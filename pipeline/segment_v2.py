"""Assign the strokes of a written sample sheet v2 to characters (the sentence of every line is known).

Input : strokes per page (svg_strokes.load of a pdftocairo SVG) + the manifest written by make_sheet.py.
Output: occurrences, one per character that could be matched safely:
        {char, pos (position in the word: initial|medial|final|single), strokes (pt), baseline (pt), line, page}

Method (print-like writing with separate letters; joined cursive is not supported yet):
  1. strokes -> line by vertical position inside the writing row of the manifest
  2. line  -> words: the k-1 widest horizontal gaps split the line into the k words of the sentence
  3. word  -> characters: strokes with overlapping x-ranges form one character (i-dots, umlaut dots, crossbars)
  4. a word is accepted only if it yields exactly as many characters as expected; otherwise it is skipped and counted.
     Better to lose a word than to learn a wrong letter.
Ruling lines of the template (long straight strokes) are ignored.
"""
import numpy as np

from svg_strokes import xclusters

SKIP_STRAIGHT_PT = 60          # a stroke of <= 3 points that is at least this long is a ruling line, not handwriting


def is_ruling(s):
    return len(s) <= 3 and np.hypot(*(s[-1] - s[0])) >= SKIP_STRAIGHT_PT


def assign_lines(strokes, lines, row_h):
    """Return {line index: [stroke index]} for the manifest lines of ONE page (list of dicts with baseline/x0/x1)."""
    out = {i: [] for i in range(len(lines))}
    for k, s in enumerate(strokes):
        if is_ruling(s):
            continue
        cy = (s[:, 1].min() + s[:, 1].max()) / 2
        best = min(range(len(lines)), key=lambda i: abs(cy - (lines[i]['baseline'] - 0.4 * row_h)))
        b = lines[best]['baseline']
        if b - 1.1 * row_h <= cy <= b + 0.45 * row_h:
            out[best].append(k)
    return out


def merge_to(strokes, clusters, n, small_pt=7.0):
    """Merge SMALL clusters (i-dots, accents, umlaut dots) into their neighbour until n clusters remain.
    Only parts smaller than small_pt are merged; merging by gap alone gave wrong letters on real handwriting
    (a with the stem of its neighbour). Returns None if n cannot be reached that way."""
    cl = [list(c) for c in clusters]
    height = lambda c: max(strokes[i][:, 1].max() for i in c) - min(strokes[i][:, 1].min() for i in c)
    gap = lambda a, b: max(min(strokes[i][:, 0].min() for i in b) - max(strokes[i][:, 0].max() for i in a), 0)
    while len(cl) > n:
        small = [k for k, c in enumerate(cl) if height(c) < small_pt and len(cl) > 1]
        if not small:
            return None
        k = min(small, key=lambda k: height(cl[k]))
        nb = [j for j in (k - 1, k + 1) if 0 <= j < len(cl)]
        j = min(nb, key=lambda j: gap(cl[min(j, k)], cl[max(j, k)]))
        lo, hi = min(j, k), max(j, k)
        cl[lo] = sorted(cl[lo] + cl[hi]); del cl[hi]
    return cl if len(cl) == n else None


def split_words(strokes, idx, n_words):
    """Split the strokes of one line into n_words groups using the widest gaps between character clusters."""
    cl = xclusters(strokes, idx, pad=0.0)
    if n_words == 1:
        return [[i for c in cl for i in c]]
    if len(cl) < n_words:
        return None
    box = lambda c: (min(strokes[i][:, 0].min() for i in c), max(strokes[i][:, 0].max() for i in c))
    gaps = [(box(cl[k + 1])[0] - box(cl[k])[1], k) for k in range(len(cl) - 1)]
    cuts = sorted(k for _, k in sorted(gaps, reverse=True)[:n_words - 1])
    words, start = [], 0
    for k in cuts + [len(cl) - 1]:
        words.append([i for c in cl[start:k + 1] for i in c]); start = k + 1
    return words


