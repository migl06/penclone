// @ts-check
/* Node-only helpers: find profiles, read glyph libraries, measured layout and paper templates, write every output format.
 * Profiles live outside the repository (docs/decisions.md §6): $PENCLONE_HOME/profiles/<name>/, default
 * ~/.local/share/penclone (same rule as pipeline/profiles.py). */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { deflateSync, gzipSync } from 'node:zlib';
import { loadLibrary } from './glyphs.js';
import { measured } from './layout.js';
import { toExcalidraw, toInkML, toPDF, toSVG, toXournal } from './output.js';

export function profilesHome() {
  const base = process.env.PENCLONE_HOME
    || join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'penclone');
  return join(base, 'profiles');
}

export function profileDir(nameOrDir) {
  if (existsSync(join(nameOrDir, 'profile.json'))) return resolvePath(nameOrDir);
  return join(profilesHome(), nameOrDir);
}

export const readJson = (fn) => JSON.parse(readFileSync(fn, 'utf8'));

/** profile.json of a profile (throws a helpful error if it does not exist). */
export function readProfile(name) {
  const dir = profileDir(name);
  if (!existsSync(join(dir, 'profile.json'))) {
    throw new Error(`profile not found: ${name} (create it with: penclone profile create ${name})`);
  }
  return { dir, P: readJson(join(dir, 'profile.json')) };
}

/** Write profile.json, adding a log entry (same format as pipeline/profiles.py). */
export function writeProfile(dir, P, change, why = '') {
  if (change) (P.log ??= []).push({ date: new Date().toISOString().slice(0, 10), change, why });
  writeFileSync(join(dir, 'profile.json'), JSON.stringify(P, null, 2));
}

export function listProfileNames() {
  const h = profilesHome();
  if (!existsSync(h)) return [];
  return readdirSync(h).filter((n) => !n.startsWith('.') && existsSync(join(h, n, 'profile.json'))).sort();
}

const GLYPH_SETS = { v1: ['glyphs.json'], v2: ['glyphs-v2.json'], v3: ['glyphs-v3.json'], both: ['glyphs.json', 'glyphs-v2.json'] };

/**
 * Load a profile's glyph library and measured layout habits.
 * @param {string} name profile name or directory
 * @param {{glyphSet?: 'auto'|'v1'|'v2'|'v3'|'both'}} [o] glyph library: auto = sheet v1 (the letters written one by one), else sheet v2.
 *        v3 = letters written one by one at the proportions of the sentences (pipeline/glyph_qa.py).
 *        Characters added with character sheets (glyphs-chars.json) are always included.
 */
export function loadProfile(name, o = {}) {
  const { dir, P } = readProfile(name);
  let set = o.glyphSet ?? 'auto';
  if (set === 'auto') set = existsSync(join(dir, 'glyphs.json')) ? 'v1' : 'v2';
  const files = GLYPH_SETS[set];
  if (!files) throw new Error(`unknown glyph set ${set}; use auto, v1, v2, v3 or both`);
  const found = files.filter((f) => existsSync(join(dir, f)));
  if (!found.length) throw new Error(`profile ${name} has no glyphs yet (run: penclone profile build ${name})`);
  if (existsSync(join(dir, 'glyphs-chars.json'))) found.push('glyphs-chars.json');
  const lib = loadLibrary(...found.map((f) => readJson(join(dir, f))));
  const layoutFile = join(dir, 'layout.json');
  const layoutJson = existsSync(layoutFile) ? readJson(layoutFile) : null;
  return { dir, P, lib, glyphSet: set, glyphFiles: found, layoutJson, layout: measured(layoutJson), preferences: P.preferences ?? {} };
}

export function loadGlyphFile(fn, layoutFn) {
  const layoutJson = layoutFn ? readJson(layoutFn) : null;
  return { dir: null, P: null, lib: loadLibrary(readJson(fn)), glyphFiles: [fn], layoutJson, layout: measured(layoutJson), preferences: {} };
}

/**
 * Turn a template folder (template.json [+ background.png], written by pipeline/scan_paper.py or `penclone template add`)
 * into an engine Paper.
 * @returns {import('./paper.js').Paper}
 */
export function paperFromTemplate(dir) {
  const t = readJson(join(dir, 'template.json'));
  if (t.kind === 'built' || !t.rules) {
    // parametric template: {type, spacing|grid, margins}
    return { type: t.type, spacing: t.spacing, grid: t.grid, margins: t.margins, note: t.note ?? 'own template' };
  }
  /** @type {import('./paper.js').Paper} */
  const paper = { type: 'scan', rules: t.rules, verticals: t.verticals ?? [], page: t.page, source: t.source, note: `scan (${t.type})` };
  // squared and dotted scans: the rules are every grid line; layout.js picks every k-th one like on built-in grids
  if (t.type === 'squared' || t.type === 'dotted') paper.grid = t.grid;
  if (t.type === 'lined') paper.spacing = t.spacing;
  if (t.background && existsSync(join(dir, t.background))) {
    paper.background = { file: t.background, width: t.page[0], height: t.page[1], png: readFileSync(join(dir, t.background)) };
  }
  return paper;
}

/** Own templates of a profile: name -> folder. */
export function profileTemplates(dir) {
  const t = join(dir, 'templates');
  if (!existsSync(t)) return {};
  return Object.fromEntries(readdirSync(t).filter((n) => existsSync(join(t, n, 'template.json'))).map((n) => [n, join(t, n)]));
}

export const FORMATS = ['pdf', 'svg', 'png', 'xopp', 'inkml', 'excalidraw'];

/**
 * Write a rendered document. The format comes from `o.format` or the file extension.
 * .svg and .png give one file per page (name.svg, or name-1.svg, name-2.svg, ...).
 * @returns {Promise<string[]>} written files
 */
export async function writeDocument(doc, file, o = {}) {
  const ext = (o.format ?? file.split('.').pop() ?? '').toLowerCase();
  const many = (n, e) => (n === 1 ? [file] : Array.from({ length: n }, (_, i) => file.replace(new RegExp(`\\.${e}$`, 'i'), '') + `-${i + 1}.${e}`));
  const pdf = () => toPDF(doc, { ...o, deflate: (b) => deflateSync(b, { level: 9 }) });
  switch (ext) {
    case 'pdf': writeFileSync(file, pdf()); return [file];
    case 'svg': {
      const pages = toSVG(doc, o), names = many(pages.length, 'svg');
      pages.forEach((s, i) => writeFileSync(names[i], s));
      return names;
    }
    case 'png': {
      const { pdfToPng } = await import('./preview.js');
      const names = many(doc.pages.length, 'png');
      await pdfToPng(pdf(), names, o.dpi ?? 200);
      return names;
    }
    case 'xopp': writeFileSync(file, gzipSync(toXournal(doc, o))); return [file];
    case 'inkml': writeFileSync(file, toInkML(doc, o)); return [file];
    case 'excalidraw': writeFileSync(file, toExcalidraw(doc, o)); return [file];
    default: throw new Error(`unknown output format "${ext}" (use ${FORMATS.join(', ')})`);
  }
}

export function ensureDir(d) { mkdirSync(d, { recursive: true }); return d; }
