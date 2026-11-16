"""Summary of a realism experiment: table per condition, paired comparisons, optional figures.

    python3 research/report.py research/results/PROFILE.json [--md out.md] [--figures DIR]
"""
import argparse
import json
from collections import defaultdict

import numpy as np

METRICS = [  # key, label, digits, better ('low' | 'high' | 'ref' = close to the writer)
    ('hwd', 'HWD', 3, 'low'),
    ('c2st_words', 'C2ST words', 2, 'half'),
    ('c2st_letters', 'C2ST letters', 2, 'half'),
    ('twins', 'twins', 2, 'ref'),
    ('clearance_w1', 'clearance W1', 3, 'low'),
    ('clearance_median', 'clearance median', 2, 'ref'),
    ('pen_lifts_per_letter', 'pen lifts/letter', 2, 'ref'),
    ('join_rate', 'join rate', 3, 'ref'),
    ('size_cv', 'size CV', 3, 'ref'),
    ('width_cv', 'width CV', 3, 'ref'),
    ('pen_width_cv', 'pen width CV', 3, 'ref'),
    ('baseline_sd', 'baseline SD', 3, 'ref'),
    ('word_gap_median', 'word gap', 2, 'ref'),
]
LADDER = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']
LOO = ['L1', 'L2', 'L3', 'L4']
PAIRED = ['hwd', 'c2st_words', 'c2st_letters', 'twins', 'clearance_w1']


def runs_by(res):
    by = defaultdict(dict)
    for r in res['runs']:
        by[r['condition']][(r['fold'], r['seed'])] = r
    return by


def mean_sd(vals):
    v = np.array([x for x in vals if x is not None and not (isinstance(x, float) and np.isnan(x))], float)
    return (float(v.mean()), float(v.std(ddof=1)) if len(v) > 1 else 0.0) if len(v) else (np.nan, np.nan)


def human_ref(res):
    h = res['human']
    ref = {
        'hwd': np.mean([x['hwd_train_vs_test'] for x in h]),
        'c2st_words': np.mean([x['c2st_words_train_vs_test'] for x in h]),
        'c2st_letters': np.mean([x['c2st_letters_train_vs_test'] for x in h]),
        'clearance_w1': np.mean([x['clearance_w1_train_vs_test'] for x in h]),
        'twins': np.mean([r['twins_real'] for r in res['runs'] if r['twins_real'] is not None]),
    }
    for k in ('pen_lifts_per_letter', 'join_rate', 'size_cv', 'width_cv', 'baseline_sd', 'clearance_median', 'word_gap_median'):
        ref[k] = np.mean([x['test'][k] for x in h if x['test'].get(k) is not None])
    ref['pen_width_cv'] = 0.0
    return ref


def paired(by, a, b, key, rng):
    """Mean difference b - a over runs with the same fold and seed, 95 % bootstrap CI and Wilcoxon signed-rank p."""
    from scipy.stats import wilcoxon
    ks = sorted(set(by[a]) & set(by[b]))
    d = np.array([by[b][k][key] - by[a][k][key] for k in ks if by[a][k][key] is not None and by[b][k][key] is not None], float)
    d = d[~np.isnan(d)]
    if len(d) < 3:
        return None
    boot = [rng.choice(d, len(d)).mean() for _ in range(5000)]
    try:
        p = float(wilcoxon(d).pvalue) if np.any(d != 0) else 1.0
    except ValueError:
        p = 1.0
    return {'diff': float(d.mean()), 'ci': np.percentile(boot, [2.5, 97.5]).tolist(), 'p': p, 'n': int(len(d))}


