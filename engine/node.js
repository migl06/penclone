// @ts-check
/* Node-only helpers: find profiles, read glyph libraries and measured layout, write SVG / PDF files.
 * Profiles live outside the repository (docs/decisions.md §6): $PENCLONE_HOME/profiles/<name>/, default
 * ~/.local/share/penclone (same rule as pipeline/profiles.py). */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { deflateSync } from 'node:zlib';
import { loadLibrary } from './glyphs.js';
import { measured } from './layout.js';
import { toPDF, toSVG } from './output.js';

export function profilesHome() {
  const base = process.env.PENCLONE_HOME
    || join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'penclone');
  return join(base, 'profiles');
}

export function profileDir(nameOrDir) {
  if (existsSync(join(nameOrDir, 'profile.json'))) return resolvePath(nameOrDir);
  return join(profilesHome(), nameOrDir);
}

const readJson = (fn) => JSON.parse(readFileSync(fn, 'utf8'));

/**
 * Load a profile's glyph library and measured layout habits.
 * @param {string} name profile name or directory
 * @param {{glyphSet?: 'v1'|'v2'|'both'}} [o] which glyph library: sheet v1 (default), sheet v2, or both merged
 */
export function loadProfile(name, o = {}) {
  const dir = profileDir(name);
  if (!existsSync(join(dir, 'profile.json'))) {
    throw new Error(`profile not found: ${dir} (create it with: penclone profile create NAME --pdf FILE)`);
  }
  const set = o.glyphSet ?? 'v1';
  const files = { v1: ['glyphs.json'], v2: ['glyphs-v2.json'], both: ['glyphs.json', 'glyphs-v2.json'] }[set];
  if (!files) throw new Error(`unknown glyph set ${set}; use v1, v2 or both`);
  const found = files.filter((f) => existsSync(join(dir, f)));
  if (!found.length) throw new Error(`profile ${name} has no ${files.join(' / ')} yet (run: penclone profile build ${name})`);
  const lib = loadLibrary(...found.map((f) => readJson(join(dir, f))));
  const layoutFile = join(dir, 'layout.json');
  const layoutJson = existsSync(layoutFile) ? readJson(layoutFile) : null;
  return { dir, lib, glyphFiles: found, layoutJson, layout: measured(layoutJson) };
}

export function loadGlyphFile(fn, layoutFn) {
  const layoutJson = layoutFn ? readJson(layoutFn) : null;
  return { dir: null, lib: loadLibrary(readJson(fn)), glyphFiles: [fn], layoutJson, layout: measured(layoutJson) };
}

/**
 * Write a rendered document. .pdf -> one PDF; .svg -> one file per page (name.svg, or name-1.svg, name-2.svg, ...).
 * @returns {string[]} written files
 */
export function writeDocument(doc, file, o = {}) {
  if (/\.pdf$/i.test(file)) {
    writeFileSync(file, toPDF(doc, { ...o, deflate: (b) => deflateSync(b, { level: 9 }) }));
    return [file];
  }
  if (/\.svg$/i.test(file)) {
    const pages = toSVG(doc, o);
    const names = pages.length === 1 ? [file] : pages.map((_, i) => file.replace(/\.svg$/i, `-${i + 1}.svg`));
    pages.forEach((s, i) => writeFileSync(names[i], s));
    return names;
  }
  throw new Error(`unknown output format: ${file} (use .pdf or .svg)`);
}
