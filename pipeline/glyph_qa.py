"""Quality gate for glyphs cut out of sentences, and the combined library of a profile.

The letters written one by one on sample sheet v1 are known to be right: the writer wrote each one on purpose. Letters cut
out of sentences (sheet v2) bring the writer's habits in running text (sizes, proportions, shapes of joined letters), but the
cutting is done by an algorithm and sometimes goes wrong: a part of the next letter hangs on, a stroke is missing, a letter is
cut so that it looks like another one. A wrong letter in the output is worse than a missing variant, so:

  * every sentence variant has to pass structural checks (no stub, no extra part, plausible size against the other variants
    of the same character and against sheet v1) before it may be used;
  * characters without enough passing variants, and all punctuation and symbols, come from sheet v1 only;
  * the sheet-v1 letters are scaled to the proportions the writer shows in sentences (a capital K against the x-height,
    the height of an ascender, ...), so that both sources fit together.

curate(v1, sentences) -> (library, report). Units: em, baseline y = 0, y down (as everywhere in the pipeline).
"""
import copy

import numpy as np
from scipy.ndimage import gaussian_filter

# characters that have small strokes on purpose (dots, accents, punctuation marks, ...)
DOTTED = set('ijäöüÄÖÜ!?:;.,"\'„“”‚‘’=%…·-–—+*/')
MIN_RECOGNISED = 0.8           # share of the nearest sheet-v1 look-alikes that must be the same character
CASE_PAIRS = 'cmopsuvwxyz'     # letters that differ from their capital only in size: either counts as the same character
SMALL = 0.07                   # em: a stroke shorter than this is a stub (dot, cut-off end)
NR, NC = 22, 16               # raster for recognition: y from -1.1 to 0.5 em, 1 em wide around the ink centre
LETTER_RE = 'abcdefghijklmnopqrstuvwxyzäöüßABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ0123456789'


def _arr(v):
    return [np.asarray(s, float) for s in v['s']]


def _plen(s):
    return float(np.hypot(*np.diff(s, axis=0).T).sum()) if len(s) > 1 else 0.0


def measures(v):
    """Height above the baseline, depth below, width, ink length and number of strokes / stubs of a glyph."""
    S = _arr(v)
    P = np.concatenate(S)
    lens = [_plen(s) for s in S]
    return {'top': float(-P[:, 1].min()), 'bottom': float(P[:, 1].max()), 'w': float(np.ptp(P[:, 0])),
            'ink': float(sum(lens)), 'n': len(S), 'stubs': int(sum(1 for L in lens if L < SMALL))}


def _med(x):
    return float(np.median(x))


def _mad(x):
    return float(np.median(np.abs(np.asarray(x) - np.median(x)))) * 1.4826


def check_sentence_variants(ch, vs, v1vs):
    """(accepted indices, {index: reason}) for the sentence variants `vs` of character `ch`."""
    ref = [measures(v) for v in v1vs]
    m = [measures(v) for v in vs]
    why = {}
    max_n = max((r['n'] for r in ref), default=2)
    ref_stubs = max((r['stubs'] for r in ref), default=0)
    for i, x in enumerate(m):
        if ch not in DOTTED and x['stubs'] > 0:
            why[i] = 'stub'
        elif ch in DOTTED and x['stubs'] > max(ref_stubs, 1):
            why[i] = 'too many stubs'
        elif x['n'] > max_n + (1 if ch in 'ijäöüÄÖÜ' else 0):
            why[i] = 'extra part'
        elif ref:
            # against sheet v1: not a fragment, not several letters in one
            if x['w'] > 2.2 * max(r['w'] for r in ref) + 0.1 or x['ink'] < 0.45 * min(r['ink'] for r in ref):
                why[i] = 'size against sheet v1'
    ok = [i for i in range(len(vs)) if i not in why]
    # outliers among the variants of the same character (needs some of them)
    if len(ok) >= 6:
        for key, lim in (('top', 3.0), ('bottom', 3.0), ('w', 3.0), ('ink', 3.0)):
            vals = [m[i][key] for i in ok]
            md, sd = _med(vals), max(_mad(vals), 0.02)
            for i in list(ok):
                if abs(m[i][key] - md) / sd > lim + 0.5:
                    why[i] = f'outlier in {key}'
                    ok.remove(i)
    return ok, why


def _raster(S):
    img = np.zeros((NR, NC))
    for s in S:
        s = np.asarray(s, float)
        if len(s) < 2:
            P = s
        else:
            P = np.concatenate([np.linspace(a, b, max(2, int(np.hypot(*(b - a)) * 150))) for a, b in zip(s[:-1], s[1:])])
        cx = 0.5 * (P[:, 0].min() + P[:, 0].max())
        i = ((P[:, 1] + 1.1) / 1.6 * NR).astype(int)
        j = ((P[:, 0] - cx + 0.5) * NC).astype(int)
        m = (i >= 0) & (i < NR) & (j >= 0) & (j < NC)
        img[i[m], j[m]] = 1
    return img


