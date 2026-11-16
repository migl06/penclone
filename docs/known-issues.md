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
3. **No line level.** Lines are perfectly straight and left-aligned; real writing drifts and returns (Haines: Kalman smoothing).
   The baseline random walk also restarts at every text node.
4. **Deformation without a motor basis.** Two sine waves bend all strokes of a glyph alike. Research varies the movement
   (sigma-lognormal, ±15 % on µ and σ), which needs timestamps that PDF exports do not contain.
5. **Strokes look digital.** Constant width; opacity varies per character instead of along the stroke; bold is a thicker line
   instead of retracing.
6. **Highlighter** is a rectangle with rounded corners instead of a marker stroke.

## C. Engineering

1. ~~Page-specific row thresholds and a special case for swapped rows~~ – **fixed**: rows and their order are detected
   automatically (`pipeline/rows.py`).
2. **The renderer depends on a host HTML page.** `engine/handwriting.js` is injected into a page that provides layout and a seeded
   random generator. A DOM-free renderer (SVG/PDF output) is needed for the CLI, the MCP server and worksheet filling.
3. **One `<span>` + one `<svg>` per character** → thousands of DOM nodes per page and large PDFs (several MB per page). Layout
   needs an overflow tolerance because ink extends beyond the character box.
4. **No hyphenation.** Words are unbreakable blocks; German compounds cause ragged lines or overflow.
5. **One global random stream.** Changing one word changes the look of everything after it. Better: a seed per position.
6. **Missing characters** fall back to a font, which breaks the style. Better: compose from existing glyphs.
7. **No measurement yet.** Parameters are set by eye; planned: OCR character error rate (legibility) and HWD (style similarity),
   see [research.md](research.md#8-measure-instead-of-guess).

## Roadmap

| Step | What | Result |
|---|---|---|
| **P0** ✓ | A1, A2, A4, A6, A7 as general rules R1–R5; automatic row detection | done |
| P1 | Sample sheet v2: given German sentences, mixed case, word positions; iPad capture page | fixes A3, A5, A8, B1, B2 at the root |
| P2 | DOM-free engine: own layout + hyphenation, line model, per-position seeds, one path per line | C2–C5, B3 |
| P3 | Paper, pens, iPad output; CLI, MCP server and skill; worksheet filling | see [decisions.md](decisions.md) |
| P4 | Measure: OCR error rate, HWD, blind test | justify parameters, validate R5 |
