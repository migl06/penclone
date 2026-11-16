// @ts-check
/* Output writers: SVG and PDF from the geometry of layout.js. No DOM and no dependencies.
 *
 * Strokes of one line that share a stroke width are joined into one path (docs/known-issues.md, C3: one <svg> per
 * character made pages large). Strokes are written as straight segments: compared at 600 dpi, smoothing them with
 * quadratic curves through the segment midpoints (as the browser renderer did) made no visible difference but files
 * 2.5x larger, because the points are already dense (median 0.25 mm apart at a 0.3 mm pen). `smooth: true` keeps it. */

/** Ink colour until pens arrive in P3 (assumption: a dark blue like a ballpoint). */
export const INK = '#1f2a5a';

const f2 = (n) => {
  const s = n.toFixed(2);
  return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
};

/** Segments of a polyline, smoothed or straight: ['M', p] | ['L', p] | ['Q', c, p]. */
function segments(q, smooth = true) {
  if (q.length === 1) return [['M', q[0]], ['L', [q[0][0] + 0.001, q[0][1]]]];
  if (q.length === 2 || !smooth) return [['M', q[0]], ...q.slice(1).map((p) => ['L', p])];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const out = [['M', q[0]], ['L', mid(q[0], q[1])]];
  for (let i = 1; i < q.length - 1; i++) out.push(['Q', q[i], mid(q[i], q[i + 1])]);
  out.push(['L', q[q.length - 1]]);
  return out;
}

/** Group the strokes of a line by stroke width (0.01 mm) and fill. */
function groups(line) {
  const m = new Map();
  for (const s of line.strokes) {
    const key = s.filled ? 'f' : f2(s.w);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(s);
  }
  return m;
}

/**
 * One SVG document per page.
 * @param {import('./layout.js').Document} doc
 * @param {{color?: string, background?: string|null, smooth?: boolean}} [o]
 * @returns {string[]}
 */
export function toSVG(doc, o = {}) {
  const color = o.color ?? INK, bg = o.background === undefined ? '#fff' : o.background;
  return doc.pages.map((pg) => {
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${f2(pg.width)}mm" height="${f2(pg.height)}mm" viewBox="0 0 ${f2(pg.width)} ${f2(pg.height)}">`];
    if (bg) parts.push(`<rect width="100%" height="100%" fill="${bg}"/>`);
    parts.push(`<g fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">`);
    for (const line of pg.lines) {
      for (const [key, strokes] of groups(line)) {
        let d = '';
        for (const s of strokes) {
          for (const seg of segments(s.pts, o.smooth === true)) {
            d += seg[0] + seg.slice(1).map((p) => f2(p[0]) + ' ' + f2(p[1])).join(' ');
          }
          if (s.filled) d += 'Z';
        }
        parts.push(key === 'f' ? `<path fill="${color}" stroke="none" d="${d}"/>` : `<path stroke-width="${key}" d="${d}"/>`);
      }
    }
    parts.push('</g></svg>');
    return parts.join('\n') + '\n';
  });
}

const hex = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) throw new Error(`colour must be #rrggbb, got ${c}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f2(v / 255)).join(' ');
};

/**
 * PDF 1.4 with vector strokes (round caps and joins), one content stream per page.
 * @param {import('./layout.js').Document} doc
 * @param {{color?: string, deflate?: (b: Uint8Array) => Uint8Array, title?: string, smooth?: boolean}} [o]
 *        deflate: zlib compression (e.g. node:zlib deflateSync); without it the streams are stored uncompressed.
 * @returns {Uint8Array}
 */
export function toPDF(doc, o = {}) {
  const enc = new TextEncoder();
  const rgb = hex(o.color ?? INK);
  const PT = 72 / 25.4;
  /** @type {(string|Uint8Array)[][]} */ const objs = [];       // object bodies, index + 1 = object number
  const add = (...parts) => { objs.push(parts); return objs.length; };
  const catalog = add(''), pagesObj = add('');
  const kids = [];
  for (const pg of doc.pages) {
    const W = pg.width * PT, H = pg.height * PT;
    // mm coordinates with y down: scale by pt/mm and flip at the page top
    let c = `q ${PT.toFixed(6)} 0 0 ${(-PT).toFixed(6)} 0 ${H.toFixed(3)} cm 1 J 1 j ${rgb} RG ${rgb} rg\n`;
    for (const line of pg.lines) {
      for (const [key, strokes] of groups(line)) {
        if (key !== 'f') c += `${key} w\n`;
        for (const s of strokes) {
          let cur = s.pts[0];
          for (const seg of segments(s.pts, o.smooth === true)) {
            if (seg[0] === 'M') { cur = seg[1]; c += `${f2(cur[0])} ${f2(cur[1])} m `; }
            else if (seg[0] === 'L') { cur = seg[1]; c += `${f2(cur[0])} ${f2(cur[1])} l `; }
            else {
              const [, q, p] = seg;
              const c1 = [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])];
              const c2 = [p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])];
              c += `${f2(c1[0])} ${f2(c1[1])} ${f2(c2[0])} ${f2(c2[1])} ${f2(p[0])} ${f2(p[1])} c `;
              cur = p;
            }
          }
          c += s.filled ? 'h f\n' : '\n';
        }
        if (key !== 'f') c += 'S\n';
      }
    }
    c += 'Q\n';
    let data = enc.encode(c), filter = '';
    if (o.deflate) { data = o.deflate(data); filter = ' /Filter /FlateDecode'; }
    const content = add(`<< /Length ${data.length}${filter} >>\nstream\n`, data, '\nendstream');
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = [`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`];
  objs[pagesObj - 1] = [`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`];
  const pdfStr = (s) => '(' + s.replace(/[\\()]/g, (m) => '\\' + m).replace(/[^\x20-\x7e]/g, '?') + ')';
  const info = add(`<< /Producer (penclone)${o.title ? ` /Title ${pdfStr(o.title)}` : ''} >>`);

  /** @type {Uint8Array[]} */ const chunks = [];
  let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));     // binary marker comment (PDF 1.4, 3.4.1)
  const offsets = [];
  objs.forEach((parts, i) => {
    offsets.push(len);
    push(`${i + 1} 0 obj\n`);
    for (const p of parts) push(p);
    push('\nendobj\n');
  });
  const xref = len;
  push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`);
  for (const off of offsets) push(`${String(off).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let p = 0;
  for (const b of chunks) { out.set(b, p); p += b.length; }
  return out;
}
