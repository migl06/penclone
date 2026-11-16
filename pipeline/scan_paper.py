"""Measure a scanned page: paper type, line spacing, rule positions and margin lines; write a clean background image.

Usage:
    python3 scan_paper.py --input empty_page.pdf --out DIR            # DIR/template.json + DIR/background.png
    python3 scan_paper.py --input worksheet.png --out DIR --boxes fields.json   # also: rules inside each field box
    options: --page N (PDF page, default 1), --width-mm W (image width when the file has no resolution; default 210),
             --no-background (geometry only)

Nobody measures by hand (docs/decisions.md §12): penclone measures rather than the AI because small errors add up over many
lines and vision-language models are unreliable with exact geometry.

Method (axis-aligned scans; documented as standard image-analysis steps, the parameters are assumptions):
  1. grey image at 150 dpi (PDF via pdftoppm; images via Pillow, size from their dpi or --width-mm)
  2. skew: rotate in 0.1 degree steps within +-3 degrees and keep the angle whose row profile has the largest variance
     (projection-profile deskewing; ruled lines and text rows give sharp peaks only when level)
  3. ink = how much darker a pixel is than the paper (90th percentile of the page); dark = ink > 20 of 255
  4. rules: rows where at least 35 % of the width is dark, merged to one line each; vertical lines likewise on columns
  5. dots: if there are no rules, the row and column profiles are tested for a regular period between 3 and 15 mm
     (autocorrelation); a period on both axes = dot grid
  6. type: regular rules + regular vertical lines at the same spacing = squared; regular rules = lined; dots = dotted;
     otherwise blank. Long vertical lines on lined paper are margin lines.
Field boxes (worksheets): inside each box, rows where at least 50 % of the box width is dark are answer lines.
"""
import argparse
import json
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image

DPI = 150
DARK = 20            # ink level (0-255 darker than the paper) that counts as printed (assumption)
ROW_FRAC = 0.35      # a ruled line covers at least this part of the page width (assumption)
BOX_FRAC = 0.5       # an answer line covers at least this part of its field box (assumption)


def load(path, page=1, width_mm=None):
    """Grey image (numpy uint8) and its pixels per mm."""
    if path.lower().endswith('.pdf'):
        with tempfile.TemporaryDirectory() as d:
            base = os.path.join(d, 'p')
            subprocess.run(['pdftoppm', '-r', str(DPI), '-gray', '-png', '-f', str(page), '-l', str(page), '-singlefile',
                            path, base], check=True)
            im = Image.open(base + '.png').convert('L')
            im.load()
        return np.array(im), DPI / 25.4
    im = Image.open(path)
    dpi = im.info.get('dpi', (0, 0))[0]
    im = im.convert('L')
    if width_mm:
        ppmm = im.width / width_mm
    elif dpi and dpi > 30:
        ppmm = float(dpi) / 25.4
    else:
        ppmm = im.width / 210.0           # assumption: a full A4 page in portrait
    # work at 150 dpi
    scale = (DPI / 25.4) / ppmm
    if abs(scale - 1) > 0.02:
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    return np.array(im), DPI / 25.4


def ink(a):
    bg = np.percentile(a, 90)
    return np.clip(bg - a.astype(np.int16), 0, 255).astype(np.uint8)


def deskew(a):
    small = Image.fromarray(a)
    f = 600 / max(1, small.width)
    if f < 1:
        small = small.resize((600, max(1, round(small.height * f))))
    best, best_v = 0.0, -1
    for ang in np.arange(-3, 3.001, 0.1):
        r = np.array(small.rotate(ang, resample=Image.BILINEAR, fillcolor=255))
        v = (ink(r) > DARK).mean(1).var()
        if v > best_v:
            best, best_v = float(ang), v
    if abs(best) < 0.05:
        return a, 0.0
    return np.array(Image.fromarray(a).rotate(best, resample=Image.BICUBIC, fillcolor=255)), best


def runs(mask):
    """Centres of runs of True."""
    out, start = [], None
    for i, m in enumerate(list(mask) + [False]):
        if m and start is None:
            start = i
        elif not m and start is not None:
            out.append((start + i - 1) / 2)
            start = None
    return out


def regular(pos, tol=0.12):
    """Median spacing if the positions are regular (most gaps within tol of a multiple of it), else None."""
    if len(pos) < 3:
        return None
    d = np.diff(pos)
    s = float(np.median(d))
    if s <= 0:
        return None
    k = np.round(d / s)
    ok = (k >= 1) & (np.abs(d - k * s) <= tol * s)
    if ok.mean() < 0.8:
        return None
    # refine: least-squares slope of position against line number (the median gap alone is off by pixel rounding)
    idx = np.concatenate([[0], np.cumsum(k)])
    return float(np.polyfit(idx, pos, 1)[0])


