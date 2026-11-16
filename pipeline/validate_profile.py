"""Anonymous statistics of one profile for checking the general rules with other writers (P5, stage 2).

Usage:
    python3 validate_profile.py NAME            # prints JSON; nothing is sent anywhere
    penclone validate NAME

Only a few numbers leave this script: proportions relative to the writer's own x-height (capital, ascender, overshoot below
the baseline - see validate_stats.py) and the measured line habits (layout.json). No strokes, no images, no text. The
volunteer reads the output and decides whether to post it in an issue ("Share anonymous statistics").
"""
import argparse
import json
import os
import sys

from profiles import load, source_dir, V2
from validate_stats import writer_stats
from segment_v2 import assign_lines, split_words

FORMAT = 1


def words_of(pages, manifest):
    """Words with their known text from a written sample sheet v2 (strokes only used here, never returned)."""
    out = []
    by_page = {}
    for li, ln in enumerate(manifest['lines']):
        by_page.setdefault(ln['page'], []).append((li, ln))
    for page, items in by_page.items():
        st = pages.get(page)
        if st is None:
            continue
        per = assign_lines(st, [ln for _, ln in items], manifest['row_height_pt'])
        for (li, ln), idx in zip(items, per.values()):
            texts = ln['text'].split()
            if not idx:
                continue
            groups = split_words(st, idx, len(texts))
            if groups is None:
                continue
            for t, g in zip(texts, groups):
                out.append({'text': t, 'strokes': [st[i] for i in g], 'line': li})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('name')
    a = ap.parse_args()
    P = load(a.name)
    if not any(s['id'] == V2 for s in P['sources']):
        sys.exit('this needs sample sheet v2 in the profile (penclone sample-sheet, then penclone import)')
    from build_glyphs_v2 import pages_from_pdf
    src = source_dir(P, V2)
    man = json.load(open(os.path.join(src, 'sheet.json'), encoding='utf-8'))
    pages = pages_from_pdf(os.path.join(src, 'written.pdf'), max(l['page'] for l in man['lines']))
    # the sheet has fixed sentences with about 15 words of x-height letters only, so 8 are enough here (IAM tool: 15)
    stats = writer_stats(words_of(pages, man), min_words=60, min_x=8) or {}
    r = lambda v: None if v is None else round(v, 3)
    res = {'format': FORMAT, 'sheet': 'sample-v2', 'languages': P.get('languages', []),
           'word_level': {k: (r(v) if isinstance(v, float) else v) for k, v in stats.items()}}
    rep = os.path.join(P['_dir'], 'report-v2.json')
    if os.path.isfile(rep):
        pr = json.load(open(rep, encoding='utf-8')).get('proportions', {})
        # character level: strokes assigned to known letters while building the glyphs (more exact than word level)
        res['char_level'] = {'cap_over_x': r(pr.get('capital_over_xheight')), 'asc_over_x': r(pr.get('ascender_over_xheight'))}
    if not stats and 'char_level' not in res:
        sys.exit('too few words could be measured on the sample sheet')
    lay = os.path.join(P['_dir'], 'layout.json')
    if os.path.isfile(lay):
        L = json.load(open(lay, encoding='utf-8'))
        res['line_habits'] = {
            'word_gap_median': L['word_gap']['median'] if L.get('word_gap') else None,
            'baseline_offset_median': L['baseline_offset']['median'] if L.get('baseline_offset') else None,
            'slope_deg_sd': L['line_slope_deg']['sd'] if L.get('line_slope_deg') else None,
            'drift_sd': L['drift']['drift_sd'] if L.get('drift') else None,
            'drift_range': L['drift']['range'] if L.get('drift') else None,
        }
    print(json.dumps(res, indent=1))


if __name__ == '__main__':
    main()
