"""Round trip without any personal data: make_sheet manifest -> synthetic handwriting -> segment -> build.

Run: python tests/test_sheet_v2.py
The synthetic writer draws every character as a box-like shape of known height (x-height letters, ascenders, descenders,
capitals) with a small random wobble, so the expected proportions are known and can be checked.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
from make_sheet import build as sheet_build, pdf_bytes
from sentences_de import select
from segment_v2 import segment
from build_glyphs_v2 import build as build_glyphs

XH = 9.0            # pt, x-height of the synthetic writer
ASC, CAP, DESC = 1.7 * XH, 1.55 * XH, 0.6 * XH
rng = np.random.default_rng(1)


def glyph(ch, x, base):
    """Strokes (pt, y down) of one synthetic character starting at x."""
    w = 0.5 * XH
    jit = lambda: rng.normal(0, 0.12)
    if ch in 'bdfhklt':
        top = ASC
    elif ch.isupper() or ch.isdigit() or ch in 'ÄÖÜ':
        top = CAP
    else:
        top = XH
    bot = -DESC if ch in 'gjpqyß' else 0
    S = [np.array([[x + jit(), base - top + jit()], [x + w * 0.5, base - top * 0.5], [x + w + jit(), base - bot + jit()]])]
    if ch in 'äöüÄÖÜ':
        S.append(np.array([[x + w * 0.2, base - top - 5], [x + w * 0.22, base - top - 4.5]]))
        S.append(np.array([[x + w * 0.7, base - top - 5], [x + w * 0.72, base - top - 4.5]]))
    if ch in 'ij':
        S.append(np.array([[x + w * 0.45, base - top - 5], [x + w * 0.47, base - top - 4.5]]))
    return S, w


def write(manifest):
    pages = {}
    for ln in manifest['lines']:
        x, base = ln['x0'] + 4, ln['baseline'] - 2.0 + rng.normal(0, 0.3)
        for word in ln['text'].split():
            for ch in word:
                S, w = glyph(ch, x, base)
                pages.setdefault(ln['page'], []).extend(S)
                x += w + 1.8
            x += 8
        assert x < ln['x1'] + 60, ('line too long for the synthetic writer', ln['text'])
    return pages


def main():
    sentences, have, need = select()
    pages, man = sheet_build(sentences)
    assert pdf_bytes(pages).startswith(b'%PDF-1.4') and len(man['lines']) == len(sentences)
    occ, stats = segment(write(man), man)
    ratio = stats['words_ok'] / stats['words']
    print('words matched', stats['words_ok'], '/', stats['words'], f'({ratio:.0%}); characters', stats['chars'])
    assert ratio > 0.9, stats['skipped'][:5]
    glyphs, rep = build_glyphs(occ)
    p = rep['proportions']
    print('capital/x-height %.2f (true %.2f), ascender/x-height %.2f (true %.2f)'
          % (p['capital_over_xheight'], CAP / XH, p['ascender_over_xheight'], ASC / XH))
    assert abs(p['capital_over_xheight'] - CAP / XH) < 0.15 and abs(p['ascender_over_xheight'] - ASC / XH) < 0.15
    assert 'e' in glyphs and 1 <= len(glyphs['e']) <= 8
    pos = {g['pos'] for g in glyphs['e']}
    assert pos <= {'initial', 'medial', 'final', 'single'}
    print('variants of e:', len(glyphs['e']), 'positions', sorted(pos), '- OK')


if __name__ == '__main__':
    main()
