"""Summary of the IAM-OnDB replication: per condition the mean over writers (each writer: mean of both folds), the writers'
own reference, and paired comparisons across writers (Wilcoxon signed-rank, bootstrap CI over writers).

    python3 research/report_iam.py research/results/iam.json [--md out.md]
"""
import argparse
import json

import numpy as np

KEYS = [('hwd', 'HWD', 3), ('c2st_words', 'C2ST words', 2), ('c2st_letters', 'C2ST letters', 2), ('twins', 'twins', 2),
        ('clearance_w1', 'clearance W1', 3), ('pen_lifts_per_letter', 'pen lifts/letter', 2), ('join_rate', 'join rate', 3),
        ('size_cv', 'size CV', 3), ('word_gap_median', 'word gap', 2)]
PAIRS = [('A1', 'A3'), ('A3', 'A4'), ('A4', 'A6'), ('A6', 'B3'), ('A6', 'B6'), ('B6', 'B8'), ('B6', 'B9'), ('A1', 'B6'), ('A1', 'B8')]
PAIRED = ['hwd', 'c2st_words', 'c2st_letters', 'twins', 'clearance_w1']


def per_writer(res):
    """{writer: {condition or 'human': {metric: mean over folds}}}"""
    out = {}
    for row in res['rows']:
        w = out.setdefault(row['writer'], {})
        for c, v in row.items():
            if not isinstance(v, dict):
                continue
            for k, x in v.items():
                if k == 'word_gaps':
                    k, x = 'word_gap_median', (x or {}).get('median')
                if isinstance(x, (int, float)) and x is not None and not np.isnan(x):
                    w.setdefault(c, {}).setdefault(k, []).append(x)
    return {w: {c: {k: float(np.mean(v)) for k, v in m.items()} for c, m in cs.items()} for w, cs in out.items()}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('results')
    ap.add_argument('--md')
    a = ap.parse_args()
    res = json.load(open(a.results, encoding='utf-8'))
    W = per_writer(res)
    conds = list(res['conditions'])
    val = lambda c, k: [W[w][c][k] for w in W if c in W[w] and k in W[w][c]]
    lines = [f'{len(W)} IAM-OnDB writers; mean ± SD over writers (each writer: mean of both folds)', '',
             '| condition | ' + ' | '.join(l for _, l, _ in KEYS) + ' |', '|---' * (len(KEYS) + 1) + '|']
    human = {k: val('human', k) for k, _, _ in KEYS}
    human['twins'] = [np.mean([r[c]['twins_real'] for c in conds if c in r and r[c].get('twins_real') is not None])
                      for r in res['rows']]
    lines.append('| **writers (reference)** | ' + ' | '.join(
        f'**{np.mean(human[k]):.{d}f}**' if human.get(k) else '' for k, _, d in KEYS) + ' |')
    for c in conds:
        cells = []
        for k, _, d in KEYS:
            v = val(c, k)
            cells.append(f'{np.mean(v):.{d}f} ± {np.std(v, ddof=1):.{d}f}' if len(v) > 1 else '–')
        lines.append(f'| {c} {res["conditions"][c]["label"]} | ' + ' | '.join(cells) + ' |')
    from scipy.stats import wilcoxon
    rng = np.random.default_rng(0)
    lines += ['', '| comparison (paired over writers) | ' + ' | '.join(PAIRED) + ' |', '|---' * (len(PAIRED) + 1) + '|']
    for x, y in PAIRS:
        if x not in conds or y not in conds:
            continue
        cells = []
        for k in PAIRED:
            d = np.array([W[w][y][k] - W[w][x][k] for w in W if x in W[w] and y in W[w] and k in W[w][x] and k in W[w][y]])
            if len(d) < 3:
                cells.append('–'); continue
            ci = np.percentile([rng.choice(d, len(d)).mean() for _ in range(5000)], [2.5, 97.5])
            p = float(wilcoxon(d).pvalue) if np.any(d != 0) else 1.0
            better = (d < 0).sum()
            cells.append(f'{d.mean():+.3f} [{ci[0]:+.3f}, {ci[1]:+.3f}] p={p:.3f} ({better}/{len(d)} lower)')
        lines.append(f'| {x} → {y} | ' + ' | '.join(cells) + ' |')
    txt = '\n'.join(lines) + '\n'
    print(txt)
    if a.md:
        open(a.md, 'w', encoding='utf-8').write(txt)


if __name__ == '__main__':
    main()
