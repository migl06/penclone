# Writing like the writer: a held-out evaluation of glyph-based handwriting synthesis

*penclone research note 1 · November 2026 · code and raw numbers: [`research/`](../../research/)*

## Zusammenfassung (deutsch)

<!-- RESULTS:SUMMARY_DE -->

## Abstract

<!-- RESULTS:ABSTRACT -->

## 1 Introduction

penclone writes text in a person's own print handwriting (letters written one by one, some joined; cursive is out of
scope) from strokes they recorded on a tablet. It is a glyph-based
(concatenative) synthesiser: the writer's letters are cut out of sample sentences, varied slightly and set one after the
other. The goal is writing that is indistinguishable from the writer's own hand, including when it lies next to a page the
person really wrote.

That last condition is the hard one. In the largest perceptual study of glyph-based synthesis, Haines et al. [1] showed
170 people sentences that were either real or synthesised. When glyphs were simply chosen at random ("random selection"),
people spotted 60.7 % of sentences viewed on their own as fake, but 74.1 % when a real sentence by the same writer was shown
next to them. With learned spacing, ligatures and texture, these dropped to 53.8 % and 52.4 %, close to chance. Random
choice of glyphs is convincing in isolation and fails in a side-by-side comparison. What it gets wrong is the writer's
*habits*: how far apart letters stand, where they are joined, how often the same shape comes back.

This note asks which of these habits matter for penclone, measured rather than guessed. We (1) build an evaluation that
compares penclone's output with the writer's own held-out sentences, using the same code for both sides, (2) find and fix
defects that the evaluation exposes, and (3) quantify each change in an ablation, for the writer the system was built for
and for further writers from a public database.

## 2 Related work

**Glyph-based synthesis.** Guyon [2] concatenated handwritten glyphs. Lin and Wan [3] sampled glyphs from a user's
samples, varied their shape, aligned them on the baseline with "proper horizontal inter-character space and vertical offset",
trimmed letter heads and tails and connected neighbouring letters "by polynomial interpolation". Wang et al. [4] split
letters into head, body and tail and model the ligatures between them. Haines et al. [1] select glyphs by dynamic
programming with learned costs for character choice, spacing and ligatures. Their vertical offset between two joined
glyphs is drawn so that the ligature end points meet (their Eq. 7), and a regression forest predicts the spacing when no
ligature exists. They name joined-up writing the easiest case and print or partly joined writing the hardest, because the
pen leaves the paper there and the gap has to be inferred.

**Learned generators.** Sequence models [5] and, more recently, transformer and diffusion models for styled handwritten
text generation write in a style given by a few examples. They are evaluated with image statistics. FID was found
unsuitable for text images, and the Handwriting Distance (HWD) [6] compares sets of word images in the feature space of a
network trained on 10,400 synthetic handwriting fonts. It is stable with few samples, which matters for a single writer.
Sentence-level work points at the boundaries between characters: CASHG [7] adds connectivity and spacing metrics because
"even minor boundary artifacts (e.g., spacing or unintended stroke breaks) become salient in long sentences".

**Variation.** Within-writer variation consists of allograph choice and motor noise [8]. Perturbing the parameters of the
sigma-lognormal model of handwriting movements by about ±15 % gives human-like variants of a word [9]. That needs pen
timing, which penclone's PDF exports do not have.

**Two-sample tests.** A classifier two-sample test (C2ST) [10] trains a classifier to separate two samples. Its held-out
accuracy stays at chance when the samples come from the same distribution, which makes it a direct, interpretable
measure of how far generated data is from real data.

## 3 System

penclone records the writer on two sheets. Sheet v1 is an alphabet: every character written three times, separately.
Sheet v2 has 34 German sentences. Strokes come as vectors from the iPad's PDF export (no timing, constant pen width). For
sheet v2, each word's strokes are cut into small pieces where the pen touches the baseline or turns sharply. Dynamic
programming then groups consecutive pieces into exactly one group per character, at the lowest shape cost against the
sheet-v1 templates. A word is accepted if no character costs more than 0.9.

