# Realism experiments

How close is penclone's writing to the writer's own hand, and which changes bring it closer? The paper with the method and
the results is [docs/paper/realism.md](../docs/paper/realism.md).

## Protocol in short

- **Held-out sentences.** Sample sheet v2 has 34 sentences. Fold 0 tests on the even lines, fold 1 on the odd lines. Glyphs
  and measured habits are built from the *other* fold only, and penclone writes the test sentences. The result is compared
  with the writer's real test lines, never with the lines the glyphs were cut from.
- **Same code for both sides.** Line assignment, word split, template alignment, every measurement and the word images are
  produced by the same functions for real and generated writing. Sheet v1 (the alphabet sheet, recorded separately) provides
  the alignment templates for both.
- **Human reference.** The writer's train lines compared with the test lines: same hand, other sentences.
- **Repetitions.** 2 folds × 5 seeds per condition. Each condition uses the same seeds, so conditions can be compared run by run.

## Measures

| Measure | What it shows | Ideal |
|---|---|---|
| HWD | Handwriting Distance (Pippi et al., BMVC 2023): distance of the mean VGG-16 handwriting features of the word images | the human reference |
| C2ST words / letters | classifier two-sample test (Lopez-Paz & Oquab, ICLR 2017): cross-validated accuracy of a classifier that separates generated from real words (HWD features) or letters (shape rasters) | 0.5 |
| twins | share of letters with a near-identical twin of the same character in the same text; the threshold comes from the writer's train letters | the writer's own rate |
| clearance W1 | Wasserstein distance between the distributions of white between neighbouring letters (x-heights) | the human reference |
| pen lifts / letter, join rate | how often the pen leaves the paper; how often two letters are written in one stroke | the writer's own values |
| size / width CV | variation of the height / width of the same letter | the writer's own values |

## Run it

The HWD reference implementation needs PyTorch, which is kept in its own environment outside the repository:

```bash
git clone https://github.com/aimagelab/HWD ~/Projekte/hwd-eval/HWD
python3 -m venv ~/Projekte/hwd-eval/venv
~/Projekte/hwd-eval/venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision
~/Projekte/hwd-eval/venv/bin/pip install torchmetrics scikit-learn opencv-python-headless tqdm transformers tiktoken \
    protobuf msgpack editdistance scipy pillow six matplotlib
~/Projekte/hwd-eval/venv/bin/pip install --no-deps -e ~/Projekte/hwd-eval/HWD

python3 research/run_experiments.py PROFILE            # about 20 minutes on 6 CPU cores
python3 research/report.py research/results/PROFILE.json
```

Word images and intermediate glyph sets go to `~/.cache/penclone-research` (`PENCLONE_RESEARCH_CACHE`). The results file
holds numbers only: no strokes, no images, nothing that shows the handwriting.
