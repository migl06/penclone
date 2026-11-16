# Known issues

Status: 2026-11-16. Found while building the first glyph library with sample sheet v1 and rendering full pages with it.
German version: [de/bekannte-probleme.md](de/bekannte-probleme.md).

## A. Glyph library (sample sheet v1)

| # | Problem | Cause | Status |
|---|---|---|---|
| A1 | Small marks (colon, i-dots) were only partly replaced by synthetic dots, giving mixed shapes – e.g. a colon that reads as “°”. | Replacement only below a fixed size (0.14 em). | **fixed** – rule R1 ([rules.md](rules.md)) |
| A2 | A capital whose first stroke overshoots below the baseline reads as a different letter (e.g. N as “V”); ! and ? sat at inconsistent heights. | Row baseline taken from the 97th percentile of the row. | **fixed** – R3, R4 |
| A3 | Capitals are hardly taller than ascenders, so pairs like K/k and I/l are hard to tell apart. | Upper and lower case are written in separate rows; their size ratio cannot be measured. | open – sample sheet v2 |
| A4 | Lower-case umlauts come out clearly larger than their base letters and read as capitals. | The umlaut row is only aligned across pages, not to the x-height. | **fixed** – R2 |
| A5 | Single letters can end up smaller than the x-height. | Same cause as A3. | open – sample sheet v2 |
| A6 | A variant can look like another letter (e.g. a k with a loop reads as h). | – | **fixed** – R5 (thresholds still an assumption) |
| A7 | Tiny pen-down strokes were turned into visible dots. | Dot replacement applied to every small stroke. | **fixed** – R1 |
| A8 | Uneven gaps inside words. | Spacing uses the minimum ink distance; the eye judges the white *area* between letters. | open – area-based spacing (HT Letterspacer) |

## B. Naturalness

1. **Few variants per character** (3 with sample sheet v1). Repetition shows in frequent letters. Haines et al. only allow
   substitutes below 8 exact matches → target 6–8 variants for frequent characters.
2. **Variants from alphabet rows, not words.** Letters in a row are written more carefully than in words, and first/last letters
   of a word are written differently (Srihari et al. 2002, cited by Haines). Glyphs carry no word position yet.
3. ~~**No line level.**~~ – **fixed** (P2): every line gets a slow baseline drift that returns to the line (Ornstein-Uhlenbeck
   process), a small slope and a slightly varying start; word gaps vary. All of these are **measured from the writer's own sample
   sheet v2** (`pipeline/measure_layout.py` → `layout.json` in the profile), see [research.md §13](research.md#13-line-habits-measured-from-the-writers-own-sample).
4. **Deformation without a motor basis.** Two sine waves bend all strokes of a glyph alike. Research varies the movement
   (sigma-lognormal, ±15 % on µ and σ), which needs timestamps that PDF exports do not contain.
5. **Strokes look digital** – *partly fixed* (P3): pens set colour, width and opacity; the iPad look varies the width along the
   stroke (simulated pressure, tapered ends); pencil grain in SVG. Still open: ink model for ballpoints (darker where slow), pencil
   grain in PDF, bold as retracing.
6. **Highlighter** – not built yet in the new engine.

## C. Engineering

1. ~~Page-specific row thresholds and a special case for swapped rows~~ – **fixed**: rows and their order are detected
   automatically (`pipeline/rows.py`).
2. ~~**The renderer depends on a host HTML page.**~~ – **fixed** (P2): `engine/` lays out text and writes SVG and PDF itself, in
   Node and in the browser, without DOM or dependencies (`penclone render`). The old injected renderer `engine/handwriting.js`
   is kept only for existing HTML pages.
3. ~~**One `<span>` + one `<svg>` per character**~~ – **fixed** (P2): one path per line and stroke width; strokes simplified to
   0.02 mm and written as straight segments. A test page of 14 lines: 55 KB PDF (before: several MB per page).
4. ~~**No hyphenation.**~~ – **fixed** (P2): Liang's algorithm with the TeX patterns `de-1996`. A word is split only if it would
   otherwise leave a large gap at the end of the line (6 x-heights, assumption) or does not fit on a line of its own.
5. ~~**One global random stream.**~~ – **fixed** (P2): every decision has its own stream keyed by what it decides (word text and
   occurrence, line); editing a word leaves the other lines unchanged (tested).
6. **Missing characters** – *partly fixed* (P2): typographic look-alikes (’ → ', — → –) and the base letter of accented letters
   (é → e) are used and reported; anything else is left out and reported instead of falling back to a font. The AI asks the user
   whether to write them on a small character sheet (`penclone sample-sheet --chars`), leave them out or replace them (P3). Still
   open: compose new characters from existing strokes.
7. **No measurement yet.** Parameters are set by eye; planned: OCR character error rate (legibility) and HWD (style similarity),
   see [research.md](research.md#8-measure-instead-of-guess).

## Roadmap

| Step | What | Result |
|---|---|---|
| **P0** ✓ | A1, A2, A4, A6, A7 as general rules R1–R5; automatic row detection | done |
| P1 | Sample sheet v2: given German sentences, mixed case, word positions; iPad capture page | fixes A3, A5, A8, B1, B2 at the root. **Done so far:** sheet generator, import and glyph build (`make_sheet.py`, `segment_v2.py`, `build_glyphs_v2.py`), tested with synthetic handwriting; **tested on one real sheet:** with a first glyph library as templates (`--templates`) 159 of 335 words aligned, lower-case letters mostly clean, i/Ä/ß still weak and the run takes ~100 s; **profile integration done** (`profiles.py add-sample`; `build` writes `glyphs-v2.json` next to the v1 glyphs; the new engine can use them with `--glyph-set v2|both`, default stays v1 until v2 is cleaner); **open:** iPad capture page, rules R3/R5 for v2, dot of the i, speed |
| **P2** ✓ | DOM-free engine: own layout + hyphenation, line model measured from the sample, per-position seeds, one path per line; `penclone render` | C2–C5, B3 fixed, C6 partly |
| **P3** ✓ | Paper (built-in + own scans), pens, iPad output; CLI, MCP server and skill; worksheet filling; character sheets | [decisions.md §14](decisions.md#14-paper-pens-worksheets-mcp-server-and-skill-p3); open: detect-fields, `--pages`, highlighter, ink model |
| P4 | Measure: OCR error rate, HWD, blind test | justify parameters, validate R5 |
| P5 | **Validate the general rules with other writers**, privacy-preserving: `penclone validate` computes only anonymous statistics (no strokes, no images) that volunteers post in an issue | tool + issue form done; collecting answers open |
| P6 | **Packaging and user guide**: one npm package (CLI + MCP server; pipeline ported to TypeScript or shipped via pipx so users need no manual Python setup) + end-user guide (EN/DE) | guide done; install from GitHub; open: npm release, Python without manual setup |
