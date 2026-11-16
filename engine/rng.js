// @ts-check
/* Seeded randomness keyed by position.
 *
 * Every random decision gets its own stream, derived from the document seed and a key that names *what* is decided
 * (e.g. the word, which occurrence of that word it is, and which character). Editing one word therefore changes only
 * that word; with a single global stream, every later letter would change too (docs/known-issues.md, C5). */

/** 32-bit FNV-1a hash of the parts, joined with a separator that cannot occur in text. */
export function hash(...parts) {
  let h = 0x811c9dc5;
  const s = parts.join('\u0000');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // final avalanche (murmur3 fmix32) so that similar keys give unrelated seeds
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32: small, fast PRNG with a 32-bit state; returns floats in [0, 1). */
export function prng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random stream for the given key parts. */
export const stream = (...parts) => prng(hash(...parts));

/** Approximately standard normal (sum of four uniforms, scaled to sd 1, bounded to +-3.46). */
export const gauss = (r) => (r() + r() + r() + r() - 2) * 1.7320508;
