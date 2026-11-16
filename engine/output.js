// @ts-check
/* Output writers from the geometry of layout.js: SVG, PDF, and editable ink (Xournal++, InkML, Excalidraw).
 * No DOM and no dependencies; compression (PDF streams, .xopp) is passed in by the caller (node:zlib in node.js).
 *
 * Strokes of one line that share a stroke width are joined into one path (docs/known-issues.md, C3). Strokes are written as
 * straight segments: compared at 600 dpi, smoothing them with quadratic curves through the segment midpoints made no visible
 * difference but files 2.5x larger, because the points are already dense (median 0.25 mm apart at a 0.3 mm pen).
 * `smooth: true` keeps the curves. With output "ipad" every stroke becomes a filled outline (pens.js). */
import { outline, resolvePen } from './pens.js';
import { paperItems } from './paper.js';

/** Default ink (the ballpoint pen); kept for callers of the first engine version. */
export const INK = '#1f2a5a';

const f2 = (n) => {
  const s = n.toFixed(2);
  return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
};

/** @typedef {{output?: 'paper'|'ipad', pen?: string, color?: string, opacity?: number, smooth?: boolean, paper?: boolean, background?: string|null}} Style */

/** Pen, colour and opacity from the style options. */
function ink(o = {}) {
  const output = o.output ?? 'paper';
  const pen = resolvePen(output, o.pen);
  return { output, pen, color: o.color ?? pen.color, opacity: o.opacity ?? pen.opacity, grain: !!pen.grain };
}

/** Segments of a polyline, smoothed or straight: ['M', p] | ['L', p] | ['Q', c, p]. */
function segments(q, smooth = false) {
  if (q.length === 1) return [['M', q[0]], ['L', [q[0][0] + 0.001, q[0][1]]]];
  if (q.length === 2 || !smooth) return [['M', q[0]], ...q.slice(1).map((p) => ['L', p])];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const out = [['M', q[0]], ['L', mid(q[0], q[1])]];
  for (let i = 1; i < q.length - 1; i++) out.push(['Q', q[i], mid(q[i], q[i + 1])]);
  out.push(['L', q[q.length - 1]]);
  return out;
}

/** Drawable groups of one line: {fill: true, polys} or {fill: false, width, polys}. */
function groups(line, st) {
  const m = new Map();
  const add = (key, item) => { if (!m.has(key)) m.set(key, []); m.get(key).push(item); };
  for (const s of line.strokes) {
    if (s.filled) add('f', s.pts);
    else if (st.output === 'ipad') add('f', outline(s.pts, s.w));
    else add(f2(s.w), s.pts);
  }
  return [...m].map(([key, polys]) => (key === 'f' ? { fill: true, polys } : { fill: false, width: key, polys }));
}

function b64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/**
 * One SVG document per page.
 * @param {import('./layout.js').Document} doc
 * @param {Style} [o]
 * @returns {string[]}
 */
export function toSVG(doc, o = {}) {
  const st = ink(o), bg = o.background === undefined ? '#fff' : o.background;
  return doc.pages.map((pg) => {
    const W = f2(pg.width), H = f2(pg.height);
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`];
    if (bg) parts.push(`<rect width="100%" height="100%" fill="${bg}"/>`);
    if (o.paper !== false && pg.paper) {
      const scan = pg.paper.background;
      if (scan?.png) parts.push(`<image href="data:image/png;base64,${b64(scan.png)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`);
      const it = paperItems(pg.paper, pg.width, pg.height, pg.top ?? 20, doc.lineSpacing);
      if (it.lines.length || it.dots.length) {
        parts.push('<g stroke-linecap="round">');
        for (const [x1, y1, x2, y2, c, w] of it.lines) parts.push(`<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${c}" stroke-width="${w}"/>`);
        for (const [x, y, c, d] of it.dots) parts.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(d / 2)}" fill="${c}"/>`);
        parts.push('</g>');
      }
    }
    if (st.grain) {
      // pencil: paper grain as a noise mask (assumption: grain of about half a millimetre)
      parts.push('<defs><filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="2" seed="3" result="n"/>'
        + '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.4 1.35" result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/></filter></defs>');
    }
    const op = st.opacity < 1 ? ` opacity="${st.opacity}"` : '';
    parts.push(`<g fill="none" stroke="${st.color}" stroke-linecap="round" stroke-linejoin="round"${op}${st.grain ? ' filter="url(#grain)"' : ''}>`);
    for (const line of pg.lines) {
      for (const g of groups(line, st)) {
        let d = '';
        for (const q of g.polys) {
          for (const seg of segments(q, o.smooth === true && !g.fill)) d += seg[0] + seg.slice(1).map((p) => f2(p[0]) + ' ' + f2(p[1])).join(' ');
          if (g.fill) d += 'Z';
        }
        parts.push(g.fill ? `<path fill="${st.color}" stroke="none" d="${d}"/>` : `<path stroke-width="${g.width}" d="${d}"/>`);
      }
    }
    parts.push('</g></svg>');
    return parts.join('\n') + '\n';
  });
}

