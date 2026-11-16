"""Legibility: character error rate of a handwriting recogniser on word images (real and generated).

Runs in the torch environment (see research/README.md), with the TrOCR model used by the HWD reference implementation
(microsoft/trocr-base-handwritten, trained on English handwriting):
    <venv>/bin/python research/ocr_cer.py ROOT [--only PATTERN]

Every sub-folder of ROOT with a labels.json and no ocr.json gets an ocr.json: {cer, n, words: {file: prediction}}.
The recogniser is English, so absolute error rates on German text are high; what counts is the error rate of generated
words relative to the writer's real words of the same sentences.
"""
import argparse
import fnmatch
import json
import unicodedata
from pathlib import Path

import editdistance
import torch
from PIL import Image
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

MODEL = 'microsoft/trocr-base-handwritten'


def norm(t):
    """Compare letters only, case-insensitive, accents removed (the recogniser does not know German umlauts)."""
    t = unicodedata.normalize('NFD', t.lower())
    return ''.join(c for c in t if c.isalnum())


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('root')
    ap.add_argument('--only', default='*')
    a = ap.parse_args()
    todo = [d for d in sorted(Path(a.root).iterdir())
            if d.is_dir() and fnmatch.fnmatch(d.name, a.only) and (d / 'labels.json').exists() and not (d / 'ocr.json').exists()]
    if not todo:
        return
    torch.set_num_threads(max(1, torch.get_num_threads()))
    proc = TrOCRProcessor.from_pretrained(MODEL)
    model = VisionEncoderDecoderModel.from_pretrained(MODEL).eval()
    for d in todo:
        labels = json.load(open(d / 'labels.json', encoding='utf-8'))
        names = sorted(labels)
        preds = {}
        with torch.inference_mode():
            for i in range(0, len(names), 16):
                batch = names[i:i + 16]
                imgs = [Image.open(d / n).convert('RGB') for n in batch]
                ids = model.generate(proc(images=imgs, return_tensors='pt').pixel_values, max_new_tokens=24)
                for n, t in zip(batch, proc.batch_decode(ids, skip_special_tokens=True)):
                    preds[n] = t
        err = sum(editdistance.eval(norm(preds[n]), norm(labels[n])) for n in names)
        tot = sum(len(norm(labels[n])) for n in names)
        json.dump({'cer': err / max(tot, 1), 'n': len(names), 'chars': tot, 'words': preds},
                  open(d / 'ocr.json', 'w', encoding='utf-8'), ensure_ascii=False)
        print(d.name, round(err / max(tot, 1), 3), flush=True)


if __name__ == '__main__':
    main()
