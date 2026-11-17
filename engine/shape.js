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
 * @typedef {{glyph: Glyph, x: number, join?: boolean}} Placed
 * @typedef {{text: string, placed: Placed[], charStart: number[], width: number, missing: string[], substituted: string[], key: string[],
 *   spacing: {clear: (number|undefined)[], joined: boolean[], separate?: number}}} Word
 * @typedef {{clearance?: number[], joins?: boolean, widthSd?: number, pressSd?: number, jitter?: number, continuation?: boolean,
 *   deck?: boolean, centreGaps?: boolean, separate?: number, clearanceScale?: number}} Style
 *   clearance: quantiles (em) of the white between neighbouring letters, measured from the writer (else a fixed minimum);
 *   joins: join letters where the writer's variants were joined; widthSd / pressSd: pen width variation per letter / word;
 *   jitter: factor on every per-use shape variation (size, scale, rotation, shear, wobble), 1 = the values above;
 *   continuation: when the previous letter's source word went on with the needed character, use that occurrence with its
 *   original clearance and join (unit selection as in Haines et al. 2016);
 *   deck: use every variant of a character once before any is used twice (in document order; editing a word then also
 *   changes the choice of later letters of the same characters);
 *   clearanceScale: factor on the measured clearances (calibration, e.g. for a library whose letters are narrower than the
 *   ones the clearance was measured on);
 *   separate: white (em) that the ink of a letter keeps from the previous one at least; no letter overlaps the one before
 *   that either (letters joined on purpose excepted). Off when undefined;
 *   centreGaps: word gaps measured between the centre lines of the ink are applied as such (else between glyph boxes,
 *   which adds one pen width to every gap).
 */

/** Entry / exit point of a variant's join (glyph units), or null. */
const joinPoint = (v, which) => {
  const k = which === 'in' ? v.ji : v.jo;
  if (k === undefined || !v.s[k]) return null;
  const st = v.s[k];
  return which === 'in' ? st[0] : st[st.length - 1];
};

/**
 * Choose a variant. `join`: the exit point of the previous letter if it runs on into this one (then only variants that
 * start with a join are used, preferring entries at the same height), false if the previous letter ends freely (then
 * variants with an entry join are avoided), undefined to ignore joins.
 */
function pickVariant(variants, pos, r, avoid, join, uses) {
  let pool = variants.map((v, i) => i);
  if (pos) {
    const same = pool.filter((i) => variants[i].pos === pos);
    if (same.length >= 2) pool = same;
  }
  if (join !== undefined) {
    const want = !!join;
    const fit = pool.filter((i) => (variants[i].ji !== undefined) === want);
    if (fit.length) pool = fit;
  }
  if (pool.length > 1 && avoid !== undefined) pool = pool.filter((i) => i !== avoid);
  if (uses && pool.length > 1) {
    // deck: only the least used variants are candidates, so every shape is used once before any is used twice
    const m = Math.min(...pool.map((i) => uses[i] ?? 0));
    pool = pool.filter((i) => (uses[i] ?? 0) === m);
  }
  if (join && pool.length > 1) {
    // entries close to the height of the exit are likelier (the writer's own joins meet at the same height)
    const wts = pool.map((i) => {
      const p = joinPoint(variants[i], 'in');
      return p ? Math.exp(-(((p[1] - join[1]) / 0.06) ** 2)) + 1e-6 : 1e-6;
    });
    let u = r() * wts.reduce((a, b) => a + b, 0);
    for (let k = 0; k < pool.length; k++) { u -= wts[k]; if (u <= 0) return pool[k]; }
  }
  return pool[Math.floor(r() * pool.length)];
}

/** A value from measured quantiles (equally spaced probabilities from 0 to 1), linearly interpolated. */
export function fromQuantiles(r, q) {
  const u = r() * (q.length - 1), i = Math.floor(u), f = u - i;
  return q[i] + (q[Math.min(i + 1, q.length - 1)] - q[i]) * f;
}