def _desc(S, ref_centre=None):
    img = np.zeros((NR, NC))
    allp = np.concatenate([np.asarray(s, float) for s in S])
    cx = 0.5 * (allp[:, 0].min() + allp[:, 0].max()) if ref_centre is None else ref_centre
    for s in S:
        s = np.asarray(s, float)
        P = s if len(s) < 2 else np.concatenate([np.linspace(a, b, max(2, int(np.hypot(*(b - a)) * 150))) for a, b in zip(s[:-1], s[1:])])
        i = ((P[:, 1] + 1.1) / 1.6 * NR).astype(int)
        j = ((P[:, 0] - cx + 0.5) * NC).astype(int)
        m = (i >= 0) & (i < NR) & (j >= 0) & (j < NC)
        img[i[m], j[m]] = 1
    img = gaussian_filter(img, 0.9)
    n = np.linalg.norm(img)
    return (img / n if n else img).ravel()


def _augment(S, rng):
    a = np.concatenate(S)
    cx = a[:, 0].mean()
    sx, sy, sh, th = rng.uniform(0.8, 1.25), rng.uniform(0.85, 1.18), rng.uniform(-0.25, 0.25), rng.normal(0, 0.07)
    c, s_ = np.cos(th), np.sin(th)
    out = []
    for s in S:
        s = np.asarray(s, float)
        x = (s[:, 0] - cx) * sx + s[:, 1] * sh
        y = s[:, 1] * sy
        out.append(np.stack([c * x - s_ * y + cx, s_ * x + c * y], 1) + rng.normal(0, 0.006, s.shape))
    return out


class Recogniser:
    """Does a cut-out look like the character it should be? Nearest neighbours among the writer's own separately written
    letters (sheet v1), each deformed 60 times (size, slant, rotation, tremor). Returns the share of the 15 nearest that
    are the same character (a capital and its small letter count as the same where they differ only in size)."""

    def __init__(self, v1, copies=60, k=15, seed=0):
        rng = np.random.default_rng(seed)
        self.k = k
        X, y = [], []
        for c, vs in v1.items():
            if not c.isalnum():
                continue
            for v in vs:
                S = _arr(v)
                X.append(_desc(S)); y.append(c)
                for _ in range(copies):
                    X.append(_desc(_augment(S, rng))); y.append(c)
        self.X, self.y = np.array(X), np.array(y)

    def same(self, a, b):
        return a == b or (a.lower() == b.lower() and a.lower() in CASE_PAIRS)

    def score(self, ch, v):
        sim = self.X @ _desc(_arr(v))
        top = np.argsort(-sim)[:self.k]
        return float(np.mean([self.same(self.y[i], ch) for i in top]))


def class_of(ch):
    if ch in 'bdfhkl':
        return 'ascender'
    if ch in 'gjpqy':
        return 'descender'
    if ch in 'ijtß' or ch in 'äöü':
        return 'other-lower'
    if ch.islower():
        return 'x'
    if ch.isupper():
        return 'capital'
    if ch.isdigit():
        return 'digit'
    return 'other'


def scale_variant(v, f):
    w = copy.deepcopy(v)
    w['s'] = [[[x * f, y * f] for x, y in s] for s in v['s']]
    w['adv'] = v['adv'] * f
    return w


def _resample(s, n=32):
    s = np.asarray(s, float)
    if len(s) < 2:
        return np.repeat(s[:1], n, axis=0)
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(s, axis=0).T))]
    if d[-1] <= 0:
        return np.repeat(s[:1], n, axis=0)
    u = np.linspace(0, d[-1], n)
    return np.stack([np.interp(u, d, s[:, 0]), np.interp(u, d, s[:, 1])], 1)


def morph(a, b, t, max_dist=0.12):
    """A glyph between the variants `a` and `b` of one character (None if they do not have the same structure).
    Strokes are matched by position (either direction), resampled and blended point by point."""
    A, B = _arr(a), _arr(b)
    if len(A) != len(B) or any(len(x) < 2 for x in A + B):
        return None
    free = list(range(len(B)))
    out = []
    for sa in A:
        ra = _resample(sa)
        best = None
        for j in free:
            rb = _resample(B[j])
            for rev in (False, True):
                rr = rb[::-1] if rev else rb
                d = float(np.hypot(*(ra - rr).T).mean())
                if best is None or d < best[0]:
                    best = (d, j, rr)
        if best is None or best[0] > max_dist:
            return None
        free.remove(best[1])
        out.append(((1 - t) * ra + t * best[2]).tolist())
    return {'adv': (1 - t) * a['adv'] + t * b['adv'], 's': out}


def _plain(v):
    """A copy without links to neighbours or position tags: such a variant is used wherever its character is needed."""
    w = {'adv': v['adv'], 's': copy.deepcopy(v['s'])}
    if v.get('f'):
        w['f'] = True
    return w


