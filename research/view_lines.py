"""Draw generated lines of a condition into one PNG, to look at them.

    python3 research/view_lines.py PROFILE COND OUT.png [--fold 0] [--n 8] [--seed 1]
"""
import argparse
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blind_test as B  # noqa: E402
import harness as H  # noqa: E402
import run_experiments as E  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('profile'); ap.add_argument('cond'); ap.add_argument('out')
ap.add_argument('--fold', type=int, default=0); ap.add_argument('--n', type=int, default=8); ap.add_argument('--seed', default='1')
ap.add_argument('--start', type=int, default=0)
a = ap.parse_args()
W = E.W = H.Writer(a.profile)
c = E.CONDITIONS[a.cond]
t = W.train(a.fold, *H.train_args(c))
glyphs = E.glyphs_for(W, c, t)
_, te = W.fold(a.fold)
order = sorted(te)[a.start:a.start + a.n]
texts = [W.man['lines'][i]['text'] for i in order]
pages, man, _ = H.render(texts, glyphs, t['layout'], a.seed, c['style'], c['ms'], t['xh_pt'], W.man)
lines = B.lines_of(pages, man)
imgs = [B.draw_line(lines[j], t['xh_pt']) for j in range(len(texts)) if j in lines]
w = max(i.width for i in imgs)
sheet = Image.new('L', (w, sum(i.height for i in imgs)), 255)
y = 0
for i in imgs:
    sheet.paste(i, (0, y)); y += i.height
sheet.save(a.out)
print('\n'.join(texts))
