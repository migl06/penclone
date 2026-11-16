"""Create sample sheet v2: German sentences to write by hand on ruled lines (PDF + manifest).

Usage:
    python3 make_sheet.py --out sheet.pdf            # also writes sheet.json next to it

Each block shows the sentence in small grey print and a ruled writing row below it. Write the sentence on the ruled
line in your normal handwriting and speed, on one line. penclone later knows which letter every stroke belongs to
(see segment_v2.py). The manifest (sheet.json) lists the text and the position of every writing line in pt.

The PDF is written by hand (standard Helvetica, WinAnsi) so no extra Python package is needed. Rules are drawn as thin
filled rectangles, not as stroked paths, so they are not mistaken for pen strokes in an exported PDF.
"""
import argparse
import json

from sentences_de import select

MM = 72 / 25.4
W, H = 595.28, 841.89
M = 20 * MM                      # page margin
HEADER = 38 * MM                 # extra space for the title on page 1
MODEL_H = 5.5 * MM               # grey model text
ROW_H = 12 * MM                  # writing row (baseline at its bottom)
GAP = 2 * MM
BLOCK = MODEL_H + ROW_H + GAP


def esc(s):
    return s.encode('cp1252', 'replace').decode('latin-1').replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def build(sentences, title='penclone sample sheet v2'):
    pages, manifest = [], {'sheet': 'sample-v2', 'lang': 'de', 'page_pt': [W, H], 'row_height_pt': ROW_H, 'lines': []}
    cur, y, first = None, 0, True

    def new_page(first):
        nonlocal cur, y
        cur = []
        pages.append(cur)
        y = M + (HEADER if first else 0)
        if first:
            cur.append(f'BT /F2 14 Tf {M:.1f} {H - M - 10:.1f} Td ({esc(title)}) Tj ET')
            tips = ['Write each sentence on the ruled line below it, in your normal handwriting and speed, with the pen',
                    'you want to imitate. Keep each sentence on one line (smaller is fine). Do not write over the grey text.',
                    'Cross out and rewrite a whole sentence if you slip. Stay inside the page margins. About 30 minutes in total.']
            for k, t in enumerate(tips):
                cur.append(f'BT /F1 8.5 Tf 0.25 g {M:.1f} {H - M - 26 - k * 11:.1f} Td ({esc(t)}) Tj ET 0 g')

    new_page(True)
    for text in sentences:
        if y + BLOCK > H - M:
            new_page(False)
        top = y
        base = top + MODEL_H + ROW_H            # from the page top, pt
        cur.append(f'BT /F1 9 Tf 0.45 g {M:.1f} {H - top - 8:.1f} Td ({esc(text)}) Tj ET 0 g')
        cur.append(f'0.6 g {M:.1f} {H - base - 0.3:.1f} {W - 2 * M:.1f} 0.6 re f 0 g')
        manifest['lines'].append({'page': len(pages), 'text': text, 'x0': round(M, 2), 'x1': round(W - M, 2),
                                  'baseline': round(base, 2), 'top': round(top + MODEL_H, 2)})
        y += BLOCK
    return pages, manifest


def pdf_bytes(pages):
    objs = []
    add = lambda b: objs.append(b) or len(objs)
    cat = add(b'')                                    # 1 catalog (filled later)
    pgs = add(b'')                                    # 2 pages
    f1 = add(b'<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>')
    f2 = add(b'<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>')
    kids = []
    for ops in pages:
        body = '\n'.join(ops).encode('latin-1')
        c = add(b'<</Length %d>>\nstream\n' % len(body) + body + b'\nendstream')
        p = add(f'<</Type/Page/Parent {pgs} 0 R/MediaBox[0 0 {W} {H}]/Contents {c} 0 R'
                f'/Resources<</Font<</F1 {f1} 0 R/F2 {f2} 0 R>>>>>>'.encode())
        kids.append(p)
    objs[cat - 1] = f'<</Type/Catalog/Pages {pgs} 0 R>>'.encode()
    objs[pgs - 1] = f'<</Type/Pages/Count {len(kids)}/Kids[{" ".join(f"{k} 0 R" for k in kids)}]>>'.encode()
    out, offs = bytearray(b'%PDF-1.4\n'), []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f'{i} 0 obj\n'.encode() + o + b'\nendobj\n'
    x = len(out)
    out += f'xref\n0 {len(objs) + 1}\n0000000000 65535 f \n'.encode()
    for o in offs:
        out += f'{o:010d} 00000 n \n'.encode()
    out += f'trailer\n<</Size {len(objs) + 1}/Root {cat} 0 R>>\nstartxref\n{x}\n%%EOF\n'.encode()
    return bytes(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--out', default='sheet.pdf')
    ap.add_argument('--lines', type=int, default=48, help='maximum number of sentences')
    a = ap.parse_args()
    sentences, have, need = select(lines=a.lines)
    pages, manifest = build(sentences)
    open(a.out, 'wb').write(pdf_bytes(pages))
    json.dump(manifest, open(a.out[:-4] + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{a.out}: {len(pages)} pages, {len(sentences)} sentences; manifest {a.out[:-4]}.json')


if __name__ == '__main__':
    main()
