# Writing like the writer: a held-out evaluation of glyph-based handwriting synthesis

*penclone research note 1 · November 2026 · code and raw numbers: [`research/`](../../research/)*

## Zusammenfassung (deutsch)

penclone schreibt Text in der eigenen Druckschrift einer Person. Wir messen, wie nah das Ergebnis an der echten Handschrift
liegt, indem penclone Sätze schreibt, die beim Bau der Buchstaben nicht benutzt wurden, und das Ergebnis mit den echten
Zeilen derselben Sätze vergleicht. Die Bewertung deckte einen Fehler auf (ein Buchstabenblatt mit zu ordentlichen Buchstaben)
und mehrere fehlende Gewohnheiten, vor allem den gemessenen Abstand zwischen Buchstaben. Mit den Änderungen sank der
Abstand zur echten Hand (HWD) für die Schreiberin bzw. den Schreiber, für den das System gebaut wurde, von 1,53 auf 0,32,
und ein Klassifikator erkennt erzeugte Wörter nur noch in 54 % der Fälle (vorher 88 %; 50 % wäre Zufall). Bei 12 weiteren
Schreibern einer öffentlichen Datenbank gilt dieselbe Reihenfolge der Effekte, der Rest-Abstand ist aber größer (HWD 0,50
gegen 0,34; Klassifikator 58 %). Es bleibt ein Unterschied: Der Schreiber selbst nannte nach einem Paartest Fehlerklassen ( sich überschneidende Buchstaben, unpassende Abstände, falsche Satzzeichen, falsche Buchstaben, Reste von
abgebrochenen Strichen). Die Bildmaße erfassen diese lokalen Fehler nicht.


## Abstract

We evaluate a glyph-based handwriting synthesiser (penclone) against the writer's own held-out sentences, with identical
code for real and generated lines. The evaluation exposed one defect (neat alphabet-sheet letters) and three missing habits.
Measured letter spacing is the largest single effect (HWD −0.57 for the writer the system was built for, −0.80 across 12
IAM-OnDB writers), followed by glyph material (every occurrence instead of 8 variants, unsqueezed glyphs). Overall, HWD fell
from 1.53 to 0.32 and the word-level classifier accuracy from 0.88 to 0.54 for the main writer. For the IAM writers, the
ordering of the effects holds but the remaining gap is larger (HWD 0.50 against 0.34, classifier 0.58). Joins and
centre-line word gaps remove defects that the image measures do not see. More variation per use lowers repetition of
identical letters towards the writer's own rate, at a cost in HWD. Generated writing remains distinguishable by a
classifier. In a first informal test the writer named local defects that give the generated lines away (overlapping
letters, wrong punctuation, wrong letters, stubs, cut-off words). The image measures do not capture them.


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

### 7.1 Writer A

Table 1 lists every condition (mean over 2 folds × 5 seeds), Table 2 the paired differences that matter. *CER ratio* is the
character error rate of TrOCR on the generated test words divided by its error rate on the writer's real test words
(seed 1, both folds; §7.3).

**Table 1.** Writer A, held-out sentences. Reference row: the writer's own training lines against the test lines.