The renderer chooses a variant per character, never the same variant twice in a row, preferring variants from the same
position in a word. It varies size and rotation in a damped random walk, adds small affine and sinusoidal deformations,
and places each letter so that its ink keeps a fixed minimum clearance from the previous letter. Word gaps, baseline
offset, line slope and a slow baseline drift (an Ornstein-Uhlenbeck process fitted to the variogram of the writer's
baselines) were already measured from the writer's sentences.

## 4 What we changed

The evaluation in §6 exposed one defect and three missing habits. Each change is a switch, so that it can be measured alone.

| | change | why |
|---|---|---|
| I1 | **Rejoin pieces.** Pieces of one pen stroke that end up in the same character are joined again. | Alignment cut strokes into pieces and never put them back together, so a letter written in one movement became several strokes. |
| I2 | **Every occurrence a variant.** All aligned occurrences that pass the outlier checks are used, not 8 per character chosen by farthest-point sampling. | Farthest-point sampling picks the most *different* shapes, so it over-represents unusual ones, and 8 variants repeat visibly on a page. |
| I3 | **Measured letter spacing.** The clearance between neighbouring letters is drawn from the writer's own distribution instead of a fixed minimum. | It is the same quantity the renderer uses: the smallest horizontal distance between the centre lines of two letters over bands of equal height, measured on non-joined letter pairs. |
| I4 | **Joins like the writer.** A stroke that runs from one letter into the next is stored as a join. When the previous letter's variant ends in a join, the next letter is chosen among variants that start with one, preferring entries at the same height. The two strokes are merged, their ends bent towards each other over 0.4 x-heights with a raised-cosine weight. Joins that would bridge more than 0.15 em vertically are not made. | The writer joins 7 % of letter pairs. Without joins, these pairs show a pen lift and the stubs of the cut strokes. |
| I5 | **Constant pen width.** Per-letter (±4.5 %) and per-word (±7 %) width variation is switched off. | The writer's pen in the notes app has constant width, and a real ballpoint does not change width from letter to letter. |
| I6 | **Leave out uncertain cuts.** Occurrences with an alignment cost above 0.6 are not used as variants. Characters with fewer than 3 remaining variants also get the sheet-v1 glyphs. | Inspection showed wrong cuts among accepted words, e.g. *i* with parts of the next letter, *E* without its bars. |

## 5 Data

**Writer A.** The writer the system was built for (German, print-like handwriting with occasional joins), 34 sentences
written on an iPad, 335 words. The alignment accepts 159 of them (47 %) with 670 characters.

**IAM-OnDB writers.** The IAM On-Line Handwriting Database [11] holds English text lines written on a whiteboard by 197
writers (median 55 lines). The pipeline cannot segment fully joined cursive yet, so we take the writers with the most
words written in separate letters and at least 40 lines. Lines are straightened and scaled to the x-height of writer A.
IAM writers have no alphabet sheet, so alignment templates and fallback glyphs come from the separately written letters of
their own training lines.

## 6 Evaluation protocol

**Held-out sentences.** The sentences are split into two folds (even and odd lines). For each fold, glyphs and every
measured habit are built from the other fold only. penclone then writes this fold's sentences, and the result is compared
with the writer's real lines for the same sentences. Using the lines that the glyphs came from as the reference would
reward copying.

**Same code for both sides.** Real and generated lines go through the same line assignment, word split, template
alignment, measurements and rasterisation. Word images use a fixed window anchored at the local baseline (2.2 x-heights
above, 1.0 below, 10 px per x-height) and the same pen width for both sides. Relative width changes of generated strokes are
kept, so I5 remains visible.

**Measures.**
- *HWD* [6] between generated and real test words (reference implementation, VGG-16 backbone). 95 % confidence intervals
  come from bootstrapping words.
