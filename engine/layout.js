// @ts-check
/* Page layout: text -> lines -> pages, with hyphenation and a line model. No DOM; output is plain geometry in mm.
 *
 * Every number has a source (docs/decisions.md §5). "measured" values are read from the profile's layout.json, which
 * pipeline/measure_layout.py writes from the writer's own sample sheet v2; the fallbacks below are used only when a
 * profile has no such measurement and are marked as assumptions. */
import { stream, gauss } from './rng.js';
import { shapeWord, splitWord } from './shape.js';
import { wordBreaks } from './hyphenate.js';
import { resolvePaper, writingArea } from './paper.js';

export const PAGES = { a4: [210, 297], a5: [148, 210], letter: [215.9, 279.4] };   // mm (ISO 216, ANSI)

export const LAYOUT = {
  page: 'a4',
  margin: [20, 20, 20, 20],      // top, right, bottom, left in mm (assumption)
  xHeight: 2.5,                  // mm; fallback when the profile has no measured x-height (assumption)
  lineSpacing: 8,                // mm (assumption: between US college ruling 7.1 mm and German Lineatur 27, 9 mm)
  // fallbacks for the measured line habits, in x-heights (assumptions; replaced by layout.json when present)
  wordGap: { median: 1.4, q1: 1.15, q3: 1.75 },
  baselineOffset: 0.2,           // writing sits this far above the line
  slopeDeg: { mean: 0, sd: 0.25 },
  drift: { sd: 0.15, range: 4 }, // slow baseline drift: Ornstein-Uhlenbeck process (exponential covariance)
  lineStartSd: 0.15,             // where a line starts, relative to the margin (assumption, not measurable on sheet v2)
  hyphenate: true,
  hyphenMinGap: 6,
  simplify: 0.02,                // mm; points closer than this to the simplified line are dropped (a quarter pixel at
                                 // 300 dpi, a sixteenth of the stroke width - invisible; keeps files small)               // hyphenate only if otherwise at least this much space (x-heights) stays empty (assumption)
};

/** Merge the measured habits from a profile's layout.json into layout options. */
export function measured(layoutJson) {
  if (!layoutJson) return {};
  const m = {};
  if (layoutJson.x_height_pt) m.xHeight = layoutJson.x_height_pt * 25.4 / 72;
  const wg = layoutJson.word_gap;
  if (wg && wg.n >= 30) m.wordGap = { median: wg.median, q1: wg.q1, q3: wg.q3 };
  const bo = layoutJson.baseline_offset;
  if (bo && bo.n >= 10) m.baselineOffset = bo.median;
  const sl = layoutJson.line_slope_deg;
  if (sl && sl.n >= 10) m.slopeDeg = { mean: sl.mean, sd: sl.sd };
  const d = layoutJson.drift;
  if (d && d.model === 'exponential') m.drift = { sd: d.drift_sd, range: d.range };
  return m;
}

/** Log-normal draw with the given median and quartiles (sigma from the interquartile range). */
function lognormal(r, { median, q1, q3 }) {
  const sigma = Math.log(q3 / q1) / 1.349;
  return median * Math.exp(gauss(r) * sigma);
}

/** Baseline drift along one line: Ornstein-Uhlenbeck process on a fixed grid (x-heights), linearly interpolated. */
function driftFn(r, { sd, range }, lengthXh) {
  const step = 0.5, n = Math.ceil(lengthXh / step) + 2;
  const rho = Math.exp(-step / range), s = sd * Math.sqrt(1 - rho * rho);
  const v = [gauss(r) * sd];
  for (let i = 1; i < n; i++) v.push(v[i - 1] * rho + gauss(r) * s);
  return (x) => {
    const t = Math.max(0, Math.min(n - 1.001, x / step)), i = Math.floor(t), f = t - i;
    return v[i] * (1 - f) + v[i + 1] * f;
  };
}

