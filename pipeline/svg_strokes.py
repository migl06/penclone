"""Read pen strokes from an SVG page exported from an iPad PDF (pdftocairo -svg).

Every stroked <path> becomes one stroke: an (N, 2) array of points in page
coordinates. Cubic Bezier segments are flattened into 6 line segments each.
"""
import re

import numpy as np


def load(fn):
    """Return a list of strokes (np.ndarray of shape (N, 2)) from an SVG file."""
    s = open(fn, encoding="utf-8").read()
    strokes = []
    for m in re.finditer(r'<path[^>]*stroke-width[^>]*>', s):
        p = m.group(0)
        d = re.search(r' d="([^"]*)"', p).group(1)
        t = re.search(r'matrix\(([^)]*)\)', p)
        a, b, c, dd, e, f = [float(x) for x in t.group(1).split(',')]
        toks = re.findall(r'[MCL]|-?\d+\.?\d*(?:e-?\d+)?', d)
        pts = []
        i = 0
        cur = None
        while i < len(toks):
            c_ = toks[i]
            i += 1
            if c_ == 'M':
                cur = np.array([float(toks[i]), float(toks[i + 1])])
                i += 2
                pts.append(cur)
            elif c_ == 'L':
                n = np.array([float(toks[i]), float(toks[i + 1])])
                i += 2
                pts.append(n)
                cur = n
            elif c_ == 'C':
                q = [np.array([float(toks[i + 2 * k]), float(toks[i + 2 * k + 1])]) for k in range(3)]
                i += 6
                for t_ in np.linspace(0, 1, 7)[1:]:
                    pts.append((1 - t_) ** 3 * cur + 3 * (1 - t_) ** 2 * t_ * q[0]
                               + 3 * (1 - t_) * t_ ** 2 * q[1] + t_ ** 3 * q[2])
                cur = q[2]
        P = np.array(pts)
        strokes.append(np.stack([a * P[:, 0] + c * P[:, 1] + e, b * P[:, 0] + dd * P[:, 1] + f], 1))
    return strokes


def xclusters(st, idx, pad=0.15):
    """Group strokes of one text row into characters by overlapping x-ranges.

    Strokes whose x-intervals (padded by `pad`) overlap are merged, so i-dots,
    umlaut dots and crossbars end up with their character.
    """
    iv = sorted([(st[i][:, 0].min() - pad, st[i][:, 0].max() + pad, i) for i in idx])
    out = []
    for a, b, i in iv:
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
            out[-1][2].append(i)
        else:
            out.append([a, b, [i]])
    return [sorted(c[2]) for c in out]
