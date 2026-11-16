"""Realism check: compare the writer's real sample sentences with penclone writing the same sentences.

Usage (from the repository root):
    python3 tools/realism_check.py PROFILE [--glyph-set auto|v1|v2|both] [--seeds 3] [--json out.json]

Both sides go through the same measurements (pipeline/measure_layout.py, pipeline/segment_v2.py), so a difference is a
difference in the writing, not in the method. Only numbers are printed; no strokes leave the computer.

What is measured, and why it gives generated writing away:
  pen lifts       strokes per letter. Glyphs cut out of joined writing start and end at every letter.
  separate        share of words whose letters are all separate (no letter touches or overlaps its neighbour).
  letter gap      gap between neighbouring letters inside a word, in x-heights.
  word gap        gap between words, in x-heights.
  baseline        spread of the letters around their line, in x-heights.
  size / width    coefficient of variation of the height and width of the same letter.
  twins           share of letters with a near-identical twin of the same character elsewhere in the text: the
                  "copy-paste" signal. Threshold = the 5th percentile of nearest-neighbour distances in real writing,
                  so real writing scores low by construction (5-10 % with few letters per character).
  classifier      cross-validated accuracy of a classifier that tells real from generated letters by shape alone
                  (0.5 = cannot tell, 1.0 = always right).
  stroke width    coefficient of variation of the pen width over all strokes.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'pipeline'))

from build_glyphs_v2 import normalise, pages_from_pdf  # noqa: E402
from measure_layout import measure  # noqa: E402
from segment_v2 import segment  # noqa: E402

XH_CHARS = set('acemnorsuvwxz')
TWIN_PCT = 5


def profile_dir(name):
    base = os.environ.get('PENCLONE_HOME') or os.path.join(
        os.environ.get('XDG_DATA_HOME') or os.path.expanduser('~/.local/share'), 'penclone')
    return name if os.path.exists(os.path.join(name, 'profile.json')) else os.path.join(base, 'profiles', name)


def generated_pages(name, sheet, seed, glyph_set):
    out = subprocess.run(['node', os.path.join(ROOT, 'tools', 'render_sheet.mjs'), name, sheet, str(seed), glyph_set],
                         check=True, capture_output=True, text=True).stdout
    d = json.loads(out)
    pages = {int(p): [np.array(s['pts'], float) for s in st] for p, st in d['pages'].items()}
    widths = [s['w'] for st in d['pages'].values() for s in st]
    return pages, widths, d['glyphFiles']


def shape_vec(strokes, n=24):
    """Blurred ink raster of one letter in em (x relative to its own left edge, y from -0.9 to 0.4)."""
    from scipy.ndimage import gaussian_filter
    img = np.zeros((n, n))
    x0 = min(s[:, 0].min() for s in strokes)
    for s in strokes:
        segs = zip(s[:-1], s[1:]) if len(s) > 1 else [(s[0], s[0])]
        for a, b in segs:
            for t in np.linspace(0, 1, max(2, int(np.hypot(*(b - a)) * 120))):
                x, y = a + (b - a) * t
                i, j = int((y + 0.9) / 1.3 * n), int((x - x0) / 1.0 * n)
                if 0 <= i < n and 0 <= j < n:
                    img[i, j] = 1
    v = gaussian_filter(img, 0.8).ravel()
    return v / (np.linalg.norm(v) or 1)


def letters(pages, man):
    occ, stats = segment(pages, man)
    norm = normalise(occ)[0] if occ else []
    by = {}
    for o in norm:
        by.setdefault(o['char'], []).append(o['strokes'])
    return by, stats


def nn_dist(V):
    D = np.sqrt(((V[:, None] - V[None]) ** 2).sum(2))
    np.fill_diagonal(D, np.inf)
    return D.min(1)


def summarise(pages, man, xh_pt, widths):
    lay = measure(pages, man, xh_pt)
    by, stats = letters(pages, man)
    n_letters = sum(len(ln['text'].replace(' ', '')) for ln in man['lines'])
    n_strokes = sum(len(v) for v in pages.values())

    def cv(vals):
        vals = np.asarray(vals)
        return float(vals.std() / vals.mean()) if len(vals) > 2 and vals.mean() else float('nan')
    h_cv = [cv([np.ptp(np.concatenate(s)[:, 1]) for s in v]) for c, v in by.items() if c in XH_CHARS and len(v) >= 5]
    w_cv = [cv([np.ptp(np.concatenate(s)[:, 0]) for s in v]) for c, v in by.items() if c.isalpha() and len(v) >= 5]
    return {
        'pen_lifts_per_letter': n_strokes / n_letters,
        'separate_words': stats['words_ok'] / max(stats['words'], 1),
        'letter_gap': lay['letter_gap'], 'word_gap': lay['word_gap'],
        'baseline_sd': lay['baseline_residual_sd']['median'] if lay['baseline_residual_sd'] else float('nan'),
        'size_cv': float(np.nanmedian(h_cv)) if h_cv else float('nan'),
        'width_cv': float(np.nanmedian(w_cv)) if w_cv else float('nan'),
        'stroke_width_cv': cv(widths) if widths else 0.0,
        '_letters': by,
    }


def twins_and_classifier(real, gen, seed):
    """Twin rate of both sides and a cross-validated real/generated classifier on letter shapes."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold, cross_val_score
    chars = [c for c in real if c in gen and len(real[c]) >= 6 and len(gen[c]) >= 6]
    twin_r, twin_g, X, y = [], [], [], []
    rng = np.random.default_rng(seed)
    for c in chars:
        k = min(len(real[c]), len(gen[c]))        # same number per side: twin rates depend on the count
        R = np.array([shape_vec(s) for s in real[c]])[rng.permutation(len(real[c]))[:k]]
        G = np.array([shape_vec(s) for s in gen[c]])[rng.permutation(len(gen[c]))[:k]]
        nr, ng = nn_dist(R), nn_dist(G)
        thr = np.percentile(nr, TWIN_PCT)
        twin_r += list(nr <= thr)
        twin_g += list(ng <= thr)
        # shape + distance to the nearest letter of the same text: what a reader sees when comparing letters
        X += [np.r_[v, d] for v, d in zip(R, nr)] + [np.r_[v, d] for v, d in zip(G, ng)]
        y += [0] * k + [1] * k
    X, y = np.array(X), np.array(y)
    cvk = StratifiedKFold(5, shuffle=True, random_state=seed)
    acc = cross_val_score(LogisticRegression(max_iter=2000, C=1.0), X, y, cv=cvk).mean() if len(set(y)) == 2 else float('nan')
    return float(np.mean(twin_r)), float(np.mean(twin_g)), float(acc), chars


