"""Split a sample page into text rows and describe the expected sample layout.

The sample sheet (v1) has 12 rows per page, each containing a fixed character
set in a fixed order. Rows are found automatically: strokes are sorted by their
vertical centre and the 11 largest vertical gaps are taken as row boundaries.
If two neighbouring rows were written in swapped order, assign_rows() detects it
from the expected number of characters per row.
"""
import os

from svg_strokes import load, xclusters

NAMES = ['lower', 'upper', 'digit', 'uml', 'sym', 'arrow', 'ex1', 'circ', 'ex2', 'acc', 'logic', 'tri']
EXP = {'lower': 26, 'upper': 26, 'digit': 10, 'uml': 7, 'sym': 20, 'arrow': 4, 'ex1': 14,
       'circ': 10, 'ex2': 10, 'acc': 3, 'logic': 8, 'tri': 1}


def page_rows(p, svg_dir='.', n_rows=len(NAMES)):
    """Return (strokes, rows) for sample page p (reads <svg_dir>/pg<p>.svg)."""
    st = load(os.path.join(svg_dir, f'pg{p}.svg'))
    c = sorted(((s[:, 1].min() + s[:, 1].max()) / 2, i) for i, s in enumerate(st))
    gaps = sorted(range(1, len(c)), key=lambda k: c[k][0] - c[k - 1][0], reverse=True)[:n_rows - 1]
    cuts = set(gaps)
    rows = [[c[0][1]]]
    for k in range(1, len(c)):
        if k in cuts:
            rows.append([])
        rows[-1].append(c[k][1])
    return st, rows


def assign_rows(st, rows, names=NAMES):
    """Return the row names in page order; swaps neighbours that were written in swapped order."""
    names = list(names)
    fits = lambda r, n: len(xclusters(st, r)) >= EXP[n]
    for i in range(len(names) - 1):
        if not fits(rows[i], names[i]) and fits(rows[i], names[i + 1]) and fits(rows[i + 1], names[i]):
            names[i], names[i + 1] = names[i + 1], names[i]
    bad = [(n, len(xclusters(st, r)), EXP[n]) for r, n in zip(rows, names) if not fits(r, n)]
    if bad:
        raise SystemExit(f'sample page does not match sample sheet v1 (row, found, expected): {bad}')
    return names


if __name__ == '__main__':
    import sys
    d = sys.argv[1] if len(sys.argv) > 1 else '.'
    for p in (1, 2, 3):
        st, R = page_rows(p, d)
        print('page', p, len(R), 'rows:', ' '.join(assign_rows(st, R)))
