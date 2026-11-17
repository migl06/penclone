"""Contact sheet of glyph variants, to look at what the pipeline cut: one row per character, baseline marked.

    python3 research/glyph_sheet.py GLYPHS.json OUT.png [chars] [--v1 GLYPHS_V1.json]
Variants are drawn at 100 px per em; index and source tag under each. Meant for checking by eye, not for the paper.
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw

PX = 110


def sheet(glyphs, chars, out, cols=14, extra=None):
    rows = []
    for ch in chars:
        vs = [(f'{i}', v) for i, v in enumerate(glyphs.get(ch, []))] + [(f'v1.{i}', v) for i, v in enumerate((extra or {}).get(ch, []))]
        for k in range(0, max(len(vs), 1), cols):
            rows.append((ch, vs[k:k + cols]))
    cw, ch_h = int(0.95 * PX), int(1.9 * PX)
    img = Image.new('RGB', (cols * cw + 40, len(rows) * ch_h), 'white')
    d = ImageDraw.Draw(img)
    for r, (ch, vs) in enumerate(rows):
        y0 = r * ch_h + int(1.25 * PX)
        d.line([(0, y0), (img.width, y0)], fill=(200, 200, 255))
        d.text((4, y0 - 20), ch, fill=(200, 0, 0))
        for c, (tag, v) in enumerate(vs):
            x0 = 40 + c * cw + 8
            col = (0, 0, 160) if tag.startswith('v1') else (0, 0, 0)
            for s in v['s']:
                pts = [(x0 + x * PX, y0 + y * PX) for x, y in s]
                if len(pts) > 1:
                    d.line(pts, fill=col, width=3, joint='curve')
                else:
                    d.ellipse([pts[0][0] - 2, pts[0][1] - 2, pts[0][0] + 2, pts[0][1] + 2], fill=col)
            d.text((x0, y0 + int(0.55 * PX)), tag, fill=(120, 120, 120))
    img.save(out)


if __name__ == '__main__':
    a = [x for x in sys.argv[1:] if not x.startswith('--')]
    g = json.load(open(a[0], encoding='utf-8'))
    ex = json.load(open(sys.argv[sys.argv.index('--v1') + 1], encoding='utf-8')) if '--v1' in sys.argv else None
    chars = a[2] if len(a) > 2 else sorted(g)
    sheet(g, chars, a[1], extra=ex)
