// @ts-check
/* Glyph library: the writer's characters as stroke variants.
 *
 * Format (written by pipeline/build_glyphs.py and build_glyphs_v2.py):
 *   { "<char>": [ { "adv": number, "s": [[[x, y], ...], ...], "f"?: true, "pos"?: "initial"|"medial"|"final"|"single" } ] }
 * Units are em with the baseline at y = 0 and y pointing down; the pipeline normalises the x-height to 0.42 em.
 * "f" marks a filled shape (e.g. a solid triangle), "pos" the position in the word the variant was written in. */

/** Lower-case letters without ascender or descender; their median top is the x-height (as in the pipeline). */
const XH_CHARS = 'acemnorsuvwxz';

/** @typedef {{adv: number, s: number[][][], f?: boolean, pos?: string, ji?: number, jo?: number, id?: number, nx?: number, ng?: number}} Variant
 *  ji / jo: stroke whose start / end runs on into the previous / next letter; id, nx, ng: this variant's id, the id of the
 *  letter that followed it in the source word and the clearance to it (em). */
/** @typedef {{chars: Map<string, Variant[]>, xHeight: number, byId?: Map<number, {c: string, i: number}>}} Library */

/** Build a library from glyph JSON (one object, or several merged in order: e.g. sheet v1 + sheet v2). */
export function loadLibrary(...sources) {
  /** @type {Map<string, Variant[]>} */
  const chars = new Map();
  for (const src of sources) {
    if (!src) continue;
    for (const [ch, vs] of Object.entries(src)) {
      if (!Array.isArray(vs) || !vs.length) continue;
      const cur = chars.get(ch) ?? [];
      for (const v of vs) if (v && Array.isArray(v.s) && v.s.length) cur.push(v);
      if (cur.length) chars.set(ch, cur);
    }
  }
  if (!chars.size) throw new Error('glyph library is empty');
  /** @type {Map<number, {c: string, i: number}>} variant id -> character and index (links between source neighbours) */
  const byId = new Map();
  for (const [c, vs] of chars) vs.forEach((v, i) => { if (typeof v.id === 'number') byId.set(v.id, { c, i }); });
  return { chars, xHeight: measureXHeight(chars), byId };
}

function measureXHeight(chars) {
  const tops = [];
  for (const c of XH_CHARS) for (const v of chars.get(c) ?? []) {
    let top = 0;
    for (const st of v.s) for (const p of st) if (-p[1] > top) top = -p[1];
    tops.push(top);
  }
  if (!tops.length) return 0.42;
  tops.sort((a, b) => a - b);
  return tops[Math.floor(tops.length / 2)];
}

/* Characters that are drawn with another character when the writer has not written them (yet).
 * Only typographic look-alikes; the substitution is reported, never silent. */
const LOOKALIKE = {
  '’': "'", '‘': "'", '‚': ',', '”': '“', '′': "'", '´': "'", '`': "'",
  '—': '–', '‒': '–', '‐': '-', '‑': '-', '−': '-', '–': '-',
  '»': '>', '«': '<', '…': '...', 'ẞ': 'SS', '·': '.', '•': '·',
  '×': 'x', '→': '->', '⇒': '=>', '≤': '<=', '≥': '>=', '≠': '=',
};

/**
 * Return the characters to draw for `ch`: itself if written, else a look-alike, else the base letter without accent.
 * @param {Library} lib
 * @returns {{draw: string[], kind: 'exact'|'lookalike'|'base'|'missing'}}
 */
export function resolve(lib, ch) {
  if (lib.chars.has(ch)) return { draw: [ch], kind: 'exact' };
  const seen = new Set([ch]);
  let alt = LOOKALIKE[ch];
  while (alt && !seen.has(alt)) {
    const parts = [...alt];
    if (parts.every((c) => lib.chars.has(c))) return { draw: parts, kind: 'lookalike' };
    seen.add(alt);
    alt = parts.length === 1 ? LOOKALIKE[alt] : undefined;
  }
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (base && base !== ch && [...base].every((c) => lib.chars.has(c))) return { draw: [...base], kind: 'base' };
  return { draw: [], kind: 'missing' };
}
