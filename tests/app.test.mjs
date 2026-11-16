// Commands, paper, pens, formats and the MCP server - with a synthetic profile in a temporary PENCLONE_HOME.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { prng } from '../engine/rng.js';
import { loadLibrary, layout, outline, writingArea, resolvePaper, toXournal, toInkML, toExcalidraw, toSVG } from '../engine/index.js';

const HOME = mkdtempSync(join(tmpdir(), 'penclone-test-'));
process.env.PENCLONE_HOME = HOME;
process.env.PENCLONE_OUT = join(HOME, 'out');
const C = await import('../lib/commands.js');
const hasPython = !spawnSync('python3', ['-c', 'import numpy, PIL']).status;
const hasPoppler = !spawnSync('pdftoppm', ['-v']).error;

function glyphs() {
  const r = prng(1), g = {};
  for (const ch of 'abcdefghijklmnopqrstuvwxyzäöüßABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?-') {
    const top = /[A-Zbdfhklt0-9!?]/.test(ch) ? -0.62 : /[.,:;-]/.test(ch) ? -0.12 : -0.42;
    g[ch] = [0, 1].map(() => ({ adv: 0.3, s: [[[0.03, 0], [0.12 + r() * 0.02, top], [0.24, 0]]] }));
  }
  return g;
}

before(() => {
  const d = join(HOME, 'profiles', 'demo');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'profile.json'), JSON.stringify({ name: 'demo', version: 1, languages: ['de'], sources: [{ id: 'alphabet-v1', sheet: 'alphabet-v1' }], overrides: {} }));
  writeFileSync(join(d, 'glyphs.json'), JSON.stringify(glyphs()));
});
after(() => rmSync(HOME, { recursive: true, force: true }));

test('status: ready, with optional steps for preferences and missing common characters', () => {
  const st = C.status();
  assert.equal(st.profile, 'demo');
  assert.equal(st.ready, true);
  assert.equal(st.next.id, 'ready');
  assert.ok(st.missingCommonChars.includes('§'));
  assert.deepEqual(st.optional.map((x) => x.id).sort(), ['measure', 'missing-chars', 'preferences']);
});

test('lined paper: baselines sit on the rules', () => {
  const lib = loadLibrary(glyphs());
  const doc = layout(lib, 'eins\nzwei\ndrei', { paper: 'lined-college', margin: [20, 20, 20, 20], baselineOffset: 0 });
  const rules = doc.pages[0].lines.map((l) => l.rule);
  assert.deepEqual(rules.map((r) => +r.toFixed(2)), [27.1, 34.2, 41.3]);
  // squared 5 mm: every second grid line (line distance at least the natural 8 mm)
  const area = writingArea(resolvePaper('squared'), { width: 210, height: 297, margin: [20, 20, 20, 20], lineSpacing: 8, xHeight: 2.5 });
  assert.equal(+(area.rules[1] - area.rules[0]).toFixed(6), 10);
  assert.equal(+(((area.rules[0] - 6) / 5) % 1).toFixed(6), 0);     // on a grid line
  // Lineatur 27: margin lines limit the writing
  const a27 = writingArea(resolvePaper('lin27'), { width: 210, height: 297, margin: [20, 10, 20, 10], lineSpacing: 8, xHeight: 2.5 });
  assert.ok(a27.left >= 20 && a27.right <= 190);
});

test('render with preferences, own parametric template and every format', async () => {
  C.setPreferences({ profile: 'demo', paper: 'dotted', pen: 'fineliner' });
  const out = join(HOME, 'a.pdf');
  const r = await C.render({ text: 'Hallo Welt § @', out });
  assert.equal(r.paper, 'dotted');
  assert.equal(r.pen, 'fineliner');
  assert.deepEqual(Object.keys(r.missing), ['§', '@']);
  assert.match(r.missingAdvice.ask_user, /Ask the user/);
  assert.ok(readFileSync(out).subarray(0, 8).toString().startsWith('%PDF-1.4'));
  C.addTemplate({ profile: 'demo', name: 'mein-block', type: 'lined', lineSpacing: '7mm', margins: ['left'] });
  const r2 = await C.render({ text: 'eins zwei', out: join(HOME, 'b.svg'), paper: 'mein-block' });
  assert.match(r2.paper, /own template/);
  assert.equal(r2.lineSpacingMm, 7);
  for (const f of ['xopp', 'inkml', 'excalidraw', 'svg']) {
    const r3 = await C.render({ text: 'eins zwei', out: join(HOME, `c.${f}`), output: f === 'svg' ? 'ipad' : 'paper' });
    assert.ok(existsSync(r3.files[0]), f);
  }
  assert.match(gunzipSync(readFileSync(join(HOME, 'c.xopp'))).toString(), /<xournal[\s\S]*<stroke tool="pen"/);
  assert.match(readFileSync(join(HOME, 'c.inkml'), 'utf8'), /<ink xmlns="http:\/\/www.w3.org\/2003\/InkML">[\s\S]*<trace /);
  assert.ok(JSON.parse(readFileSync(join(HOME, 'c.excalidraw'), 'utf8')).elements.some((e) => e.type === 'freedraw'));
  assert.match(readFileSync(join(HOME, 'c.svg'), 'utf8'), /<path fill="#111111" stroke="none"/);   // iPad: filled outlines
  C.setPreferences({ profile: 'demo', paper: '', pen: '' });
  assert.throws(() => C.setPreferences({ profile: 'demo', pen: 'kuli' }), /does not exist/);
});