| | condition | HWD ↓ | C2ST words | C2ST letters | twins | spacing W1 ↓ | pen lifts / letter | join rate | word gap | CER ratio |
|---|---|---|---|---|---|---|---|---|---|---|
| | **writer A (reference)** | **0.423** | **0.47** | **0.49** | **0.10** | **0.029** | **1.31** | **0.079** | **1.43** | **1.00** |
| A0 | alphabet sheet, 3 variants (previous default) | 1.530 | 0.88 | 0.65 | 0.69 | 0.185 | 1.38 | 0.037 | 1.55 | 0.34 |
| A1 | sentence glyphs, 8 variants, cut pieces | 1.152 | 0.77 | 0.56 | 0.29 | 0.184 | 2.28 | 0.049 | 1.55 | |
| A2 | + I1 pieces rejoined | 1.172 | 0.77 | 0.57 | 0.29 | 0.169 | 1.35 | 0.097 | 1.55 | |
| A3 | + I2 every occurrence | 0.994 | 0.74 | 0.55 | 0.21 | 0.162 | 1.36 | 0.088 | 1.55 | |
| A4 | + I3 measured spacing | 0.420 | 0.58 | 0.54 | 0.19 | 0.040 | 1.36 | 0.071 | 1.56 | |
| A5 | + I4 joins | 0.437 | 0.58 | 0.54 | 0.19 | 0.037 | 1.32 | 0.093 | 1.56 | |
| A6 | + I5 constant pen width | 0.432 | 0.59 | 0.55 | 0.20 | 0.037 | 1.32 | 0.097 | 1.55 | 0.91 |
| A7 | + I6 uncertain cuts left out | 0.437 | 0.59 | 0.58 | 0.34 | 0.039 | 1.34 | 0.051 | 1.56 | |
| L1 | A6 without I2 (8 variants) | 0.603 | 0.63 | 0.57 | 0.34 | 0.042 | 1.32 | 0.086 | 1.55 | |
| L2 | A6 without I3 (fixed spacing) | 1.054 | 0.76 | 0.53 | 0.20 | 0.164 | 1.32 | 0.117 | 1.55 | |
| L3 | A6 without I4 (no joins) | 0.409 | 0.59 | 0.54 | 0.17 | 0.039 | 1.36 | 0.071 | 1.55 | |
| L4 | A6 without I1 (cut pieces, no joins) | 0.431 | 0.60 | 0.54 | 0.19 | 0.065 | 2.31 | 0.049 | 1.56 | |
| B1 | A6 + deck | 0.414 | 0.59 | 0.54 | 0.16 | 0.044 | 1.33 | 0.108 | 1.55 | |
| B2 | A6 + continuation | 0.410 | 0.57 | 0.54 | 0.23 | 0.030 | 1.32 | 0.100 | 1.55 | |
| B3 | A6 + glyphs not squeezed | 0.331 | 0.57 | 0.53 | 0.19 | 0.035 | 1.32 | 0.075 | 1.55 | |
| B4 | A6 + centre-line word gaps | 0.433 | 0.60 | 0.55 | 0.19 | 0.038 | 1.32 | 0.107 | 1.43 | |
| B5 | A6 + 1.5 × variation per use | 0.430 | 0.59 | 0.54 | 0.14 | 0.038 | 1.32 | 0.101 | 1.55 | |
| B6 | A6 + B1–B4 | 0.316 | 0.54 | 0.52 | 0.17 | 0.038 | 1.33 | 0.067 | 1.43 | 1.00 |
| B7 | B6 without joins | 0.319 | 0.54 | 0.52 | 0.17 | 0.035 | 1.36 | 0.055 | 1.45 | |
| B8 | B6 + 1.5 × variation per use | 0.321 | 0.55 | 0.53 | 0.14 | 0.036 | 1.33 | 0.078 | 1.44 | 1.00 |
| B9 | B6 + 2 × variation per use | 0.333 | 0.56 | 0.52 | 0.09 | 0.036 | 1.33 | 0.087 | 1.44 | 1.01 |

**Table 2.** Paired differences (10 pairs: same fold and seed), mean with 95 % bootstrap CI; Wilcoxon signed-rank p. With
10 pairs the smallest possible p is 0.002.

