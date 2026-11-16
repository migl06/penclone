// @ts-check
/* Hyphenation with Liang's algorithm (F. M. Liang, "Word Hy-phen-a-tion by Com-put-er", Stanford 1983) and the TeX
 * patterns of hyph-utf8. German needs it more than English because of long compound words (docs/research.md §5). */

/** @typedef {{tag: string, leftmin: number, rightmin: number, patterns: string, exceptions: string}} PatternSet */

/** Compile a pattern set: map from the letters of a pattern to its inter-letter values. */
export function compile(/** @type {PatternSet} */ set) {
  /** @type {Map<string, number[]>} */
  const table = new Map();
  let maxLen = 0;
  for (const p of set.patterns.split(' ')) {
    if (!p) continue;
    const letters = [], values = [0];
    for (const ch of p) {
      if (ch >= '0' && ch <= '9') values[values.length - 1] = Number(ch);
      else { letters.push(ch); values.push(0); }
    }
    const key = letters.join('');
    table.set(key, values);
    if (letters.length > maxLen) maxLen = letters.length;
  }
  /** @type {Map<string, number[]>} */
  const exceptions = new Map();
  for (const e of set.exceptions.split(' ')) {
    if (!e) continue;
    const pts = [];
    let n = 0;
    for (const ch of e) { if (ch === '-') pts.push(n); else n++; }
    exceptions.set(e.replace(/-/g, ''), pts);
  }
  return { table, maxLen, exceptions, leftmin: set.leftmin, rightmin: set.rightmin };
}

/**
 * Break points of one word made of letters only: indices i where a hyphen may go before letter i.
 * @param {ReturnType<typeof compile>} h
 * @param {string} word
 */
export function breakPoints(h, word) {
  const lower = word.toLowerCase();
  const chars = [...lower];
  if (chars.length !== [...word].length) return [];     // lower-casing changed the length (e.g. a special capital)
  const ex = h.exceptions.get(lower);
  if (ex) return ex;
  const n = chars.length;
  if (n < h.leftmin + h.rightmin) return [];
  const w = ['.', ...chars, '.'];
  const vals = new Array(w.length + 1).fill(0);
  for (let i = 0; i < w.length; i++) {
    let key = '';
    for (let j = i; j < Math.min(w.length, i + h.maxLen); j++) {
      key += w[j];
      const v = h.table.get(key);
      if (!v) continue;
      for (let k = 0; k < v.length; k++) if (v[k] > vals[i + k]) vals[i + k] = v[k];
    }
  }
  // vals[i + 1] is the value between w[i] and w[i + 1]; w[0] is the leading dot, so letter k is w[k + 1]
  const out = [];
  for (let k = h.leftmin; k <= n - h.rightmin; k++) if (vals[k + 1] % 2 === 1) out.push(k);
  return out;
}

/**
 * Break points of a word as written, possibly with punctuation and explicit hyphens ("IT-Sicherheit,").
 * Returns [{at, hyphen}] where `at` is the character index before which the line may break and `hyphen` says whether a
 * hyphen has to be added (false after an explicit hyphen).
 * @param {ReturnType<typeof compile> | null} h
 * @param {string} text
 */
export function wordBreaks(h, text) {
  const chars = [...text];
  /** @type {{at: number, hyphen: boolean}[]} */ const out = [];
  let i = 0;
  while (i < chars.length) {
    if (/\p{L}/u.test(chars[i])) {
      let j = i;
      while (j < chars.length && /\p{L}/u.test(chars[j])) j++;
      if (h) for (const k of breakPoints(h, chars.slice(i, j).join(''))) out.push({ at: i + k, hyphen: true });
      i = j;
    } else {
      // break after an explicit hyphen or slash if something follows that is long enough to stand on the next line
      if (/[-‐‑–/]/.test(chars[i]) && i >= 2 && chars.length - i - 1 >= 2) out.push({ at: i + 1, hyphen: false });
      i++;
    }
  }
  return out;
}
