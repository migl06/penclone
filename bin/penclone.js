#!/usr/bin/env node
// @ts-check
/* penclone command line: a thin layer over lib/commands.js, like the MCP server (docs/decisions.md §2, full parity). */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import * as C from '../lib/commands.js';
import { LAYOUT, PAPERS, PENS } from '../engine/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `penclone - text in your own handwriting

Getting started:
  penclone status [--profile NAME]          what is there and what to do next
  penclone init [--profile NAME]            first start: asks language, output and paper, then shows the next step

Write:
  penclone render FILE|- [options]          write a text file (or - for stdin) in your handwriting
  penclone fill SHEET --fields F.json [opt] write answers into the boxes of a scanned page or PDF, fitted to the space

Handwriting:
  penclone sample-sheet [--chars C] --out F.pdf   sheet to write by hand (all sentences, or only some characters)
  penclone import NAME WRITTEN.pdf --manifest F.json   add a written sheet to a profile and build it
  penclone capture NAME [--chars C]         write the sample sheet in the browser of a tablet with a pen (time, pressure, tilt)
  penclone profile create|list|show|build|export|import|override|block ...   manage profiles
  penclone use [NAME]                       switch the active handwriting (stays until switched again); no NAME: show
  penclone report NAME [--sheet out.png]    quality report of the glyphs
  penclone validate NAME                    anonymous numbers to help check the general rules (nothing is sent)

Paper and settings:
  penclone template add NAME --profile P --from SCAN    own paper, measured from a scan of an empty page
  penclone template add NAME --profile P --type lined --line-spacing 7mm [--margins left,right]
  penclone prefs NAME [key=value ...]       usual output, pen, color, paper, page, lang, format (key= to clear)
  penclone styles [--profile NAME]          papers, pens, formats

AI apps:
  penclone mcp                              MCP server on stdin/stdout (for Claude, ChatGPT, Cursor, ...)

Options of render and fill:
  --profile NAME          another handwriting just this once (default: the active one, see penclone use)
  -o, --out FILE          .pdf .svg .png .xopp .inkml .excalidraw (default: input name with .pdf)
  --text TEXT             text to write instead of a file
  --paper P               ${Object.keys(PAPERS).join(', ')}, an own template, or a scan file
  --output paper|ipad     pen on paper, or clean digital ink like a notes app
  --pen PEN               paper: ${Object.keys(PENS.paper).join(', ')}; ipad: ${Object.keys(PENS.ipad).join(', ')}
  --color #RRGGBB         ink colour (default: the pen's)
  --page a4|a5|letter|WxH paper size, WxH in mm (default a4; a scan keeps its size)
  --margin MM             one value or top,right,bottom,left (default 20)
  --size MM               x-height (default: measured from your samples, else ${LAYOUT.xHeight} mm)
  --line-spacing MM       line distance on blank paper (default ${LAYOUT.lineSpacing} mm); spacing of 'lined'
  --grid MM               square / dot size of 'squared' and 'dotted'
  --lang de               language for hyphenation; --no-hyphenation never splits words
  --pages N               fit the text to N pages (writes smaller if needed)
  --seed N                another seed gives another, equally valid version (default 1)
  --glyph-set auto|v1|v2|v3|both  which glyph library of the profile
  --json                  print the result as JSON