def period(profile, ppmm, lo=3, hi=15):
    p = profile - profile.mean()
    if p.std() < 1e-6:
        return None
    ac = np.correlate(p, p, 'full')[len(p) - 1:]
    ac /= ac[0]
    a, b = int(lo * ppmm), min(int(hi * ppmm), len(ac) - 1)
    if b <= a:
        return None
    seg = ac[a:b]
    if seg.max() <= 0.3:
        return None
    # the first lag close to the best one: multiples of the period correlate almost as well
    k = a + int(np.nonzero(seg >= 0.85 * seg.max())[0][0])
    while k + 1 < len(ac) and ac[k + 1] > ac[k]:
        k += 1
    return k / ppmm


def analyse(a, ppmm):
    a, skew = deskew(a)
    d = ink(a) > DARK
    H, W = d.shape
    rows, cols = d.mean(1), d.mean(0)
    rules = [y / ppmm for y in runs(rows >= ROW_FRAC)]
    verts = [x / ppmm for x in runs(cols >= ROW_FRAC)]
    sp = regular(rules)
    vs = regular(verts)
    res = {'skew_deg': round(skew, 2), 'page': [round(W / ppmm, 2), round(H / ppmm, 2)], 'rules': [], 'verticals': []}
    if sp and vs and abs(sp - vs) < 0.15 * sp:
        res.update(type='squared', grid=round(sp, 2), rules=[round(y, 2) for y in rules])
    elif sp:
        res.update(type='lined', spacing=round(sp, 2), rules=[round(y, 2) for y in rules],
                   verticals=[round(x, 2) for x in verts])
    else:
        pr, pc = period(rows, ppmm), period(cols, ppmm)
        if pr and pc and abs(pr - pc) < 0.15 * pr:
            # dot rows: peaks of the row profile on the period
            peaks = [y / ppmm for y in runs(rows > rows.mean() + rows.std())]
            res.update(type='dotted', grid=round(regular(peaks) or pr, 2), rules=[round(y, 2) for y in peaks])
        else:
            res.update(type='blank')
    return res, a


def box_rules(a, ppmm, box):
    """Answer lines inside one field box [x, y, w, h] in mm (y from the top)."""
    x, y, w, h = box
    x0, y0 = max(0, int(x * ppmm)), max(0, int(y * ppmm))
    x1, y1 = min(a.shape[1], int((x + w) * ppmm)), min(a.shape[0], int((y + h) * ppmm))
    if x1 - x0 < 5 or y1 - y0 < 5:
        return []
    d = ink(a[y0:y1, x0:x1]) > DARK
    return [round(y + r / ppmm, 2) for r in runs(d.mean(1) >= BOX_FRAC)]


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--input', required=True, help='scan or PDF (empty page, or a worksheet)')
    ap.add_argument('--out', required=True, help='output folder (template.json, background.png)')
    ap.add_argument('--page', type=int, default=1)
    ap.add_argument('--width-mm', type=float, help='real width of the image when the file has no resolution')
    ap.add_argument('--boxes', help='JSON with {"fields": [{"box": [x, y, w, h]}, ...]} in mm')
    ap.add_argument('--no-background', action='store_true')
    a = ap.parse_args()
    img, ppmm = load(a.input, a.page, a.width_mm)
    res, straight = analyse(img, ppmm)
    os.makedirs(a.out, exist_ok=True)
    if not a.no_background:
        clean = straight.copy()
        clean[ink(straight) < 10] = 255          # paper becomes white: cleaner print, much smaller file
        Image.fromarray(clean).save(os.path.join(a.out, 'background.png'), optimize=True)
        res['background'] = 'background.png'
    if a.boxes:
        f = json.load(open(a.boxes, encoding='utf-8'))
        res['fields'] = [{'box': fd['box'], 'rules': box_rules(straight, ppmm, fd['box'])} for fd in f.get('fields', [])]
    res['source'] = os.path.basename(a.input)
    json.dump(res, open(os.path.join(a.out, 'template.json'), 'w', encoding='utf-8'), indent=1)
    print(json.dumps({k: v for k, v in res.items() if k not in ('rules', 'fields')}))


if __name__ == '__main__':
    main()