def fmt_dist(d):
    return f"{d['median']:.2f} [{d['q1']:.2f}-{d['q3']:.2f}]" if d else '-'


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('profile')
    ap.add_argument('--glyph-set', default='auto', help='glyph library to test (auto = what penclone render uses)')
    ap.add_argument('--seeds', type=int, default=3, help='number of generated versions to average over')
    ap.add_argument('--json', help='also write the numbers as JSON')
    a = ap.parse_args()
    d = profile_dir(a.profile)
    sheet = os.path.join(d, 'samples', 'sample-v2', 'sheet.json')
    pdf = os.path.join(d, 'samples', 'sample-v2', 'written.pdf')
    if not os.path.exists(pdf):
        cap = os.path.join(d, 'samples', 'sample-v2', 'capture.json')
        pdf = cap if os.path.exists(cap) else pdf
    man = json.load(open(sheet, encoding='utf-8'))
    xh_pt = json.load(open(os.path.join(d, 'layout.json')))['x_height_pt']
    real_pages = pages_from_pdf(pdf, max(ln['page'] for ln in man['lines']))
    real = summarise(real_pages, man, xh_pt, [])
    gens, files = [], None
    for s in range(1, a.seeds + 1):
        pages, widths, files = generated_pages(a.profile, sheet, s, a.glyph_set)
        g = summarise(pages, man, xh_pt, widths)
        g['twin_real'], g['twin_gen'], g['classifier'], chars = twins_and_classifier(real['_letters'], g['_letters'], s)
        gens.append(g)
    mean = lambda k: float(np.nanmean([g[k] for g in gens]))
    rows = [
        ('pen lifts per letter', f"{real['pen_lifts_per_letter']:.2f}", f"{mean('pen_lifts_per_letter'):.2f}"),
        ('words with all letters separate', f"{real['separate_words']:.0%}", f"{mean('separate_words'):.0%}"),
        ('letter gap (x-heights)', fmt_dist(real['letter_gap']), fmt_dist(gens[0]['letter_gap'])),
        ('word gap (x-heights)', fmt_dist(real['word_gap']), fmt_dist(gens[0]['word_gap'])),
        ('baseline spread (x-heights)', f"{real['baseline_sd']:.3f}", f"{mean('baseline_sd'):.3f}"),
        ('size variation of a letter (CV)', f"{real['size_cv']:.3f}", f"{mean('size_cv'):.3f}"),
        ('width variation of a letter (CV)', f"{real['width_cv']:.3f}", f"{mean('width_cv'):.3f}"),
        ('pen width variation (CV)', '0.000 (constant)', f"{mean('stroke_width_cv'):.3f}"),
        (f'letters with a near-identical twin', f"{mean('twin_real'):.0%}", f"{mean('twin_gen'):.0%}"),
        ('classifier real vs generated (0.5 = blind)', '', f"{mean('classifier'):.2f}"),
    ]
    print(f"profile {a.profile}: glyphs {' + '.join(files)}, {a.seeds} generated versions, "
          f"{len(man['lines'])} sentences")
    w = max(len(r[0]) for r in rows)
    print(f"{'':{w}}  {'real':>22}  {'penclone':>22}")
    for r in rows:
        print(f"{r[0]:{w}}  {r[1]:>22}  {r[2]:>22}")
    if a.json:
        clean = lambda x: {k: v for k, v in x.items() if not k.startswith('_')}
        json.dump({'glyphs': files, 'real': clean(real), 'generated': [clean(g) for g in gens]},
                  open(a.json, 'w'), indent=1, default=float)


if __name__ == '__main__':
    main()
