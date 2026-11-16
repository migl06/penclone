// @ts-check
/* iPad capture page: write the sample sheet directly in Safari with the Apple Pencil (docs/decisions.md §4b).
 *
 * `penclone capture NAME` starts a small web server in the local network with a random secret link, shows the sentences of
 * sample sheet v2 (or a character sheet) on ruled lines, records every stroke with time, pressure and tilt (Pointer Events),
 * and imports the result into the profile when the user taps "Done". Coordinates are stored in pt from the page top, the same
 * as a PDF export, so the pipeline needs no special case; time, pressure and tilt are kept for later (speed-based variation).
 *
 * Safety: the server listens only while capturing, every path contains a 128-bit random token, uploads are limited in size,
 * and it stops after a successful import (or after the time limit). */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import * as C from './commands.js';

const MAX_BODY = 40 * 1024 * 1024;
const TIME_LIMIT_MS = 3 * 60 * 60 * 1000;

/** LAN addresses to show (IPv4, not internal). */
function addresses() {
  return Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
}

/**
 * Start the capture server. Resolves with {url, urls, done} once listening; `done` resolves with the import result.
 * @param {{profile: string, chars?: string, port?: number, host?: string, keep?: boolean}} o
 */
export async function startCapture(o) {
  C.readProfileOrThrow(o.profile);
  const tmp = mkdtempSync(join(tmpdir(), 'penclone-capture-'));
  const sheet = C.sampleSheet({ out: join(tmp, 'sheet.pdf'), chars: o.chars });
  const manifest = readFileSync(sheet.manifest, 'utf8');
  const token = randomBytes(16).toString('hex');
  let finish, timer;
  const done = new Promise((res) => { finish = res; });
  const server = createServer((req, res) => {
    const send = (code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(body); };
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith(`/${token}/`)) return send(404, 'text/plain', 'not found');
    const path = url.pathname.slice(token.length + 2);
    if (req.method === 'GET' && path === '') return send(200, 'text/html; charset=utf-8', PAGE);
    if (req.method === 'GET' && path === 'sheet.json') return send(200, 'application/json', manifest);
    if (req.method === 'POST' && path === 'upload') {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { send(413, 'text/plain', 'too large'); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (size > MAX_BODY) return;
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (data.format !== 'penclone-capture' || typeof data.pages !== 'object') throw new Error('not a capture');
          const n = Object.values(data.pages).reduce((a, s) => a + (Array.isArray(s) ? s.length : 0), 0);
          if (!n) throw new Error('no strokes');
          const file = join(tmp, 'written.json');
          writeFileSync(file, JSON.stringify(data));
          const out = C.importSamples({ profile: o.profile, pdf: file, manifest: sheet.manifest });
          send(200, 'application/json', JSON.stringify({ ok: true, strokes: n, output: out }));
          if (!o.keep) stop({ ok: true, strokes: n, output: out });
        } catch (e) {
          send(400, 'application/json', JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }
    send(404, 'text/plain', 'not found');
  });
  const stop = (result) => {
    clearTimeout(timer);
    server.close();
    rmSync(tmp, { recursive: true, force: true });
    finish(result);
  };
  await new Promise((res, rej) => { server.once('error', rej); server.listen(o.port ?? 8765, o.host ?? '0.0.0.0', () => res(null)); });
  timer = setTimeout(() => stop({ ok: false, error: 'time limit reached' }), TIME_LIMIT_MS);
  const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
  const hosts = o.host && o.host !== '0.0.0.0' ? [o.host] : [...addresses(), '127.0.0.1'];
  const urls = hosts.map((h) => `http://${h}:${addr.port}/${token}/`);
  return { url: urls[0], urls, port: addr.port, done, stop: () => stop({ ok: false, error: 'stopped' }) };
}

/* The page: one canvas per sheet page, ruled lines at the manifest positions, pen strokes recorded in pt. Finger = scroll,
 * Apple Pencil (or mouse) = write. Self-contained: no external scripts, fonts or styles. */
const PAGE = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>penclone – Schreibprobe</title>
<style>
:root{--bg:#f4f4f2;--fg:#1d1d1f;--muted:#6b6b6b;--accent:#1f4fd1}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.4 -apple-system,system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--bg);padding:10px 16px;border-bottom:1px solid #ddd;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
header h1{font-size:17px;margin:0 auto 0 0}
button{font:inherit;padding:8px 14px;border-radius:9px;border:1px solid #c8c8c8;background:#fff;color:var(--fg)}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
#help{padding:10px 16px;color:var(--muted);font-size:14px}
.page{position:relative;margin:12px auto;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.15)}
canvas{display:block;touch-action:none}
.model{position:absolute;left:0;color:#9a9a9a;white-space:nowrap;pointer-events:none}
#status{padding:8px 16px;font-size:14px}
</style></head><body>
<header><h1>penclone – Schreibprobe</h1><button id="undo">Rückgängig</button><button id="done" class="primary">Fertig</button></header>
<div id="help">Schreib jeden Satz mit dem Apple Pencil auf die Linie darunter – normal und in normalem Tempo. Mit dem Finger scrollst du.
Verschrieben? „Rückgängig“ entfernt den letzten Strich. Am Ende „Fertig“ tippen.</div>
<div id="pages"></div><div id="status"></div>
<script>
const base = location.pathname;
const S = { pages: {}, order: [] };
const KEY = 'penclone-capture-' + base;
try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.pages) Object.assign(S, s); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const status = (t) => { document.getElementById('status').textContent = t; };
let t0 = performance.now(), penSeen = false;
fetch(base + 'sheet.json').then((r) => r.json()).then((man) => {
  const [PW, PH] = man.page_pt;
  const byPage = {};
  man.lines.forEach((l) => (byPage[l.page] = byPage[l.page] || []).push(l));
  const box = document.getElementById('pages');
  const pages = Object.keys(byPage).map(Number).sort((a, b) => a - b);
  const W = Math.min(window.innerWidth - 16, 1000), k = W / PW, dpr = window.devicePixelRatio || 1;
  const draws = {};
  for (const p of pages) {
    const lines = byPage[p];
    const top = Math.max(0, Math.min(...lines.map((l) => l.top)) - 30), bottom = Math.min(PH, Math.max(...lines.map((l) => l.baseline)) + 20);
    const H = (bottom - top) * k;
    const div = document.createElement('div'); div.className = 'page'; div.style.width = W + 'px'; div.style.height = H + 'px';
    const cv = document.createElement('canvas'); cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    div.appendChild(cv);
    for (const l of lines) {
      const m = document.createElement('div'); m.className = 'model'; m.textContent = l.text;
      m.style.top = ((l.top - top - 17) * k) + 'px'; m.style.left = (l.x0 * k) + 'px'; m.style.fontSize = (10.5 * k) + 'px';
      div.appendChild(m);
    }
    box.appendChild(div);
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    const toPt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / k, (e.clientY - r.top) / k + top]; };
    const redraw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#9db3c9';
      for (const l of lines) ctx.fillRect(l.x0 * k, (l.baseline - top) * k, (l.x1 - l.x0) * k, Math.max(1, 0.6 * k));
      ctx.strokeStyle = '#1d1d1f'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const s of S.pages[p] || []) {
        for (let i = 1; i < s.length; i++) {
          ctx.lineWidth = Math.max(0.6, 1.6 * (s[i][3] || 0.5)) * k * 0.6;
          ctx.beginPath(); ctx.moveTo(s[i - 1][0] * k, (s[i - 1][1] - top) * k); ctx.lineTo(s[i][0] * k, (s[i][1] - top) * k); ctx.stroke();
        }
      }
    };
    draws[p] = redraw; redraw();
    let cur = null, lastY = 0;
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'pen') penSeen = true;
      if (e.pointerType === 'touch') { lastY = e.clientY; cv.setPointerCapture(e.pointerId); return; }
      if (penSeen && e.pointerType !== 'pen') return;
      cv.setPointerCapture(e.pointerId);
      const [x, y] = toPt(e);
      cur = [[+x.toFixed(2), +y.toFixed(2), Math.round(performance.now() - t0), +(e.pressure || 0.5).toFixed(3), e.tiltX || 0, e.tiltY || 0]];
      (S.pages[p] = S.pages[p] || []).push(cur); S.order.push(p);
    });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') { window.scrollBy(0, lastY - e.clientY); lastY = e.clientY; return; }
      if (!cur) return;
      for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) {
        const [x, y] = toPt(ev);
        cur.push([+x.toFixed(2), +y.toFixed(2), Math.round(ev.timeStamp - t0), +(ev.pressure || 0.5).toFixed(3), ev.tiltX || 0, ev.tiltY || 0]);
      }
      redraw();
    });
    const end = () => { if (cur) { cur = null; save(); redraw(); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }
  document.getElementById('undo').onclick = () => {
    const p = S.order.pop(); if (p === undefined) return;
    S.pages[p].pop(); save(); draws[p] && draws[p]();
  };
  document.getElementById('done').onclick = async () => {
    const n = Object.values(S.pages).reduce((a, s) => a + s.length, 0);
    if (!n) { status('Noch nichts geschrieben.'); return; }
    status('Wird übertragen und eingelesen … (bis zu zwei Minuten)');
    try {
      const r = await fetch(base + 'upload', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ format: 'penclone-capture', version: 1, sheet: man.sheet, device: navigator.userAgent, pages: S.pages }) });
      const j = await r.json();
      if (j.ok) { status('Fertig: ' + j.strokes + ' Striche eingelesen. Du kannst diese Seite schließen.'); try { localStorage.removeItem(KEY); } catch (e) {} }
      else status('Fehler: ' + j.error);
    } catch (e) { status('Übertragung fehlgeschlagen: ' + e.message + ' – bitte noch einmal tippen.'); }
  };
});
</script></body></html>`;
