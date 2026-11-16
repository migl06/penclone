"""Measure line-level habits from a written sample sheet v2: word gaps, letter gaps, baseline drift, line slope.

Usage:
    python3 measure_layout.py --pdf written.pdf --manifest sheet.json [--out layout.json]
    python3 profiles.py build NAME                  # runs this for the sample-v2 source and writes layout.json

The renderer (engine/layout.js) uses these numbers as its defaults, so spacing and drift come from the writer's own samples
(evidence type 2 in docs/decisions.md) instead of assumptions. All lengths are in x-heights.

Method (sample sheet v2: one known sentence per ruled line):
  * words   : segment_v2.split_words (the k-1 widest gaps of the line split it into the k words of the sentence);
              word gap = white space between the ink of neighbouring words. A line is used only if every word of 3 or
              more letters has a plausible width per letter (within 0.5-2x the line median), so a mis-split line (a gap
              inside a word taken for a word gap) does not distort the result. Letter gap = gap between neighbouring
              ink clusters inside a word (letters whose ink overlaps horizontally count as one cluster).
  * baseline: bottom of every character cluster of at least half an x-height (no dots, commas, dashes); descenders are
              dropped (bottom more than 0.3 x-heights below the median of the 9 nearest clusters). Offsets are
              measured against the ruled line of the sheet; slope = straight-line fit per line.
  * drift   : what is left after removing the line fit is split into a jitter per letter and a slow drift with an
              exponential variogram, gamma(h) = nugget + sill * (1 - exp(-h / range)), fitted by least squares to the
              pooled empirical variogram of all lines (Matheron's estimator; the exponential model is the covariance of
              an Ornstein-Uhlenbeck process, i.e. a random walk pulled back to the line). The glyphs already carry the
              jitter of the letters they were cut from, so the renderer adds only the slow drift (sd = sqrt(sill)).
"""
import argparse
import json
import math

import numpy as np

from segment_v2 import assign_lines, split_words, local_baseline
from svg_strokes import xclusters


def summary(v, nd=3):
    v = np.asarray(v, float)
    if not len(v):
        return None
    q1, med, q3 = np.percentile(v, [25, 50, 75])
    return {'n': int(len(v)), 'median': round(float(med), nd), 'q1': round(float(q1), nd), 'q3': round(float(q3), nd),
            'mean': round(float(v.mean()), nd), 'sd': round(float(v.std()), nd)}


def fit_variogram(h, g, max_lag=20.0, bin_w=0.5):
    """Fit gamma(h) = nugget + sill * (1 - exp(-h / range)) to binned semivariances (weighted by pair counts)."""
    k = h <= max_lag
    h, g = h[k], g[k]
    edges = np.arange(0, max_lag + bin_w, bin_w)
    idx = np.digitize(h, edges) - 1
    hb, gb, nb = [], [], []
    for b in range(len(edges) - 1):
        m = idx == b
        if m.sum() >= 20:
            hb.append(h[m].mean()); gb.append(g[m].mean()); nb.append(m.sum())
    hb, gb, w = np.array(hb), np.array(gb), np.sqrt(np.array(nb, float))
    best = None
    for r in np.geomspace(0.3, 60, 200):
        A = np.stack([np.ones_like(hb), 1 - np.exp(-hb / r)], 1)
        coef, *_ = np.linalg.lstsq(A * w[:, None], gb * w, rcond=None)
        if (coef < 0).any():
            continue
        err = float(((((A @ coef) - gb) * w) ** 2).sum())
        if best is None or err < best[0]:
            best = (err, r, coef)
    if best is None:
        return None
    _, r, (nug, sill) = best
    return {'model': 'exponential', 'nugget': round(float(nug), 5), 'sill': round(float(sill), 5),
            'range': round(float(r), 3), 'jitter_sd': round(math.sqrt(nug), 4), 'drift_sd': round(math.sqrt(sill), 4),
            'bins': [[round(float(a), 2), round(float(b), 5), int(c)] for a, b, c in zip(hb, gb, nb)]}