test('iPad outline: closed shape, tapered ends, wider in the middle', () => {
  const pts = Array.from({ length: 30 }, (_, i) => [i * 0.2, Math.sin(i / 4)]);
  const poly = outline(pts, 0.4);
  assert.ok(poly.length > 2 * 30);
  const mid = pts[15], end = pts[29];
  const near = (p, q) => Math.min(...poly.map((a) => Math.hypot(a[0] - q[0], a[1] - q[1])));
  assert.ok(near(poly, mid) > near(poly, end) * 1.2, 'ends thinner than the middle');
});

test('editable formats keep every stroke', () => {
  const lib = loadLibrary(glyphs());
  const doc = layout(lib, 'abc def', {});
  const n = doc.pages[0].lines.reduce((a, l) => a + l.strokes.length, 0);
  assert.equal((toXournal(doc).match(/<stroke /g) || []).length, n);
  assert.equal((toInkML(doc).match(/<trace /g) || []).length, n);
  assert.equal(JSON.parse(toExcalidraw(doc)).elements.filter((e) => e.type === 'freedraw').length, n);
  assert.match(toSVG(doc, { pen: 'pencil' })[0], /filter="url\(#grain\)"/);
});

test('worksheet: text fitted into boxes, overflow reported', { skip: !hasPython && 'needs Python with numpy and pillow' }, async () => {
  const png = join(HOME, 'sheet.png');
  const py = `
from PIL import Image, ImageDraw
p = 150 / 25.4; im = Image.new('L', (int(210 * p), int(297 * p)), 250); d = ImageDraw.Draw(im)
for y in (60, 68, 76): d.line([20 * p, y * p, 190 * p, y * p], fill=120, width=2)
im.save(${JSON.stringify(png)}, dpi=(150, 150))`;
  assert.equal(spawnSync('python3', ['-c', py]).status, 0);
  const r = await C.fill({
    sheet: png, out: join(HOME, 'filled.pdf'),
    fields: [{ box: [18, 52, 175, 28], text: 'eins zwei drei' }, { box: [20, 150, 20, 6], text: 'viel zu langer Text für dieses kleine Feld' }],
  });
  assert.equal(r.fields[0].fits, true);
  assert.equal(r.fields[0].onRuledLines, true);
  assert.equal(r.fields[1].fits, false);
  assert.match(r.fields[1].advice, /did not fit/);
});

test('MCP server: handshake, tools, a call, errors', async () => {
  const p = spawn(process.execPath, [join(import.meta.dirname, '..', 'bin', 'penclone.js'), 'mcp'], { env: process.env });
  const msgs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'render_handwriting', arguments: { text: 'Hallo §', preview: hasPoppler } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'render_handwriting', arguments: { text: 'x', output: 'tablet' } } },
    { jsonrpc: '2.0', id: 5, method: 'unknown/method' },
  ];
  p.stdin.end(msgs.map((m) => JSON.stringify(m)).join('\n') + '\n');
  let out = '';
  for await (const chunk of p.stdout) out += chunk;
  const res = Object.fromEntries(out.trim().split('\n').map((l) => JSON.parse(l)).map((m) => [m.id, m]));
  assert.equal(res[1].result.protocolVersion, '2025-06-18');
  assert.equal(res[1].result.serverInfo.name, 'penclone');
  const names = res[2].result.tools.map((t) => t.name);
  for (const n of ['get_status', 'render_handwriting', 'fill_page', 'create_sample_sheet', 'import_samples', 'add_template', 'set_preferences']) assert.ok(names.includes(n), n);
  const c3 = res[3].result.content;
  assert.ok(JSON.parse(c3[0].text).files[0].endsWith('.pdf'));
  assert.match(c3[1].text, /Ask the user/);
  if (hasPoppler) assert.equal(c3[2].type, 'image');
  assert.equal(res[4].result.isError, true);
  assert.equal(res[5].error.code, -32601);
  assert.equal(Object.keys(res).length, 5);           // no answer to the notification
});