def table(res):
    by = runs_by(res)
    ref = human_ref(res)
    conds = [c for c in res['conditions'] if c in by]
    lines = ['| condition | ' + ' | '.join(m[1] for m in METRICS) + ' |', '|---' * (len(METRICS) + 1) + '|']
    lines.append('| **writer (reference)** | ' + ' | '.join(
        f'**{ref[k]:.{d}f}**' if k in ref and not np.isnan(ref[k]) else '' for k, _, d, _ in METRICS) + ' |')
    for c in conds:
        cells = []
        for k, _, d, _ in METRICS:
            m, s = mean_sd([r[k] for r in by[c].values()])
            cells.append('–' if np.isnan(m) else f'{m:.{d}f} ± {s:.{d}f}')
        lines.append(f'| {c} {res["conditions"][c]["label"]} | ' + ' | '.join(cells) + ' |')
    return '\n'.join(lines)


def comparisons(res):
    by = runs_by(res)
    rng = np.random.default_rng(0)
    out = ['| comparison | ' + ' | '.join(PAIRED) + ' |', '|---' * (len(PAIRED) + 1) + '|']
    pairs = [(LADDER[i], LADDER[i + 1]) for i in range(len(LADDER) - 1)] + [('A0', 'A6'), ('A0', 'A7')] + [('A6', c) for c in LOO]
    pairs += [(c['base'], k) for k, c in res['conditions'].items() if c.get('base')]
    for a, b in pairs:
        if a not in by or b not in by:
            continue
        cells = []
        for k in PAIRED:
            r = paired(by, a, b, k, rng)
            cells.append('–' if r is None else f"{r['diff']:+.3f} [{r['ci'][0]:+.3f}, {r['ci'][1]:+.3f}] p={r['p']:.3f}")
        out.append(f'| {a} → {b} | ' + ' | '.join(cells) + ' |')
    return '\n'.join(out)


def figures(res, d):
    import os
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    by = runs_by(res)
    ref = human_ref(res)
    os.makedirs(d, exist_ok=True)
    conds = [c for c in LADDER if c in by]
    plt.rcParams.update({'font.size': 9, 'svg.fonttype': 'none'})
    fig, axes = plt.subplots(1, 4, figsize=(11, 2.8))
    for ax, (k, label, best) in zip(axes, [('hwd', 'HWD (lower is closer)', None), ('c2st_words', 'C2ST words (0.5 = indistinguishable)', 0.5),
                                          ('twins', 'near-identical twins', None), ('clearance_w1', 'letter spacing W1 (x-heights)', None)]):
        vals = [[r[k] for r in by[c].values() if r[k] is not None] for c in conds]
        m = [np.mean(v) for v in vals]; s = [np.std(v, ddof=1) for v in vals]
        ax.bar(range(len(conds)), m, yerr=s, color='#4a6fa5', width=0.65, capsize=2)
        if k in ref and not np.isnan(ref[k]):
            ax.axhline(ref[k], color='#c0392b', lw=1.2, ls='--', label='writer')
        if best is not None:
            ax.axhline(best, color='#555', lw=0.8, ls=':')
        ax.set_xticks(range(len(conds)), conds)
        ax.set_title(label, fontsize=9)
        ax.spines[['top', 'right']].set_visible(False)
    axes[0].legend(frameon=False, fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(d, 'ladder.svg'))
    print('figure', os.path.join(d, 'ladder.svg'))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('results', nargs='+')
    ap.add_argument('--md')
    ap.add_argument('--figures')
    a = ap.parse_args()
    res = json.load(open(a.results[0], encoding='utf-8'))
    for extra in a.results[1:]:                    # further rounds: same writer, same folds and seeds, other conditions
        more = json.load(open(extra, encoding='utf-8'))
        res['conditions'].update(more['conditions'])
        res['runs'] += [r for r in more['runs'] if r['condition'] not in {x['condition'] for x in res['runs']}]
    txt = '## Results per condition (mean ± SD over folds and seeds)\n\n' + table(res) + \
          '\n\n## Paired differences (same fold and seed), 95 % bootstrap CI, Wilcoxon signed-rank p\n\n' + comparisons(res) + '\n'
    print(txt)
    if a.md:
        open(a.md, 'w', encoding='utf-8').write(txt)
    if a.figures:
        figures(res, a.figures)


if __name__ == '__main__':
    main()
