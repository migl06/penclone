// Render the sentences of a sample sheet v2 with a profile, each line on the baseline where the writer wrote it, and
// print the strokes per page as JSON in pt (the coordinates of the PDF export). Input for tools/realism_check.py.
//
//   node tools/render_sheet.mjs PROFILE sheet.json [seed] [auto|v1|v2|both]
import { loadProfile, readJson } from '../engine/node.js';
import { layout } from '../engine/layout.js';

const [name, sheetFn, seed = '1', glyphSet = 'auto'] = process.argv.slice(2);
if (!name || !sheetFn) {
  console.error('usage: node tools/render_sheet.mjs PROFILE sheet.json [seed] [auto|v1|v2|both]');
  process.exit(2);
}
const S = loadProfile(name, { glyphSet: /** @type {any} */ (glyphSet) });
const man = readJson(sheetFn);
const PT = 72 / 25.4;
/** @type {Record<string, any[]>} */
const byPage = {};
for (const ln of man.lines) (byPage[ln.page] ??= []).push(ln);
/** @type {Record<string, {pts: number[][], w: number, filled: boolean}[]>} */
const pages = {};
for (const [p, lines] of Object.entries(byPage)) {
  const x0 = Math.min(...lines.map((l) => l.x0)) / PT;
  // a wide page so that no sentence wraps: every sentence stays on its own rule, like on the sheet
  const doc = layout(S.lib, lines.map((l) => l.text).join('\n'), {
    ...S.layout, seed: `${seed}/${p}`, hyphenate: false,
    page: [man.page_pt[0] / PT + 300, man.page_pt[1] / PT], margin: [0, 0, 0, x0],
    rules: lines.map((l) => l.baseline / PT),
  });
  pages[p] = doc.pages[0].lines.flatMap((l) => l.strokes.map((s) => ({
    pts: s.pts.map(([x, y]) => [x * PT, y * PT]), w: s.w * PT, filled: s.filled,
  })));
}
process.stdout.write(JSON.stringify({ glyphFiles: S.glyphFiles, pages }));