| comparison | HWD | C2ST words | C2ST letters | twins |
|---|---|---|---|---|
| A0 → A1 sentence glyphs instead of alphabet sheet | −0.378 [−0.409, −0.344] p=0.002 | −0.111 p=0.002 | −0.095 p=0.002 | −0.398 p=0.002 |
| A1 → A2 pieces rejoined | +0.020 [+0.014, +0.027] p=0.002 | +0.004 p=0.23 | +0.009 p=0.28 | −0.001 p=0.87 |
| A2 → A3 every occurrence | −0.179 [−0.198, −0.162] p=0.002 | −0.037 p=0.002 | −0.018 p=0.004 | −0.087 p=0.002 |
| A3 → A4 measured spacing | −0.573 [−0.607, −0.539] p=0.002 | −0.152 p=0.002 | −0.007 p=0.32 | −0.020 p=0.23 |
| A4 → A5 joins | +0.017 [+0.005, +0.029] p=0.049 | −0.003 p=0.77 | −0.002 p=0.77 | −0.000 p=1.00 |
| A6 → A7 uncertain cuts left out | +0.005 [−0.035, +0.047] p=0.77 | +0.002 p=0.70 | +0.025 p=0.004 | +0.141 p=0.002 |
| A6 → B1 deck | −0.019 [−0.039, +0.002] p=0.16 | −0.002 p=0.77 | −0.014 p=0.19 | −0.040 p=0.010 |
| A6 → B2 continuation | −0.022 [−0.036, −0.007] p=0.037 | −0.013 p=0.38 | −0.014 p=0.064 | +0.029 p=0.23 |
| A6 → B3 glyphs not squeezed | −0.101 [−0.150, −0.057] p=0.002 | −0.013 p=0.28 | −0.025 p=0.084 | −0.011 p=0.92 |
| A6 → B5 1.5 × variation | −0.002 [−0.008, +0.003] p=0.56 | +0.004 p=0.70 | −0.016 p=0.027 | −0.054 p=0.004 |
| A6 → B6 B1–B4 together | −0.116 [−0.165, −0.065] p=0.004 | −0.048 p=0.006 | −0.031 p=0.006 | −0.027 p=0.16 |
| B6 → B8 1.5 × variation | +0.004 [−0.002, +0.011] p=0.38 | +0.013 p=0.23 | +0.004 p=0.38 | −0.034 p=0.064 |
| B6 → B9 2 × variation | +0.016 [+0.006, +0.028] p=0.020 | +0.016 p=0.19 | −0.003 p=0.56 | −0.075 p=0.002 |
| A0 → B6 overall | −1.214 [−1.238, −1.187] p=0.002 | −0.340 p=0.002 | −0.132 p=0.002 | −0.522 p=0.002 |

**What the previous default got wrong.** Generated with the alphabet-sheet glyphs (A0), a linear classifier told generated
from real words 88 % of the time. 69 % of the letters had a near-identical twin in the same text, against 10 % in the
writer's own sentences. The text was also three times *more* legible to a recogniser than the writer's real hand (CER ratio
0.34). Letters written one by one on an alphabet sheet are neater than letters in sentences, and that neatness is itself a
tell.

**What matters most.** Measured letter spacing is the largest single effect: −0.57 HWD when added (A3 → A4) and +0.62 when
removed again (L2). With a fixed minimum clearance, letters stood 0.25 x-heights apart (median), against the writer's 0.41.
The next largest effects come from the glyph material: sentence occurrences instead of alphabet letters (−0.38), every
occurrence instead of 8 farthest-point variants (−0.18; removing it again: +0.17 and +0.15 twins), and unsqueezed glyphs
(−0.10). The undocumented horizontal squeeze of 10 % in both glyph builders made every letter narrower than the writer's.

