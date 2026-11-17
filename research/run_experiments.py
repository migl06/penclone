"""Run the realism ablation: every condition x 2 folds x N seeds, then HWD and the summary table.

    python3 research/run_experiments.py PROFILE [--seeds 5] [--jobs 6] [--hwd-python ~/Projekte/hwd-eval/venv/bin/python]
                                        [--out research/results/PROFILE.json]

Writes numbers only (no strokes, no images) to the output JSON; word images stay in the cache folder.
"""
import argparse
import json
import multiprocessing as mp
import os
import subprocess
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H  # noqa: E402

CONST_WIDTH = {'widthSd': 0, 'pressSd': 0}
# glyphs: 'v1' = alphabet sheet only (what `penclone render` uses by default today); 'v2' = sentences of the train fold
# with sheet v1 as fallback for characters the train fold lacks. merge: cut pieces rejoined. mv: variants per character
# (None = every occurrence). ms: measured letter spacing. style: engine options.
CONDITIONS = {
    'A0': dict(label='v1 alphabet sheet, 3 variants (current default)', glyphs='v1', merge=True, mv=8, ms=False, style={}),
    'A1': dict(label='v2 sentences, 8 variants, cut pieces', glyphs='v2', merge=False, mv=8, ms=False, style={}),
    'A2': dict(label='+ pieces rejoined into pen strokes', glyphs='v2', merge=True, mv=8, ms=False, style={}),
    'A3': dict(label='+ every occurrence as a variant', glyphs='v2', merge=True, mv=None, ms=False, style={}),
    'A4': dict(label='+ measured letter spacing', glyphs='v2', merge=True, mv=None, ms=True, style={}),
    'A5': dict(label='+ joins like the writer', glyphs='v2', merge=True, mv=None, ms=True, style={'joins': True}),
    'A6': dict(label='+ constant pen width', glyphs='v2', merge=True, mv=None, ms=True, style={'joins': True, **CONST_WIDTH}),
    'A7': dict(label='+ uncertain cuts left out (cost > 0.6), alphabet sheet below 3 variants', glyphs='v2', merge=True, mv=None,
               ms=True, style={'joins': True, **CONST_WIDTH}, cost=0.6, fb=3),
    # round 2: on top of A6 (A7 was worse)
    'B1': dict(label='A6 + deck (least used variant first)', base='A6', glyphs='v2', merge=True, mv=None, ms=True,
               style={'joins': True, **CONST_WIDTH, 'deck': True}),
    'B2': dict(label='A6 + continuation of source words', base='A6', glyphs='v2', merge=True, mv=None, ms=True,
               style={'joins': True, **CONST_WIDTH, 'continuation': True}),
    'B3': dict(label='A6 + glyphs not squeezed (width 1.0 instead of 0.9)', base='A6', glyphs='v2', merge=True, mv=None, ms=True,
               narrow=1.0, style={'joins': True, **CONST_WIDTH}),
    'B4': dict(label='A6 + word gaps between centre lines', base='A6', glyphs='v2', merge=True, mv=None, ms=True,
               style={'joins': True, **CONST_WIDTH, 'centreGaps': True}),
    'B5': dict(label='A6 + 1.5 x shape variation per use', base='A6', glyphs='v2', merge=True, mv=None, ms=True,
               style={'joins': True, **CONST_WIDTH, 'jitter': 1.5}),
    'B6': dict(label='A6 + B1-B4 together', base='A6', glyphs='v2', merge=True, mv=None, ms=True, narrow=1.0,
               style={'joins': True, **CONST_WIDTH, 'deck': True, 'continuation': True, 'centreGaps': True}),
    'B7': dict(label='B6 without joins', base='B6', glyphs='v2', merge=True, mv=None, ms=True, narrow=1.0,
               style={**CONST_WIDTH, 'deck': True, 'continuation': True, 'centreGaps': True}),
    # round 3: B6 with more shape variation per use (B5 lowered twins)
    'B8': dict(label='B6 + 1.5 x shape variation per use', base='B6', glyphs='v2', merge=True, mv=None, ms=True, narrow=1.0,
               style={'joins': True, **CONST_WIDTH, 'deck': True, 'continuation': True, 'centreGaps': True, 'jitter': 1.5}),
    'B9': dict(label='B6 + 2 x shape variation per use', base='B6', glyphs='v2', merge=True, mv=None, ms=True, narrow=1.0,
               style={'joins': True, **CONST_WIDTH, 'deck': True, 'continuation': True, 'centreGaps': True, 'jitter': 2.0}),
    'L1': dict(label='A6 without every occurrence (8 variants)', glyphs='v2', merge=True, mv=8, ms=True, style={'joins': True, **CONST_WIDTH}),
    'L2': dict(label='A6 without measured spacing', glyphs='v2', merge=True, mv=None, ms=False, style={'joins': True, **CONST_WIDTH}),
    'L3': dict(label='A6 without joins', glyphs='v2', merge=True, mv=None, ms=True, style={**CONST_WIDTH}),
    'L4': dict(label='A6 without rejoined pieces (no joins possible)', glyphs='v2', merge=False, mv=None, ms=True, style={**CONST_WIDTH}),
}

