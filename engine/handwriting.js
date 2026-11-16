/* penclone rendering engine (browser).
 * Injected into a page that provides `rnd()` (seeded PRNG) and calls glyphSpan()/sk().
 * The build step replaces the GLYPHS placeholder with the glyph JSON.
 * Everything up to and including the line '//@ENGINE@' is stripped before injection. */
//@ENGINE@
const GLY = /*@GLYPHS@*/null;
  // ---------- eigene Handschrift: Striche aus der Schreibprobe (3 Varianten je Zeichen)
  // Zufall nach dem Prinzip veröffentlichter Projekte (Text2Hand, bodiman/Handwritten, Project-Handwritten):
  // Variante zufällig (ohne direkte Wiederholung) · Basislinie/Größe/Neigung als gedämpfter Zufallslauf von Buchstabe zu Buchstabe
  // · Stiftdruck je Wort + je Buchstabe · Abstand je Buchstabenpaar nach der Tinten-Form (Kerning), damit nichts verschmilzt
  const HS = { pen: 0.058, bold: 1.45, clear: 0.05, minGap: -0.10 };
  const LASTV = {};
  const WST = { b: 0, sz: 1, rot: 0, press: 1 };
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.73;
  const NB = 30, BY0 = -1.1, BH = 0.05;
  function glyphSpan(ch, bold, rnd, prev){
    const gv = GLY[ch]; if (!gv) return null;
    let vi; do { vi = Math.floor(rnd() * gv.length); } while (gv.length > 1 && vi === LASTV[ch]);
    LASTV[ch] = vi; const g = gv[vi];
    // gedämpfter Zufallslauf: Veränderung entwickelt sich allmählich
    WST.b = Math.max(-.05, Math.min(.05, WST.b * .72 + gauss() * .014));
    WST.sz = Math.max(.9, Math.min(1.1, 1 + (WST.sz - 1) * .7 + gauss() * .022));
    WST.rot = Math.max(-.06, Math.min(.06, WST.rot * .6 + gauss() * .012));
    const A = 0.011;
    const sx = WST.sz * (1 + gauss() * .03), sy = WST.sz * (1 + gauss() * .035), rot = WST.rot + gauss() * .012, sh = gauss() * .03;
    const dy = WST.b + gauss() * .008, k1 = 5 + rnd() * 5, k2 = 5 + rnd() * 5, p1 = rnd() * 6.28, p2 = rnd() * 6.28;
    const a1 = A * (.4 + rnd()), a2 = A * (.4 + rnd());
    const cx = g.adv / 2, cr = Math.cos(rot), sr = Math.sin(rot);
    const T = ([x, y]) => {
      let u = (x - cx) * sx + y * sh, v = y * sy;
      u += a1 * Math.sin(y * k1 + p1); v += a2 * Math.sin(x * k2 + p2);
      return [cx + cr * u - sr * (v + .2), sr * u + cr * (v + .2) - .2 + dy];
    };
    const w = HS.pen * (bold ? HS.bold : 1) * WST.press * (1 + gauss() * .045), hw = w / 2;
    const polys = g.s.map(st => st.map(T));
    let minX = 1e9, maxX = -1e9;
    for (const q of polys) for (const p of q) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; }
    const shift = hw - minX, W = maxX - minX + w;
    // Tinten-Profil (links/rechts je Höhenband) für Abstand zum Nachbarn
    const L = new Array(NB).fill(null), R = new Array(NB).fill(null);
    const mark = (x, y) => { const b = Math.floor((y - BY0) / BH); if (b < 0 || b >= NB) return; x += shift; if (L[b] === null || x - hw < L[b]) L[b] = x - hw; if (R[b] === null || x + hw > R[b]) R[b] = x + hw; };
    for (const q of polys) for (let i = 0; i < q.length; i++) {
      mark(q[i][0], q[i][1]);
      if (i) { const dx = q[i][0] - q[i - 1][0], dyy = q[i][1] - q[i - 1][1], n = Math.ceil(Math.hypot(dx, dyy) / .015); for (let k = 1; k < n; k++) mark(q[i - 1][0] + dx * k / n, q[i - 1][1] + dyy * k / n); }
    }
    const f3 = n => n.toFixed(3);
    let d = '';
    for (const q0 of polys) {
      const q = q0.map(p => [p[0] + shift, p[1] + 1]);
      if (g.f) { d += 'M' + q.map(p => f3(p[0]) + ' ' + f3(p[1])).join('L') + 'Z'; continue; }
      if (q.length < 3) { d += `M${f3(q[0][0])} ${f3(q[0][1])}L${f3(q[q.length - 1][0])} ${f3(q[q.length - 1][1])}`; continue; }
      d += `M${f3(q[0][0])} ${f3(q[0][1])}L${f3((q[0][0] + q[1][0]) / 2)} ${f3((q[0][1] + q[1][1]) / 2)}`;
      for (let i = 1; i < q.length - 1; i++) d += `Q${f3(q[i][0])} ${f3(q[i][1])} ${f3((q[i][0] + q[i + 1][0]) / 2)} ${f3((q[i][1] + q[i + 1][1]) / 2)}`;
      d += `L${f3(q[q.length - 1][0])} ${f3(q[q.length - 1][1])}`;
    }
    // Abstand zum Vorgänger: Tinten dürfen sich nicht berühren
    let ml = 0;
    if (prev) {
      let mn = 9;
      for (let b = 0; b < NB; b++) {
        if (prev.R[b] === null) continue;
        const dR = prev.W - prev.R[b];
        for (let b2 = b - 1; b2 <= b + 1; b2++) if (b2 >= 0 && b2 < NB && L[b2] !== null) mn = Math.min(mn, dR + L[b2]);
      }
      ml = mn === 9 ? 0 : Math.max(HS.minGap, HS.clear - mn);
    }
    const c = document.createElement('span');
    c.className = 'c gl';
    c.style.width = W.toFixed(3) + 'em';
    if (ml) c.style.marginLeft = ml.toFixed(3) + 'em';
    c.innerHTML = `<svg viewBox="0 0 1 1"><path d="${d}" stroke-width="${w.toFixed(3)}"${g.f ? ' style="fill:currentColor"' : ''}/></svg>`;
    c.style.opacity = (1 - rnd() * .12).toFixed(2);
    return { el: c, L, R, W };
  }
  // ---------- handgezeichnete Umrandungen (gerade Striche bleiben gerade, Ecken/Kreise sind unsauber)
  function sk(el, kind){
    const cs = getComputedStyle(el), bw = parseFloat(cs.borderTopWidth) || 1.2, col = cs.borderTopColor, dashed = cs.borderTopStyle === 'dashed';
    const w = el.offsetWidth, h = el.offsetHeight; if (!w || !h) return;
    const J = (a) => (rnd() - .5) * 2 * a;
    let d = '';
    if (kind === 'circle') {
      const r = Math.min(w, h) / 2 - bw, cx = w / 2, cy = h / 2, n = 40, a0 = rnd() * 6.28, ph = rnd() * 6.28, ph2 = rnd() * 6.28;
      const pts = [];
      for (let i = 0; i <= n + 4; i++) { const a = a0 + i / n * 6.2832 * 1.0, rr = r * (1 + .05 * Math.sin(a * 2 + ph) + .03 * Math.sin(a * 3 + ph2) + (i > n ? (i - n) * .012 : 0)); pts.push([cx + Math.cos(a) * rr * 1.02, cy + Math.sin(a) * rr]); }
      d = 'M' + pts.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L');
    } else {
      const o = () => 1.2 + rnd() * 2.8, j = () => J(.9);
      const s = [bw / 2, bw / 2, w - bw / 2, h - bw / 2];
      const [x0, y0, x1, y1] = s;
      d = `M${(x0 - o()).toFixed(2)} ${(y0 + j()).toFixed(2)}L${(x1 + o() * .6).toFixed(2)} ${(y0 + j()).toFixed(2)}` +
          `M${(x1 + j()).toFixed(2)} ${(y0 - o() * .6).toFixed(2)}L${(x1 + j()).toFixed(2)} ${(y1 + o()).toFixed(2)}` +
          `M${(x1 + o() * .5).toFixed(2)} ${(y1 + j()).toFixed(2)}L${(x0 - o() * .8).toFixed(2)} ${(y1 + j()).toFixed(2)}` +
          `M${(x0 + j()).toFixed(2)} ${(y1 + o() * .7).toFixed(2)}L${(x0 + j()).toFixed(2)} ${(y0 - o()).toFixed(2)}`;
    }
    el.style.borderColor = 'transparent';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', w); svg.setAttribute('height', h);
    svg.style.cssText = `position:absolute;left:${-bw}px;top:${-bw}px;overflow:visible;pointer-events:none;fill:none`;
    p.setAttribute('d', d); p.setAttribute('stroke', col); p.setAttribute('stroke-width', (bw * (.95 + rnd() * .25)).toFixed(2));
    p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    if (dashed) p.setAttribute('stroke-dasharray', `${(4 + rnd() * 2).toFixed(1)} ${(2.4 + rnd() * 1.4).toFixed(1)}`);
    svg.appendChild(p); el.appendChild(svg);
  }