**Defects that the image measures do not see.** Rejoining cut pieces (I1) brings the pen lifts per letter from 2.28 to 1.35,
close to the writer's 1.31. In word images it is neutral (+0.02 HWD). It matters for editable ink output and for pen models
that taper stroke ends, where every cut would show as a pinch. Centre-line word gaps (B4) fix a systematic error of one pen
width per gap (1.55 → 1.43 x-heights, the writer's value), also without a measurable effect on the image measures.

**What does not help.** Joins (I4) do not improve any image measure, and A4 → A5 is even slightly worse (+0.017 HWD).
Leaving out uncertain cuts (I6) makes things worse: fewer variants mean more twins (+0.14), and the cuts it removes do not
measurably hurt legibility.

**Repetition against faithfulness.** Drawing variants with replacement gives about 1 − 1/e ≈ 63 % of the letters a sibling
from the same source when a text needs as many letters as there are variants. The deck (B1) and more variation per use
(B5, B8, B9) both lower the twin rate. Twice the variation (B9) reaches the writer's own rate (0.09 against 0.10) but costs
+0.016 HWD (p = 0.02). The best compromise depends on what the reader compares: repeated shapes on a page, or the overall
look of words.

**Legibility.** At equal sentences, TrOCR reads B6, B8 and B9 exactly as well as the writer's real hand (CER ratio 1.00–1.01).
The absolute error rates are high (63 % for real writing), because the recogniser was trained on English handwriting and
reads German words. More variation per use does not make the writing harder to read.

### 7.2 Further writers (IAM-OnDB)

Does the ordering found for writer A hold for other hands? 12 IAM-OnDB writers (Section 5) went through the same
protocol with the conditions that apply without an alphabet sheet. A0 and the ablations that need one (L1–L4, A7, B1, B2,
B4, B5) were not run. Table 3 gives the mean over writers, each writer being the mean of both folds. The reference row is
the writers' own training lines against their test lines. Its twin rate is the share of twins among the writers' real
letters.

**Table 3.** IAM-OnDB, 12 writers, mean ± SD over writers.

| condition | HWD | C2ST words | C2ST letters | twins | clearance W1 | pen lifts / letter | join rate |
|---|---|---|---|---|---|---|---|
| writers (reference) | 0.335 | 0.49 | 0.49 | 0.12 | 0.043 | 1.26 | 0.121 |
| A1 sentence glyphs, 8 variants, cut pieces | 1.637 ± 0.461 | 0.85 ± 0.04 | 0.58 ± 0.03 | 0.21 ± 0.03 | 0.391 ± 0.219 | 2.53 ± 0.17 | 0.018 ± 0.010 |
| A3 + every occurrence | 1.505 ± 0.497 | 0.82 ± 0.06 | 0.55 ± 0.03 | 0.17 ± 0.04 | 0.343 ± 0.202 | 1.37 ± 0.07 | 0.128 ± 0.030 |
| A4 + measured letter spacing | 0.703 ± 0.098 | 0.64 ± 0.03 | 0.55 ± 0.02 | 0.17 ± 0.04 | 0.061 ± 0.033 | 1.37 ± 0.07 | 0.087 ± 0.017 |
| A6 + constant pen width | 0.668 ± 0.103 | 0.64 ± 0.02 | 0.55 ± 0.03 | 0.17 ± 0.03 | 0.062 ± 0.034 | 1.33 ± 0.06 | 0.115 ± 0.036 |
| B3 A6 + glyphs not squeezed | 0.552 ± 0.101 | 0.60 ± 0.02 | 0.53 ± 0.03 | 0.16 ± 0.05 | 0.062 ± 0.033 | 1.33 ± 0.06 | 0.097 ± 0.024 |
| B6 A6 + B1–B4 | 0.503 ± 0.093 | 0.58 ± 0.02 | 0.53 ± 0.03 | 0.13 ± 0.04 | 0.060 ± 0.031 | 1.33 ± 0.06 | 0.093 ± 0.023 |
| B8 B6 + 1.5 × variation | 0.527 ± 0.102 | 0.58 ± 0.03 | 0.54 ± 0.03 | 0.11 ± 0.03 | 0.058 ± 0.029 | 1.33 ± 0.06 | 0.093 ± 0.025 |
| B9 B6 + 2 × variation | 0.559 ± 0.111 | 0.60 ± 0.03 | 0.54 ± 0.02 | 0.08 ± 0.03 | 0.056 ± 0.026 | 1.33 ± 0.06 | 0.101 ± 0.021 |

**Table 4.** Paired differences over writers (n = 12), mean with 95 % bootstrap CI; Wilcoxon signed-rank p. With 12 pairs
the smallest possible p is 0.0005; "k/12" counts the writers for whom the value went down.

| comparison | HWD | C2ST words | C2ST letters | twins |
|---|---|---|---|---|
| A1 → A3 every occurrence | −0.132 [−0.167, −0.096] p<0.001 (12/12) | −0.033 p=0.001 (11/12) | −0.033 p=0.003 (10/12) | −0.041 p=0.009 (10/12) |
| A3 → A4 measured spacing | −0.802 [−1.069, −0.533] p<0.001 (12/12) | −0.184 p<0.001 (12/12) | +0.004 p=1.0 (7/12) | +0.002 p=0.85 (5/12) |
| A4 → A6 constant pen width | −0.035 [−0.045, −0.024] p<0.001 (12/12) | −0.001 p=1.0 (7/12) | −0.000 p=1.0 (6/12) | +0.001 p=0.85 (5/12) |
| A6 → B3 glyphs not squeezed | −0.116 [−0.141, −0.088] p<0.001 (12/12) | −0.036 p=0.001 (11/12) | −0.021 p=0.016 (10/12) | −0.016 p=0.20 (9/12) |
| A6 → B6 B1–B4 together | −0.166 [−0.203, −0.128] p<0.001 (12/12) | −0.059 p<0.001 (12/12) | −0.016 p=0.007 (10/12) | −0.038 p<0.001 (12/12) |
| B6 → B8 1.5 × variation | +0.024 [+0.016, +0.033] p<0.001 (0/12) | +0.004 p=0.30 (4/12) | +0.005 p=0.42 (4/12) | −0.025 p=0.042 (9/12) |
| B6 → B9 2 × variation | +0.056 [+0.042, +0.073] p<0.001 (0/12) | +0.021 p=0.016 (1/12) | +0.005 p=0.38 (4/12) | −0.049 p=0.001 (11/12) |
| A1 → B6 overall | −1.134 [−1.401, −0.875] p<0.001 (12/12) | −0.276 p<0.001 (12/12) | −0.045 p<0.001 (12/12) | −0.076 p<0.001 (12/12) |

**The ordering of the effects carries over.** Measured letter spacing is again the largest single effect (−0.80 HWD, lower
for all 12 writers), followed by unsqueezed glyphs (−0.12) and every occurrence instead of 8 variants (−0.13). The pen lifts
per letter fall from 2.53 to 1.37 as soon as cut pieces are rejoined, next to 1.26 for the writers. The effect sizes are
larger and vary more between writers than for writer A (SD of A1 HWD: 0.46). We did not test why. Candidate reasons are the smaller
training material per writer and the different degree of neatness between writers.

**The remaining gap is larger.** B6 reaches 0.503 HWD against 0.335 for the writers' own hand, and a linear classifier still
separates generated from real words in 58 % of the cases (writer A: 54 %). Word-level C2ST for the reference is 0.49 because
it compares two sets of real words. The gap is mostly in the word images, not in the habits: clearance (0.060 against 0.043),
pen lifts and twin rate (0.13 against 0.12) are close.

**More variation per use behaves as for writer A.** It lowers the twin rate towards the writers' (0.13 → 0.11 → 0.08 for B6,
B8, B9) and costs HWD for every writer (+0.024 and +0.056). B8 matches the reference twin rate (0.11 against 0.12) at a
small price, while B9 goes below it. This confirms the trade-off from Section 7.1 on a second population: how much
variation is right depends on whether repeated shapes or the overall look of words is compared.

