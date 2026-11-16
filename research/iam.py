"""IAM On-Line Handwriting Database (Liwicki & Bunke, ICDAR 2005) as further writers for the realism experiments.

Every text line of a writer becomes one "page" in the format of a written sample sheet (strokes in pt, y down, a manifest
line with its baseline), so the same pipeline and the same measurements apply. Lines are straightened (slope from the
bottoms of the ink) and scaled so that the writer's x-height is about that of the sample sheets. The data stays where it
is (~/Daten/IAM-OnDB); nothing of it is copied into the repository and only numbers per writer are reported, under IAM's
numeric writer id. Obtain the database yourself (registration, non-commercial research use) and cite the paper.

IAM writers have no alphabet sheet: the alignment templates and the fallback glyphs come from the letters of the writer's
own TRAIN lines that are written separately (strict segmentation), so no test line is used for building anything.
"""
import glob
import json
import os
import sys
import xml.etree.ElementTree as ET

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H  # noqa: E402
from align_v2 import Templates  # noqa: E402
from build_glyphs_v2 import build, normalise  # noqa: E402
from measure_layout import measure  # noqa: E402
from segment_v2 import segment  # noqa: E402

IAM = os.environ.get('IAM_ONDB', os.path.expanduser('~/Daten/IAM-OnDB'))
XH_PT = 6.6            # target x-height in pt (the sample sheets' writer: 6.6)
BASE, X0, ROW = 200.0, 56.69, 34.0


def strokes_of(fn):
    root = ET.parse(fn).getroot()
    out = []
    for s in root.iter('Stroke'):
        P = np.array([[float(p.get('x')), float(p.get('y'))] for p in s.iter('Point')])
        if len(P) >= 1:
            out.append(P)
    return out


def writers_index():
    """{writer id: [(text, line stroke file), ...]} for all forms of the database."""
    idx = {}
    for fn in sorted(glob.glob(os.path.join(IAM, 'original-xml-all', 'original', '*', '*', 'strokes*.xml'))):
        try:
            root = ET.parse(fn).getroot()
        except ET.ParseError:
            continue
        form = root.find('General/Form')
        if form is None or not form.get('writerID'):
            continue
        d = os.path.dirname(fn).replace(os.path.join('original-xml-all', 'original'), os.path.join('lineStrokes-all', 'lineStrokes'))
        for tl in root.iter('TextLine'):
            text = (tl.get('text') or '').replace('&quot;', '"').replace('&apos;', "'").replace('&amp;', '&').strip()
            lf = os.path.join(d, tl.get('id') + '.xml')
            if text.split() and os.path.isfile(lf):
                idx.setdefault(form.get('writerID'), []).append((text, lf))
    return idx


def straighten(strokes):
    """Remove the slope of a line (fit through the 80th percentile of y in ten x-windows) and return strokes and the
    baseline estimate (y down)."""
    P = np.concatenate(strokes)
    xs = np.linspace(P[:, 0].min(), P[:, 0].max(), 11)
    pts = []
    for a, b in zip(xs[:-1], xs[1:]):
        m = (P[:, 0] >= a) & (P[:, 0] <= b)
        if m.sum() >= 10:
            pts.append(((a + b) / 2, np.percentile(P[m, 1], 80)))
    if len(pts) >= 3:
        k, c = np.polyfit(*np.array(pts).T, 1)
    else:
        k, c = 0.0, float(np.percentile(P[:, 1], 80))
    out = [np.stack([s[:, 0], s[:, 1] - k * s[:, 0]], 1) for s in strokes]
    return out, c


class IAMWriter(H.Writer):
    """Same interface as harness.Writer, built from one IAM writer's lines."""

    def __init__(self, wid, lines):
        self.wid = wid
        raw = []
        for text, lf in lines:
            st = strokes_of(lf)
            if not st:
                continue
            st, base = straighten(st)
            P = np.concatenate(st)
            raw.append((text, st, base, np.percentile(P[:, 1], 75) - np.percentile(P[:, 1], 25)))
        scale = XH_PT / (1.5 * float(np.median([r[3] for r in raw])))     # interquartile ink height ~ 2/3 x-height
        self.pages, lines_m = {}, []
        for k, (text, st, base, _) in enumerate(raw, 1):
            x0 = min(s[:, 0].min() for s in st)
            S = [np.stack([(s[:, 0] - x0) * scale + X0, (s[:, 1] - base) * scale + BASE], 1) for s in st]
            self.pages[k] = S
            width = max(s[:, 0].max() for s in S) - X0
            lines_m.append({'page': k, 'text': text, 'x0': X0, 'x1': X0 + width, 'baseline': BASE, 'top': BASE - ROW})
        self.man = {'sheet': 'iam', 'lang': 'en', 'page_pt': [2000, 400], 'row_height_pt': ROW, 'lines': lines_m}
        self.n = len(lines_m)
        self.cache = os.path.join(H.CACHE, 'iam', wid)
        self._templates, self._occ = {}, {}

    def templates(self, f):
        """Alignment templates and fallback glyphs from the separately written letters of the train lines of fold f."""
        if f not in self._templates:
            tr, _ = self.fold(f)
            occ, st = segment(self.pages, self.man, lines=tr)
            glyphs = build(occ, 3)[0] if occ else {}
            self._templates[f] = (glyphs, Templates(glyphs) if glyphs else None, st)
        return self._templates[f]

    def train(self, f, merge=True, max_variants=None, max_cost=None, narrow=None, links=False):
        key = H.train_key(f, merge, max_variants, max_cost, narrow, links)
        fn = os.path.join(self.cache, key + '.json')
        if os.path.exists(fn):
            return json.load(open(fn, encoding='utf-8'))
        tr, _ = self.fold(f)
        strict, T, _ = self.templates(f)
        if (f, merge) not in self._occ:           # the alignment is the slow part; conditions differ only after it
            sc, xh_pt = self.scale(tr)
            self._occ[(f, merge)] = (*segment(self.pages, self.man, T, sc, H.LIMIT, lines=tr, merge=merge), sc, xh_pt)
        occ, st, sc, xh_pt = self._occ[(f, merge)]
        glyphs, rep = build(occ, max_variants, max_cost, **({'narrow': narrow} if narrow is not None else {}), links=links)
        lay = measure(self.pages, H.sub_manifest(self.man, tr), xh_pt)
        lay['letter_spacing'] = rep['letter_spacing']
        res = {'glyphs': glyphs, 'layout': lay, 'sc': sc, 'xh_pt': xh_pt, 'fallback': strict,
               'words_aligned': st['words_ok'], 'words': st['words']}
        os.makedirs(self.cache, exist_ok=True)
        json.dump(res, open(fn, 'w', encoding='utf-8'), ensure_ascii=False)
        return res


def separable_share(wid, lines):
    """Share of words whose letters are written separately (strict segmentation succeeds) - how print-like a writer is."""
    try:
        w = IAMWriter(wid, lines)
        _, st = segment(w.pages, w.man)
        return wid, st['words_ok'] / max(st['words'], 1), st['words_ok']
    except Exception:          # noqa: BLE001 - a broken file excludes the writer, it does not stop the survey
        return wid, 0.0, 0
