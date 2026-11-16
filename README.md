# penclone

**Turn text into your own handwriting – rendered from your real pen strokes.**
German first (ä ö ü ß, „quotes“, hyphenation), English too. Planned as a CLI, an MCP server and an Agent Skill that can each do the
whole workflow.

[Deutsch](README.de.md)

penclone takes a few pages of your handwriting (vector strokes from an iPad / Apple Pencil), turns every character into a set of
glyph variants and writes new text with them. Unlike handwriting fonts, the same letter never looks exactly the same twice:
variants are picked at random, the baseline drifts, pressure changes, letters are spaced by their actual ink so they never touch,
and boxes and circles are drawn by hand.

Typical uses: study notes, letters and cards, mockups, a personal handwriting font.

> **Status: early.** Working today: glyph pipeline, handwriting profiles, quality report, a browser renderer that renders full
> pages. Planned: CLI, MCP server, skill, paper and pen styles, iPad output. Known problems and the plan:
> [docs/known-issues.md](docs/known-issues.md), [docs/decisions.md](docs/decisions.md).

## Built on research, not guesswork

Every feature and default comes from a cited source, from a measurement of your own samples, or is marked as an assumption
([evidence policy](docs/decisions.md#5-evidence-policy)). The facts behind the main features:

| Feature | Fact | Source |
|---|---|---|
| Several variants per letter, no visible repeats | People notice repeated glyphs; good synthesis draws glyph choices randomly and only falls back to substitutes when fewer than 8 exact samples exist. | Haines, Mac Aodha, Brostow: *My Text in Your Handwriting*, ACM TOG 2016 |
| Samples written as sentences, not alphabet rows | First and last letters of a word are written differently; unfamiliar text makes writers hesitate and changes the writing; sample text is chosen by letter and letter-pair frequency. | Haines et al. 2016 (citing Srihari et al. 2002) |
| Baseline drifts and comes back | Writers stay near the rule but drift in arcs as the hand pivots; modelled with Kalman smoothing along the line. | Haines et al. 2016 |
| Natural variation from movement | Human-like variants of a word: perturb the timing parameters µ and σ of the sigma-lognormal model by ±15 %. | Martín-Albo, Plamondon, Vidal, ICFHR 2014 |
| Ballpoint look | Ink deposit depends on pen force and speed; ballpoint paste shows typical inner-trace patterns. | Franke & Rose, Ink-Deposition Model, IWFHR 2004 |
| Pencil look | Result depends on lead composition, paper texture and pressure. | Sousa & Buchanan, Computer Graphics Forum 2000 |
| iPad look | Stroke width from simulated pressure (thinning, smoothing, taper). | perfect-freehand |
| German hyphenation | Liang's algorithm with TeX patterns (`de-1996`); German needs it more because of long compounds. | Hyphenopoly, hyphen |
| Most frequent German letter pairs covered in samples | ER, EN, CH, DE, EI, ND, TE, IN, IE, GE. | University of Wuppertal / HU Berlin tables |
| Spacing by white area | Type designers space letters by the white area next to them, not by the closest point. | HT Letterspacer |
| Measuring legibility and style | German handwriting recogniser (TrOCR, 4.1 % character error rate on its test set); HWD scores handwriting style better than FID. | fhswf/TrOCR_german_handwritten; Pippi et al., BMVC 2023 |
| Editable ink, not just PDFs | GoodNotes' format is undocumented, so its ink cannot be generated; InkML is a W3C standard for exchanging digital ink; Xournal++ and Excalidraw use open formats. | W3C InkML 2011; see research notes |

Full list with links and how deeply each source was read: [docs/research.md](docs/research.md).

## Handwriting profiles (working)

Your handwriting is saved under a name and reused. Profiles live **outside the repository**
(`~/.local/share/penclone/profiles/<name>/`), so they survive updates and re-downloads.

```bash
python3 pipeline/profiles.py create me --pdf my_samples.pdf --lang de     # import samples
python3 pipeline/profiles.py build me                                     # glyph library
python3 tools/glyph_report.py --profile me --sheet sheet.png              # quality report
python3 pipeline/profiles.py export me me.zip                             # backup / other computer
```

penclone improves through **more samples** (more variants, better proportions) and through **general rules** that are the same
for everyone and built into the pipeline ([docs/rules.md](docs/rules.md)) – e.g. marks stay as written, umlauts get the size of their
base letters, a variant that reads as another letter is skipped. Users cannot change these rules; personal overrides exist only
as a last resort and are normally empty. No neural network is trained.

**Teaching it your handwriting:** write the given sample sentences – not free text, not alphabet rows – normally and at normal
speed, about 2–4 pages ([why](docs/decisions.md#7-teaching-penclone-your-handwriting-guided-sentences)).

## Everything adjustable (planned)

| Option | Values |
|---|---|
| `--output` | `paper` (simulated pen on paper) · `ipad` (clean digital ink) |
| `--pen` | `ballpoint`, `pencil`, `fineliner`, `gel`, `fountain`, `highlighter` (iPad: `pen`, `pencil`, `highlighter`) |
| `--paper` | `blank`, `lined`, `squared`, `dotted`; German presets `lin22`, `lin26`, `lin27`, `lin28`; or your own scan/PDF |
| `--line-spacing`, `--grid`, `--margin`, `--page` | sizes in mm, page `a4`/`a5`/`letter`/custom |
| `--size` | x-height in mm, or `auto` = your own size relative to the line, measured from your samples |
| `--color`, `--width`, `--pages` | ink colour, stroke width, fit to N pages |
| `--format` | `pdf`, `svg`, `png`, and editable ink: `xopp` (Xournal++), `excalidraw`, `inkml` |

**Scanned pages and worksheets (planned):** the AI client (or you) says what goes where with a rough box; penclone measures the
space, fits your handwriting into it and reports if something does not fit
([why](docs/decisions.md#9-scanned-pages-and-worksheets-the-ai-says-what-goes-where-penclone-makes-it-fit)).

GoodNotes/Notability: import the PDF (or PNG lines) and write on top; the generated strokes themselves cannot be made editable
there because the format is closed ([details](docs/decisions.md#editable-on-the-ipad-goodnotes)).

## How it works

```
samples (iPad PDF) ──► profile ──pipeline/──► glyphs.json ──engine/──► HTML/SVG ──► PDF
```

1. **Extract** (`pipeline/svg_strokes.py`): every stroked path becomes a polyline.
2. **Segment** (`pipeline/rows.py`, `build_glyphs.py`): rows by vertical gaps, characters by overlapping x-ranges.
3. **Normalise and apply the general rules**: baseline, x-height, punctuation heights, smoothing, slant; rules R1–R5.
4. **Render** (`engine/handwriting.js`): random variant per character, damped random walk for baseline/size/rotation, pressure per
   word and letter, spacing from the ink profile.

The sample sheet layout (v1) is described in [samples/README.md](samples/README.md).

## Privacy

Handwriting is personal. Your samples, glyphs and profiles stay **on your computer**: profiles live in
`~/.local/share/penclone/profiles/` (or `PENCLONE_HOME`, e.g. `./data`), and `samples/`, `data/`, `profiles/`, `scans/`, `*.pdf`,
`*.svg`, `*.zip` and glyph files are git-ignored. CI rejects commits that contain them. penclone uploads nothing.

## Non-goal

penclone aims to look natural. It is **not** a tool for forging documents or getting around authenticity checks, and it has no
features meant to fool AI detectors, handwriting examiners or physical inspection.

## Contributing

Bug reports, ideas and pull requests are welcome – see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
