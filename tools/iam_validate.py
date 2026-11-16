"""Compute anonymous writer statistics from the IAM On-Line Handwriting Database (P5, stage 1).

Usage:
    python3 tools/iam_validate.py ~/Daten/IAM-OnDB -o iam_stats.json [--limit-writers N]

Expects the extracted archives lineStrokes-all/ and original-xml-all/ inside the given folder (obtained by you from
https://fki.tic.heia-fr.ch/databases/iam-on-line-handwriting-database after registration; non-commercial research only,
do not redistribute, cite Liwicki & Bunke, ICDAR 2005). The data is never copied into the repository. The output holds one
row of numbers per writer (IAM's numeric writer id) and a summary; no strokes and no personal data from writers.xml.
"""
import argparse
import glob
import json
import os
import sys
import xml.etree.ElementTree as ET

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pipeline'))
from validate_stats import writer_stats


def strokes_of(fn):
    root = ET.parse(fn).getroot()
    out = []
    for s in root.iter('Stroke'):
        P = np.array([[float(p.get('x')), float(p.get('y'))] for p in s.iter('Point')])
        if len(P) >= 2:
            out.append(P)
    return out


def split_words(strokes, k):
    """Split a line's strokes into k words at the k-1 widest horizontal gaps between strokes sorted by x."""
    st = sorted(strokes, key=lambda s: s[:, 0].min())
    if k <= 1 or len(st) < k:
        return [st] if k <= 1 else None
    reach, gaps = st[0][:, 0].max(), []
    for i in range(1, len(st)):
        gaps.append((st[i][:, 0].min() - reach, i))
        reach = max(reach, st[i][:, 0].max())
    cuts = sorted(i for _, i in sorted(gaps, reverse=True)[:k - 1])
    words, a = [], 0
    for c in cuts + [len(st)]:
        words.append(st[a:c]); a = c
    return words


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('folder')
    ap.add_argument('-o', '--out', default='iam_stats.json')
    ap.add_argument('--limit-writers', type=int)
    a = ap.parse_args()
    forms = sorted(glob.glob(os.path.join(a.folder, 'original-xml-all', 'original', '*', '*', 'strokes*.xml')))
    by_writer = {}
    for fn in forms:
        try:
            root = ET.parse(fn).getroot()
        except ET.ParseError:
            continue
        form = root.find('General/Form')
        if form is None or not form.get('writerID'):
            continue
        wid = form.get('writerID')
        d = os.path.dirname(fn).replace(os.path.join('original-xml-all', 'original'), os.path.join('lineStrokes-all', 'lineStrokes'))
        for tl in root.iter('TextLine'):
            text = (tl.get('text') or '').replace('&quot;', '"')
            lf = os.path.join(d, tl.get('id') + '.xml')
            if not text.split() or not os.path.isfile(lf):
                continue
            words = text.split()
            groups = split_words(strokes_of(lf), len(words))
            if groups is None:
                continue
            for w, g in zip(words, groups):
                by_writer.setdefault(wid, []).append({'text': w, 'strokes': g, 'line': tl.get('id')})
    rows = {}
    for wid, ws in sorted(by_writer.items())[:a.limit_writers]:
        s = writer_stats(ws)
        if s:
            rows[wid] = s
    summary = {}
    for k in ('cap_over_x', 'asc_over_x', 'overshoot_p50', 'overshoot_p95'):
        v = [r[k] for r in rows.values() if r[k] is not None]
        if v:
            summary[k] = {'writers': len(v), 'p5': float(np.percentile(v, 5)), 'p50': float(np.percentile(v, 50)),
                          'p95': float(np.percentile(v, 95))}
    json.dump({'source': 'IAM-OnDB', 'writers': rows, 'summary': summary}, open(a.out, 'w'), indent=1)
    print(len(rows), 'writers with usable statistics (of', len(by_writer), ')')
    for k, v in summary.items():
        print(f'{k:15s} writers {v["writers"]:3d}  5%/50%/95%: {v["p5"]:.2f} / {v["p50"]:.2f} / {v["p95"]:.2f}')


if __name__ == '__main__':
    main()
