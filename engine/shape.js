// @ts-check
/* Word shaping: pick a variant for every character, vary it slightly, and space the letters by their ink.
 *
 * Coordinates are in em (glyph units), x from the left edge of the word's ink, y = 0 on the baseline, y down.
 * The line level (baseline drift, slope, word gaps) is applied later in layout.js.
 *
 * Provenance of the numbers (docs/decisions.md, evidence policy):
 *   - variant choice, damped random walk of size and rotation, pressure per word and per letter, ink-profile spacing:
 *     taken over from the earlier browser renderer (engine/handwriting.js), whose approach follows published projects
 *     (Text2Hand, bodiman/Handwritten); the numeric values were set by eye -> assumptions, to be measured in P4.
 *   - no per-letter baseline jitter: the glyphs already keep the vertical jitter of the letters they were cut from
 *     (pipeline/measure_layout.py splits the writer's baseline variation into that jitter and a slow drift, which
 *     layout.js adds). */
import { stream, gauss } from './rng.js';
import { resolve } from './glyphs.js';

export const SHAPE = {
  pen: 0.058,          // stroke width, em (assumption: earlier renderer)
  bold: 1.45,          // bold = wider stroke (retracing is planned for P3, docs/known-issues.md B5)
  clear: 0.05,         // minimum white between the ink of neighbouring letters, em (assumption)
  minGap: -0.10,       // letters may move closer than their boxes, em (assumption)
  pressSd: 0.07, pressMin: 0.85, pressMax: 1.18,   // pen pressure per word (assumption)
  widthSd: 0.045,      // stroke width per letter (assumption)
  sizeKeep: 0.7, sizeSd: 0.022, sizeMin: 0.9, sizeMax: 1.1,   // damped random walk of the size within a word
  rotKeep: 0.6, rotSd: 0.012, rotMax: 0.06,                    // ... and of the rotation (radians)
  sxSd: 0.03, sySd: 0.035, rotJitter: 0.012, shearSd: 0.03,    // per letter
  wobble: 0.011,       // amplitude of the two sine deformations, em
};

// ink profile: leftmost / rightmost ink per horizontal band, used to space letters so that they never touch
const NB = 30, BY0 = -1.1, BH = 0.05;

/**
 * @typedef {{ch: string, polys: number[][][], filled: boolean, w: number, W: number, L: (number|null)[], R: (number|null)[]}} Glyph
 * @typedef {{glyph: Glyph, x: number}} Placed
 * @typedef {{text: string, placed: Placed[], charStart: number[], width: number, missing: string[], substituted: string[], key: string[]}} Word
 */

function pickVariant(variants, pos, r, avoid) {
  let pool = variants.map((v, i) => i);
  if (pos) {
    const same = pool.filter((i) => variants[i].pos === pos);
    if (same.length >= 2) pool = same;
  }
  if (pool.length > 1 && avoid !== undefined) pool = pool.filter((i) => i !== avoid);
  return pool[Math.floor(r() * pool.length)];
}

/** Transform one variant and compute its ink profile. */
function prepare(ch, v, r, walk, penW) {
  walk.sz = Math.max(SHAPE.sizeMin, Math.min(SHAPE.sizeMax, 1 + (walk.sz - 1) * SHAPE.sizeKeep + gauss(r) * SHAPE.sizeSd));
  walk.rot = Math.max(-SHAPE.rotMax, Math.min(SHAPE.rotMax, walk.rot * SHAPE.rotKeep + gauss(r) * SHAPE.rotSd));
  const sx = walk.sz * (1 + gauss(r) * SHAPE.sxSd), sy = walk.sz * (1 + gauss(r) * SHAPE.sySd);
  const rot = walk.rot + gauss(r) * SHAPE.rotJitter, sh = gauss(r) * SHAPE.shearSd;
  const k1 = 5 + r() * 5, k2 = 5 + r() * 5, p1 = r() * 6.2832, p2 = r() * 6.2832;
  const a1 = SHAPE.wobble * (0.4 + r()), a2 = SHAPE.wobble * (0.4 + r());
  const cx = v.adv / 2, cr = Math.cos(rot), sr = Math.sin(rot);
  // rotate around the middle of the x-height so that letters do not jump off the baseline
  const T = ([x, y]) => {
    let u = (x - cx) * sx + y * sh, w = y * sy;
    u += a1 * Math.sin(y * k1 + p1); w += a2 * Math.sin(x * k2 + p2);
    return [cx + cr * u - sr * (w + 0.2), sr * u + cr * (w + 0.2) - 0.2];
  };
  const w = penW * (1 + gauss(r) * SHAPE.widthSd), hw = w / 2;
  let polys = v.s.map((st) => st.map(T));
  let minX = Infinity, maxX = -Infinity;
  for (const q of polys) for (const p of q) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; }
  const shift = hw - minX;
  polys = polys.map((q) => q.map((p) => [p[0] + shift, p[1]]));
  const W = maxX - minX + w;
  /** @type {(number|null)[]} */ const L = new Array(NB).fill(null);
  /** @type {(number|null)[]} */ const R = new Array(NB).fill(null);
  const mark = (x, y) => {
    const b = Math.floor((y - BY0) / BH);
    if (b < 0 || b >= NB) return;
    const lb = L[b], rb = R[b];
    if (lb === null || x - hw < lb) L[b] = x - hw;
    if (rb === null || x + hw > rb) R[b] = x + hw;
  };
  for (const q of polys) for (let i = 0; i < q.length; i++) {
    mark(q[i][0], q[i][1]);
    if (i) {
      const dx = q[i][0] - q[i - 1][0], dy = q[i][1] - q[i - 1][1], n = Math.ceil(Math.hypot(dx, dy) / 0.015);
      for (let k = 1; k < n; k++) mark(q[i - 1][0] + dx * k / n, q[i - 1][1] + dy * k / n);
    }
  }
  return { ch, polys, filled: !!v.f, w, W, L, R };
}

