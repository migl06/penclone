"""Anonymous writing statistics for validating the general rules (P5): no strokes, no images, only a few numbers.

Input: words of one writer, each {'text': str, 'strokes': [ (N,2) arrays ], 'line': line id}, y pointing DOWN.
The characters inside a word are NOT aligned to strokes; the statistics therefore use words whose tallest and lowest
parts are known from their letters:

  x_words   only x-height letters (a c e m n o r s u v w x z)               -> x-height
  cap       capital (not J Q) + only x-height letters                       -> capital height / x-height   (rule R2 / known issue A3)
  asc       contains b d h k l, rest x-height letters                       -> ascender height / x-height
  overshoot words without descender letters: lowest point below the baseline, in x-heights  -> tolerance of rule R3

The baseline of a line is a line fitted through the bottoms of its words without descender (robust). Everything is
measured relative to the writer's own x-height, so units and scan resolution do not matter.
"""
import numpy as np

XH = set('acemnorsuvwxz')
CAPS = set('ABCDEFGHIKLMNOPRSTUVWXYZÄÖÜ')
ASC = set('bdhkl')
NO_DESC = set('abcdehiklmnorstuvwxzABCDEFGHIKLMNOPRSTUVWXYZ')


def _bounds(strokes):
    P = np.concatenate(strokes)
    return float(P[:, 0].mean()), float(P[:, 1].min()), float(P[:, 1].max())


def _letters(text):
    return [c for c in text if c.isalpha()]


def line_baseline(items):
    """Robust linear baseline (slope, intercept) through the bottoms of the line's words without descender letters."""
    pts = [(x, bot) for (x, top, bot), t in items if t and all(c in NO_DESC for c in t)]
    if len(pts) < 4:
        return None
    x, y = np.array(pts).T
    m, b = np.polyfit(x, y, 1)
    for _ in range(2):
        r = y - (m * x + b)
        k = np.abs(r) <= max(np.median(np.abs(r)) * 2.5, 1e-9)
        if k.sum() < 4:
            break
        m, b = np.polyfit(x[k], y[k], 1)
    return m, b


def writer_stats(words, min_words=60, min_x=15):
    """Return a dict of anonymous statistics, or None if the writer has too few usable words."""
    lines = {}
    for w in words:
        t = _letters(w['text'])
        if t and w['strokes']:
            lines.setdefault(w['line'], []).append((_bounds(w['strokes']), t))
    heights = {'x': [], 'cap': [], 'asc': []}
    over, raw = [], []
    for items in lines.values():
        bl = line_baseline(items)
        if bl is None:
            continue
        for (x, top, bot), t in items:
            base = bl[0] * x + bl[1]
            raw.append((base - top, base - bot, t))
    xh = [h for h, _, t in raw if len(t) >= 2 and all(c in XH for c in t)]
    if len(xh) < min_x:
        return None
    X = float(np.median(xh))
    for h, below, t in raw:
        if len(t) >= 2 and all(c in XH for c in t[1:]) and t[0] in CAPS:
            heights['cap'].append(h / X)
        if len(t) >= 3 and any(c in ASC for c in t) and all(c in XH or c in ASC for c in t):
            heights['asc'].append(h / X)
        if all(c in NO_DESC for c in t):
            over.append(-below / X)
    n = len(raw)
    if n < min_words:
        return None
    q = lambda v, p: float(np.percentile(v, p)) if len(v) >= 8 else None
    return {'words': n, 'x_words': len(xh),
            'cap_over_x': q(heights['cap'], 50), 'cap_n': len(heights['cap']),
            'asc_over_x': q(heights['asc'], 50), 'asc_n': len(heights['asc']),
            'overshoot_p50': q(over, 50), 'overshoot_p95': q(over, 95), 'overshoot_n': len(over)}