test('capture page: secret link, rejects bad uploads, imports a written character sheet', { skip: !hasPython && 'needs Python with numpy' }, async () => {
  const { startCapture } = await import('../lib/capture.js');
  const c = await startCapture({ profile: 'demo', chars: '§', port: 0, host: '127.0.0.1' });
  try {
    assert.match(c.url, /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\/$/);
    assert.match(await (await fetch(c.url)).text(), /mit dem Stift/);
    assert.equal((await fetch(c.url.replace(/[0-9a-f]{32}/, '0'.repeat(32)))).status, 404);
    const man = await (await fetch(c.url + 'sheet.json')).json();
    assert.deepEqual(man.lines.map((l) => l.text), ['n§n n§n n§n']);
    assert.equal((await fetch(c.url + 'upload', { method: 'POST', body: '{"format":"other"}' })).status, 400);
    // synthetic writer: "n" = two strokes of x-height, "§" = a taller zigzag, points [x, y, t, pressure, tiltX, tiltY] in pt
    const ln = man.lines[0], xh = 7, strokes = [];
    let x = ln.x0 + 6, t = 0;
    const pt = (px, py) => [px, py, (t += 8), 0.5, 0, 0];
    const n = () => { strokes.push([pt(x, ln.baseline), pt(x, ln.baseline - xh)], [pt(x, ln.baseline - xh), pt(x + 4, ln.baseline - xh), pt(x + 4, ln.baseline)]); x += 7; };
    for (let g = 0; g < 3; g++) {
      n();
      strokes.push([0, 1, 2, 3, 4, 5].map((i) => pt(x + (i % 2) * 4, ln.baseline - 1.5 * xh + i * 0.3 * xh)));
      x += 7;
      n();
      x += 18;
    }
    const r = await (await fetch(c.url + 'upload', { method: 'POST', body: JSON.stringify({ format: 'penclone-capture', version: 1, pages: { 1: strokes } }) })).json();
    assert.equal(r.ok, true, r.error);
    assert.ok((await c.done).ok);
    const chars = JSON.parse(readFileSync(join(HOME, 'profiles', 'demo', 'glyphs-chars.json'), 'utf8'));
    assert.equal(chars['§'].length, 3);
  } finally {
    c.stop();
  }
});

test('fit to N pages: smaller writing, never more pages than asked', async () => {
  const text = Array.from({ length: 70 }, (_, i) => `Zeile ${i} mit etwas Text`).join('\n');
  const free = await C.render({ text, out: join(HOME, 'p.pdf'), page: 'a5' });
  assert.ok(free.pages >= 3);
  const two = await C.render({ text, out: join(HOME, 'p2.pdf'), page: 'a5', pages: 2 });
  assert.equal(two.pages, 2);
  assert.ok(two.fitted.xHeightMm < two.fitted.natural);
  await assert.rejects(C.render({ text: text.repeat(40), out: join(HOME, 'p3.pdf'), page: 'a5', pages: 1 }), /does not fit/);
});

test('several handwritings: switch the active one, it stays until switched again', async () => {
  const d2 = join(HOME, 'profiles', 'zweite');
  mkdirSync(d2, { recursive: true });
  writeFileSync(join(d2, 'profile.json'), JSON.stringify({ name: 'zweite', version: 1, languages: ['de'], sources: [{ id: 'alphabet-v1', sheet: 'alphabet-v1' }], overrides: {} }));
  writeFileSync(join(d2, 'glyphs.json'), JSON.stringify(glyphs()));
  try {
    // two profiles and none chosen: render asks for a choice once, status says how
    assert.equal(C.useProfile().active, null);
    await assert.rejects(C.render({ text: 'Hallo', out: join(HOME, 'x.svg') }), /penclone use NAME/);
    assert.equal(C.status().next.id, 'choose-profile');
    // choose one: it is used from now on without --profile
    assert.equal(C.useProfile({ name: 'zweite' }).active, 'zweite');
    assert.equal(C.status().profile, 'zweite');
    assert.ok((await C.render({ text: 'Hallo', out: join(HOME, 'x.svg') })).files.length);
    assert.deepEqual(C.listProfiles().filter((p) => p.active).map((p) => p.name), ['zweite']);
    // --profile is a one-off; the active one stays
    assert.equal(C.status({ profile: 'demo' }).profile, 'demo');
    assert.equal(C.useProfile().active, 'zweite');
    assert.equal(C.useProfile({ name: 'demo' }).active, 'demo');
    assert.throws(() => C.useProfile({ name: 'gibtsnicht' }), /profile not found/);
  } finally {
    rmSync(d2, { recursive: true, force: true });
    rmSync(join(HOME, 'config.json'), { force: true });
  }
});
