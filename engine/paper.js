// @ts-check
/* Paper: what is printed on the page (rules, squares, dots, margin lines, or a scanned page) and where the writing sits.
 *
 * Built-in templates are generated from parameters (docs/decisions.md §12), so they are exact at any size. A scanned
 * template (pipeline/scan_paper.py) brings a background image and the measured positions of its rules. The layout puts
 * the baselines on the rules, so writing on lined paper sits on the lines like real writing (with the writer's own
 * offset above the line, measured from the sample, see layout.js). */

/** @typedef {{type: 'blank'|'lined'|'squared'|'dotted'|'scan', spacing?: number, grid?: number, margins?: ('left'|'right')[],
 *   source?: string, note?: string, background?: {file: string, width: number, height: number, png?: Uint8Array},
 *   rules?: number[], verticals?: number[], page?: number[]}} Paper */

/** Built-in templates; lengths in mm. Sources in docs/decisions.md §12 and docs/research.md §4. */
export const PAPERS = {
  blank: { type: 'blank', note: 'no lines' },
  lined: { type: 'lined', spacing: 8, note: 'ruled, 8 mm (assumption; set --line-spacing)' },
  'lined-narrow': { type: 'lined', spacing: 6.35, note: 'US narrow ruled, 1/4 in' },
  'lined-college': { type: 'lined', spacing: 7.1, note: 'US college ruled, 9/32 in' },
  'lined-wide': { type: 'lined', spacing: 8.7, note: 'US wide ruled, 11/32 in' },
  lin27: { type: 'lined', spacing: 9, margins: ['left', 'right'], note: 'German Lineatur 27: ruled 9 mm, double margin (one retailer source)' },
  squared: { type: 'squared', grid: 5, note: '5 mm squares' },
  lin22: { type: 'squared', grid: 5, note: 'German Lineatur 22: 5 mm squares, no margin' },
  lin26: { type: 'squared', grid: 5, margins: ['right'], note: 'German Lineatur 26: 5 mm squares with margin' },
  lin28: { type: 'squared', grid: 5, margins: ['left', 'right'], note: 'German Lineatur 28: 5 mm squares, double margin (spacing: assumption)' },
  dotted: { type: 'dotted', grid: 5, note: '5 mm dot grid (assumption)' },
};

/** Look of the printed paper (assumptions: light colours as on common notepads). */
export const PAPER_INK = { rule: '#9db3c9', grid: '#b9c6d0', dot: '#8f9ba5', margin: '#e3908a', rule_w: 0.15, grid_w: 0.1, dot_w: 0.35, margin_w: 0.2 };

/** Margin line distance from the page edge (assumption: about where school pads have it). */
const MARGIN_LINE = 20;
/** Border without print around grids (assumption). */
const BORDER = 6;

/**
 * Resolve a paper option: built-in name, or a Paper object (scan template), with overrides.
 * @param {string|Paper|undefined} p
 * @param {{lineSpacing?: number, grid?: number}} [o]
 * @returns {Paper}
 */
export function resolvePaper(p, o = {}) {
  const base = typeof p === 'string' ? PAPERS[p] : p ?? PAPERS.blank;
  if (!base) throw new Error(`unknown paper ${p}; built in: ${Object.keys(PAPERS).join(', ')}`);
  const out = { ...base };
  if (out.type === 'lined' && o.lineSpacing) out.spacing = o.lineSpacing;
  if ((out.type === 'squared' || out.type === 'dotted') && o.grid) out.grid = o.grid;
  return out;
}

/**
 * Baselines (mm from the top) for one page, and the left/right limits of the writing.
 * @param {Paper} paper
 * @param {{width: number, height: number, margin: number[], lineSpacing: number, xHeight: number}} g
 */
export function writingArea(paper, g) {
  const [mt, mr, mb, ml] = g.margin;
  let left = ml, right = g.width - mr;
  const margins = paper.margins ?? [];
  if (margins.includes('left')) left = Math.max(left, MARGIN_LINE + 3);
  if (margins.includes('right')) right = Math.min(right, g.width - MARGIN_LINE - 3);
  if (paper.type === 'scan' && paper.verticals?.length) {
    // a margin line of the scan on the left / right third of the page limits the writing
    for (const x of paper.verticals) {
      if (x < g.width / 3) left = Math.max(left, x + 3);
      else if (x > (2 * g.width) / 3) right = Math.min(right, x - 3);
    }
  }
  let rules = [];
  if (paper.type === 'scan' && paper.rules?.length) {
    rules = paper.rules.filter((y) => y >= mt + 1.5 * g.xHeight && y <= g.height - mb);
    if (paper.grid) {               // squared / dotted scan: every k-th grid line, as on built-in grids
      const k = Math.max(1, Math.ceil(g.lineSpacing / paper.grid - 1e-9));
      rules = rules.filter((_, i) => i % k === 0);
    }
  } else {
    let step = g.lineSpacing, y0 = mt + g.lineSpacing;
    if (paper.type === 'lined' && paper.spacing) { step = paper.spacing; y0 = mt + step; }
    if ((paper.type === 'squared' || paper.type === 'dotted') && paper.grid) {
      // write on every k-th grid line, k chosen so that the line distance is at least the natural one (assumption)
      const k = Math.max(1, Math.ceil(g.lineSpacing / paper.grid - 1e-9));
      step = k * paper.grid;
      y0 = Math.ceil((mt + step - BORDER) / paper.grid) * paper.grid + BORDER;
    }
    for (let y = y0; y <= g.height - mb + 1e-9; y += step) rules.push(y);
  }
  return { rules, left, right };
}

/**
 * Vector items that print the paper: lines [x1, y1, x2, y2, colour, width] and dots [x, y, colour, diameter].
 * @param {Paper} paper
 * @param {number} W page width (mm)
 * @param {number} H page height (mm)
 * @param {number} top top margin (mm), where ruled lines start
 * @param {number} lineSpacing
 */
export function paperItems(paper, W, H, top, lineSpacing) {
  const I = PAPER_INK;
  /** @type {any[]} */ const lines = [], dots = [];
  if (paper.type === 'lined') {
    const s = paper.spacing ?? lineSpacing;
    for (let y = top + s; y <= H - 8; y += s) lines.push([0, y, W, y, I.rule, I.rule_w]);
  } else if (paper.type === 'squared') {
    const s = paper.grid ?? 5;
    for (let y = BORDER; y <= H - BORDER + 1e-9; y += s) lines.push([BORDER, y, W - BORDER, y, I.grid, I.grid_w]);
    for (let x = BORDER; x <= W - BORDER + 1e-9; x += s) lines.push([x, BORDER, x, H - BORDER, I.grid, I.grid_w]);
  } else if (paper.type === 'dotted') {
    const s = paper.grid ?? 5;
    for (let y = BORDER; y <= H - BORDER + 1e-9; y += s) for (let x = BORDER; x <= W - BORDER + 1e-9; x += s) dots.push([x, y, I.dot, I.dot_w]);
  }
  for (const m of paper.margins ?? []) {
    const x = m === 'left' ? MARGIN_LINE : W - MARGIN_LINE;
    lines.push([x, 0, x, H, I.margin, I.margin_w]);
  }
  return { lines, dots };
}
