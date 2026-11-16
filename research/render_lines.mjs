// Render sentences for the realism experiments: one sentence per rule on a tall page, strokes in pt.
//
//   node research/render_lines.mjs spec.json > out.json
//
// spec: {glyphs: [file, ...], layout: file|null, texts: [str], seed, style: {...}, measuredSpacing: bool,
//        x0Pt, firstBaselinePt, lineGapPt, pageWidthPt}
// out:  {lines: [{text, baseline: pt, strokes: [{pts: [[x, y]] (pt), w: pt}]}], missing: {...}}
import { readFileSync } from 'node:fs';
import { loadLibrary } from '../engine/glyphs.js';
import { layout, measured } from '../engine/layout.js';

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const lib = loadLibrary(...spec.glyphs.map((f) => JSON.parse(readFileSync(f, 'utf8'))));
const lay = spec.layout ? measured(JSON.parse(readFileSync(spec.layout, 'utf8'))) : {};
const PT = 72 / 25.4;
const n = spec.texts.length;
const rules = spec.texts.map((_, i) => (spec.firstBaselinePt + i * spec.lineGapPt) / PT);
const doc = layout(lib, spec.texts.join('\n'), {
  ...lay,
  ...(spec.xHeightMm ? { xHeight: spec.xHeightMm } : {}),
  seed: spec.seed, hyphenate: false, style: spec.style ?? {}, measuredSpacing: spec.measuredSpacing ?? true,
  page: [spec.pageWidthPt / PT, (spec.firstBaselinePt + (n + 1) * spec.lineGapPt) / PT],
  margin: [0, 0, 0, spec.x0Pt / PT], rules,
});
if (doc.pages.length !== 1 || doc.pages[0].lines.length !== n) throw new Error('every sentence must stay on its own line');
process.stdout.write(JSON.stringify({
  lines: doc.pages[0].lines.map((l, i) => ({
    text: spec.texts[i], baseline: rules[i] * PT,
    strokes: l.strokes.map((s) => ({ pts: s.pts.map(([x, y]) => [x * PT, y * PT]), w: s.w * PT })),
  })),
  missing: doc.missing,
}));