- *C2ST* [10] on words (logistic regression on HWD features) and on letters (logistic regression on blurred 24×24 ink
  rasters, balanced per character). We report 5-fold cross-validated accuracy, where 0.5 means indistinguishable.
- *Twins*: share of letters that have a near-identical letter of the same character in the same text. The threshold per
  character is the 5th percentile of nearest-neighbour distances among the writer's *training* letters, and all sets are
  subsampled to equal counts, so no test set sets its own threshold.
- *Clearance W1*: Wasserstein distance between the distributions of letter clearance (in x-heights) of generated and real
  test lines.
- Habits measured in both: pen lifts per letter, join rate, size and width variation of the same letter (coefficient of
  variation), baseline spread, word gap.

**Human reference.** The writer's training lines against the test lines (same hand, other sentences) give the value that
real writing reaches. For HWD and word C2ST this reference compares *different* sentences, while generated and real test
words share the same sentences. The reference is therefore conservative, and real writing of the same sentences would score
at least as well.

**Repetitions and statistics.** 2 folds × 5 seeds per condition for writer A. All conditions use the same seeds, so they
are compared run by run: mean paired difference, 95 % bootstrap CI and Wilcoxon signed-rank test. For IAM, one version per
fold and writer, and conditions are compared across writers.

## 7 Results

<!-- RESULTS:TABLES -->

## 8 Discussion

<!-- RESULTS:DISCUSSION -->

## 9 Limitations

<!-- RESULTS:LIMITATIONS -->

## 10 Reproducing

```bash
python3 research/run_experiments.py PROFILE      # writer A: ~25 min on 6 CPU cores
python3 research/run_iam.py --writers 12         # IAM-OnDB writers
python3 research/report.py research/results/PROFILE.json
```

Setup of the HWD environment: [research/README.md](../../research/README.md). The result files hold numbers only.

## References

1. T. Haines, O. Mac Aodha, G. Brostow. *My Text in Your Handwriting.* ACM Transactions on Graphics 35(3), 2016. doi:10.1145/2886099
2. I. Guyon. *Handwriting synthesis from handwritten glyphs.* Proc. 5th Int. Workshop on Frontiers of Handwriting Recognition, 1996.
3. Z. Lin, L. Wan. *Style-preserving English handwriting synthesis.* Pattern Recognition 40, 2097–2109, 2007. doi:10.1016/j.patcog.2006.11.024
4. J. Wang, C. Wu, Y.-Q. Xu, H.-Y. Shum, L. Ji. *Learning-based cursive handwriting synthesis.* Proc. 8th Int. Workshop on Frontiers in Handwriting Recognition (IWFHR), 2002.
5. A. Graves. *Generating sequences with recurrent neural networks.* arXiv:1308.0850, 2013.
6. V. Pippi, F. Quattrini, S. Cascianelli, R. Cucchiara. *HWD: A Novel Evaluation Score for Styled Handwritten Text Generation.* BMVC 2023. arXiv:2310.20316
7. J. Shin, S. Hong, J. Bak. *CASHG: Context-Aware Stylized Online Handwriting Generation.* arXiv:2604.02103, 2026.
8. L. Schomaker. Lecture on within-writer variability, 7th Conference of the International Graphonomics Society, 1995. https://www.ai.rug.nl/~lambert/papers/igs7-1995-TR-lecture.pdf
9. A. Martín-Albo, R. Plamondon, E. Vidal. *Training of on-line handwriting text recognizers with synthetic text generated using the kinematic theory of rapid human movements.* ICFHR 2014.
10. D. Lopez-Paz, M. Oquab. *Revisiting Classifier Two-Sample Tests.* ICLR 2017. arXiv:1610.06545
11. M. Liwicki, H. Bunke. *IAM-OnDB – an on-line English sentence database acquired from handwritten text on a whiteboard.* ICDAR 2005.