W = None   # the writer, loaded once before the workers fork


def train_job(args):
    W.train(*args)
    return args


def real_job(f):
    tr, te = W.fold(f)
    t = W.train(f, True, None)
    res = {}
    for name, lines in (('test', te), ('train', tr)):
        man = H.sub_manifest(W.man, lines)
        pages = {p: s for p, s in W.pages.items()}
        res[name] = H.evaluate(pages, man, W, t['sc'], t['xh_pt'], None, os.path.join(H.CACHE, 'img', f'real-{name}-f{f}'))
    return f, res


def gen_job(args):
    cid, f, seed = args
    c = CONDITIONS[cid]
    t = W.train(f, *H.train_args(c))
    glyphs = W.v1 if c['glyphs'] == 'v1' else H.with_fallback(t['glyphs'], W.v1, c.get('fb', 1))
    _, te = W.fold(f)
    texts = [W.man['lines'][i]['text'] for i in sorted(te)]
    pages, man, widths = H.render(texts, glyphs, t['layout'], f'{seed}', c['style'], c['ms'], t['xh_pt'], W.man)
    ev = H.evaluate(pages, man, W, t['sc'], t['xh_pt'], widths, os.path.join(H.CACHE, 'img', f'{cid}-f{f}-s{seed}'))
    return (cid, f, seed), ev


def hwd_sets(root):
    feats = {}
    for d in sorted(os.listdir(root)):
        fn = os.path.join(root, d, 'features.npz')
        if os.path.exists(fn):
            z = np.load(fn)
            feats[d] = (z['sums'], z['counts'])
    return feats


def hwd(a, b):
    ma = a[0].sum(0) / a[1].sum()
    mb = b[0].sum(0) / b[1].sum()
    return float(np.linalg.norm(ma - mb))


def hwd_boot(a, b, rng, n=300):
    out = []
    for _ in range(n):
        ia = rng.integers(0, len(a[1]), len(a[1])); ib = rng.integers(0, len(b[1]), len(b[1]))
        out.append(hwd((a[0][ia], a[1][ia]), (b[0][ib], b[1][ib])))
    return np.percentile(out, [2.5, 97.5]).tolist()


def c2st_words(a, b, seed):
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold, cross_val_score
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    k = min(len(a[1]), len(b[1]))
    rng = np.random.default_rng(seed)
    ia, ib = rng.permutation(len(a[1]))[:k], rng.permutation(len(b[1]))[:k]
    X = np.vstack([a[0][ia] / a[1][ia, None], b[0][ib] / b[1][ib, None]])
    y = np.r_[np.zeros(k), np.ones(k)]
    cv = StratifiedKFold(5, shuffle=True, random_state=seed)
    clf = make_pipeline(StandardScaler(), LogisticRegression(max_iter=5000, C=0.05))
    return float(cross_val_score(clf, X, y, cv=cv).mean())


