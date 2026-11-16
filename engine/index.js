// @ts-check
/* penclone engine: text -> handwriting geometry -> SVG / PDF. Runs in Node and in the browser (no DOM, no dependencies).
 *
 *   import { loadLibrary, hyphenator, render, toSVG, toPDF } from './engine/index.js';
 *   const lib = loadLibrary(glyphsJson);                       // glyph JSON of a profile
 *   const doc = render(lib, 'Text …', { hyphenator: await hyphenator('de'), seed: 1 });
 *   const svgPages = toSVG(doc);
 *
 * Node helpers for profiles and files live in node.js; the command line in bin/penclone.js. */
import { layout } from './layout.js';
import { compile } from './hyphenate.js';

export { loadLibrary, resolve } from './glyphs.js';
export { shapeWord, splitWord, place, SHAPE } from './shape.js';
export { layout, measured, LAYOUT, PAGES } from './layout.js';
export { compile as compileHyphenation, breakPoints, wordBreaks } from './hyphenate.js';
export { toSVG, toPDF, INK } from './output.js';
export { hash, prng, stream } from './rng.js';

/** Hyphenation pattern set per language (TeX hyph-utf8 tags). English follows with the English language pack. */
export const HYPHENATION = { de: 'de-1996' };

const cache = new Map();
/** Compiled hyphenation patterns for a language, or null if none are available. */
export async function hyphenator(lang = 'de') {
  const tag = HYPHENATION[lang];
  if (!tag) return null;
  if (!cache.has(tag)) cache.set(tag, compile((await import(`./hyph/${tag}.js`)).default));
  return cache.get(tag);
}

/**
 * Render text with a glyph library. Same as layout(); kept as the stable entry point for CLI, MCP server and browser.
 * @param {import('./glyphs.js').Library} lib
 * @param {string} text
 * @param {Parameters<typeof layout>[2]} [options]
 */
export function render(lib, text, options = {}) {
  return layout(lib, text, options);
}
