"""Twin rate and size / width variation of conditions, without the HWD environment (a few minutes).

    python3 research/quick_variation.py PROFILE COND [COND ...]
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H  # noqa: E402
import run_experiments as E  # noqa: E402

if __name__ == '__main__':
    W = E.W = H.Writer(sys.argv[1])
    real = dict(E.real_job(f) for f in (0, 1))
    print('writer: size CV %.3f width CV %.3f' % (np.mean([real[f]['test']['size_cv'] for f in (0, 1)]), np.mean([real[f]['test']['width_cv'] for f in (0, 1)])))
    for cid in sys.argv[2:]:
        tw, sz, wd = [], [], []
        for f in (0, 1):
            for seed in (1, 2):
                ev = E.gen_job((cid, f, seed))[1]
                a, b = H.twin_rate(real[f]['train']['_letters'], real[f]['test']['_letters'], ev['_letters'], np.random.default_rng(seed))
                tw.append(b); sz.append(ev['size_cv']); wd.append(ev['width_cv'])
        print(f'{cid}: twins {np.mean(tw):.2f} (writer {a:.2f})  size CV {np.mean(sz):.3f}  width CV {np.mean(wd):.3f}', flush=True)
