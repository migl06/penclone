"""Replicate the realism ablation on writers of the IAM On-Line Handwriting Database.

    python3 research/run_iam.py [--writers 12] [--jobs 6] [--out research/results/iam.json]

Writers are chosen by how many words they write with separate letters (the pipeline does not handle fully joined
cursive yet), at least 40 lines each. Per writer: 2 folds (even / odd lines), one generated version per fold and condition.
Output: numbers per IAM writer id and condition; no strokes, no images.
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
import iam  # noqa: E402
from run_experiments import CONDITIONS, c2st_words, hwd, hwd_sets  # noqa: E402

CONDS = ['A1', 'A3', 'A4', 'A6', 'B3', 'B6', 'B8', 'B9']   # ladder of the realism study on further writers
IDX = None


def survey_job(wid):
    return iam.separable_share(wid, IDX[wid])


def writer_job(wid):
    w = iam.IAMWriter(wid, IDX[wid])
    out = {'wid': wid, 'folds': {}}
    img = os.path.join(H.CACHE, 'img-iam')
    for f in (0, 1):
        strict, T, _ = w.templates(f)
        if T is None:
            return None
        w.T = T
        trains = {c: w.train(f, *H.train_args(CONDITIONS[c])) for c in CONDS}
        cover = set.intersection(*[set(t['glyphs']) | set(strict) for t in trains.values()])
        tr, te = w.fold(f)
        te = {i for i in te if set(w.man['lines'][i]['text'].replace(' ', '')) <= cover}
        if len(te) < 6:
            return None
        t0 = trains['A3']
        res = {'n_test_lines': len(te)}
        for name, lines in (('test', te), ('train', tr)):
            res[f'real_{name}'] = H.evaluate(w.pages, H.sub_manifest(w.man, lines), w, t0['sc'], t0['xh_pt'], None,
                                             os.path.join(img, f'{wid}-real-{name}-f{f}'))
        texts = [w.man['lines'][i]['text'] for i in sorted(te)]
        for c in CONDS:
            cd, t = CONDITIONS[c], trains[c]
            glyphs = H.with_fallback(t['glyphs'], strict, cd.get('fb', 1))
            pages, man, widths = H.render(texts, glyphs, t['layout'], f'{f}', cd['style'], cd['ms'], t['xh_pt'], w.man)
            res[c] = H.evaluate(pages, man, w, t0['sc'], t0['xh_pt'], widths, os.path.join(img, f'{wid}-{c}-f{f}'))
        out['folds'][f] = res
    return out


def strip(ev):
    return {k: v for k, v in ev.items() if not k.startswith('_') and k != 'clearance'}


def main():
    global IDX
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--writers', type=int, default=12)
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2)
    ap.add_argument('--hwd-python', default=os.path.expanduser('~/Projekte/hwd-eval/venv/bin/python'))
    ap.add_argument('--out', default=os.path.join(H.ROOT, 'research', 'results', 'iam.json'))
    a = ap.parse_args()
    t0 = time.time()
    IDX = iam.writers_index()
    cand = [w for w, ls in IDX.items() if len(ls) >= 40]
    ctx = mp.get_context('fork')
    cached = os.path.join(H.CACHE, 'iam-survey.json')
    with ctx.Pool(a.jobs) as pool:
        if os.path.exists(cached):
            survey = [tuple(r) for r in json.load(open(cached))]
        else:
            survey = sorted(pool.map(survey_job, cand), key=lambda r: -r[2])
            json.dump(survey, open(cached, 'w'))
        print(f'survey of {len(cand)} writers ({time.time() - t0:.0f} s); most separate words:',
              [(w, round(s, 2), n) for w, s, n in survey[:a.writers]], flush=True)
        chosen = [w for w, s, n in survey[:a.writers + 4]]
        results = []
        for r in pool.imap_unordered(writer_job, chosen):
            if r is not None:
                results.append(r)
                print(f'  writer {r["wid"]} done ({time.time() - t0:.0f} s)', flush=True)
    results = sorted(results, key=lambda r: [w for w, _, _ in survey].index(r['wid']))[:a.writers]
    subprocess.run([a.hwd_python, os.path.join(H.ROOT, 'research', 'hwd_features.py'), os.path.join(H.CACHE, 'img-iam')],
                   check=True, cwd=os.path.join(H.ROOT, 'research'))
    F = hwd_sets(os.path.join(H.CACHE, 'img-iam'))
    rows = []
    for r in results:
        wid = r['wid']
        for f, res in r['folds'].items():
            rt, rtr = res['real_test'], res['real_train']
            row = {'writer': wid, 'fold': f, 'n_test_lines': res['n_test_lines'],
                   'human': {'hwd': hwd(F[f'{wid}-real-train-f{f}'], F[f'{wid}-real-test-f{f}']),
                             'c2st_words': c2st_words(F[f'{wid}-real-train-f{f}'], F[f'{wid}-real-test-f{f}'], 0),
                             'c2st_letters': H.c2st_letters(rt['_letters'], rtr['_letters'], 0),
                             'clearance_w1': H.wasserstein(rtr['clearance'], rt['clearance']),
                             **strip(rt)}}
            for c in CONDS:
                ev = res[c]
                g, rr = F[f'{wid}-{c}-f{f}'], F[f'{wid}-real-test-f{f}']
                tw_real, tw_gen = H.twin_rate(rtr['_letters'], rt['_letters'], ev['_letters'], np.random.default_rng(f))
                row[c] = {'hwd': hwd(g, rr), 'c2st_words': c2st_words(g, rr, 0),
                          'c2st_letters': H.c2st_letters(rt['_letters'], ev['_letters'], 0),
                          'twins': tw_gen, 'twins_real': tw_real,
                          'clearance_w1': H.wasserstein(ev['clearance'], rt['clearance']), **strip(ev)}
            rows.append(row)
    json.dump({'source': 'IAM-OnDB', 'conditions': {c: CONDITIONS[c] for c in CONDS}, 'writers': [r['wid'] for r in results],
               'rows': rows, 'seconds': round(time.time() - t0)}, open(a.out, 'w', encoding='utf-8'), indent=1, default=float)
    print('written', a.out, f'({time.time() - t0:.0f} s)')


if __name__ == '__main__':
    main()
