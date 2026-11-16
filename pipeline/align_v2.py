"""Align the strokes of one written word to its known characters using template glyphs (dynamic programming).

Why: counting stroke groups fails on semi-joined handwriting (letters that touch, letters written in two parts). Here the
strokes are first cut into small atoms (at points where the pen touches the baseline or turns sharply), sorted by x, and then
consecutive atoms are grouped into exactly one group per character so that the total shape cost against the templates
(a first glyph library, e.g. from sample sheet v1) is smallest.

A word is accepted only if every group is close enough to a template of its character (limits: worst character and word average; assumptions, tuned on
one writer, see docs/rules.md). Otherwise the word is skipped: better to lose a word than to learn a wrong letter.
"""
import numpy as np

from shapes import raster, width

MAX_GROUP = 6
NO_TEMPLATE_COST = 0.9
WIDTH_W = 0.5


def cut_stroke(s, base_y, tol):
    """Cut a stroke into atoms where it touches the baseline at a local bottom, or turns sharply."""
    if len(s) < 6:
        return [s]
    cuts = []
    for i in range(2, len(s) - 2):
        bottom = s[i, 1] >= s[i - 1, 1] and s[i, 1] >= s[i + 1, 1] and s[i, 1] > base_y(s[i, 0]) - tol
        v1, v2 = s[i] - s[i - 2], s[i + 2] - s[i]
        n1, n2 = np.hypot(*v1), np.hypot(*v2)
        sharp = n1 > 0 and n2 > 0 and (v1 @ v2) / (n1 * n2) < -0.2
        if (bottom or sharp) and (not cuts or i - cuts[-1] >= 3):
            cuts.append(i)
    parts, a = [], 0
    for c in cuts:
        parts.append(s[a:c + 1]); a = c
    parts.append(s[a:])
    return [p for p in parts if len(p) >= 2]


def to_em(strokes, base_y, sc):
    a = np.concatenate(strokes)
    x0 = a[:, 0].min()
    by = base_y(float(a[:, 0].mean()))
    return [np.stack([(s[:, 0] - x0) * sc, (s[:, 1] - by) * sc], 1) for s in strokes]


class Templates:
    """Template glyphs {char: [{'s': strokes}]} converted to arrays with their raster and width."""
    def __init__(self, glyphs):
        self.t = {}
        for ch, vs in glyphs.items():
            items = []
            for g in vs:
                S = [np.array(s, float) for s in g['s']]
                items.append((raster(S), width(S) if len(np.concatenate(S)) > 1 else 0.05))
            self.t[ch] = items

    def cost(self, ch, em_strokes):
        items = self.t.get(ch)
        if not items:
            return NO_TEMPLATE_COST
        r, w = raster(em_strokes), max(width(em_strokes) * 0.9, 0.03)
        best = 9.0
        for tr, tw in items:
            c = ((r - tr) ** 2).sum() / max(r.sum() + tr.sum(), 1) + WIDTH_W * abs(np.log(w / max(tw, 0.03)))
            best = min(best, c)
        return float(best)


def merge_pieces(groups, ids):
    """Put the pieces of every character back together where they came from one pen stroke, and find the joins.

    groups: atoms per character; ids: (stroke, part) per atom, in the same nesting. Consecutive parts of one stroke inside a
    character become one stroke again (cutting is only a means of alignment: a letter written in one go stays one stroke).
    A join is a pen stroke that runs on from one character into the next: the previous character's piece ends exactly where
    this character's piece starts.
    Returns (strokes per character, joins per character as {'in': stroke index or None, 'out': stroke index or None})."""
    where = {pid: j for j, g in enumerate(ids) for pid in g}
    out, joins = [], []
    for j, (g, gid) in enumerate(zip(groups, ids)):
        order = sorted(range(len(g)), key=lambda k: gid[k])
        merged, mid = [], []
        for k in order:
            s, p = gid[k]
            if mid and mid[-1] == (s, p - 1):
                merged[-1] = np.vstack([merged[-1], g[k][1:]])
            else:
                merged.append(g[k])
            mid.append((s, p))
        # first/last (stroke, part) of every merged stroke
        firsts, lasts, cur = [], [], None
        for s, p in mid:
            if cur is None or (s, p - 1) != cur:
                firsts.append((s, p))
                if cur is not None:
                    lasts.append(cur)
            cur = (s, p)
        lasts.append(cur)
        j_in = next((i for i, (s, p) in enumerate(firsts) if p > 0 and where.get((s, p - 1)) == j - 1), None)
        j_out = next((i for i, (s, p) in enumerate(lasts) if where.get((s, p + 1)) == j + 1), None)
        out.append(merged)
        joins.append({'in': j_in, 'out': j_out})
    return out, joins


def align_word(strokes, chars, T, base_y, sc, limit=0.9, max_group=MAX_GROUP, mean_limit=1.0, joins=False):
    """strokes: list of arrays (pt) of one word; chars: its characters.
    Returns (groups, costs): a list of lists of stroke pieces (pt) per character, or (None, None) if the word does not fit.
    With joins=True the pieces of a character are merged back into its pen strokes and the result is
    (groups, costs, joins), see merge_pieces."""
    tol = 0.12 / sc                                  # 0.12 em in pt
    tagged = [(a, (si, pi)) for si, s in enumerate(strokes) for pi, a in enumerate(cut_stroke(s, base_y, tol))]
    tagged.sort(key=lambda t: (t[0][:, 0].min() + t[0][:, 0].max()) / 2)
    atoms = [a for a, _ in tagged]
    atom_ids = [i for _, i in tagged]
    m, n = len(atoms), len(chars)
    if m < n:
        return (None, None, None) if joins else (None, None)
    memo = {}

    def gcost(i, k, j):                              # atoms i..i+k-1 as character j
        key = (i, k, j)
        if key not in memo:
            memo[key] = T.cost(chars[j], to_em(atoms[i:i + k], base_y, sc))
        return memo[key]

    INF = 1e9
    best = np.full((m + 1, n + 1), INF); best[0, 0] = 0
    back = {}
    for j in range(1, n + 1):
        for i in range(j, m + 1):
            for k in range(1, min(max_group, i - (j - 1)) + 1):
                prev = best[i - k, j - 1]
                if prev >= INF:
                    continue
                c = prev + gcost(i - k, k, j - 1)
                if c < best[i, j]:
                    best[i, j] = c; back[(i, j)] = k
    if best[m, n] >= INF:
        return (None, None, None) if joins else (None, None)
    groups, ids, costs, i = [], [], [], m
    for j in range(n, 0, -1):
        k = back[(i, j)]
        groups.append(atoms[i - k:i]); ids.append(atom_ids[i - k:i]); costs.append(gcost(i - k, k, j - 1)); i -= k
    groups.reverse(); ids.reverse(); costs.reverse()
    if max(costs) > limit or float(np.mean(costs)) > mean_limit:
        return (None, None, None) if joins else (None, None)
    if joins:
        merged, jn = merge_pieces(groups, ids)
        return merged, costs, jn
    return groups, costs
