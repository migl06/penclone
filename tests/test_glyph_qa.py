"""glyph_qa: stubs and extra parts are rejected, sheet-v1 shapes are kept, blends are made, punctuation stays sheet-v1 only.
Synthetic glyphs only (no real handwriting in the repository)."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
import glyph_qa as Q  # noqa: E402


def stroke(pts):
    return [list(map(float, p)) for p in pts]


def letter(x0=0.0, top=-0.42, w=0.3, tilt=0.0):
    """A synthetic 'n'-like glyph: two stems and an arch."""
    return {'adv': w + 0.1, 's': [stroke([(x0, top), (x0 + tilt, 0)]),
                                 stroke([(x0, top), (x0 + w / 2, top - 0.03), (x0 + w, top), (x0 + w, 0)])]}


V1 = {'n': [letter(tilt=0.0), letter(w=0.32, tilt=0.02), letter(w=0.28)], ',': [{'adv': 0.1, 's': [stroke([(0, -0.05), (0, 0.1)])]}]}


def test_stub_and_extra_part_are_rejected():
    good = letter(w=0.31)
    stub = {'adv': 0.4, 's': good['s'] + [stroke([(0.5, -0.1), (0.505, -0.1)])]}          # a dot where none belongs
    extra = {'adv': 0.6, 's': good['s'] + [stroke([(0.4, -0.3), (0.5, -0.1), (0.6, 0.0)]),
                                         stroke([(0.4, -0.2), (0.6, -0.2)])]}               # a piece of the next letter
    ok, why = Q.check_sentence_variants('n', [good, stub, extra], V1['n'])
    assert ok == [0] and 'stub' in why[1].lower() and 'extra' in why[2].lower()


def test_morph_blends_same_structure_only():
    m = Q.morph(V1['n'][0], V1['n'][1], 0.5)
    assert m is not None and len(m['s']) == 2
    one = {'adv': 0.3, 's': [stroke([(0, -0.4), (0.3, 0)])]}
    assert Q.morph(V1['n'][0], one, 0.5) is None


def test_curate_keeps_v1_shapes_and_adds_blends_but_no_punctuation_from_sentences():
    sent = {'n': [letter(w=0.3)] * 6, ',': [{'adv': 0.1, 's': [stroke([(0, 0.0), (0.001, 0.0)])]}]}      # sentence comma: a dot
    lib, rep = Q.curate(V1, sent, morphs=5, recogniser=type('R', (), {'score': lambda self, c, v: 1.0})())
    assert len(lib['n']) == 3 + 5                       # three letters from sheet v1 and five blends
    assert lib[','] == [Q._plain(v) for v in V1[',']]    # punctuation: sheet v1 only, untouched
    assert all('ji' not in v and 'pos' not in v for v in lib['n'])