def local_baseline(strokes, idx):
    """Baseline function y(x) for one line: median bottom of the 9 nearest characters (most letters have no descender)."""
    cl = xclusters(strokes, idx, pad=0.0)
    xs = np.array([np.mean([strokes[i][:, 0].mean() for i in c]) for c in cl])
    bs = np.array([max(strokes[i][:, 1].max() for i in c) for c in cl])
    def f(x):
        k = np.argsort(np.abs(xs - x))[:9]
        return float(np.median(bs[k]))
    return f


def segment(pages_strokes, manifest, templates=None, scale=None, limit=0.9, mean_limit=1.0, lines=None):
    """pages_strokes: {page number: list of strokes}. Returns (occurrences, stats).
    With templates (align_v2.Templates) and scale (em per pt) words are aligned by dynamic programming (joined letters
    allowed); without them only words whose stroke groups match the letter count exactly are used.
    Every occurrence also names its word ('word': line, word index) and its joins to the neighbouring letters ('join_in',
    'join_out': index of the stroke whose start / end runs on into the previous / next letter, else None).
    lines: only use these manifest line indices (e.g. a training split); default all."""
    if templates is not None:
        from align_v2 import align_word
    occ, stats = [], {'lines': 0, 'words': 0, 'words_ok': 0, 'chars': 0, 'skipped': []}
    row_h = manifest['row_height_pt']
    by_page = {}
    for li, ln in enumerate(manifest['lines']):
        if lines is None or li in lines:
            by_page.setdefault(ln['page'], []).append((li, ln))
    for page, items in by_page.items():
        st = pages_strokes.get(page)
        if st is None:
            continue
        per = assign_lines(st, [ln for _, ln in items], row_h)
        for (li, ln), (j, idx) in zip(items, per.items()):
            words = ln['text'].split()
            stats['lines'] += 1; stats['words'] += len(words)
            if not idx:
                continue
            groups = split_words(st, idx, len(words))
            if groups is None:
                stats['skipped'].append((li, 'too few strokes for the words'))
                continue
            base_y = local_baseline(st, idx) if templates is not None else None
            for k, (w, g) in enumerate(zip(words, groups)):
                chars = [c for c in w]
                if templates is not None:
                    parts, costs, jn = align_word([st[i] for i in g], chars, templates, base_y, scale, limit,
                                                  mean_limit=mean_limit, joins=True)
                    if parts is None:
                        stats['skipped'].append((li, f'{w!r}: no good alignment'))
                        continue
                    stats['words_ok'] += 1
                    for ci, (ch, pc) in enumerate(zip(chars, parts)):
                        pos = 'single' if len(chars) == 1 else 'initial' if ci == 0 else 'final' if ci == len(chars) - 1 else 'medial'
                        occ.append({'char': ch, 'pos': pos, 'strokes': pc, 'baseline': ln['baseline'], 'line': li,
                                    'page': page, 'cost': costs[ci], 'word': (li, k),
                                    'join_in': jn[ci]['in'], 'join_out': jn[ci]['out']})
                        stats['chars'] += 1
                    continue
                cl = merge_to(st, xclusters(st, g, pad=0.0), len(chars))
                if cl is None:
                    stats['skipped'].append((li, f'{w!r}: fewer clusters than the {len(chars)} characters (joined letters)'))
                    continue
                stats['words_ok'] += 1
                for ci, (ch, c) in enumerate(zip(chars, cl)):
                    # first and last letters of a word are written differently (Srihari et al. 2002, cited by Haines et al.)
                    pos = 'single' if len(chars) == 1 else 'initial' if ci == 0 else 'final' if ci == len(chars) - 1 else 'medial'
                    occ.append({'char': ch, 'pos': pos, 'strokes': [st[i] for i in c], 'baseline': ln['baseline'],
                                'line': li, 'page': page, 'word': (li, k), 'join_in': None, 'join_out': None})
                    stats['chars'] += 1
    return occ, stats