def curate(v1, sent, morphs=12, seed=0, threshold=MIN_RECOGNISED, recogniser=None, use_sentence_shapes=False, proportions=None):
    """Combine sheet-v1 glyphs `v1` and sentence glyphs `sent` into one library, see the module docstring.

    By default the shapes come from sheet v1 only (use_sentence_shapes=False): inspected by eye, even the sentence letters
    that pass every check below were partly unclean (extra loops, doubled dots), while the separately written letters are right
    by construction. The sentences still set the scale. With use_sentence_shapes=True, a sentence variant is used only if it passes the structural checks, is not tied to its neighbours by a join, and is
    recognised as its character from the writer's own separately written letters. The library holds, per character:
    the sheet-v1 letters (scaled to the writer's proportions in sentences), the admitted sentence letters, and `morphs`
    blends between pairs of those (new but never foreign shapes). Punctuation and symbols are sheet-v1 only.

    proportions: {'capital_height_em', 'ascender_height_em', 'x_height_em'} as measured on the sentences by build_glyphs_v2
    (report['proportions']). The writer's capitals and ascenders in running text are 1.6 x-heights high, on the alphabet
    sheet they are written smaller; the sheet-v1 letters are scaled to the sentence proportions."""
    rng = np.random.default_rng(seed)
    R = recogniser or Recogniser(v1)
    report = {'rejected': {}, 'admitted': {}, 'scale': {}, 'morphs': {}, 'v1_stubs': []}
    passing, admitted = {}, {}
    for ch, vs in sent.items():
        if ch not in LETTER_RE or ch not in v1:
            continue
        ok, why = check_sentence_variants(ch, vs, v1[ch])
        passing[ch] = [vs[i] for i in ok]
        for i in ok:
            v = vs[i]
            if v.get('ji') is not None or v.get('jo') is not None:
                why[i] = 'joined to a neighbour'
            elif not 0.6 <= measures(v)['ink'] / _med([measures(x)['ink'] for x in v1[ch]]) <= 1.6:
                why[i] = 'ink length against sheet v1'
            elif R.score(ch, v) < threshold:
                why[i] = 'not recognised as the character'
        if why:
            report['rejected'][ch] = {str(i): r for i, r in sorted(why.items())}
        admitted[ch] = [_plain(vs[i]) for i in range(len(vs)) if i not in why] if use_sentence_shapes else []
    # proportions in sentences: height above the baseline per character against sheet v1, shrunk towards the class mean
    ratio = {}
    for ch, vs in passing.items():
        if len(vs) >= 4:
            a = _med([measures(v)['top'] for v in vs])
            b = _med([measures(v)['top'] for v in v1[ch]])
            if a > 0.05 and b > 0.05:
                ratio[ch] = (a / b, len(vs))
    by_class = {}
    for ch, (r, n) in ratio.items():
        by_class.setdefault(class_of(ch), []).append(r)
    class_f = {c: _med(rs) for c, rs in by_class.items() if len(rs) >= 3}
    if proportions:
        # the proportions measured over all sentence letters beat the ratios of single characters
        def v1_top(chars):
            t = [measures(v)['top'] for c in chars if c in v1 for v in v1[c]]
            return _med(t) if t else None
        for cls, chars, target in (('capital', [c for c in v1 if c.isupper() and c in LETTER_RE], proportions.get('capital_height_em')),
                                   ('ascender', 'bdfhkl', proportions.get('ascender_height_em')),
                                   ('x', 'acemnorsuvwxz', proportions.get('x_height_em'))):
            have = v1_top(chars)
            if target and have:
                class_f[cls] = target / have
    lib = {}
    for ch, vs in v1.items():
        f = 1.0
        if ch in LETTER_RE:
            fc = class_f.get(class_of(ch), 1.0)
            if ch in ratio:
                r, n = ratio[ch]
                f = (n * r + 3 * fc) / (n + 3)
            else:
                f = fc
            f = float(np.clip(f, 0.8, 1.3))
            report['scale'][ch] = round(f, 3)
        base = [_plain(scale_variant(v, f)) for v in vs]
        for i, v in enumerate(base):
            if ch not in DOTTED and measures(v)['stubs']:
                report['v1_stubs'].append(f'{ch}{i}')
        lib[ch] = base + admitted.get(ch, [])
        if admitted.get(ch):
            report['admitted'][ch] = len(admitted[ch])
    for ch in list(lib):
        pool = lib[ch]
        if ch in LETTER_RE and len(pool) >= 2 and morphs:
            made, tries = [], 0
            while len(made) < morphs and tries < morphs * 8:
                tries += 1
                i, j = rng.choice(len(pool), 2, replace=False)
                m = morph(pool[i], pool[j], float(rng.uniform(0.25, 0.75)))
                if m is not None:
                    made.append(m)
            lib[ch] = pool + made
            report['morphs'][ch] = len(made)
    return lib, report