**Joins.** The join rate of B6 (0.093) stays below the writers' 0.121. This run does not isolate joins (no L3 or B7
equivalent), so nothing is claimed about their effect on the image measures.

### 7.3 Legibility measurement

TrOCR (`microsoft/trocr-base-handwritten`, the recogniser of the HWD reference implementation) read each word image
rendered at 30 px per x-height. Comparison is case-insensitive and ignores accents and punctuation, because the recogniser
does not know German umlauts. The ratio to the writer's own error rate on the same sentences is the measure. The absolute
value describes the recogniser more than the writing.

### 7.4 Test with a human rater

20 held-out sentences, each shown twice in random order: the writer's real line and penclone's line, drawn by the same code
with the same pen width and scale, and with size and ink amount within a few percent between the two sides
(`research/blind_test.py`).

**Two tests were invalid.** The first two runs (condition B6 and condition C3, 20 of 20 correct in both) used a script
with an indexing error: in 16 of the 34 sentences the real line shown was another sentence than the generated one. These
results are not reported as evidence. The error was fixed (commit `6c81c23`), and the test was rebuilt and has to be
repeated.

Asked afterwards, the writer named these giveaways, and we found them in the generated lines:
1. Letters that overlap, and gaps that do not occur in the writer's hand.
2. Punctuation of the wrong size or position (commas that look like dots or sit at the wrong height).
3. Wrong letters, for example an *f* where a *t* belongs, a *2*-like shape in *zuletzt*, and *ß* missing in *Straße*.
4. Dots and stubs where the pen stopped in the original, put into the line as if they were part of the letter.
5. Words that end cut off (*Jahr* as *Jah*).

