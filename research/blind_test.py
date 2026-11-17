"""Blind test for people: which of two lines is the writer's real hand?

    python3 research/blind_test.py PROFILE [--pairs 20]     # builds the test page, keeps the key in a separate file
    python3 research/blind_test.py --score ANSWERS.json     # compares the answers exported from the page with the key

Each item shows the same held-out sentence twice, once as the writer really wrote it and once as penclone writes it
(condition B6), in random order. Both go through the same drawing code with the same pen width and scale. The page does not
say which is which, and neither does its source: the key is stored in a separate file in the cache folder.
Nothing is written to the repository.
"""
import argparse
import base64
import io
import json
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H  # noqa: E402
from run_experiments import CONDITIONS  # noqa: E402
from segment_v2 import assign_lines  # noqa: E402

OUT = os.path.join(H.CACHE, 'blind')   # one sub-folder per condition from round 4 on (the first test, B6, sits directly in here)
PX_PER_XH, S, PAD_XH = 16, 3, 0.8


def draw_line(strokes, xh_pt):
    k = PX_PER_XH / xh_pt * S
    a = np.concatenate(strokes)
    x0, y0 = a[:, 0].min() - PAD_XH * xh_pt, a[:, 1].min() - PAD_XH * xh_pt
    w = int((a[:, 0].max() - a[:, 0].min() + 2 * PAD_XH * xh_pt) * k)
    h = int((a[:, 1].max() - a[:, 1].min() + 2 * PAD_XH * xh_pt) * k)
    img = Image.new('L', (w, h), 255)
    dr = ImageDraw.Draw(img)
    r = H.PEN_XH * PX_PER_XH * S / 2
    for s in strokes:
        px = [((x - x0) * k, (y - y0) * k) for x, y in s]
        if len(px) > 1:
            dr.line(px, fill=0, width=int(round(2 * r)), joint='curve')
        for x, y in px[:: max(1, len(px) - 1)]:
            dr.ellipse([x - r, y - r, x + r, y + r], fill=0)
    return img.resize((w // S, h // S), Image.LANCZOS)


def lines_of(pages, man):
    """{line index in man: [strokes]} through the same line assignment as the experiments."""
    out = {}
    by_page = {}
    for li, ln in enumerate(man['lines']):
        by_page.setdefault(ln['page'], []).append((li, ln))
    for page, items in by_page.items():
        st = pages[page]
        per = assign_lines(st, [ln for _, ln in items], man['row_height_pt'])
        for (li, _), (_, idx) in zip(items, per.items()):
            if idx:
                out[li] = [st[i] for i in idx]
    return out


def png64(img):
    b = io.BytesIO()
    img.save(b, 'PNG', optimize=True)
    return base64.b64encode(b.getvalue()).decode()


PAGE = """<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welche Zeile ist echt?</title><style>
body{font:16px system-ui;margin:0;background:#f6f6f4;color:#222}main{max-width:960px;margin:0 auto;padding:16px}
.card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin:12px 0}
.card img{display:block;max-width:100%;margin:6px 0;border:1px solid #eee}button{font:inherit;padding:8px 14px;margin:4px 6px 4px 0;cursor:pointer}
.sel{outline:3px solid #36c}textarea{width:100%;height:120px}small{color:#666}</style>
<main><h1>Welche Zeile ist echt?</h1>
<p>Zu jedem Satz gibt es zwei Zeilen. Eine hat die Person selbst geschrieben, die andere ist nachgemacht. Wähle die, die du
für die echte hältst. Nimm dir pro Paar ruhig ein paar Sekunden und rate, wenn du es nicht weißt. Es gibt keine Rückmeldung
während des Tests.</p><div id="app"></div></main>
<script>const ITEMS=__ITEMS__;let ans={},i=0;const app=document.getElementById('app');
function show(){if(i>=ITEMS.length){const out=JSON.stringify(ans);app.innerHTML='<div class="card"><b>Fertig.</b> Kopiere diesen Text und gib ihn weiter:<br><textarea readonly>'+out+'</textarea></div>';return}
const it=ITEMS[i];app.innerHTML='<div class="card"><small>'+(i+1)+' / '+ITEMS.length+'</small><div><b>A</b><img src="data:image/png;base64,'+it.a+'"></div><div><b>B</b><img src="data:image/png;base64,'+it.b+'"></div><p>Welche ist echt?</p><button onclick="pick(\\'a\\')">A ist echt</button><button onclick="pick(\\'b\\')">B ist echt</button></div>'}
function pick(s){ans[ITEMS[i].id]=s;i++;show()}show();</script></html>"""


def build(profile, n_pairs, cid='B6'):
    global OUT
    OUT = OUT if cid == 'B6' else os.path.join(OUT, cid)
    W = H.Writer(profile)
    cond = CONDITIONS[cid]
    rng = random.SystemRandom()
    cand = []
    for f in (0, 1):
        _, te = W.fold(f)
        t = W.train(f, *H.train_args(cond))
        if cond['glyphs'] == 'v1':
            glyphs = W.v1
        elif cond['glyphs'] == 'hybrid':
            glyphs = {ch: list(W.v1.get(ch, [])) + list(t['glyphs'].get(ch, [])) for ch in set(W.v1) | set(t['glyphs'])}
        else:
            glyphs = H.with_fallback(t['glyphs'], W.v1, cond.get('fb', 1))
        order = sorted(te)
        texts = [W.man['lines'][i]['text'] for i in order]
        gp, gm, _ = H.render(texts, glyphs, t['layout'], f'{rng.randrange(10**6)}', cond['style'], cond['ms'], t['xh_pt'], W.man)
        gl = lines_of(gp, gm)
        rl = lines_of(W.pages, H.sub_manifest(W.man, te))
        for j, li in enumerate(order):
            real = rl.get(li) or rl.get(order.index(li))
            if j in gl and real:
                cand.append((texts[j], draw_line(real, t['xh_pt']), draw_line(gl[j], t['xh_pt'])))
    rng.shuffle(cand)
    items, key = [], {}
    for k, (text, real, gen) in enumerate(cand[:n_pairs]):
        iid = f'q{k + 1:02d}'
        real_left = rng.random() < 0.5
        a, b = (real, gen) if real_left else (gen, real)
        items.append({'id': iid, 'a': png64(a), 'b': png64(b)})
        key[iid] = {'real': 'a' if real_left else 'b', 'text': text}
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, 'test.html'), 'w', encoding='utf-8').write(PAGE.replace('__ITEMS__', json.dumps(items)))
    json.dump(key, open(os.path.join(OUT, 'key.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{len(items)} pairs -> {os.path.join(OUT, "test.html")}')
    print(f'key (do not open before the test) -> {os.path.join(OUT, "key.json")}')


def score(fn, cid='B6'):
    global OUT
    OUT = OUT if cid == 'B6' else os.path.join(OUT, cid)
    key = json.load(open(os.path.join(OUT, 'key.json'), encoding='utf-8'))
    ans = json.load(open(fn, encoding='utf-8'))
    ok = sum(1 for q, s in ans.items() if key[q]['real'] == s)
    n = len(ans)
    from scipy.stats import binomtest
    print(f'{ok} of {n} correct ({ok / n:.0%}); chance is 50 %, p (two-sided) = {binomtest(ok, n, 0.5).pvalue:.3f}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('profile', nargs='?')
    ap.add_argument('--pairs', type=int, default=20)
    ap.add_argument('--score')
    ap.add_argument('--condition', default='B6', help='condition of research/run_experiments.py that writes the generated lines')
    a = ap.parse_args()
    score(a.score, a.condition) if a.score else build(a.profile, a.pairs, a.condition)
