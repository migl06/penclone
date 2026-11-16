"""Realism experiments: penclone against the writer's own held-out sentences.

Protocol (see research/README.md and docs/paper/realism.md):
  * The 34 sentences of sample sheet v2 are split into two folds (even / odd lines). For each fold the glyphs and the
    measured habits are built from the OTHER fold only (train), and penclone writes the sentences of this fold (test).
    The generated lines are compared with the writer's real test lines - never with the lines the glyphs came from.
  * Both sides go through exactly the same code: line assignment, word split, template alignment, measurements and
    rasterisation. Sheet v1 (the alphabet sheet, a separate recording) serves as alignment templates for both.
  * Human reference: the writer's train lines compared with the test lines (same writer, other sentences).

Nothing here leaves the computer; images go to a cache folder outside the repository, results are numbers only.
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'pipeline'))

from align_v2 import Templates  # noqa: E402
from build_glyphs_v2 import XH_EM, build, letter_spacing, line_baselines, normalise, pages_from_pdf  # noqa: E402
from measure_layout import measure  # noqa: E402
from segment_v2 import assign_lines, local_baseline, segment, split_words  # noqa: E402

CACHE = os.environ.get('PENCLONE_RESEARCH_CACHE', os.path.expanduser('~/.cache/penclone-research'))
XH_CHARS = set('acemnorsuvwxz')
LIMIT = 0.9                    # alignment acceptance (as profiles.build_v2)
PX_PER_XH = 10                 # word images: x-height 10 px, window from 2.2 x-heights above to 1.0 below the baseline
WIN_TOP, WIN_BOT = 2.2, 1.0
PEN_XH = 0.13                  # pen width of the word images in x-heights (both sides; relative width changes are kept)


def profile_dir(name):
    base = os.environ.get('PENCLONE_HOME') or os.path.join(
        os.environ.get('XDG_DATA_HOME') or os.path.expanduser('~/.local/share'), 'penclone')
    return name if os.path.exists(os.path.join(name, 'profile.json')) else os.path.join(base, 'profiles', name)


def sub_manifest(man, keep):
    return {**man, 'lines': [ln for i, ln in enumerate(man['lines']) if i in keep]}


class Writer:
    """The writer's recorded data: sample sheet v2 (sentences) and the sheet v1 glyphs (alignment templates)."""

    def __init__(self, profile):
        d = profile_dir(profile)
        src = os.path.join(d, 'samples', 'sample-v2')
        self.man = json.load(open(os.path.join(src, 'sheet.json'), encoding='utf-8'))
        pdf = os.path.join(src, 'written.pdf')
        if not os.path.exists(pdf):
            pdf = os.path.join(src, 'capture.json')
        self.pages = pages_from_pdf(pdf, max(ln['page'] for ln in self.man['lines']))
        self.v1 = json.load(open(os.path.join(d, 'glyphs.json'), encoding='utf-8'))
        self.T = Templates(self.v1)
        self.n = len(self.man['lines'])

    def fold(self, f):
        """(train line indices, test line indices) of fold f (0: test = even lines, 1: test = odd lines)."""
        test = {i for i in range(self.n) if i % 2 == f}
        return set(range(self.n)) - test, test

    def scale(self, lines):
        occ, _ = segment(self.pages, self.man, lines=lines)
        _, sc, xh_pt = normalise(occ)
        return sc, xh_pt

    def train(self, f, merge=True, max_variants=None, max_cost=None, narrow=None, links=False):
        """Glyphs and measured habits from the train lines of fold f (cached)."""
        key = train_key(f, merge, max_variants, max_cost, narrow, links)
        fn = os.path.join(CACHE, key + '.json')
        if os.path.exists(fn):
            return json.load(open(fn, encoding='utf-8'))
        tr, _ = self.fold(f)
        sc, xh_pt = self.scale(tr)
        occ, st = segment(self.pages, self.man, self.T, sc, LIMIT, lines=tr, merge=merge)
        glyphs, rep = build(occ, max_variants, max_cost, **({'narrow': narrow} if narrow is not None else {}), links=links)
        lay = measure(self.pages, sub_manifest(self.man, tr), xh_pt)
        lay['letter_spacing'] = rep['letter_spacing']
        res = {'glyphs': glyphs, 'layout': lay, 'sc': sc, 'xh_pt': xh_pt,
               'words_aligned': st['words_ok'], 'words': st['words']}
        os.makedirs(CACHE, exist_ok=True)
        json.dump(res, open(fn, 'w', encoding='utf-8'), ensure_ascii=False)
        return res


def train_key(f, merge, max_variants, max_cost=None, narrow=None, links=False):
    return (f'train-f{f}-m{int(merge)}-v{max_variants}' + (f'-c{max_cost}' if max_cost is not None else '')
            + (f'-n{narrow}' if narrow is not None else '') + ('-links' if links else ''))


def train_args(c):
    """Arguments of Writer.train for a condition dict."""
    return c['merge'], c['mv'], c.get('cost'), c.get('narrow'), bool(c.get('style', {}).get('continuation'))


