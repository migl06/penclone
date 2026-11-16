"""Build the glyph library from a written sample sheet v2 (sentences with known text).

Usage:
    python3 build_glyphs_v2.py --pdf written.pdf --manifest sheet.json --out glyphs.json [--report report.json]

Steps: strokes -> characters (segment_v2.py) -> per-line baseline (fit through the bottoms of letters without descender)
-> size normalisation (x-height = 0.42 em, like sample sheet v1) -> drop outliers -> up to 8 varied variants per character
(farthest-point choice on a small ink raster) -> glyph JSON in the same format as v1, plus a "pos" tag
(initial / medial / final / single) per variant. The report lists coverage per character and the measured proportions
(capital / x-height, ascender / x-height), which sample sheet v1 could not measure (known issues A3, A5).

Not yet applied: rules R3 and R5 of docs/rules.md (they were calibrated on sheet v1) -- see docs/known-issues.md.
"""
import argparse
import json
import os
import subprocess
import tempfile

import numpy as np

from svg_strokes import load
from segment_v2 import segment
from shapes import raster

XH_EM = 0.42                       # x-height in em (same as sheet v1)
XH_CHARS = 'acemnorsuvwxz'
NO_DESC = set('abcdehiklmnorstuvwxzABCDEFGHIKLMNOPRSTUVWXYZ0126 8äöü')
MAX_VARIANTS = 8
OUTLIER = (0.6, 1.6)               # height relative to the median of the same character (assumption)
BEAR, MINADV, RDP_EPS, NARROW = 0.025, 0.2, 0.0035, 0.9


def rdp(P, eps):
    if len(P) < 3:
        return P
    a, b = P[0], P[-1]
    ab = b - a
    n = np.hypot(*ab)
    d = np.abs(ab[0] * (P[:, 1] - a[1]) - ab[1] * (P[:, 0] - a[0])) / n if n > 1e-9 else np.hypot(*(P - a).T)
    i = d.argmax()
    if d[i] > eps:
        return np.vstack([rdp(P[:i + 1], eps)[:-1], rdp(P[i:], eps)])
    return np.vstack([a, b])


def line_baselines(occ):
    """Fit a baseline y = m*x + b per line from the bottoms of letters without descender; fall back to the ruled line."""
    fits = {}
    for li in {o['line'] for o in occ}:
        pts = [(np.concatenate(o['strokes'])[:, 0].mean(), np.concatenate(o['strokes'])[:, 1].max())
               for o in occ if o['line'] == li and o['char'] in NO_DESC and o['char'].isalnum()]
        if len(pts) >= 6:
            x, y = np.array(pts).T
            m, b = np.polyfit(x, y, 1)
            res = y - (m * x + b)
            k = np.abs(res) <= max(np.abs(res).std() * 1.5, 0.5)
            if k.sum() >= 4:
                m, b = np.polyfit(x[k], y[k], 1)
            if abs(m) < 0.15:                  # a page-wide slope beyond ~8 degrees is not handwriting drift
                fits[li] = (m, b)
                continue
        base = next(o['baseline'] for o in occ if o['line'] == li)
        fits[li] = (0.0, base)
    return fits


def normalise(occ):
    """Return occurrences with strokes in em units: x from the glyph's left edge, y = 0 at the baseline, up is negative."""
    fits = line_baselines(occ)
    # x-height is measured from the *line baseline at the glyph*, so tilt of the whole line is removed
    hs = []
    for o in occ:
        if o['char'] in XH_CHARS:
            a = np.concatenate(o['strokes'])
            m, b = fits[o['line']]
            hs.append(m * a[:, 0].mean() + b - a[:, 1].min())
    xh_pt = float(np.median(hs))
    sc = XH_EM / xh_pt
    out = []
    for o in occ:
        m, b = fits[o['line']]
        a = np.concatenate(o['strokes'])
        x0 = a[:, 0].min()
        ys = m * a[:, 0].mean() + b
        S = [np.stack([(s[:, 0] - x0) * sc, (s[:, 1] - ys) * sc], 1) for s in o['strokes']]
        out.append({**o, 'strokes': S})
    return out, sc, xh_pt


def pick_varied(items, k):
    """Choose up to k items that differ most (farthest-point sampling, start at the one closest to the mean)."""
    if len(items) <= k:
        return items
    R = np.array([raster(it['strokes']) for it in items])
    chosen = [int(np.argmin(((R - R.mean(0)) ** 2).sum(1)))]
    d = ((R - R[chosen[0]]) ** 2).sum(1)
    while len(chosen) < k:
        n = int(np.argmax(d)); chosen.append(n)
        d = np.minimum(d, ((R - R[n]) ** 2).sum(1))
    return [items[i] for i in chosen]


