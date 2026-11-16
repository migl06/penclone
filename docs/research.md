# Research: how to render text in someone's own handwriting (with German in mind)

Status: 2026-11-16. Each source states **how deeply it was read**: full text, slides, README, or only an abstract/summary.
Numbers are only taken from sources that were actually read. German version: [de/recherche.md](de/recherche.md).

## 1. Glyph-based synthesis: “My Text in Your Handwriting” (Haines, Mac Aodha, Brostow, ACM TOG 2016)

Read: **full text** (author version, [UCL Discovery](https://discovery.ucl.ac.uk/10075697/7/Brostow_My%20Text%20in%20Your%20Handwriting_AAM2.pdf),
[project page](https://reality.tf.fau.de/projects/haines/haines16handwriting.html), DOI 10.1145/2886099).

The closest work to penclone: real glyphs from a writing sample, recombined.

| Topic | What the paper does | What penclone takes |
|---|---|---|
| Writing sample | about 4 A4 pages, every other line, 10–30 min. **Full sentences**, chosen automatically to cover frequent letters *and letter pairs* (a Scrabble-like cost plus a pair term). Unfamiliar text makes writers hesitate, which changes the writing. | New sample from **German** sentences, chosen by German letter and pair frequency. |
| Position in word | Glyphs are tagged start / middle / end of word, because first and last letters are written differently (citing Srihari et al. 2002). | Position tag per glyph. |
| Number of variants | Substitutes (wrong position, lower case for upper case) are only allowed with **fewer than 8** exact matches. | Target 6–8 variants for frequent characters. |
| Glyph choice | Dynamic programming over the word; cost = glyph fits + neighbours fit (stroke width, joins). **Pairs that were adjacent in the sample cost 0**, so short words are often copied whole. Repetition is avoided by Gumbel noise on the costs (λ = 10 η). | Prefer pairs from the sample; replace “never the same variant twice” with soft costs. |
| Horizontal spacing | Uniform draw from the range of offsets the neighbouring glyphs had in the sample. | Learn spacing from real text instead of a pure minimum distance. |
| Height / baseline | **Kalman smoothing** along the line: each glyph wants to sit on the rule (weakly, σ = 1 line height), neighbours want the vertical offset from the sample. Text drifts away and returns (“arcs, as the hand pivots”). | Line model instead of an independent random walk per word. |
| Punctuation | Fixed height above the baseline, otherwise the model confuses comma and apostrophe. | Already done this way. |
| Pen | Ink texture is taken from the scan; the pen can be replaced (ballpoint, HB pencil, fountain pen, gel, marker). Tablet samples have **no texture** and look unnatural. For printing, inkjet beats laser. | Pen texture has to be synthesised because penclone's samples come from an iPad. |

## 2. Varying movement instead of shape: the sigma-lognormal model

Read: **slides** (Martín-Albo, Plamondon, Vidal, ICFHR 2014,
[PDF](https://iapr.org/archives/icfhr2014/wp-content/uploads/2015/02/ICFHR2014-Albo.pdf)).

- A stroke is decomposed into sub-movements with 6 parameters each (D, t₀, µ, σ, θ_start, θ_end); speed follows a lognormal curve.
- Human-like variation = **perturb µ and σ uniformly by ±15 %**, then integrate the velocity again.
- Requires **timestamps** per point. The PDF export has none, so this needs capture on the iPad (see [decisions.md](decisions.md)).

## 3. Line-level distortion: Varga & Bunke

Read: **abstracts/summaries only** ([IJPRAI 2004](https://worldscientific.com/doi/abs/10.1142/S0218001404003666),
[calibration by Cheng & Lopresti 2010](https://engineering.lehigh.edu/sites/engineering.lehigh.edu/files/_DEPARTMENTS/cse/research/tech-reports/2010/LU-CSE-10-003.pdf)).

- Whole text lines are distorted with **slowly varying functions** (“CosineWave” = concatenated cosine half-waves of random length):
  shear, scale, baseline and stroke width change gradually along the line.
- No concrete parameter ranges found. The idea fits gap B3 (no line level) exactly.

## 4. Pen and paper

- **Ballpoint:** Franke & Rose, “Ink-Deposition Model” (IWFHR 2004; read: summary only,
  [PDF](https://rdg.ext.hitachi.co.jp/iwfhr9/AfterWS/IWFHR9-Proceedings/docs/029_x_franke-Ink-Dep.pdf)). Ink amount depends on
  force and speed; with position, speed and force, traces were hard to tell from genuine ones. Ballpoint paste shows typical inner
  trace patterns (striations, skips).
- **Pencil:** Sousa & Buchanan, “Observational Models of Graphite Pencil Materials” (Computer Graphics Forum 2000; read: abstract
  only, [EG Digital Library](https://diglib.eg.org/handle/10.2312/8605)). Result depends on lead composition, **paper texture**
  and pressure → pencil = grey value × paper grain noise × pressure.
- **Estimating speed without timestamps:** the two-thirds power law of motor control (Lacquaniti et al. 1983: speed ∝ curvature^(−1/3),
  i.e. slower in curves) is a standard result; **not re-read here**. It lets us estimate from shape where the pen was slow (more ink)
  and fast (thinner, lighter).
- **iPad look:** [perfect-freehand](https://github.com/steveruizok/perfect-freehand) (read: README). Stroke width from simulated
  pressure (point spacing), options `thinning`, `smoothing`, `streamline`, `taper` – the look of note-taking apps.
- **German paper formats:** Lineatur 22 = 5 mm squares without margin, 26 = 5 mm squares with margin, 28 = squares with double
  margin, 27 = lined with double margin (9 mm line spacing according to one retailer; not double-checked), e.g.
  [familie.de](https://www.familie.de/testberichte/lineaturen-so-findet-ihr-das-richtige-heft-fuer-euer-schulkind--01GZRDJNST98W54VMBMP8X9VGQ).

## 5. What makes German special

| Point | Consequence | Source |
|---|---|---|
| Characters: ä ö ü ß Ä Ö Ü, „ “ ‚ ‘, » «, €, § | The German character set is a superset of English; English costs almost nothing extra afterwards. | – |
| **All nouns are capitalised** | Far more capitals than in English → upper/lower ratio (A3) and capital variants matter more. | – |
| Most frequent pairs: ER, EN, CH, DE, EI, ND, TE, IN, IE, GE (SS most frequent double letter) | These pairs belong in the sample several times; record “ch”, “ck”, “sch”, “tz”, “st” as units. | [Uni Wuppertal](https://ddi.uni-wuppertal.de/fileadmin/informatikdidaktik/OER/Spioncamp/buchstabenhaeufigkeit-station.pdf), [HU Berlin](https://www2.informatik.hu-berlin.de/Forschung_Lehre/algorithmenII/Lehre/WS2005-2006/Kryptologie_1/tabellen.pdf) |
| **Long compound words** | Hyphenation is mandatory. Liang's algorithm with TeX patterns (`de-1996` = reformed spelling). German patterns ≈ 81 KB (English ≈ 27 KB). | [Hyphenopoly](https://github.com/mnater/Hyphenopoly), [hyphen (npm)](https://github.com/ytiurin/hyphen) |
| Pangram with umlauts and ß | e.g. “Victor jagt zwölf Boxkämpfer quer über den großen Sylter Deich” as the first sentence of the sample. | – |

## 6. Fonts instead of an engine? (OpenType)

Read: tutorials/forum posts ([High-Logic](https://www.high-logic.com/font-editor/fontcreator/tutorials/creating-handwritten-fonts-with-contextual-alternates),
[Type Network](https://typenetwork.com/articles/opentype-at-work-contextual-alternates), [TypeDrawers](https://typedrawers.com/discussion/comment/67455)).

- Pseudo-randomness in fonts practically only works via **`calt`** (variants in a cycle 1-2-3-1-2-3); `rand` is barely supported.
- 2–3 variants already remove most visible repetition, but context often breaks at word boundaries, identical words look
  identical, and there is no drift or deformation.
- **Conclusion:** useful as an extra export (use your handwriting in Word/Pages/note apps), too rigid as the main path.

## 7. Spacing like type designers: HT Letterspacer

Read: project page/README ([GitHub](https://github.com/huertatipografica/HTLetterspacer)). Sets side bearings from the
**white area** next to a glyph (within a height band, with a depth limit), not from the closest point. Fits as a replacement for
penclone's pure minimum distance (A8).

## 8. Measure instead of guess

- **Legibility:** a German handwriting recogniser, e.g. [fhswf/TrOCR_german_handwritten](https://huggingface.co/fhswf/TrOCR_german_handwritten)
  (model card: 4.1 % character error rate on its test set). Recognise rendered lines → character error rate as a legibility score.
- **Style similarity:** HWD (Pippi et al., BMVC 2023, [arXiv](https://arxiv.org/abs/2310.20316), [code](https://github.com/aimagelab/hwd))
  compares real and generated handwriting in the feature space of a handwriting network; better than FID for this purpose.
- **Blind test:** show real and generated lines mixed and let people guess (this is how Haines validates as well).

## 9. Neural methods – why not (yet)

| Method | Problem for penclone |
|---|---|
| Graves RNN ([sjvasquez/handwriting-synthesis](https://github.com/sjvasquez/handwriting-synthesis)) | English character set without umlauts/ß; no German weights found. |
| VATr (Pippi et al., CVPR 2023, [paper](https://openaccess.thecvf.com/content/CVPR2023/papers/Pippi_Handwritten_Text_Generation_From_Visual_Archetypes_CVPR_2023_paper.pdf)) | Can generate rare characters via Unifont “archetypes” (interesting for umlauts), but outputs **pixel images** of words, trained on English data. |
| Diffusion models (DiffusionPen, DiffInk, …) | Pixel images or Chinese script, heavy compute, hard to fit into a page layout. |

For notes with tables, boxes and formulas, the glyph approach is the right choice. Neural models might later help to fill
**missing characters** in the writer's style.

## 10. CLI, MCP or skill?

Read: Anthropic blog [“Extending Claude's capabilities with skills and MCP servers”](https://claude.com/blog/extending-claude-capabilities-with-skills-mcp-servers).

- **Skill** = procedural knowledge (“how to do X”): instructions + scripts + templates, loaded on demand.
- **MCP** = access to external systems and live data (“the AI needs to reach X”). Good setups combine both.
- **Both are open, not Claude-only:** Agent Skills were published as an open standard on 2025-12-18
  ([agentskills.io](https://agentskills.io/)); reportedly used by Codex, GitHub Copilot, Cursor, Gemini CLI and others.
  MCP servers run in Claude, ChatGPT, Cursor, VS Code/Copilot, Zed and others
  ([overview](https://contextbolt.com/blog/ai-tools-mcp-support/); support varies per client, e.g. remote servers only or developer mode only).

Decision: see [decisions.md](decisions.md#2-cli-mcp-server-or-skill).

## 11. Editable digital ink

Read: search summaries and project pages only (not the formats' full specs).

| Target | Fact | Source |
|---|---|---|
| GoodNotes | Notebook format is not published; users ask Goodnotes for an open data format so that editable notes could be generated; community reverse-engineering attempts (2020) did not finish. → penclone cannot write editable GoodNotes ink. GoodNotes' lasso copies/pastes handwriting only between its own pages. | [Goodnotes feedback: open data format](https://feedback.goodnotes.com/forums/191274-customer-suggestions-for-goodnotes/suggestions/40953457-open-data-format-for-goodnotes), [Goodnotes support: lasso](https://support.goodnotes.com/hc/en-us/articles/10779441732111-Edit-and-reflow-handwriting-with-the-Lasso-tool) |
| Notability | `.note` was reverse engineered (binary plist) – shows it is possible per app, but each app needs its own work. | [Julia Evans 2018](https://jvns.ca/blog/2018/03/31/reverse-engineering-notability-format/) |
| InkML | W3C Recommendation (2011) for exchanging digital ink between applications; basic unit is the trace. | [W3C InkML](https://www.w3.org/TR/2011/REC-InkML-20110920/) |
| OneNote | Ink beta API (2017) returns and accepts ink as InkML (integer coordinates in himetric units). Status today not verified. | [Microsoft 365 dev blog](https://devblogs.microsoft.com/microsoft365dev/onenote-ink-beta-apis/) |
| Xournal++ | `.xopp` = gzip-compressed XML, essentially the Xournal `.xoj` format; strokes stay editable. | [xournalpp](https://github.com/xournalpp/xournalpp) |
| Excalidraw | Scenes are JSON; hand-drawn lines are `freedraw` elements with point lists, editable in the web app (also on iPad Safari). Not re-checked here. | [excalidraw](https://github.com/excalidraw/excalidraw) |

## 12. Public handwriting data for a first check of the rules (P5, stage 1)

Read: dataset pages and search summaries only (checked 2026-11-16). Licences and file formats must be re-checked on the
official pages before use. Data from these sets is never committed to this repository; only analysis scripts are, and everyone
downloads the data themselves.

| Dataset | Content | Terms (as found) | Use for penclone |
|---|---|---|---|
| [IAM On-Line Handwriting DB (IAM-OnDB)](https://fki.tic.heia-fr.ch/databases/iam-on-line-handwriting-database) | English lines, pen trajectories, many writers | Free for non-commercial research; registration required ([download](https://fki.tic.heia-fr.ch/databases/download-the-iam-on-line-handwriting-database)) | Statistics on baseline, x-height, dots from real strokes |
| [DeepWriting](https://www.github.com/emreaksan/deepwriting) (Aksan et al., CHI 2018) | 294 writers, 85,181 word instances, segmented, `.npz` | Built on IAM-OnDB: IAM registration and citation required; project-page licence not verified | Word- and character-level strokes without own segmentation |
| [CVL Database](https://cvl.tuwien.ac.at/research/cvl-databases/an-off-line-database-for-writer-retrieval-writer-identification-and-word-spotting/) | Scans (300 dpi), about 310 writers, 1 German and 6 English texts | Reported as CC BY-NC 3.0; full terms not verified | Only offline source with German text; images, so glyph cutting needed |
| [IAM Handwriting DB](https://fki.tic.heia-fr.ch/databases/iam-handwriting-database) | English text lines as images | Registration, non-commercial | Images only; no strokes |

Limits:

- These sets contain copied text, not sample sheets. They test the **size and position statistics** of the rules (R1–R4), not
  the sheet layout. R5 (confusable variants) needs several variants per character from the same writer, which the sets give only
  for frequent letters.
- Writers copy a given text; users of penclone write sentences for the sample sheet. Differences between the two are expected.
- Stage 1 (public data) shows whether the rules are plausible. Stage 2 (volunteers, `penclone validate`) is still needed because
  only it measures the actual input path of penclone.

### Stage 1 result (IAM-OnDB, 2026-11-16, `tools/iam_validate.py`)

144 of 197 writers had enough usable words (the numbers are per writer, all relative to the writer's own x-height; characters
are not aligned to strokes, so words with known tallest/lowest letters are used, see `pipeline/validate_stats.py`):

| Statistic | Writers | 5 % / median / 95 % | Compare |
|---|---|---|---|
| Ascender height / x-height | 144 | 1.31 / 1.58 / 2.06 | penclone author: 1.5–1.6 (consistent) |
| Capital height / x-height | 48 | 1.44 / 1.81 / 2.43 | penclone author: about 1.5 (at the short end; only 48 writers had enough words) |
| Lowest point below the baseline, 95th percentile, words without descender (in x-heights) | 144 | 0.18 / 0.27 / 0.43 | R3 tolerates about 0.14 (0.06 em at x-height 0.42 em) |

Reading: capital and ascender proportions of the first writer fall inside the range of IAM writers, so sample sheet v2 should not
be expected to hit a different range. The R3 tolerance is **narrower** than the overshoot of most IAM writers; but the measure
includes errors from word splitting and the baseline fit, and IAM is largely cursive, so this is **not yet evidence against R3** –
it shows that R3 must be checked with character-level data before it is applied to writers with joined letters (planned, P5).

## 13. Line habits measured from the writer's own sample

How the line model of the engine (P2) gets its numbers – evidence type 2 of the evidence policy. `pipeline/measure_layout.py`
reads the written sample sheet v2 (one known sentence per ruled line) and writes `layout.json` into the profile; the engine uses
it as its defaults. All lengths are in x-heights of the writer.

| Quantity | Method | Note |
|---|---|---|
| Word gap | white space between the ink of neighbouring words; words found by the k−1 widest gaps of a line with k words. A line counts only if every word of 3+ letters has a plausible width per letter (0.5–2× the line median). | ink to ink, the same way the engine places words |
| Baseline offset and slope | bottom of every character cluster (≥ ½ x-height; descenders dropped when > 0.3 x-heights below the median of the 9 nearest clusters), compared with the ruled line; straight-line fit per line | |
| Drift | residuals after the line fit, split into **jitter per letter** and a **slow drift** with an exponential variogram γ(h) = nugget + sill·(1 − e^(−h/range)) fitted to Matheron's estimator pooled over all lines | the exponential covariance is the one of an Ornstein-Uhlenbeck process (a random walk pulled back to the line, the continuous counterpart of the Kalman model in Haines et al.). The glyphs keep the jitter of the letters they were cut from, so the engine adds only the drift. |

First writer (migl06, 34 lines, x-height 2.33 mm): word gap median 1.45 (quartiles 1.22–1.81, 159 gaps from 19 lines); writing
sits 0.23 above the line; slope −0.10° ± 0.25°; jitter sd 0.14, drift sd 0.15 with a correlation length of 4.2 x-heights.

Limits: the sheet fixes where a line starts and how far apart lines are, so line start, line spacing and margins cannot be
measured from it and stay assumptions. A first version smoothed the baseline with the 9-cluster median before measuring the
correlation length; that length (≈ 6 x-heights) was the width of the smoothing window, not the writer's – hence the variogram.

Methods used, not re-read for this project (standard results): Liang's hyphenation algorithm (F. M. Liang, *Word Hy-phen-a-tion
by Com-put-er*, Stanford 1983) with the hyph-utf8 patterns `de-1996` (read: file header – MIT licence, version 2024-02-28,
36,709 patterns); Ramer–Douglas–Peucker line simplification (Ramer 1972; Douglas & Peucker 1973), tolerance 0.02 mm; the
Ornstein-Uhlenbeck process and Matheron's variogram estimator.