/** Transform one variant and compute its ink profile. */
function prepare(ch, v, r, walk, penW, widthSd = SHAPE.widthSd, jitter = 1) {
  const j = jitter;
  walk.sz = Math.max(SHAPE.sizeMin, Math.min(SHAPE.sizeMax, 1 + (walk.sz - 1) * SHAPE.sizeKeep + gauss(r) * SHAPE.sizeSd * j));
  walk.rot = Math.max(-SHAPE.rotMax, Math.min(SHAPE.rotMax, walk.rot * SHAPE.rotKeep + gauss(r) * SHAPE.rotSd * j));
  const sx = walk.sz * (1 + gauss(r) * SHAPE.sxSd * j), sy = walk.sz * (1 + gauss(r) * SHAPE.sySd * j);
  const rot = walk.rot + gauss(r) * SHAPE.rotJitter * j, sh = gauss(r) * SHAPE.shearSd * j;
  const k1 = 5 + r() * 5, k2 = 5 + r() * 5, p1 = r() * 6.2832, p2 = r() * 6.2832;
  const a1 = SHAPE.wobble * j * (0.4 + r()), a2 = SHAPE.wobble * j * (0.4 + r());
  const cx = v.adv / 2, cr = Math.cos(rot), sr = Math.sin(rot);
  // rotate around the middle of the x-height so that letters do not jump off the baseline
  const T = ([x, y]) => {
    let u = (x - cx) * sx + y * sh, w = y * sy;
    u += a1 * Math.sin(y * k1 + p1); w += a2 * Math.sin(x * k2 + p2);
    return [cx + cr * u - sr * (w + 0.2), sr * u + cr * (w + 0.2) - 0.2];
  };
  const w = penW * (1 + gauss(r) * widthSd), hw = w / 2;
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
  return { ch, polys, filled: !!v.f, w, W, L, R, ji: v.ji, jo: v.jo, pts: samplePoints(polys, 0.03) };
}

/** Points along the strokes, at most `step` em apart (for exact distances between neighbouring letters). */
function samplePoints(polys, step) {
  const out = [];
  for (const q of polys) {
    for (let i = 0; i < q.length; i++) {
      if (!i) { out.push(q[0]); continue; }
      const dx = q[i][0] - q[i - 1][0], dy = q[i][1] - q[i - 1][1], n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
      for (let k = 1; k <= n; k++) out.push([q[i - 1][0] + dx * k / n, q[i - 1][1] + dy * k / n]);
    }
  }
  return out;
}

/** Smallest white between the ink of glyph `a` at x = xa and glyph `b` at x = xb (em; negative where they overlap). */
export function inkGap(a, xa, b, xb) {
  let m = Infinity;
  const pw = (a.w + b.w) / 2;
  for (const [ax, ay] of a.pts) for (const [bx, by] of b.pts) {
    const dx = ax + xa - bx - xb, dy = ay - by;
    const d2 = dx * dx + dy * dy;
    if (d2 < m) m = d2;
  }
  return Math.sqrt(m) - pw;
}

/** Space after `prev` so that the ink of `g` keeps at least `clear` away from it (neighbouring bands included).
 * minGap: how far the boxes may overlap. */
function gapBetween(prev, g, clear = SHAPE.clear, minGap = SHAPE.minGap) {
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
  return mn === Infinity ? 0 : Math.max(minGap, clear - mn);
}

/**
 * Positions of glyphs placed one after another.
 * @param {Glyph[]} glyphs
 * @param {{clear?: number[], joined?: boolean[], separate?: number}} [o] separate: see below; clear: white between the ink of glyph i-1 and i (em) per glyph;
 *   joined: glyph i continues the exit stroke of glyph i-1 (its entry point is put on that exit point).
 */
export function place(glyphs, o = {}) {
  /** @type {Placed[]} */ const out = [];
  let x = 0;
  // `separate`: letters never touch. The ink of a letter keeps at least this much white (em) from the previous one, and
  // does not overlap the one before that. Pairs that are joined on purpose are left alone.
  const apart = (i, xi) => {
    const sep = o.separate;
    for (let it = 0; it < 12; it++) {
      let need = 0;
      for (const j of [i - 1, i - 2]) {
        if (j < 0 || glyphs[i].pts === undefined || glyphs[j].pts === undefined) continue;
        need = Math.max(need, (j === i - 1 ? sep : 0) - inkGap(glyphs[j], out[j].x, glyphs[i], xi));
      }
      if (need <= 1e-4) break;
      xi += need + 0.002;
    }
    return xi;
  };
  glyphs.forEach((g, i) => {
    if (i) {
      const p = glyphs[i - 1];
      if (o.joined?.[i] && p.jo !== undefined && g.ji !== undefined) {
        const e = p.polys[p.jo], s = g.polys[g.ji];
        x += e[e.length - 1][0] - s[0][0];
      } else if (o.clear?.[i] !== undefined) {
        x += p.W + gapBetween(p, g, o.clear[i], WIDE_MIN_GAP);
      } else {
        x += p.W + gapBetween(p, g);
      }
      if (o.separate !== undefined && !(o.joined?.[i] && p.jo !== undefined && g.ji !== undefined)) x = apart(i, x);
    }
    out.push(o.joined?.[i] && i > 0 && glyphs[i - 1].jo !== undefined && g.ji !== undefined ? { glyph: g, x, join: true } : { glyph: g, x });
  });
  return out;
}