const rgb = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) throw new Error(`colour must be #rrggbb, got ${c}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const pdfRGB = (c) => rgb(c).map((v) => f2(v / 255)).join(' ');

/** Width, height, colour type and concatenated IDAT data of an 8-bit, non-interlaced grey or RGB PNG. */
export function pngInfo(png) {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (dv.getUint32(0) !== 0x89504e47) throw new Error('background is not a PNG');
  let p = 8, info = null;
  const idat = [];
  while (p < png.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(...png.subarray(p + 4, p + 8));
    const data = png.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      info = { width: dv.getUint32(p + 8), height: dv.getUint32(p + 12), depth: data[8], color: data[9], interlace: data[12] };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!info || info.depth !== 8 || ![0, 2].includes(info.color) || info.interlace) {
    throw new Error('background PNG must be 8-bit grey or RGB without interlacing (pipeline/scan_paper.py writes that)');
  }
  const n = idat.reduce((a, b) => a + b.length, 0), all = new Uint8Array(n);
  let o = 0;
  for (const b of idat) { all.set(b, o); o += b.length; }
  return { ...info, data: all };
}

/**
 * PDF 1.4 with vector strokes (round caps and joins); paper as vectors, a scanned background as an image.
 * @param {import('./layout.js').Document} doc
 * @param {Style & {deflate?: (b: Uint8Array) => Uint8Array, title?: string}} [o]
 *        deflate: zlib compression (e.g. node:zlib deflateSync); without it the streams are stored uncompressed.
 * @returns {Uint8Array}
 */
export function toPDF(doc, o = {}) {
  const st = ink(o);
  const enc = new TextEncoder();
  const PT = 72 / 25.4;
  /** @type {(string|Uint8Array)[][]} */ const objs = [];
  const add = (...parts) => { objs.push(parts); return objs.length; };
  const catalog = add(''), pagesObj = add('');
  const gs = st.opacity < 1 ? add(`<< /Type /ExtGState /CA ${st.opacity} /ca ${st.opacity} >>`) : 0;
  const images = new Map();
  const kids = [];
  for (const pg of doc.pages) {
    const W = pg.width * PT, H = pg.height * PT;
    let c = '';
    let xobj = '';
    const scan = o.paper !== false ? pg.paper?.background : null;
    if (scan?.png) {
      if (!images.has(scan.png)) {
        const im = pngInfo(scan.png), colors = im.color === 2 ? 3 : 1;
        images.set(scan.png, add(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /${colors === 3 ? 'DeviceRGB' : 'DeviceGray'} /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colors} /BitsPerComponent 8 /Columns ${im.width} >> /Length ${im.data.length} >>\nstream\n`, im.data, '\nendstream'));
      }
      xobj = ` /XObject << /Im0 ${images.get(scan.png)} 0 R >>`;
      c += `q ${W.toFixed(3)} 0 0 ${H.toFixed(3)} 0 0 cm /Im0 Do Q\n`;
    }
    // mm coordinates with y down: scale by pt/mm and flip at the page top
    c += `q ${PT.toFixed(6)} 0 0 ${(-PT).toFixed(6)} 0 ${H.toFixed(3)} cm 1 J 1 j\n`;
    if (o.paper !== false && pg.paper) {
      const it = paperItems(pg.paper, pg.width, pg.height, pg.top ?? 20, doc.lineSpacing);
      const byStyle = new Map();
      for (const [x1, y1, x2, y2, col, w] of it.lines) {
        const k = `${col} ${w}`;
        byStyle.set(k, (byStyle.get(k) ?? '') + `${f2(x1)} ${f2(y1)} m ${f2(x2)} ${f2(y2)} l `);
      }
      for (const [x, y, col, d] of it.dots) {
        const k = `${col} ${d}`;
        byStyle.set(k, (byStyle.get(k) ?? '') + `${f2(x)} ${f2(y)} m ${f2(x)} ${f2(y)} l `);
      }
      for (const [k, path] of byStyle) {
        const [col, w] = k.split(' ');
        c += `${pdfRGB(col)} RG ${w} w ${path}S\n`;
      }
    }
    c += `${pdfRGB(st.color)} RG ${pdfRGB(st.color)} rg${gs ? ' /GS0 gs' : ''}\n`;
    for (const line of pg.lines) {
      for (const g of groups(line, st)) {
        if (!g.fill) c += `${g.width} w\n`;
        for (const q of g.polys) {
          let cur = q[0];
          for (const seg of segments(q, o.smooth === true && !g.fill)) {
            if (seg[0] === 'M') { cur = seg[1]; c += `${f2(cur[0])} ${f2(cur[1])} m `; }
            else if (seg[0] === 'L') { cur = seg[1]; c += `${f2(cur[0])} ${f2(cur[1])} l `; }
            else {
              const [, qq, p] = seg;
              const c1 = [cur[0] + 2 / 3 * (qq[0] - cur[0]), cur[1] + 2 / 3 * (qq[1] - cur[1])];
              const c2 = [p[0] + 2 / 3 * (qq[0] - p[0]), p[1] + 2 / 3 * (qq[1] - p[1])];
              c += `${f2(c1[0])} ${f2(c1[1])} ${f2(c2[0])} ${f2(c2[1])} ${f2(p[0])} ${f2(p[1])} c `;
              cur = p;
            }
          }
          c += g.fill ? 'h\n' : '\n';
        }
        c += g.fill ? 'f\n' : 'S\n';
      }
    }
    c += 'Q\n';
    let data = enc.encode(c), filter = '';
    if (o.deflate) { data = o.deflate(data); filter = ' /Filter /FlateDecode'; }
    const content = add(`<< /Length ${data.length}${filter} >>\nstream\n`, data, '\nendstream');
    const res = `<<${gs ? ` /ExtGState << /GS0 ${gs} 0 R >>` : ''}${xobj} >>`;
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources ${res} /Contents ${content} 0 R >>`));
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

const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * Xournal++ document (XML; the caller gzips it to .xopp). Strokes stay editable. Units: pt.
 * Paper: lined / squared / dotted become Xournal++ backgrounds; a scan is not carried over (background left plain).
 * Format as found in Xournal++ files (gzip XML, lineage of Xournal .xoj); not verified against every app version.
 * @param {import('./layout.js').Document} doc
 * @param {Style} [o]
 */
export function toXournal(doc, o = {}) {
  const st = ink(o), PT = 72 / 25.4;
  const [r, g, b] = rgb(st.color);
  const col = '#' + [r, g, b, Math.round(st.opacity * 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
  const style = (p) => ({ lined: 'lined', squared: 'graph', dotted: 'dotted' }[p?.type] ?? 'plain');
  const out = ['<?xml version="1.0" standalone="no"?>', '<xournal creator="penclone" fileversion="4">', '<title>Xournal++ document - see https://github.com/xournalpp/xournalpp</title>'];
  for (const pg of doc.pages) {
    out.push(`<page width="${f2(pg.width * PT)}" height="${f2(pg.height * PT)}">`);
    out.push(`<background type="solid" color="#ffffffff" style="${o.paper === false ? 'plain' : style(pg.paper)}"/>`);
    out.push('<layer>');
    for (const line of pg.lines) for (const s of line.strokes) {
      const pts = s.pts.length === 1 ? [s.pts[0], [s.pts[0][0] + 0.01, s.pts[0][1]]] : s.pts;
      out.push(`<stroke tool="pen" color="${col}" width="${f2(s.w * PT)}">${pts.map((p) => `${f2(p[0] * PT)} ${f2(p[1] * PT)}`).join(' ')}</stroke>`);
    }
    out.push('</layer>', '</page>');
  }
  out.push('</xournal>');
  return out.join('\n') + '\n';
}

/**
 * InkML (W3C Recommendation 2011): one trace per stroke, coordinates in mm, one traceGroup per page.
 * @param {import('./layout.js').Document} doc
 * @param {Style} [o]
 */
export function toInkML(doc, o = {}) {
  const st = ink(o);
  const widths = new Map();
  for (const pg of doc.pages) for (const l of pg.lines) for (const s of l.strokes) if (!widths.has(f2(s.w))) widths.set(f2(s.w), `br${widths.size}`);
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<ink xmlns="http://www.w3.org/2003/InkML">', '<definitions>',
    '<context xml:id="ctx0"><traceFormat><channel name="X" type="decimal" units="mm"/><channel name="Y" type="decimal" units="mm"/></traceFormat></context>'];
  for (const [w, id] of widths) out.push(`<brush xml:id="${id}"><brushProperty name="width" value="${w}" units="mm"/><brushProperty name="color" value="${xmlEsc(st.color.toUpperCase())}"/></brush>`);
  out.push('</definitions>');
  doc.pages.forEach((pg, i) => {
    out.push(`<traceGroup xml:id="page${i + 1}"><annotation type="page">${i + 1}</annotation>`);
    for (const l of pg.lines) for (const s of l.strokes) {
      out.push(`<trace contextRef="#ctx0" brushRef="#${widths.get(f2(s.w))}">${s.pts.map((p) => `${f2(p[0])} ${f2(p[1])}`).join(', ')}</trace>`);
    }
    out.push('</traceGroup>');
  });
  out.push('</ink>');
  return out.join('\n') + '\n';
}

/**
 * Excalidraw scene (JSON): every stroke a "freedraw" element, pages stacked from top to bottom. Units: px at 96 dpi.
 * Element fields as in Excalidraw's scene format; not verified against every version of the app.
 * @param {import('./layout.js').Document} doc
 * @param {Style} [o]
 */
export function toExcalidraw(doc, o = {}) {
  const st = ink(o), PX = 96 / 25.4, GAP = 40;
  const elements = [];
  let yOff = 0, n = 0;
  for (const pg of doc.pages) {
    elements.push({
      type: 'rectangle', id: `page${n}`, x: 0, y: yOff, width: pg.width * PX, height: pg.height * PX, angle: 0,
      strokeColor: '#c9c9c9', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid',
      roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: n + 1, version: 1, versionNonce: n + 1,
      isDeleted: false, boundElements: null, updated: 1, link: null, locked: true,
    });
    for (const l of pg.lines) for (const s of l.strokes) {
      n++;
      const x0 = s.pts[0][0] * PX, y0 = s.pts[0][1] * PX + yOff;
      const pts = s.pts.map((p) => [+(p[0] * PX - x0).toFixed(2), +(p[1] * PX + yOff - y0).toFixed(2)]);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      elements.push({
        type: 'freedraw', id: `s${n}`, x: +x0.toFixed(2), y: +y0.toFixed(2),
        width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), angle: 0,
        strokeColor: st.color, backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid',
        roughness: 0, opacity: Math.round(st.opacity * 100), groupIds: [], frameId: null, roundness: null, seed: n,
        version: 1, versionNonce: n, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
        points: pts, pressures: [], simulatePressure: st.output === 'ipad', lastCommittedPoint: null,
      });
    }
    yOff += pg.height * PX + GAP;
  }
  return JSON.stringify({ type: 'excalidraw', version: 2, source: 'penclone', elements, appState: { viewBackgroundColor: '#ffffff', gridSize: null }, files: {} });
}