Lengths accept mm (default), cm, in or pt, e.g. --size 2.4mm, --line-spacing 0.3in.`;

const RENDER_OPTS = {
  profile: { type: 'string' }, glyphs: { type: 'string' }, layout: { type: 'string' }, 'glyph-set': { type: 'string' },
  out: { type: 'string', short: 'o' }, text: { type: 'string' }, paper: { type: 'string' }, output: { type: 'string' },
  pen: { type: 'string' }, color: { type: 'string' }, width: { type: 'string' }, page: { type: 'string' },
  margin: { type: 'string' }, size: { type: 'string' }, 'line-spacing': { type: 'string' }, grid: { type: 'string' },
  lang: { type: 'string' }, 'no-hyphenation': { type: 'boolean' }, seed: { type: 'string' }, json: { type: 'boolean' },
  fields: { type: 'string' }, 'sheet-page': { type: 'string' }, format: { type: 'string' }, pages: { type: 'string' },
};

const args = (argv, options, extra = {}) => parseArgs({ args: argv, allowPositionals: true, options: { ...options, help: { type: 'boolean', short: 'h' }, ...extra } });

function renderOpts(a) {
  return {
    profile: a.profile, glyphs: a.glyphs, layoutFile: a.layout, glyphSet: a['glyph-set'], out: a.out, text: a.text,
    paper: a.paper, output: a.output, pen: a.pen, color: a.color, width: a.width, page: a.page, margin: a.margin,
    size: a.size, lineSpacing: a['line-spacing'], grid: a.grid, lang: a.lang, hyphenation: !a['no-hyphenation'],
    seed: a.seed, format: a.format, pages: a.pages,
  };
}

const list = (o) => Object.entries(o).map(([c, n]) => `${JSON.stringify(c)}×${n}`).join(' ');

function printNext(st) {
  console.log(`→ ${st.next.say}\n  ${st.next.cli}`);
  for (const x of st.optional ?? []) console.log(`  (${x.say})\n    ${x.cli}`);
}

const commands = {
  async render(argv) {
    const { values: a, positionals } = args(argv, RENDER_OPTS);
    if (a.help) return console.log(HELP);
    const r = await C.render({ ...renderOpts(a), input: positionals[0] });
    if (a.json) return console.log(JSON.stringify(r, null, 1));
    console.log(`${r.files.join(', ')}: ${r.pages} page(s), ${r.lines} lines, x-height ${r.xHeightMm} mm, line spacing ${r.lineSpacingMm} mm`);
    console.log(`  paper ${r.paper}, ${r.output} / ${r.pen}; glyphs ${r.glyphs.join(' + ')}; from your samples: ${r.measuredFromSamples.join(', ') || 'nothing (defaults are assumptions)'}`);
    if (r.fitted) console.log(`  fitted to ${r.fitted.pages} page(s): x-height ${r.fitted.xHeightMm} mm (natural ${r.fitted.natural} mm)`);
    if (Object.keys(r.substituted).length) console.log(`  drawn with a look-alike: ${list(r.substituted)}`);
    if (r.overflow.length) console.log(`  too long for a line, written past the margin: ${r.overflow.join(', ')}`);
    if (r.missingAdvice) console.log(`  not in your handwriting (left out): ${list(r.missing)}\n  to add them: ${r.missingAdvice.cli}`);
  },
  async fill(argv) {
    const { values: a, positionals } = args(argv, RENDER_OPTS);
    if (a.help || !positionals[0]) return console.log(HELP);
    const r = await C.fill({ ...renderOpts(a), sheet: positionals[0], fields: a.fields, page: a['sheet-page'] ? Number(a['sheet-page']) : undefined });
    if (a.json) return console.log(JSON.stringify(r, null, 1));
    console.log(`${r.files.join(', ')} (scan straightened by ${r.skewCorrectedDeg}°)`);
    for (const f of r.fields) {
      console.log(`  field ${f.field}: ${f.fits ? 'fits' : 'DOES NOT FIT'}${f.sizeMm ? `, x-height ${f.sizeMm} mm, ${f.lines} line(s)${f.onRuledLines ? ' on the printed lines' : ''}` : ''}${f.advice ? ` - ${f.advice}` : f.reason ? ` - ${f.reason}` : ''}`);
    }
    if (r.missingAdvice) console.log(`  not in your handwriting: ${r.missingAdvice.chars}\n  to add them: ${r.missingAdvice.cli}`);
  },
  async status(argv) {
    const { values: a } = args(argv, { profile: { type: 'string' }, json: { type: 'boolean' } });
    const st = C.status({ profile: a.profile });
    if (a.json) return console.log(JSON.stringify(st, null, 1));
    if (st.profile) {
      console.log(`profile ${st.profile}: ${st.sources.join(', ') || 'no samples'}${st.ready ? `, ${st.glyphChars} characters${st.measuredLayout ? ', line habits measured' : ''}` : ''}`);
      if (Object.keys(st.preferences).length) console.log(`  preferences: ${Object.entries(st.preferences).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    } else if (st.profiles.length) console.log(`profiles: ${st.profiles.join(', ')}`);
    printNext(st);
  },
  async init(argv) {
    const { values: a } = args(argv, { profile: { type: 'string' } });
    if (!process.stdin.isTTY) { console.log('init asks questions; run it in a terminal. Without questions: penclone status'); return; }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = async (q, def, choices) => {
      for (;;) {
        const v = (await rl.question(`${q}${choices ? ` (${choices.join('/')})` : ''} [${def}]: `)).trim() || def;
        if (!choices || choices.includes(v)) return v;
        console.log(`  please choose one of: ${choices.join(', ')}`);
      }
    };
    try {
      const names = C.listProfiles().map((p) => p.name);
      const name = a.profile ?? await ask('Name of your handwriting profile', names[0] ?? 'me');
      if (!names.includes(name)) { C.createProfile({ name, lang: 'de' }); console.log(`  created profile ${name}`); }
      const lang = await ask('Language', 'de', ['de', 'en']);
      const output = await ask('Output: pen on paper, or digital ink like on the iPad', 'paper', ['paper', 'ipad']);
      const paper = await ask('Paper', output === 'ipad' ? 'dotted' : 'blank', Object.keys(PAPERS));
      console.log('  saved:', JSON.stringify(C.setPreferences({ profile: name, lang, output, paper })));
      console.log('  pen, colour and sizes start with defaults; change them any time with: penclone prefs', name, 'pen=fineliner');
      printNext(C.status({ profile: name }));
    } finally { rl.close(); }
  },
  async prefs(argv) {
    const [name, ...kv] = argv;
    if (!name) return console.log('usage: penclone prefs NAME [key=value ...]   keys: output pen color paper page lang format');
    const set = Object.fromEntries(kv.map((x) => { const i = x.indexOf('='); if (i < 0) throw new Error(`use key=value, got ${x}`); return [x.slice(0, i), x.slice(i + 1)]; }));
    console.log(JSON.stringify(Object.keys(set).length ? C.setPreferences({ profile: name, ...set }) : C.status({ profile: name }).preferences ?? {}, null, 1));
  },
  async template(argv) {
    const [sub, ...rest] = argv;
    const { values: a, positionals } = args(rest, { profile: { type: 'string' }, from: { type: 'string' }, type: { type: 'string' },
      'line-spacing': { type: 'string' }, grid: { type: 'string' }, margins: { type: 'string' }, 'no-background': { type: 'boolean' } });
    if (sub === 'add' && positionals[0]) {
      const r = C.addTemplate({ profile: a.profile, name: positionals[0], from: a.from, type: a.type, lineSpacing: a['line-spacing'],
        grid: a.grid, margins: a.margins?.split(','), background: !a['no-background'] });
      return console.log(JSON.stringify(r, null, 1));
    }
    if (sub === 'list') return console.log(JSON.stringify(C.styles({ profile: a.profile }).ownTemplates));
    console.log('usage: penclone template add NAME --profile P (--from SCAN | --type lined|squared|dotted|blank ...)  |  template list --profile P');
  },
  async styles(argv) {
    const { values: a } = args(argv, { profile: { type: 'string' } });
    console.log(JSON.stringify(C.styles({ profile: a.profile }), null, 1));
  },
  async 'sample-sheet'(argv) {
    const { values: a } = args(argv, { out: { type: 'string', short: 'o' }, chars: { type: 'string' }, lines: { type: 'string' } });
    const r = C.sampleSheet({ out: a.out ?? (a.chars ? 'missing.pdf' : 'sheet.pdf'), chars: a.chars, lines: a.lines });
    console.log(`${r.pdf}\n${r.howToWrite}\nthen: ${r.next}`);
  },
  async import(argv) {
    const { values: a, positionals } = args(argv, { manifest: { type: 'string' }, 'no-build': { type: 'boolean' } });
    if (positionals.length < 2 || !a.manifest) return console.log('usage: penclone import NAME WRITTEN.pdf --manifest SHEET.json');
    console.log(C.importSamples({ profile: positionals[0], pdf: positionals[1], manifest: a.manifest, build: !a['no-build'] }));
  },
  async capture(argv) {
    const { values: a, positionals } = args(argv, { chars: { type: 'string' }, port: { type: 'string' }, host: { type: 'string' } });
    if (!positionals[0]) return console.log('usage: penclone capture NAME [--chars C] [--port 8765] [--host 0.0.0.0]');
    const { startCapture } = await import('../lib/capture.js');
    const c = await startCapture({ profile: positionals[0], chars: a.chars, port: a.port ? Number(a.port) : undefined, host: a.host });
    console.log('Open this in the browser of your tablet (same Wi-Fi) and write with the pen:');
    for (const u of c.urls) console.log('  ' + u);
    console.log('The page is reachable in your local network while this runs; the link contains a secret. Ctrl+C stops it.');
    const r = await c.done;
    console.log(r.ok ? `imported ${r.strokes} strokes\n${r.output}` : `stopped: ${r.error}`);
  },
  async validate(argv) {
    const r = C.validate({ profile: argv[0] });
    console.log(JSON.stringify(r, null, 1));
    console.error('\nOnly numbers relative to your own x-height - no strokes, images or text. If you like, paste them into a new issue:\n'
      + 'https://github.com/migl06/penclone/issues/new?template=share_statistics.yml');
  },
  async report(argv) {
    const { values: a, positionals } = args(argv, { sheet: { type: 'string' } });
    console.log(C.glyphReport({ profile: positionals[0], sheet: a.sheet }));
  },
  async profile(argv) { C.python('pipeline/profiles.py', argv, { inherit: true }); },
  async use(argv) {
    const r = C.useProfile({ name: argv[0] });
    if (!r.profiles.length) return console.log('no handwriting profile yet - run: penclone status');
    for (const n of r.profiles) console.log(`${n === r.active ? '*' : ' '} ${n}`);
    if (!r.active) console.log('no active handwriting yet: penclone use NAME');
    else if (argv[0]) console.log(`active handwriting: ${r.active} (used whenever --profile is not given)`);
  },
  async mcp() { (await import('../lib/mcp.js')).serve(); },
  async help() { console.log(HELP); },
};

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === '--version' || cmd === '-v') return console.log(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version);
  const f = commands[cmd ?? 'help'] ?? (['-h', '--help'].includes(cmd) ? commands.help : null);
  if (!f) { console.error(`unknown command: ${cmd}\n\n${HELP}`); process.exitCode = 2; return; }
  await f(rest);
}

main(process.argv.slice(2)).catch((e) => {
  console.error('penclone:', e.message);
  process.exitCode = 1;
});