/** Space after `prev` so that the ink of `g` keeps at least SHAPE.clear away from it (neighbouring bands included). */
function gapBetween(prev, g) {
  let mn = Infinity;
  for (let b = 0; b < NB; b++) {
    const pr = prev.R[b];
    if (pr === null) continue;
    const dR = prev.W - pr;
    for (let b2 = b - 1; b2 <= b + 1; b2++) {
      const l = b2 >= 0 && b2 < NB ? g.L[b2] : null;
      if (l !== null && dR + l < mn) mn = dR + l;
    }
  }
  return mn === Infinity ? 0 : Math.max(SHAPE.minGap, SHAPE.clear - mn);
}

/** Positions of glyphs placed one after another. */
export function place(glyphs) {
  /** @type {Placed[]} */ const out = [];
  let x = 0;
  glyphs.forEach((g, i) => {
    if (i) x += glyphs[i - 1].W + gapBetween(glyphs[i - 1], g);
    out.push({ glyph: g, x });
  });
  return out;
}

const wordWidth = (placed) => (placed.length ? placed[placed.length - 1].x + placed[placed.length - 1].glyph.W : 0);

/**
 * Shape one word (no spaces).
 * @param {import('./glyphs.js').Library} lib
 * @param {string} text
 * @param {{seed: string|number, key: (string|number)[], bold?: boolean, positions?: boolean}} o
 *        key names this word uniquely and stably, e.g. [text, n] for the n-th occurrence of the text in the document.
 * @returns {Word}
 */
export function shapeWord(lib, text, o) {
  const r = stream(o.seed, 'word', ...o.key);
  const press = Math.max(SHAPE.pressMin, Math.min(SHAPE.pressMax, 1 + gauss(r) * SHAPE.pressSd));
  const penW = SHAPE.pen * (o.bold ? SHAPE.bold : 1) * press;
  const walk = { sz: 1, rot: 0 };
  const last = {};
  /** @type {Glyph[]} */ const glyphs = [];
  const charStart = [], missing = [], substituted = [];
  const chars = [...text];
  // letters only count for the position in the word (punctuation does not start or end a word)
  const letterIdx = chars.map((c, i) => (/\p{L}|\p{N}/u.test(c) ? i : -1)).filter((i) => i >= 0);
  const first = letterIdx[0], lastL = letterIdx[letterIdx.length - 1];
  chars.forEach((ch, i) => {
    charStart.push(glyphs.length);
    const res = resolve(lib, ch);
    if (res.kind === 'missing') { missing.push(ch); return; }
    if (res.kind !== 'exact') substituted.push(ch);
    for (const c of res.draw) {
      const vs = /** @type {import('./glyphs.js').Variant[]} */ (lib.chars.get(c));
      const pos = o.positions === false ? undefined
        : first === lastL && i === first ? 'single' : i === first ? 'initial' : i === lastL ? 'final' : 'medial';
      const vi = pickVariant(vs, pos, r, last[c]);
      last[c] = vi;
      glyphs.push(prepare(c, vs[vi], r, walk, penW));
    }
  });
  const placed = place(glyphs);
  return { text, placed, charStart, width: wordWidth(placed), missing, substituted, key: o.key.map(String) };
}

/**
 * Split a shaped word before character `at` and add a hyphen to the first part (unless the text already ends with one).
 * The letters keep their shapes; only the hyphen is new (its own random stream, so it is stable as well).
 * @param {import('./glyphs.js').Library} lib
 * @param {Word} word
 * @param {number} at
 * @param {{seed: string|number, hyphen?: boolean}} o
 * @returns {[Word, Word]}
 */
export function splitWord(lib, word, at, o) {
  const gi = word.charStart[at];
  const chars = [...word.text];
  const headG = word.placed.slice(0, gi).map((p) => p.glyph);
  const tailG = word.placed.slice(gi).map((p) => p.glyph);
  let headText = chars.slice(0, at).join('');
  const tailText = chars.slice(at).join('');
  const cs = (from, to) => word.charStart.slice(from, to).map((g) => g - word.charStart[from]);
  const headStart = cs(0, at);
  if (o.hyphen !== false && !/[-‐‑–]$/.test(headText)) {
    const res = resolve(lib, '-');
    if (res.kind !== 'missing') {
      const r = stream(o.seed, 'hyphen', ...word.key, at);
      const c = res.draw[0];
      const vs = /** @type {import('./glyphs.js').Variant[]} */ (lib.chars.get(c));
      const press = headG.length ? headG[headG.length - 1].w / SHAPE.pen : 1;
      headStart.push(headG.length);
      headG.push(prepare(c, vs[Math.floor(r() * vs.length)], r, { sz: 1, rot: 0 }, SHAPE.pen * press));
      headText += '-';
    }
  }
  const head = place(headG), tail = place(tailG);
  return [
    { ...word, text: headText, placed: head, width: wordWidth(head), charStart: headStart },
    { ...word, text: tailText, placed: tail, width: wordWidth(tail), charStart: cs(at, chars.length), key: [...word.key, 'tail', String(at)] },
  ];
}
