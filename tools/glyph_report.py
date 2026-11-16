"""Quality report for a glyph library (glyphs.json).

Prints measurements behind the general rules (docs/rules.md):
  * umlaut body size vs. base letter (a/ä, o/ö, u/ü, ...)
  * cap height vs. ascender height (K vs k, I vs l, ...)
  * capitals that drop below the baseline
  * tiny artefact strokes that are rendered as visible dots
  * size of the dots in ':' (scribbled dots are not replaced by clean dots)
Optionally renders a contact sheet (all variants of selected characters).

Usage:
    python3 glyph_report.py glyphs.json [--sheet out.png --chars ':kKNäöü']
"""
import argparse
import json

import numpy as np

XCHARS = 'acemnorsuvwxz'
DOT_CHARS = set("ijäöüÄÖÜ:;.!?…·„“\"'%÷")


def pts(g, only_body=False):
    S = [np.array(s, dtype=float) for s in g['s']]
    if only_body:  # strokes that reach the baseline zone (drops umlaut dots/dashes)
        S = [s for s in S if s[:, 1].max() > -0.15]
    return np.vstack(S)


def size(g, only_body=False):
    a = pts(g, only_body)
    return dict(h=a[:, 1].max() - a[:, 1].min(), w=np.ptp(a[:, 0]), top=-a[:, 1].min(), below=a[:, 1].max())


def mean(G, c, key, only_body=False):
    return float(np.mean([size(g, only_body)[key] for g in G[c] if g]))


def report(G):
    xh = float(np.median([size(g, True)['h'] for c in XCHARS if c in G for g in G[c] if g]))
    print(f'x-height (median of {XCHARS}): {xh:.3f} em\n')

    print('Umlaut body vs base letter (mean of variants):')
    for u, b in zip('äöüÄÖÜ', 'aouAOU'):
        if u in G and b in G:
            hu, hb = mean(G, u, 'h', True), mean(G, b, 'h', True)
            wu, wb = mean(G, u, 'w', True), mean(G, b, 'w', True)
            print(f'  {u}/{b}: height {hu:.2f} vs {hb:.2f} ({(hu / hb - 1) * 100:+.0f} %), '
                  f'width {wu:.2f} vs {wb:.2f} ({(wu / wb - 1) * 100:+.0f} %)')

    print('\nCap height vs ascender height (top above baseline, em):')
    for U, l in zip('KILOCUNX', 'kllocunx'):
        if U in G and l in G:
            tu, tl = mean(G, U, 'top'), mean(G, l, 'top')
            flag = '  <- hard to tell apart' if tu < tl * 1.1 else ''
            print(f'  {U} {tu:.2f}  vs  {l} {tl:.2f}{flag}')

    low = {c: mean(G, c, 'below') for c in G if c.isupper() and mean(G, c, 'below') > 0.06}
    print('\nCapitals reaching below the baseline (> 0.06 em):', {k: round(v, 2) for k, v in low.items()})

    bad = []
    for c, vs in G.items():
        for v, g in enumerate(vs):
            if not g or c in DOT_CHARS:
                continue
            n = sum(1 for s in g['s'] if len(s) == 2 and abs(s[0][0] - s[1][0]) < 0.01 and abs(s[0][1] - s[1][1]) < 0.01)
            if n:
                bad.append(f'{c}(v{v})')
    print('\nArtefact dots in glyphs that should not have dots:', ' '.join(bad) or 'none')

    if ':' in G:
        print("\nParts of ':' per variant (points, width, height) - kept exactly as written:")
        for v, g in enumerate(G[':']):
            print('  v%d' % v, [(len(s), round(float(np.ptp([p[0] for p in s])), 3),
                                 round(float(np.ptp([p[1] for p in s])), 3)) for s in g['s']])


def sheet(G, chars, out):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    n = max(len(G[c]) for c in chars)
    fig, ax = plt.subplots(len(chars), n, figsize=(1.5 * n, 1.5 * len(chars)), squeeze=False)
    for r, c in enumerate(chars):
        for v in range(n):
            a = ax[r][v]
            a.set_xticks([]); a.set_yticks([])
            if v >= len(G[c]) or not G[c][v]:
                continue
            g = G[c][v]
            for s in g['s']:
                s = np.array(s)
                a.plot(s[:, 0], s[:, 1], 'k-', lw=1.5)
                if len(s) == 2 and np.hypot(*(s[1] - s[0])) < 0.01:
                    a.plot(s[:, 0].mean(), s[:, 1].mean(), 'ko', ms=3)
            a.axhline(0, color='r', lw=.5); a.axhline(-0.42, color='b', lw=.5)
            a.axvline(0, color='g', lw=.3); a.axvline(g['adv'], color='g', lw=.3)
            a.set_xlim(-.1, 1.0); a.set_ylim(.4, -1.0); a.set_aspect('equal')
            a.set_title(f'{c!r} v{v}', fontsize=6)
    plt.tight_layout(); plt.savefig(out, dpi=110)
    print('contact sheet ->', out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('glyphs', nargs='?', help='glyph JSON (or use --profile)')
    ap.add_argument('--profile', help='handwriting profile name (uses its glyphs.json)')
    ap.add_argument('--sheet', help='write a contact sheet PNG')
    ap.add_argument('--chars', default=':kKNIläöü', help='characters for the contact sheet')
    a = ap.parse_args()
    if a.profile:
        import os, sys
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pipeline'))
        import profiles
        a.glyphs = profiles.glyphs_path(profiles.load(a.profile))
    if not a.glyphs:
        ap.error('give a glyph JSON file or --profile NAME')
    G = json.load(open(a.glyphs, encoding='utf-8'))
    report(G)
    if a.sheet:
        sheet(G, a.chars, a.sheet)
