"""Small shape helpers shared by the sample sheet v2 modules."""
import numpy as np


def raster(strokes, n=14):
    """Small ink raster of a glyph (x over its own width, y from -0.9 to 0.3 em); used to compare shapes."""
    img = np.zeros((n, n))
    P = np.concatenate(strokes)
    x0 = P[:, 0].min()
    w = max(P[:, 0].max() - x0, 0.1)
    for s in strokes:
        for a, b in zip(s[:-1], s[1:]) if len(s) > 1 else [(s[0], s[0])]:
            for t in np.linspace(0, 1, max(2, int(np.hypot(*(b - a)) * 80))):
                x, y = a + (b - a) * t
                i = int((y + 0.9) / 1.2 * n); j = int((x - x0) / w * (n - 1))
                if 0 <= i < n and 0 <= j < n:
                    img[i, j] = 1
    return img.ravel()


def width(strokes):
    P = np.concatenate(strokes)
    return float(P[:, 0].max() - P[:, 0].min())