def main():
    global W
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('profile')
    ap.add_argument('--seeds', type=int, default=5)
    ap.add_argument('--jobs', type=int, default=max(1, (os.cpu_count() or 2) - 0))
    ap.add_argument('--conditions', default=','.join(CONDITIONS))
    ap.add_argument('--hwd-python', default=os.path.expanduser('~/Projekte/hwd-eval/venv/bin/python'))
    ap.add_argument('--out')
    a = ap.parse_args()
    out = a.out or os.path.join(H.ROOT, 'research', 'results', f'{a.profile}.json')
    t0 = time.time()
    W = H.Writer(a.profile)
    conds = a.conditions.split(',')
    ctx = mp.get_context('fork')
    with ctx.Pool(a.jobs) as pool:
        keys = sorted({(f, *H.train_args(CONDITIONS[c])) for c in conds for f in (0, 1)}
                      | {(0, True, None, None, None, False), (1, True, None, None, None, False)}, key=str)
        list(pool.imap_unordered(train_job, keys))
        print(f'train sets ready ({time.time() - t0:.0f} s)', flush=True)
        real = dict(pool.map(real_job, (0, 1)))
        print(f'real sets measured ({time.time() - t0:.0f} s)', flush=True)
        jobs = [(c, f, s) for c in conds for f in (0, 1) for s in range(1, a.seeds + 1)]
        gen = {}
        for i, (k, ev) in enumerate(pool.imap_unordered(gen_job, jobs), 1):
            gen[k] = ev
            if i % 10 == 0 or i == len(jobs):
                print(f'  {i}/{len(jobs)} generated sets ({time.time() - t0:.0f} s)', flush=True)
    # HWD features in the separate torch environment
    subprocess.run([a.hwd_python, os.path.join(H.ROOT, 'research', 'hwd_features.py'), os.path.join(H.CACHE, 'img')],
                   check=True, cwd=os.path.join(H.ROOT, 'research'))
    F = hwd_sets(os.path.join(H.CACHE, 'img'))
    rng = np.random.default_rng(0)
    runs = []
    for (cid, f, seed), ev in sorted(gen.items()):
        rt, rtr = real[f]['test'], real[f]['train']
        g = F[f'{cid}-f{f}-s{seed}']; r = F[f'real-test-f{f}']
        tw_real, tw_gen = H.twin_rate(rtr['_letters'], rt['_letters'], ev['_letters'], np.random.default_rng(seed))
        runs.append({
            'condition': cid, 'fold': f, 'seed': seed,
            'hwd': hwd(g, r), 'hwd_ci': hwd_boot(g, r, rng),
            'c2st_words': c2st_words(g, r, seed),
            'c2st_letters': H.c2st_letters(rt['_letters'], ev['_letters'], seed),
            'twins': tw_gen, 'twins_real': tw_real,
            'clearance_w1': H.wasserstein(ev['clearance'], rt['clearance']),
            'clearance_median': float(np.median(ev['clearance'])) if ev['clearance'] else None,
            **{k: ev[k] for k in ('pen_lifts_per_letter', 'join_rate', 'baseline_sd', 'size_cv', 'width_cv', 'pen_width_cv',
                                  'words_aligned', 'n_words_img')},
            'word_gap_median': ev['word_gaps']['median'] if ev['word_gaps'] else None,
        })
    human = []
    for f in (0, 1):
        rt, rtr = real[f]['test'], real[f]['train']
        a_, b_ = F[f'real-train-f{f}'], F[f'real-test-f{f}']
        human.append({
            'fold': f, 'hwd_train_vs_test': hwd(a_, b_), 'hwd_ci': hwd_boot(a_, b_, rng),
            'c2st_words_train_vs_test': c2st_words(a_, b_, f),
            'c2st_letters_train_vs_test': H.c2st_letters(rt['_letters'], rtr['_letters'], f),
            'clearance_w1_train_vs_test': H.wasserstein(rtr['clearance'], rt['clearance']),
            'test': {k: rt[k] for k in ('pen_lifts_per_letter', 'join_rate', 'baseline_sd', 'size_cv', 'width_cv', 'words_aligned',
                                        'n_words_img')} | {'clearance_median': float(np.median(rt['clearance'])),
                                                          'word_gap_median': rt['word_gaps']['median'] if rt['word_gaps'] else None},
        })
    res = {'profile_hash': None, 'seeds': a.seeds, 'conditions': {c: CONDITIONS[c] for c in conds}, 'runs': runs, 'human': human,
           'train': {f'f{f}': {k: v for k, v in W.train(f, True, None).items() if k in ('words_aligned', 'words', 'xh_pt')} for f in (0, 1)},
           'seconds': round(time.time() - t0)}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(res, open(out, 'w', encoding='utf-8'), indent=1, default=float)
    print('written', out)


if __name__ == '__main__':
    main()