def measure(pages_strokes, manifest, xh_pt):
    row_h = manifest['row_height_pt']
    by_page = {}
    for li, ln in enumerate(manifest['lines']):
        by_page.setdefault(ln['page'], []).append(ln)
    word_gaps, letter_gaps, offsets, slopes, resid_sd, pairs_h, pairs_g = [], [], [], [], [], [], []
    lines_used = {'words': 0, 'baseline': 0, 'total': 0}
    for page, lines in by_page.items():
        st = pages_strokes.get(page)
        if st is None:
            continue
        per = assign_lines(st, lines, row_h)
        for ln, idx in zip(lines, per.values()):
            lines_used['total'] += 1
            if len(idx) < 6:
                continue
            n_words = len(ln['text'].split())
            box = lambda ids: (min(st[i][:, 0].min() for i in ids), max(st[i][:, 0].max() for i in ids))
            groups = split_words(st, idx, n_words)
            if groups is not None and n_words > 1:
                wb = sorted(box(g) for g in groups)
                wg = [wb[k + 1][0] - wb[k][1] for k in range(len(wb) - 1)]
                inner = []
                for g in groups:
                    cb = sorted(box(c) for c in xclusters(st, g, pad=0.0))
                    inner += [cb[k + 1][0] - cb[k][1] for k in range(len(cb) - 1)]
                words = ln['text'].split()
                per_letter = [(b[1] - b[0]) / len(w) for b, w in zip(sorted(box(g) for g in groups), words) if len(w) >= 3]
                med_pl = np.median(per_letter) if per_letter else 0
                if per_letter and all(0.5 <= p / med_pl <= 2 for p in per_letter):
                    word_gaps += [g / xh_pt for g in wg]
                    letter_gaps += [g / xh_pt for g in inner]
                    lines_used['words'] += 1
            cl = [c for c in xclusters(st, idx, pad=0.0)
                  if max(st[i][:, 1].max() for i in c) - min(st[i][:, 1].min() for i in c) >= 0.5 * xh_pt]
            if len(cl) < 8:
                continue
            xs = np.array([np.mean([st[i][:, 0].mean() for i in c]) for c in cl])
            bs = np.array([max(st[i][:, 1].max() for i in c) for c in cl])
            o = np.argsort(xs); xs, bs = xs[o], bs[o]
            keep = np.array([bs[k] - np.median(bs[np.argsort(np.abs(xs - xs[k]))[:9]]) <= 0.3 * xh_pt
                             for k in range(len(xs))])
            xs, bs = xs[keep], bs[keep]
            off = (ln['baseline'] - bs) / xh_pt                # > 0: writing sits above the ruled line
            xr = (xs - xs[0]) / xh_pt
            m, c0 = np.polyfit(xr, off, 1)
            res = off - (m * xr + c0)
            offsets.append(float(np.median(off)))
            slopes.append(math.degrees(math.atan(m)))
            resid_sd.append(float(res.std()))
            h = np.abs(xr[:, None] - xr[None]); g = 0.5 * (res[:, None] - res[None]) ** 2
            iu = np.triu_indices(len(xr), 1)
            pairs_h.append(h[iu]); pairs_g.append(g[iu])
            lines_used['baseline'] += 1
    vario = fit_variogram(np.concatenate(pairs_h), np.concatenate(pairs_g)) if pairs_h else None
    return {
        'unit': 'x-height',
        'source': 'sample-v2',
        'x_height_pt': round(float(xh_pt), 3),
        'lines': lines_used,
        'word_gap': summary(word_gaps),
        'letter_gap': summary(letter_gaps),
        'baseline_offset': summary(offsets),
        'line_slope_deg': summary(slopes),
        'baseline_residual_sd': summary(resid_sd),
        'drift': vario,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--pdf', required=True, help='written sample sheet v2 (PDF export with pen strokes)')
    ap.add_argument('--manifest', required=True, help='sheet.json written by make_sheet.py')
    ap.add_argument('--xheight-pt', type=float, help='x-height in pt (default: measured like build_glyphs_v2.py)')
    ap.add_argument('--out', help='write the result as JSON (default: print)')
    a = ap.parse_args()
    from build_glyphs_v2 import pages_from_pdf, normalise
    from segment_v2 import segment
    man = json.load(open(a.manifest, encoding='utf-8'))
    pages = pages_from_pdf(a.pdf, max(l['page'] for l in man['lines']))
    xh = a.xheight_pt
    if xh is None:
        occ, _ = segment(pages, man)
        xh = normalise(occ)[2]
    res = measure(pages, man, xh)
    txt = json.dumps(res, indent=1)
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(txt + '\n')
    print(txt)


if __name__ == '__main__':
    main()