def with_fallback(glyphs, v1, min_variants=1):
    """Train glyphs plus sheet-v1 glyphs for characters the train lines do not have (or have fewer than min_variants)."""
    out = dict(glyphs)
    for ch, vs in v1.items():
        if len(out.get(ch, [])) < min_variants:
            out[ch] = list(out.get(ch, [])) + vs
    return out


def render(texts, glyphs, layout, seed, style, measured_spacing, xh_pt, man):
    """penclone writes `texts`, one per line; returns (pages, manifest, stroke widths) like a written sheet."""
    gap = man['lines'][1]['baseline'] - man['lines'][0]['baseline'] if man['lines'][1]['page'] == man['lines'][0]['page'] else 55.3
    x0, first = man['lines'][0]['x0'], 200.0
    with tempfile.TemporaryDirectory() as d:
        gf, lf, sf = (os.path.join(d, n) for n in ('g.json', 'l.json', 's.json'))
        json.dump(glyphs, open(gf, 'w', encoding='utf-8'), ensure_ascii=False)
        lay = dict(layout)
        lay['x_height_pt'] = xh_pt
        json.dump(lay, open(lf, 'w', encoding='utf-8'))
        json.dump({'glyphs': [gf], 'layout': lf, 'texts': texts, 'seed': seed, 'style': style,
                   'measuredSpacing': measured_spacing, 'x0Pt': x0, 'firstBaselinePt': first, 'lineGapPt': gap,
                   'pageWidthPt': 2000}, open(sf, 'w', encoding='utf-8'), ensure_ascii=False)
        out = json.loads(subprocess.run(['node', os.path.join(ROOT, 'research', 'render_lines.mjs'), sf],
                                        check=True, capture_output=True, text=True).stdout)
    strokes, widths, lines = [], [], []
    for ln in out['lines']:
        for s in ln['strokes']:
            strokes.append(np.array(s['pts'], float)); widths.append(s['w'])
        lines.append({'page': 1, 'text': ln['text'], 'x0': x0, 'x1': x0 + 482, 'baseline': ln['baseline'],
                      'top': ln['baseline'] - 34})
    return {1: strokes}, {**man, 'lines': lines}, np.array(widths)


# ------------------------------------------------------------------------------------------------ measurements

def shape_vec(strokes, n=24):
    """Blurred ink raster of one letter in em (x from its own left edge, y from -0.9 to 0.4), unit length."""
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


def letters_em(occ, sc):
    """Letter occurrences in em at a FIXED scale (the train scale), baseline from the line fit."""
    fits = line_baselines(occ)
    by = {}
    for o in occ:
        m, b = fits[o['line']]
        a = np.concatenate(o['strokes'])
        x0, ys = a[:, 0].min(), m * a[:, 0].mean() + b
        by.setdefault(o['char'], []).append([np.stack([(s[:, 0] - x0) * sc, (s[:, 1] - ys) * sc], 1) for s in o['strokes']])
    return by


