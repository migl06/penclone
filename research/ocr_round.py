"""Legibility of real and generated writing: character error rate of TrOCR on the test sentences' words.

    python3 research/ocr_round.py PROFILE [--conditions A0,A6,B6] [--out research/results/PROFILE-ocr.json]

penclone writes the test sentences with seed 1 per fold (the same versions as in run_experiments.py), the word images are
rendered at 30 px per x-height, and research/ocr_cer.py reads them in the torch environment. Numbers only in the output.
"""
import argparse
import json
import multiprocessing as mp
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H  # noqa: E402
from run_experiments import CONDITIONS  # noqa: E402

W = None
OCR = os.path.join(H.CACHE, 'ocr')
SMALL = os.path.join(H.CACHE, 'ocr-small')


def job(args):
    cid, f = args
    _, te = W.fold(f)
    if cid == 'real':
        t = W.train(f, True, None)
        man = H.sub_manifest(W.man, te)
        H.words(W.pages, man, t['xh_pt'], {i: 1.0 for p in W.pages for i in range(len(W.pages[p]))},
                os.path.join(SMALL, f'real-test-f{f}'), os.path.join(OCR, f'real-test-f{f}'))
        return args
    c = CONDITIONS[cid]
    t = W.train(f, *H.train_args(c))
    glyphs = W.v1 if c['glyphs'] == 'v1' else H.with_fallback(t['glyphs'], W.v1, c.get('fb', 1))
    texts = [W.man['lines'][i]['text'] for i in sorted(te)]
    pages, man, widths = H.render(texts, glyphs, t['layout'], '1', c['style'], c['ms'], t['xh_pt'], W.man)
    med = float(np.median(widths))
    H.words(pages, man, t['xh_pt'], {i: float(x) / med for i, x in enumerate(widths)},
            os.path.join(SMALL, f'{cid}-f{f}'), os.path.join(OCR, f'{cid}-f{f}'))
    return args


def main():
    global W
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('profile')
    ap.add_argument('--conditions', default='A0,A1,A3,A4,A6,A7,B1,B2,B3,B4,B5,B6,B7')
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2)
    ap.add_argument('--hwd-python', default=os.path.expanduser('~/Projekte/hwd-eval/venv/bin/python'))
    ap.add_argument('--out')
    a = ap.parse_args()
    out = a.out or os.path.join(H.ROOT, 'research', 'results', f'{a.profile}-ocr.json')
    W = H.Writer(a.profile)
    jobs = [(c, f) for c in ['real'] + a.conditions.split(',') for f in (0, 1)]
    with mp.get_context('fork').Pool(a.jobs) as pool:
        list(pool.imap_unordered(job, jobs))
    subprocess.run([a.hwd_python, os.path.join(H.ROOT, 'research', 'ocr_cer.py'), OCR], check=True)
    res = {}
    for c, f in jobs:
        r = json.load(open(os.path.join(OCR, f'{c if c != "real" else "real-test"}-f{f}', 'ocr.json'), encoding='utf-8'))
        res.setdefault(c, {})[f] = {'cer': r['cer'], 'n': r['n'], 'chars': r['chars']}
    json.dump({'model': 'microsoft/trocr-base-handwritten', 'seed': 1, 'cer': res}, open(out, 'w'), indent=1)
    for c, v in res.items():
        print(f'{c:5s} CER {np.mean([x["cer"] for x in v.values()]):.3f}')
    print('written', out)


if __name__ == '__main__':
    main()
