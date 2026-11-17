// Engine tests with a synthetic glyph library (no real handwriting in the repository or in CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadLibrary, hyphenator, render, toSVG, toPDF, measured, shapeWord, wordBreaks, resolve, LAYOUT,
} from '../engine/index.js';
import { inkGap } from '../engine/shape.js';
import { simplify } from '../engine/layout.js';
import { prng } from '../engine/rng.js';

/** Zig-zag "letters": x-height 0.42 em, ascenders/capitals 0.62 em, descenders to +0.2 em; 3 variants each. */
function syntheticGlyphs() {
  const r = prng(42);
  const g = {};
  const chars = 'abcdefghijklmnopqrstuvwxyzäöüßABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ0123456789.,:;!?-–„“\'()';
  for (const ch of chars) {
    const tall = /[A-ZÄÖÜbdfhklt0-9ß!?(“\']/.test(ch), desc = /[gjpqy,;(]/.test(ch), small = /[.,:;\-–„“\']/.test(ch);
    const top = small ? -0.12 : tall ? -0.62 : -0.42, bottom = desc ? 0.2 : 0;
    g[ch] = [0, 1, 2].map(() => {
      const w = small ? 0.08 : 0.22 + r() * 0.1;
      const s = [];
      for (let i = 0; i <= 6; i++) s.push([0.03 + (w * i) / 6 + (r() - 0.5) * 0.01, i % 2 ? bottom : top + (r() - 0.5) * 0.02]);
      return { adv: w + 0.06, s: [s] };
    });
  }
  return g;
}

const lib = loadLibrary(syntheticGlyphs());
const H = await hyphenator('de');
const opts = (o = {}) => ({ seed: 7, hyphenator: H, ...o });
const allPts = (doc) => doc.pages.flatMap((p) => p.lines.flatMap((l) => l.strokes.flatMap((s) => s.pts)));

test('x-height of the library is measured from the glyphs', () => {
  assert.ok(Math.abs(lib.xHeight - 0.42) < 0.02, String(lib.xHeight));
});

test('German hyphenation (Liang, de-1996 patterns)', () => {
  const show = (w) => {
    const b = new Set(wordBreaks(H, w).map((x) => x.at));
    return [...w].map((c, i) => (b.has(i) ? '-' : '') + c).join('');
  };
  assert.equal(show('Silbentrennung'), 'Sil-ben-tren-nung');
  assert.equal(show('Informationssicherheit'), 'In-for-ma-ti-ons-si-cher-heit');
  assert.equal(show('Zucker'), 'Zu-cker');
  assert.equal(show('Schifffahrt'), 'Schiff-fahrt');
  assert.equal(show('über'), 'über');                       // at least two letters on each side
  assert.equal(show('IT-Sicherheit,'), 'IT--Si-cher-heit,'); // break after the explicit hyphen, no extra hyphen
  assert.deepEqual(wordBreaks(H, 'IT-Sicherheit').find((b) => b.at === 3), { at: 3, hyphen: false });
});

test('same seed, same output; other seed, other output', () => {
  const t = 'Vertraulichkeit, Integrität und Verfügbarkeit.\nZweite Zeile.';
  const a = toSVG(render(lib, t, opts()))[0], b = toSVG(render(lib, t, opts()))[0];
  assert.equal(a, b);
  assert.notEqual(a, toSVG(render(lib, t, opts({ seed: 8 })))[0]);
});

test('editing a word leaves the other lines unchanged (randomness per position)', () => {
  const a = render(lib, 'eins zwei drei\nvier fünf sechs', opts());
  const b = render(lib, 'eins zwo drei\nvier fünf sechs', opts());
  assert.deepEqual(a.pages[0].lines[1], b.pages[0].lines[1]);
  assert.notDeepEqual(a.pages[0].lines[0], b.pages[0].lines[0]);
  // the shape of a word depends only on its text and which occurrence it is
  const s1 = shapeWord(lib, 'drei', { seed: 7, key: ['drei', 1] }), s2 = shapeWord(lib, 'drei', { seed: 7, key: ['drei', 1] });
  assert.deepEqual(s1, s2);
  assert.notDeepEqual(s1.placed, shapeWord(lib, 'drei', { seed: 7, key: ['drei', 2] }).placed);
});

test('text stays inside the margins and lines do not overlap', () => {
  const text = 'Symmetrische Verschlüsselung nutzt einen gemeinsamen Schlüssel, asymmetrische ein Schlüsselpaar. '.repeat(12);
  const doc = render(lib, text, opts({ page: 'a5', margin: [15, 15, 15, 15] }));
  const xh = doc.xHeight, slack = 4 * LAYOUT.lineStartSd * xh;
  for (const [x] of allPts(doc)) {
    assert.ok(x >= 15 - slack && x <= 148 - 15 + slack, `x=${x}`);
  }
  assert.ok(doc.pages.length >= 1 && doc.overflow.length === 0);
  for (const pg of doc.pages) pg.lines.forEach((l, i) => i && assert.ok(l.rule > pg.lines[i - 1].rule));
});

test('long compounds are hyphenated at the end of a line', () => {
  const doc = render(lib, 'Die Donaudampfschifffahrtsgesellschaft und das Informationssicherheitsmanagementsystem',
    opts({ page: [80, 200], margin: [10, 10, 10, 10], hyphenMinGap: 2 }));
  const lines = doc.pages[0].lines.map((l) => l.text);
  assert.ok(lines.some((t) => /\p{L}-$/u.test(t)), lines.join(' | '));
  assert.equal(lines.join(' ').replace(/(\p{L})- /gu, '$1'),
    'Die Donaudampfschifffahrtsgesellschaft und das Informationssicherheitsmanagementsystem');
});

test('a word longer than a line without break points is reported, not lost', () => {
  const doc = render(lib, 'kurz xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', opts({ page: [60, 100], margin: [10, 10, 10, 10] }));
  assert.deepEqual(doc.overflow, ['xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx']);
});

test('missing characters are reported, look-alikes are used and reported', () => {
  assert.equal(resolve(lib, '’').kind, 'lookalike');                // ’ -> '
  assert.deepEqual(resolve(lib, 'é'), { draw: ['e'], kind: 'base' });   // accent missing -> base letter
  const doc = render(lib, 'a § b ’ é', opts());
  assert.deepEqual(doc.missing, { '§': 1 });
  assert.deepEqual(doc.substituted, { '’': 1, 'é': 1 });
});

test('empty lines stay empty, page breaks happen', () => {
  const doc = render(lib, 'a\n\nb', opts());
  assert.equal(doc.pages[0].lines.length, 3);
  assert.equal(doc.pages[0].lines[1].strokes.length, 0);
  const many = render(lib, Array.from({ length: 80 }, (_, i) => `Zeile ${i}`).join('\n'), opts());
  assert.ok(many.pages.length >= 3);
});

test('PDF: valid structure, offsets in the cross-reference table are correct', () => {
  const doc = render(lib, 'Hallo Welt.\nZweite Seite?', opts({ page: [100, 22], margin: [5, 5, 5, 5], lineSpacing: 8 }));
  assert.equal(doc.pages.length, 2);
  const pdf = toPDF(doc, { title: 'test' });
  const s = new TextDecoder('latin1').decode(pdf);
  assert.ok(s.startsWith('%PDF-1.4\n'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  const startxref = Number(/startxref\n(\d+)/.exec(s)[1]);
  assert.equal(s.slice(startxref, startxref + 4), 'xref');
  const rows = s.slice(startxref).split('\n').slice(3).filter((l) => / n $/.test(l));
  rows.forEach((row, i) => {
    const off = Number(row.slice(0, 10));
    assert.equal(s.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`);
  });
  assert.match(s, /\/Count 2/);
  assert.match(s, /\nS\n/);
});

test('SVG: one document per page, a few paths per line (not one per letter)', () => {
  const text = 'Vertraulichkeit Integrität Verfügbarkeit Authentizität';
  const doc = render(lib, text, opts());
  const svg = toSVG(doc);
  assert.equal(svg.length, 1);
  const paths = (svg[0].match(/<path /g) || []).length;
  assert.ok(paths >= 1 && paths < [...text].length / 2, `${paths} paths`);
});

test('measured layout from a profile overrides the assumptions', () => {
  const m = measured({
    x_height_pt: 6.6, word_gap: { n: 100, median: 1.5, q1: 1.2, q3: 1.8 }, baseline_offset: { n: 30, median: 0.25 },
    line_slope_deg: { n: 30, mean: -0.1, sd: 0.2 }, drift: { model: 'exponential', drift_sd: 0.15, range: 4.2 },
  });
  assert.ok(Math.abs(m.xHeight - 6.6 * 25.4 / 72) < 1e-9);
  assert.deepEqual(m.wordGap, { median: 1.5, q1: 1.2, q3: 1.8 });
  assert.deepEqual(m.drift, { sd: 0.15, range: 4.2 });
  assert.deepEqual(measured({ word_gap: { n: 5, median: 9, q1: 9, q3: 9 } }), {});   // too few gaps: not used
});

test('line simplification keeps the ends and stays within the tolerance', () => {
  const pts = Array.from({ length: 50 }, (_, i) => [i * 0.1, Math.sin(i / 5) * 0.5]);
  const s = simplify(pts, 0.02);
  assert.deepEqual(s[0], pts[0]);
  assert.deepEqual(s[s.length - 1], pts[pts.length - 1]);
  assert.ok(s.length < pts.length);
  // every dropped point is within 0.02 of the simplified polyline
  const dist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  for (const p of pts) {
    const d = Math.min(...s.slice(1).map((b, i) => dist(p, s[i], b)));
    assert.ok(d <= 0.02 + 1e-9, String(d));
  }
});

test('separate: no two neighbouring letters overlap, and the white between them is at least the given value', () => {
  // wide "letters" that would overlap with a negative measured clearance
  const widths = lib.chars.get('a')[0];
  const style = { separate: 0.025, clearance: [-0.2, -0.1, 0, 0.05] };
  for (const w of ['aaaa', 'abcde', 'mmnn', 'hello']) {
    const plain = shapeWord(lib, w, { seed: 3, key: [w, 1], style: { clearance: style.clearance } });
    const sep = shapeWord(lib, w, { seed: 3, key: [w, 1], style });
    for (let i = 1; i < sep.placed.length; i++) {
      const a = sep.placed[i - 1], b = sep.placed[i];
      assert.ok(inkGap(a.glyph, a.x, b.glyph, b.x) >= 0.025 - 1e-3, `${w}[${i}] keeps its distance`);
    }
    assert.ok(sep.width >= plain.width - 1e-9, 'separating never pulls letters closer');
  }
  assert.ok(widths);
});