def drop_shape_outliers(items, k=2.5, min_items=5):
    """Remove occurrences whose shape is far from the typical shape of the same character (likely mis-assigned strokes).
    Distance = L2 between small ink rasters; limit = median + k * MAD of the distances to the medoid (assumption)."""
    if len(items) < min_items:
        return items
    R = np.array([raster(it['strokes']) for it in items])
    D = ((R[:, None] - R[None]) ** 2).sum(2)
    med = int(np.argmin(D.sum(1)))
    d = D[med]
    mad = np.median(np.abs(d - np.median(d))) or 1e-9
    return [it for it, x in zip(items, d) if x <= np.median(d) + k * 1.4826 * mad]


def pack(strokes):
    strokes = [s * np.array([NARROW, 1.0]) for s in strokes]
    a = np.concatenate(strokes)
    x0, x1 = a[:, 0].min(), a[:, 0].max()
    w = x1 - x0
    adv = max(w + 2 * BEAR, MINADV)
    off = (adv - w) / 2 - x0
    ss = []
    for s in strokes:
        q = s.copy(); q[:, 0] += off
        q = rdp(q, RDP_EPS) if len(q) > 3 else q
        ss.append([[round(float(x), 3), round(float(y), 3)] for x, y in q])
    return {'adv': round(float(adv), 3), 's': ss}


def build(occ):
    norm, sc, xh_pt = normalise(occ)
    by = {}
    for o in norm:
        by.setdefault(o['char'], []).append(o)
    report = {'scale_em_per_pt': sc, 'xheight_pt': xh_pt, 'chars': {}, 'proportions': {}}
    out = {}
    for ch, items in by.items():
        h = np.array([np.concatenate(o['strokes'])[:, 1].max() - np.concatenate(o['strokes'])[:, 1].min() for o in items])
        med = float(np.median(h))
        keep = [o for o, hh in zip(items, h) if med > 0 and OUTLIER[0] <= hh / med <= OUTLIER[1]] if len(items) > 2 else items
        keep = drop_shape_outliers(keep)
        chosen = pick_varied(keep, MAX_VARIANTS)
        out[ch] = []
        for o in chosen:
            g = pack(o['strokes']); g['pos'] = o['pos']
            out[ch].append(g)
        report['chars'][ch] = {'found': len(items), 'kept': len(keep), 'variants': len(chosen)}

    def med_top(chars):
        v = [-np.concatenate(o['strokes'])[:, 1].min() for c in chars for o in by.get(c, [])]
        return float(np.median(v)) if v else None
    cap, asc = med_top('BDEFHKLMNPRTUVWXZ'), med_top('bdfhklt')
    report['proportions'] = {'capital_height_em': cap, 'ascender_height_em': asc, 'x_height_em': XH_EM,
                             'capital_over_xheight': cap / XH_EM if cap else None,
                             'ascender_over_xheight': asc / XH_EM if asc else None}
    return out, report


def pages_from_pdf(pdf, n_pages):
    """Strokes per page (1-based) from a written sample PDF via pdftocairo."""
    res = {}
    with tempfile.TemporaryDirectory() as d:
        for p in range(1, n_pages + 1):
            fn = os.path.join(d, f'pg{p}.svg')
            subprocess.run(['pdftocairo', '-svg', '-f', str(p), '-l', str(p), pdf, fn], check=True)
            res[p] = load(fn)
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--pdf', required=True, help='written sample sheet (PDF export with pen strokes)')
    ap.add_argument('--manifest', required=True, help='sheet.json written by make_sheet.py')
    ap.add_argument('--templates', help='glyph JSON used as templates to align joined letters (e.g. a sheet-v1 glyphs.json)')
    ap.add_argument('--limit', type=float, default=0.9, help='largest accepted shape cost of one character with --templates (stricter = cleaner, fewer words)')
    ap.add_argument('--out', default='glyphs.json')
    ap.add_argument('--report', help='write the coverage report as JSON')
    a = ap.parse_args()
    man = json.load(open(a.manifest, encoding='utf-8'))
    pages = pages_from_pdf(a.pdf, max(l['page'] for l in man['lines']))
    occ, stats = segment(pages, man)
    if a.templates:
        from align_v2 import Templates
        sc = normalise(occ)[1]                      # size from the strictly matched words
        print(f'strict pass: {stats["words_ok"]}/{stats["words"]} words, scale {sc:.4f} em/pt')
        occ, stats = segment(pages, man, Templates(json.load(open(a.templates, encoding='utf-8'))), sc, a.limit)
    for li, why in stats['skipped'][:10]:
        print('  skipped line', li, why)
    glyphs, rep = build(occ)
    rep['segmentation'] = {k: v for k, v in stats.items() if k != 'skipped'} | {'skipped': len(stats['skipped'])}
    json.dump(glyphs, open(a.out, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    if a.report:
        json.dump(rep, open(a.report, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    p = rep['proportions']
    print(f'{len(glyphs)} characters; capital/x-height {p["capital_over_xheight"]:.2f}, ascender/x-height {p["ascender_over_xheight"]:.2f}')


if __name__ == '__main__':
    main()