def draw_word(strokes, widths, base_y, xh_pt, fn):
    """Rasterise one word (strokes in pt) into a fixed baseline-anchored window; 4x supersampled, black on white."""
    S = 4
    k = PX_PER_XH / xh_pt * S
    a = np.concatenate(strokes)
    x0 = a[:, 0].min() - 3 / k * S
    W = int(np.ceil((a[:, 0].max() - x0) * k + 3 * S))
    H = int(round((WIN_TOP + WIN_BOT) * PX_PER_XH)) * S
    top = base_y - WIN_TOP * xh_pt
    img = Image.new('L', (max(W, S), H), 255)
    dr = ImageDraw.Draw(img)
    for s, w in zip(strokes, widths):
        px = [((x - x0) * k, (y - top) * k) for x, y in s]
        r = max(w * PEN_XH * PX_PER_XH * S / 2, 0.5)
        if len(px) > 1:
            dr.line(px, fill=0, width=int(round(2 * r)), joint='curve')
        for x, y in px[:: max(1, len(px) - 1)]:
            dr.ellipse([x - r, y - r, x + r, y + r], fill=0)
    img.resize((img.width // S, img.height // S), Image.LANCZOS).save(fn)


def words(pages, man, xh_pt, widths_rel, out_dir):
    """Write one image per word of every line; returns the number of words written."""
    os.makedirs(out_dir, exist_ok=True)
    n = 0
    by_page = {}
    for li, ln in enumerate(man['lines']):
        by_page.setdefault(ln['page'], []).append((li, ln))
    for page, items in by_page.items():
        st = pages[page]
        per = assign_lines(st, [ln for _, ln in items], man['row_height_pt'])
        for (li, ln), (j, idx) in zip(items, per.items()):
            if not idx:
                continue
            groups = split_words(st, idx, len(ln['text'].split()))
            if groups is None:
                continue
            base = local_baseline(st, idx)
            for wi, g in enumerate(groups):
                S = [st[i] for i in g]
                cx = float(np.concatenate(S)[:, 0].mean())
                draw_word(S, [widths_rel[i] for i in g], base(cx), xh_pt, os.path.join(out_dir, f'l{li:02d}w{wi:02d}.png'))
                n += 1
    return n


def evaluate(pages, man, w, sc, xh_pt, widths=None, img_dir=None):
    """All measurements of one written set (real or generated)."""
    n_letters = sum(len(ln['text'].replace(' ', '')) for ln in man['lines'])
    n_strokes = 0                      # only strokes of the lines in this set (a real page also holds the other fold)
    by_page = {}
    for ln in man['lines']:
        by_page.setdefault(ln['page'], []).append(ln)
    for page, lines in by_page.items():
        n_strokes += sum(len(v) for v in assign_lines(pages[page], lines, man['row_height_pt']).values())
    occ, st = segment(pages, man, w.T, sc, LIMIT)
    sp, clear = letter_spacing(occ, sc, samples=True) if occ else ({'join_rate': None}, np.array([]))
    lay = measure(pages, man, xh_pt)
    lets = letters_em(occ, sc) if occ else {}

    def cv(vals):
        vals = np.asarray(vals)
        return float(vals.std() / vals.mean()) if len(vals) > 2 and vals.mean() else np.nan
    h_cv = [cv([np.ptp(np.concatenate(s)[:, 1]) for s in v]) for c, v in lets.items() if c in XH_CHARS and len(v) >= 5]
    w_cv = [cv([np.ptp(np.concatenate(s)[:, 0]) for s in v]) for c, v in lets.items() if c.isalpha() and len(v) >= 5]
    if widths is None:
        widths_rel = {i: 1.0 for p in pages for i in range(len(pages[p]))}
        width_cv = 0.0
    else:
        med = float(np.median(widths))
        widths_rel = {i: float(x) / med for i, x in enumerate(widths)}
        width_cv = float(widths.std() / widths.mean())
    n_words = words(pages, man, xh_pt, widths_rel, img_dir) if img_dir else 0
    return {
        'pen_lifts_per_letter': n_strokes / n_letters,
        'words_aligned': st['words_ok'] / max(st['words'], 1),
        'join_rate': sp.get('join_rate'),
        'clearance': clear.tolist(),
        'word_gaps': None if not lay['word_gap'] else lay['word_gap'],
        'baseline_sd': lay['baseline_residual_sd']['median'] if lay['baseline_residual_sd'] else None,
        'size_cv': float(np.nanmedian(h_cv)) if h_cv else None,
        'width_cv': float(np.nanmedian(w_cv)) if w_cv else None,
        'pen_width_cv': width_cv,
        'n_words_img': n_words,
        '_letters': lets,
    }


def twin_rate(train_lets, test_lets, other_lets, rng, pct=5):
    """Share of letters with a near-identical twin of the same character in the same set.

    The threshold per character is the pct-th percentile of nearest-neighbour distances among the writer's TRAIN letters
    (subsampled to the same count), so neither test set defines its own threshold. Both test sets are subsampled to the
    same count per character. Returns (rate of test_lets, rate of other_lets)."""
    def nn(V):
        D = np.sqrt(((V[:, None] - V[None]) ** 2).sum(2))
        np.fill_diagonal(D, np.inf)
        return D.min(1)
    ra, rb = [], []
    for c in test_lets:
        if c not in other_lets or c not in train_lets:
            continue
        k = min(len(test_lets[c]), len(other_lets[c]), len(train_lets[c]))
        if k < 6:
            continue
        pick = lambda L: np.array([shape_vec(L[i]) for i in rng.permutation(len(L))[:k]])
        thr = np.percentile(nn(pick(train_lets[c])), pct)
        ra += list(nn(pick(test_lets[c])) <= thr)
        rb += list(nn(pick(other_lets[c])) <= thr)
    return (float(np.mean(ra)) if ra else np.nan, float(np.mean(rb)) if rb else np.nan)


def c2st_letters(a, b, seed):
    """Classifier two-sample test (Lopez-Paz & Oquab, ICLR 2017) on letter shapes: 5-fold CV accuracy of a logistic
    regression telling set a from set b; balanced per character. 0.5 = the two sets are indistinguishable."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold, cross_val_score
    rng = np.random.default_rng(seed)
    X, y = [], []
    for c in a:
        if c not in b:
            continue
        k = min(len(a[c]), len(b[c]))
        if k < 4:
            continue
        for L, lab in ((a[c], 0), (b[c], 1)):
            for i in rng.permutation(len(L))[:k]:
                X.append(shape_vec(L[i])); y.append(lab)
    if len(set(y)) < 2 or len(y) < 40:
        return np.nan
    cv = StratifiedKFold(5, shuffle=True, random_state=seed)
    return float(cross_val_score(LogisticRegression(max_iter=3000, C=0.5), np.array(X), np.array(y), cv=cv).mean())


def wasserstein(a, b):
    from scipy.stats import wasserstein_distance
    return float(wasserstein_distance(a, b)) if len(a) and len(b) else np.nan