The word images of Section 6 hide all of these: at 10 px per x-height a stub or a comma is a few pixels, and the spacing
measure uses the median clearance, not its tail with overlaps. HWD and C2ST on word images are therefore necessary but not
sufficient. The next version needs measures for each defect class (share of overlapping letter pairs, stub count per line,
punctuation size and position against the writer's, letter recognition rate).

## 8 Discussion

**Habits beat randomness.** Most of the gain came from matching measured habits (spacing, glyph size, use of every
occurrence), not from adding noise. This agrees with Haines et al. [1], where learned spacing mattered more than the choice
of glyphs, and it held on a second population. A tool that measures the habit it claims to model also finds mistakes in its
own defaults: the undocumented 10 % squeeze and the fixed minimum clearance were invisible until compared with held-out
writing.

**A conservative reference.** For writer A, HWD of the generated lines (0.32) is lower than the writer's own training lines
against the test lines (0.42), because the reference compares different sentences. It is therefore not evidence that the
output is better than the real hand. The word-level classifier is the more honest measure, and it still tells generated from
real words in 54 % of the cases.

**Where the remaining difference probably lies.** The habits we measure (clearance, pen lifts, twin rate, word gaps) are
close to the writer's. What differs is something they do not capture, such as the shape of whole words, the relation between
neighbouring letters beyond clearance, and slow changes over a page. This is a hypothesis, not a measurement.

**The writer sees defects that the image measures do not.** After a first, invalid forced-choice test (Section 7.4), the
writer named local defects, and we found them in the generated lines. The classifier on word images separates generated
from real words in only 54 % of the cases, so the measures above describe the average habit, not these defects.

**What to do next.** (1) Fix the defect classes of Section 7.4 and add measures for them. (2) More raters, because one rater
who is also the writer is both the best and a biased judge. (3) Contextual choice of
variants: a letter's shape depends on its neighbours, and variants are now chosen mostly independently. (4) More writers with
their own sheets instead of IAM lines. (5) Cursive, which needs another segmentation.


## 9 Limitations

- **One human rater.** HWD, C2ST and TrOCR are models. There is no valid forced-choice result yet (Section 7.4), and the planned one has one rater, who is the writer.
- **One writer in depth.** Writer A is also the writer the system was built for, and the changes were found on this writer's
  data. The IAM replication uses a different protocol (no alphabet sheet) and writers selected for separate letters, which
  flatters the result.
- **Print only.** Fully joined cursive cannot be segmented.
- **Small samples.** Writer A has 34 sentences, of which 47 % are accepted by the alignment. 2 folds × 5 seeds give paired
  tests with 10 pairs.
- **Conservative and unconservative at once.** The human reference compares different sentences, so HWD and word C2ST of
  the reference are pessimistic. The generated side shares sentences with its test lines, which is optimistic for word
  measures.
- **Recogniser mismatch.** TrOCR was trained on English, and the writer is German, so absolute error rates (63 % for real
  writing) describe the recogniser; only ratios are used.
- **Not isolated on IAM.** L1–L4, A7, B1, B2, B4, B5 and B7 were not run on IAM, so the effect of joins, deck and centre-line
  gaps is shown only for writer A.


## 10 Reproducing

```bash
python3 research/run_experiments.py PROFILE      # writer A: ~25 min on 6 CPU cores
python3 research/run_iam.py --writers 12         # IAM-OnDB writers
python3 research/report.py research/results/PROFILE.json
python3 research/blind_test.py PROFILE           # blind test for people (page + separate key, outside the repository)
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
