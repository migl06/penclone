#!/usr/bin/env node
// @ts-check
/* penclone command line. Every capability gets a command as soon as it exists (docs/decisions.md §2, full parity).
 * The Python pipeline (profiles, sample sheets) is reached through the same entry point until it is ported (P6). */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { hyphenator, render, LAYOUT, PAGES } from '../engine/index.js';
import { loadProfile, loadGlyphFile, writeDocument } from '../engine/node.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `penclone - text in your own handwriting

Usage:
  penclone render FILE|- [options]     write text (a file, or - for stdin) in a profile's handwriting
  penclone profile ...                 manage handwriting profiles (create, add-sample, build, list, show, export, import)
  penclone sample-sheet --out FILE     create sample sheet v2 (sentences to write by hand)
  penclone help [render]

Render options:
  --profile NAME          handwriting profile (or --glyphs FILE [--layout FILE])
  --glyph-set v1|v2|both  glyph library of the profile (default v1)
  -o, --out FILE          .pdf or .svg (default: input name with .pdf)
  --text TEXT             text to write instead of a file
  --page a4|a5|letter|WxH paper size, WxH in mm (default a4)
  --margin MM             one value or top,right,bottom,left (default 20)
  --size MM               x-height (default: measured from your samples, else ${LAYOUT.xHeight} mm)
  --line-spacing MM       distance of the lines (default ${LAYOUT.lineSpacing} mm)
  --color #RRGGBB         ink colour
  --lang de               language for hyphenation (default de)
  --no-hyphenation        never split words
  --seed N                another seed gives another, equally valid handwriting sample (default 1)
  --json                  print the result summary as JSON

Lengths accept mm (default), cm, in or pt, e.g. --size 2.4mm, --line-spacing 0.3in.`;

/** Length in mm from "8", "8mm", "0.8cm", "0.3in", "20pt". */
function mm(v, what) {
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(mm|cm|in|pt)?\s*$/i.exec(String(v));
  if (!m) throw new Error(`${what}: not a length: ${v}`);
  const n = Number(m[1].replace(',', '.'));
  return n * { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72 }[(m[2] || 'mm').toLowerCase()];
}

function page(v) {
  if (PAGES[v.toLowerCase()]) return v.toLowerCase();
  const m = /^(.+?)x(.+)$/i.exec(v);
  if (!m) throw new Error(`--page: use a4, a5, letter or WxH in mm, got ${v}`);
  return [mm(m[1], '--page'), mm(m[2], '--page')];
}

async function cmdRender(argv) {
  const { values: a, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: {
      profile: { type: 'string' }, glyphs: { type: 'string' }, layout: { type: 'string' },
      'glyph-set': { type: 'string' }, out: { type: 'string', short: 'o' }, text: { type: 'string' },
      page: { type: 'string' }, margin: { type: 'string' }, size: { type: 'string' },
      'line-spacing': { type: 'string' }, color: { type: 'string' }, lang: { type: 'string' },
      'no-hyphenation': { type: 'boolean' }, seed: { type: 'string' }, json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (a.help) { console.log(HELP); return 0; }
  if (!a.profile === !a.glyphs) throw new Error('give either --profile NAME or --glyphs FILE');
  const src = positionals[0];
  if (a.text === undefined && !src) throw new Error('nothing to write: give a file, - for stdin, or --text');
  const text = a.text ?? readFileSync(src === '-' ? 0 : src, 'utf8');
  const P = a.profile
    ? loadProfile(a.profile, { glyphSet: /** @type {any} */ (a['glyph-set']) })
    : loadGlyphFile(a.glyphs, a.layout);
  const out = a.out ?? (src && src !== '-' ? src.replace(/\.[^./]*$/, '') + '.pdf' : 'penclone.pdf');

  const opts = { ...P.layout };
  if (a.page) opts.page = page(a.page);
  if (a.margin) {
    const v = a.margin.split(',').map((x) => mm(x, '--margin'));
    if (![1, 4].includes(v.length)) throw new Error('--margin: one value or top,right,bottom,left');
    opts.margin = v.length === 1 ? [v[0], v[0], v[0], v[0]] : v;
  }
  if (a.size) opts.xHeight = mm(a.size, '--size');
  if (a['line-spacing']) opts.lineSpacing = mm(a['line-spacing'], '--line-spacing');
  const lang = a.lang ?? 'de';
  opts.hyphenate = !a['no-hyphenation'];
  opts.hyphenator = opts.hyphenate ? await hyphenator(lang) : null;
  opts.seed = a.seed ?? 1;
  const doc = render(P.lib, text, opts);
  const files = writeDocument(doc, out, { color: a.color, title: src && src !== '-' ? basename(src) : undefined });

  const lines = doc.pages.reduce((n, p) => n + p.lines.length, 0);
  const fromSamples = Object.keys(P.layout);
  const summary = {
    files, pages: doc.pages.length, lines, xHeightMm: +doc.xHeight.toFixed(2), lineSpacingMm: doc.lineSpacing,
    glyphs: P.glyphFiles.map((f) => basename(f)),
    measuredFromSamples: fromSamples, missing: doc.missing, substituted: doc.substituted, overflow: doc.overflow,
    hyphenation: opts.hyphenator ? lang : (opts.hyphenate ? `none for ${lang}` : 'off'),
  };
  if (a.json) { console.log(JSON.stringify(summary, null, 1)); return 0; }
  console.log(`${files.join(', ')}: ${summary.pages} page(s), ${lines} lines, x-height ${summary.xHeightMm} mm, line spacing ${doc.lineSpacing} mm`);
  console.log(`  glyphs: ${summary.glyphs.join(' + ')}; from your samples: ${fromSamples.length ? fromSamples.join(', ') : 'nothing (no layout.json; defaults are assumptions)'}`);
  const list = (o) => Object.entries(o).map(([c, n]) => `${JSON.stringify(c)}×${n}`).join(' ');
  if (Object.keys(doc.missing).length) console.log(`  not in your handwriting (left out): ${list(doc.missing)}`);
  if (Object.keys(doc.substituted).length) console.log(`  drawn with a look-alike: ${list(doc.substituted)}`);
  if (doc.overflow.length) console.log(`  too long for a line, written past the margin: ${doc.overflow.join(', ')}`);
  if (opts.hyphenate && !opts.hyphenator) console.log(`  no hyphenation patterns for "${lang}" yet`);
  return 0;
}

/** Forward to the Python pipeline (until it is ported in P6). */
function python(script, argv) {
  const r = spawnSync(process.env.PYTHON || 'python3', [join(ROOT, 'pipeline', script), ...argv], { stdio: 'inherit' });
  if (r.error) throw new Error(`could not start Python (${r.error.message}); the pipeline needs Python 3 with numpy`);
  return r.status ?? 1;
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'render': return cmdRender(rest);
    case 'profile': return python('profiles.py', rest);
    case 'sample-sheet': return python('make_sheet.py', rest);
    case undefined: case 'help': case '-h': case '--help': console.log(HELP); return 0;
    case '--version': case '-v': console.log(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version); return 0;
    default: console.error(`unknown command: ${cmd}\n\n${HELP}`); return 2;
  }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
  console.error('penclone:', e.message);
  process.exitCode = 1;
});