/** Largest height difference (em) between the exit of one letter and the entry of the next that is still joined. */
const MAX_JOIN_DY = 0.15;

/** With measured spacing, boxes may overlap more (the writer's own letters interleave, e.g. T and o). */
const WIDE_MIN_GAP = -0.25;

const wordWidth = (placed) => (placed.length ? placed[placed.length - 1].x + placed[placed.length - 1].glyph.W : 0);

/**
 * Shape one word (no spaces).
 * @param {import('./glyphs.js').Library} lib
 * @param {string} text
 * @param {{seed: string|number, key: (string|number)[], bold?: boolean, positions?: boolean, style?: Style,
 *   uses?: Map<string, number[]>}} o  uses: how often each variant was used so far in the document (style.deck)
 *        key names this word uniquely and stably, e.g. [text, n] for the n-th occurrence of the text in the document.
 * @returns {Word}
 */
export function shapeWord(lib, text, o) {
  const st = o.style ?? {};
  const r = stream(o.seed, 'word', ...o.key);
  const rs = stream(o.seed, 'space', ...o.key);       // own stream: spacing does not change the letter shapes
  const press = Math.max(SHAPE.pressMin, Math.min(SHAPE.pressMax, 1 + gauss(r) * (st.pressSd ?? SHAPE.pressSd)));
  const penW = SHAPE.pen * (o.bold ? SHAPE.bold : 1) * press;
  const walk = { sz: 1, rot: 0 };
  const last = {};
  /** @type {Glyph[]} */ const glyphs = [];
  /** @type {(number|undefined)[]} */ const clear = [];
  /** @type {boolean[]} */ const joined = [];
  let prevV = null, prevLetter = false;
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
      const letter = /\p{L}|\p{N}/u.test(c);
      const exit = st.joins && prevV && prevLetter && letter ? joinPoint(prevV, 'out') : null;
      // continuation: the previous letter's source word went on with this very character -> take that occurrence
      const link = st.continuation && prevV?.nx !== undefined && prevLetter && letter ? lib.byId?.get(prevV.nx) : undefined;
      const cont = !!link && link.c === c && link.i !== last[c];
      let used;
      if (o.uses) { used = o.uses.get(c); if (!used) { used = []; o.uses.set(c, used); } }
      const vi = cont && link ? link.i : pickVariant(vs, pos, r, last[c], st.joins ? (exit ?? false) : undefined, used);
      last[c] = vi;
      if (used) used[vi] = (used[vi] ?? 0) + 1;
      const g = prepare(c, vs[vi], r, walk, penW, st.widthSd, st.jitter ?? 1);
      let jn = cont ? prevV?.jo !== undefined && vs[vi].ji !== undefined && !!st.joins : !!exit && vs[vi].ji !== undefined;
      if (jn) {
        // a join that would have to bridge a large height difference looks drawn, not written: lift the pen instead
        const pg = glyphs[glyphs.length - 1], e = pg.polys[pg.jo ?? -1], sIn = g.polys[g.ji ?? -1];
        if (!e || !sIn || Math.abs(e[e.length - 1][1] - sIn[0][1]) > MAX_JOIN_DY) jn = false;
      }
      joined.push(jn);
      // measured clearance is between centre lines; the ink profile includes the pen, so subtract one pen width
      const sampled = st.clearance ? fromQuantiles(rs, st.clearance) - penW : undefined;
      clear.push(cont && prevV?.ng !== undefined ? prevV.ng - penW : sampled);
      glyphs.push(g);
      prevV = vs[vi]; prevLetter = letter;
    }
  });
  const spacing = { clear, joined, separate: st.separate };
  const placed = place(glyphs, spacing);
  return { text, placed, charStart, width: wordWidth(placed), missing, substituted, key: o.key.map(String), spacing };
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
  const sp = word.spacing ?? { clear: [], joined: [] };
  const headSp = { clear: sp.clear.slice(0, gi), joined: sp.joined.slice(0, gi), separate: sp.separate };
  while (headSp.clear.length < headG.length) { headSp.clear.push(sp.clear[gi]); headSp.joined.push(false); }
  const tailSp = { clear: [undefined, ...sp.clear.slice(gi + 1)], joined: [false, ...sp.joined.slice(gi + 1)], separate: sp.separate };
  const head = place(headG, headSp), tail = place(tailG, tailSp);
  return [
    { ...word, text: headText, placed: head, width: wordWidth(head), charStart: headStart, spacing: headSp },
    { ...word, text: tailText, placed: tail, width: wordWidth(tail), charStart: cs(at, chars.length), key: [...word.key, 'tail', String(at)], spacing: tailSp },
  ];
}
