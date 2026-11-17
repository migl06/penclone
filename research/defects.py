"""Defect counts of generated lines (overlapping letters, ...) for conditions of run_experiments.py, no HWD needed.

    python3 research/defects.py PROFILE COND [COND ...]
"""
import json
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H  # noqa: E402
import run_experiments as E  # noqa: E402

if __name__ == '__main__':
    W = E.W = H.Writer(sys.argv[1])
    for cid in sys.argv[2:]:
        tot = {}
        for f in (0, 1):
            c = E.CONDITIONS[cid]
            t = W.train(f, *H.train_args(c))
            glyphs = E.glyphs_for(W, c, t)
            _, te = W.fold(f)
            texts = [W.man['lines'][i]['text'] for i in sorted(te)]
            with tempfile.TemporaryDirectory() as d:
                gf, lf, sf = (os.path.join(d, n) for n in ('g.json', 'l.json', 's.json'))
                json.dump(glyphs, open(gf, 'w'), ensure_ascii=False)
                lay = dict(t['layout']); lay['x_height_pt'] = t['xh_pt']
                json.dump(lay, open(lf, 'w'))
                json.dump({'glyphs': [gf], 'layout': lf, 'texts': texts, 'seed': '1', 'style': {**H.LEGACY_STYLE, **c['style']},
                           'measuredSpacing': c['ms']}, open(sf, 'w'), ensure_ascii=False)
                out = json.loads(subprocess.run(['node', os.path.join(H.ROOT, 'research', 'defects.mjs'), sf],
                                                check=True, capture_output=True, text=True).stdout)
            for k in ('pairs', 'overlap', 'touching', 'close', 'words'):
                tot[k] = tot.get(k, 0) + out[k]
            tot['minGap'] = min(tot.get('minGap', 9), out['minGap'])
            tot.setdefault('examples', []).extend(out['examples'][:6])
        print(cid, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in tot.items()})
