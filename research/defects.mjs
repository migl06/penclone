// Count the defects the writer sees: letters that overlap or touch, and strokes that are only a stub.
//
//   node research/defects.mjs spec.json > out.json      (spec as render_lines.mjs: glyphs, layout, texts, seed, style, ...)
// out: {pairs, overlap, touching, minGap, words, stubLetters}
import { readFileSync } from 'node:fs';
import { loadLibrary } from '../engine/glyphs.js';
import { measured } from '../engine/layout.js';
import { shapeWord, inkGap } from '../engine/shape.js';

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const lib = loadLibrary(...spec.glyphs.map((f) => JSON.parse(readFileSync(f, 'utf8'))));
const lay = spec.layout ? measured(JSON.parse(readFileSync(spec.layout, 'utf8'))) : {};
const style = { ...(spec.style ?? {}) };
if (lay.letterClearance && spec.measuredSpacing !== false) style.clearance = lay.letterClearance.map((v) => v * lib.xHeight);
const uses = style.deck ? new Map() : undefined;
let pairs = 0, overlap = 0, touching = 0, minGap = Infinity, words = 0, close = 0;
const examples = [];
for (const text of spec.texts) for (const w of text.split(/\s+/).filter(Boolean)) {
  words++;
  const s = shapeWord(lib, w, { seed: spec.seed, key: [w, words], style, uses });
  const chars = [...w];
  for (let i = 1; i < s.placed.length; i++) {
    const a = s.placed[i - 1], b = s.placed[i];
    if (b.join) continue;
    pairs++;
    const g = inkGap(a.glyph, a.x, b.glyph, b.x);
    if (g < minGap) minGap = g;
    if (g < 0) { overlap++; if (examples.length < 12) examples.push(`${w}:${a.glyph.ch}${b.glyph.ch} ${g.toFixed(3)}`); }
    else if (g < 0.01) touching++;
    else if (g < 0.03) close++;
  }
}
process.stdout.write(JSON.stringify({ pairs, overlap, touching, close, minGap, words, examples }));
