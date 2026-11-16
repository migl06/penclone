// @ts-check
/* Pens: how a stroke looks. Two outputs (docs/decisions.md §8):
 *   paper - a pen on paper: a stroke of (almost) constant width, colour and opacity per pen;
 *   ipad  - clean digital ink like a notes app: filled outlines whose width follows a simulated pressure and that taper
 *           at both ends (the approach of perfect-freehand: width from speed, thinning, taper).
 *
 * Without timestamps, speed is estimated from the shape with the two-thirds power law of motor control (Lacquaniti et
 * al. 1983: speed ~ curvature^(-1/3), slower in curves), see docs/research.md §4. All numbers below are assumptions until
 * they are measured (P4); the ink-deposition model for ballpoints (Franke & Rose) and pencil grain on paper in PDF output
 * are not built yet. */

/** @typedef {{color: string, width: number, opacity: number, grain?: boolean, note: string}} Pen */

/** width = factor on the writer's stroke width (the glyph library's width at the chosen size). */
export const PENS = {
  paper: {
    ballpoint: { color: '#1f2a5a', width: 1.0, opacity: 0.95, note: 'blue ballpoint' },
    fineliner: { color: '#161616', width: 1.05, opacity: 1, note: 'black fineliner, constant width' },
    gel: { color: '#1c3fae', width: 1.2, opacity: 1, note: 'saturated gel ink' },
    fountain: { color: '#1b2f6b', width: 1.3, opacity: 0.9, note: 'blue-black fountain pen' },
    pencil: { color: '#4a4a4a', width: 1.1, opacity: 0.82, grain: true, note: 'HB pencil; paper grain only in SVG' },
  },
  ipad: {
    pen: { color: '#111111', width: 1.15, opacity: 1, note: 'notes-app pen: width from simulated pressure, tapered ends' },
    pencil: { color: '#3c3c3c', width: 1.0, opacity: 0.8, grain: true, note: 'notes-app pencil' },
  },
};

/** Simulated pressure for the iPad look (assumptions, inspired by perfect-freehand's defaults). */
export const IPAD = { thinning: 0.45, taper: 0.8, minScale: 0.45, step: 0.3 };

/**
 * @param {'paper'|'ipad'} output
 * @param {string} [name]
 * @returns {Pen & {name: string}}
 */
export function resolvePen(output = 'paper', name) {
  const set = PENS[output];
  if (!set) throw new Error(`unknown output ${output}; use paper or ipad`);
  const n = name ?? (output === 'paper' ? 'ballpoint' : 'pen');
  const p = set[n];
  if (!p) throw new Error(`unknown pen ${n} for ${output}; use ${Object.keys(set).join(', ')}`);
  return { ...p, name: n };
}

/** Points every `step` mm along a polyline (keeps the original corners). */
function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

/**
 * Filled outline of one stroke (polygon, mm) with width from simulated pressure and tapered ends.
 * @param {number[][]} pts
 * @param {number} w nominal width (mm)
 */
export function outline(pts, w) {
  if (pts.length === 1) pts = [pts[0], [pts[0][0] + 0.01, pts[0][1]]];
  const p = densify(pts, IPAD.step);
  const n = p.length;
  // curvature at every point (turning angle per length), smoothed
  const curv = p.map((_, i) => {
    if (i === 0 || i === n - 1) return 0;
    const a = Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]);
    const b = Math.atan2(p[i + 1][1] - p[i][1], p[i + 1][0] - p[i][0]);
    let d = Math.abs(b - a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d / (Math.hypot(p[i + 1][0] - p[i - 1][0], p[i + 1][1] - p[i - 1][1]) / 2 || 1);
  });
  const speed = curv.map((k) => Math.pow(k + 0.5, -1 / 3));        // two-thirds power law; +0.5/mm keeps straight parts finite
  const mean = speed.reduce((a, b) => a + b, 0) / n;
  // length along the stroke for the taper
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const L = s[n - 1], taper = Math.min(IPAD.taper, L / 3);
  const width = p.map((_, i) => {
    let f = 1 - IPAD.thinning * (speed[i] / mean - 1);
    f = Math.max(IPAD.minScale, Math.min(1.35, f));
    if (taper > 0) {
      const t = Math.min(s[i], L - s[i]) / taper;
      if (t < 1) f *= IPAD.minScale + (1 - IPAD.minScale) * Math.sqrt(Math.max(0, t));
    }
    return (w * f) / 2;
  });
  for (let r = 0; r < 2; r++) for (let i = 1; i < n - 1; i++) width[i] = (width[i - 1] + 2 * width[i] + width[i + 1]) / 4;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    left.push([p[i][0] - dy * width[i], p[i][1] + dx * width[i]]);
    right.push([p[i][0] + dy * width[i], p[i][1] - dx * width[i]]);
  }
  // round caps: half circles of the (tapered) end width, going around the front at the end and the back at the start
  const cap = (c, a0, rad, steps = 4) => {
    const out = [];
    for (let k = 1; k < steps; k++) {
      const a = a0 - (Math.PI * k) / steps;
      out.push([c[0] + Math.cos(a) * rad, c[1] + Math.sin(a) * rad]);
    }
    return out;
  };
  const dirEnd = Math.atan2(p[n - 1][1] - p[n - 2][1], p[n - 1][0] - p[n - 2][0]);
  const dirStart = Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]);
  return [
    ...left,
    ...cap(p[n - 1], dirEnd + Math.PI / 2, width[n - 1]),
    ...right.reverse(),
    ...cap(p[0], dirStart - Math.PI / 2, width[0]),
  ];
}