/** Ramer-Douglas-Peucker simplification of a polyline (Ramer 1972; Douglas & Peucker 1973). */
export function simplify(pts, eps) {
  if (pts.length < 3 || eps <= 0) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = /** @type {number[]} */ (stack.pop());
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let dmax = -1, imax = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = len > 1e-12 ? Math.abs(dx * (py - ay) - dy * (px - ax)) / len : Math.hypot(px - ax, py - ay);
      if (d > dmax) { dmax = d; imax = i; }
    }
    if (dmax > eps) { keep[imax] = 1; stack.push([a, imax], [imax, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * @typedef {{pts: number[][], w: number, filled: boolean}} Stroke
 * @typedef {{strokes: Stroke[], rule: number, text: string}} Line
 * @typedef {{width: number, height: number, lines: Line[], paper?: import('./paper.js').Paper, top?: number}} Page
 * @typedef {{pages: Page[], missing: Record<string, number>, substituted: Record<string, number>, overflow: string[],
 *   xHeight: number, lineSpacing: number, unplaced: string[]}} Document
 */

/**
 * Lay out text. Every newline starts a new line; an empty line stays empty.
 * @param {import('./glyphs.js').Library} lib
 * @param {string} text
 * @param {Partial<typeof LAYOUT> & {seed?: string|number, hyphenator?: any, positions?: boolean,
 *   paper?: string|import('./paper.js').Paper, grid?: number, penScale?: number, rules?: number[], maxPages?: number}} [options]
 *   paper: built-in name or scan template; rules: explicit baselines (one page, e.g. a worksheet field);
 *   maxPages: stop after this many pages and return the rest as `unplaced`.
 * @returns {Document}
 */
export function layout(lib, text, options = {}) {
  const o = { ...LAYOUT, ...options };
  const seed = o.seed ?? 1;
  const [pw, ph] = typeof o.page === 'string' ? PAGES[o.page] : o.page;
  const [mt, mr, mb, ml] = o.margin;
  const xh = o.xHeight, k = xh / lib.xHeight;          // mm per em
  const paper = resolvePaper(o.paper, { lineSpacing: options.lineSpacing, grid: o.grid });
  const area = writingArea(paper, { width: pw, height: ph, margin: o.margin, lineSpacing: o.lineSpacing, xHeight: xh });
  const rules = o.rules ?? area.rules;
  if (!rules.length) throw new Error('no room for a single line: check page size, margins and line spacing');
  const left = o.rules ? ml : area.left;
  const maxW = (o.rules ? pw - mr : area.right) - left;
  const penScale = o.penScale ?? 1;
  const missing = {}, substituted = {}, overflow = [];
  const seen = new Map();
  const shape = (w) => {
    const n = (seen.get(w) ?? 0) + 1;
    seen.set(w, n);
    const s = shapeWord(lib, w, { seed, key: [w, n], positions: o.positions });
    for (const c of s.missing) missing[c] = (missing[c] ?? 0) + 1;
    for (const c of s.substituted) substituted[c] = (substituted[c] ?? 0) + 1;
    return s;
  };
  const gapOf = (word) => lognormal(stream(seed, 'gap', ...word.key), o.wordGap) * xh;

  // 1. break into lines: [{words: [{word, x}], empty}] with x in mm from the line start
  /** @type {{words: {word: any, x: number}[]}[]} */
  const lines = [];
  for (const src of text.replace(/\r\n?/g, '\n').split('\n')) {
    let cur = { words: [] }, x = 0;
    lines.push(cur);
    const queue = src.split(/[ \t ]+/).filter(Boolean).map(shape);
    while (queue.length) {
      const w = /** @type {any} */ (queue.shift());
      const gap = cur.words.length ? gapOf(w) : 0;
      const wmm = w.width * k;
      if (x + gap + wmm <= maxW) { cur.words.push({ word: w, x: x + gap }); x += gap + wmm; continue; }
      const room = maxW - x - gap;
      const lineEmpty = !cur.words.length;
      // hyphenate if the word would leave a large gap, or if it does not fit on a line of its own
      if (o.hyphenate && o.hyphenator && (lineEmpty || room >= o.hyphenMinGap * xh)) {
        const breaks = wordBreaks(o.hyphenator, w.text).reverse();
        let done = false;
        for (const b of breaks) {
          const [head, tail] = splitWord(lib, w, b.at, { seed, hyphen: b.hyphen });
          if (head.width * k <= (lineEmpty ? maxW : room)) {
            cur.words.push({ word: head, x: lineEmpty ? 0 : x + gap });
            queue.unshift(tail);
            done = true;
            break;
          }
        }
        if (done) { cur = { words: [] }; x = 0; lines.push(cur); continue; }
      }
      if (lineEmpty) {             // longer than a line and no break point: write it anyway, report it
        overflow.push(w.text);
        cur.words.push({ word: w, x: 0 });
        cur = { words: [] }; x = 0; lines.push(cur);
        continue;
      }
      cur = { words: [] }; x = 0; lines.push(cur);
      queue.unshift(w);
    }
  }
  while (lines.length > 1 && !lines[lines.length - 1].words.length) lines.pop();

  // 2. place lines on the rules of the pages and turn glyphs into strokes in mm
  /** @type {Page[]} */ const pages = [];
  const unplaced = [];
  const perPage = rules.length;
  lines.forEach((ln, i) => {
    const pi = Math.floor(i / perPage), li = i % perPage;
    if (o.maxPages && pi >= o.maxPages) { unplaced.push(ln.words.map((w) => w.word.text).join(' ')); return; }
    if (!pages[pi]) pages.push({ width: pw, height: ph, lines: [], paper, top: mt });
    const rule = rules[li];
    const r = stream(seed, 'line', pi, li);
    const x0 = left + gauss(r) * o.lineStartSd * xh;
    const slope = Math.tan((o.slopeDeg.mean + gauss(r) * o.slopeDeg.sd) * Math.PI / 180);
    const drift = driftFn(r, o.drift, maxW / xh);
    const base = rule - o.baselineOffset * xh;
    /** @type {Stroke[]} */ const strokes = [];
    for (const { word, x } of ln.words) {
      for (const { glyph, x: gx } of word.placed) {
        const gl = x + gx * k;
        const center = gl + glyph.W * k / 2;
        const y0 = base + drift(center / xh) * xh + center * slope;
        for (const q of glyph.polys) {
          const pts = q.map(([px, py]) => [x0 + gl + px * k, y0 + py * k]);
          strokes.push({ pts: glyph.filled ? pts : simplify(pts, o.simplify), w: glyph.w * k * penScale, filled: glyph.filled });
        }
      }
    }
    pages[pi].lines.push({ strokes, rule, text: ln.words.map((w) => w.word.text).join(' ') });
  });
  if (!pages.length) pages.push({ width: pw, height: ph, lines: [], paper, top: mt });
  while (unplaced.length && !unplaced[unplaced.length - 1]) unplaced.pop();
  return { pages, missing, substituted, overflow, unplaced, xHeight: xh, lineSpacing: rules.length > 1 ? rules[1] - rules[0] : o.lineSpacing };
}
