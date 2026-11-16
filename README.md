# penclone

**Turn text into your own handwriting – rendered from your real pen strokes.**
German first (ä ö ü ß, „quotes“, hyphenation), English too. One tool with three ways in: a **command line**, an **MCP server**
for AI apps (Claude, ChatGPT, Cursor, …) and an **Agent Skill** – each can do the whole workflow.

[Deutsch](README.de.md) · [User guide](docs/guide.md)

penclone takes a few pages of your handwriting (vector strokes from an iPad / Apple Pencil), turns every character into a set of
glyph variants and writes new text with them. Unlike handwriting fonts, the same letter never looks exactly the same twice:
variants are picked at random, the baseline drifts like yours, pressure changes, and letters are spaced by their actual ink so
they never touch.

Typical uses: study notes, letters and cards, answers on worksheets, mockups.

**For print handwriting.** penclone is made for handwriting in print: letters written one by one, a few of them joined. It
is not made for cursive (joined-up script, where the pen stays on the paper for whole words); such writing cannot be cut into
letters reliably yet.

> **Status: early but usable.** Working: handwriting profiles, sample sheets (full or only missing characters), layout with
> German hyphenation and a line model measured from your samples, paper (lined, squared, dotted, German Lineaturen, your own
> scanned paper), pens and an iPad look, worksheets, PDF / SVG / PNG and editable ink (Xournal++, InkML, Excalidraw), MCP server,
> skill. Not yet: legibility measurement (OCR), npm release. Details: [docs/known-issues.md](docs/known-issues.md),
> [docs/decisions.md](docs/decisions.md).

## Built on research, not guesswork

Every feature and default comes from a cited source, from a measurement of your own samples, or is marked as an assumption
([evidence policy](docs/decisions.md#5-evidence-policy)). The facts behind the main features:

| Feature | Fact | Source |
|---|---|---|
| Several variants per letter, no visible repeats | People notice repeated glyphs; good synthesis draws glyph choices randomly and only falls back to substitutes when fewer than 8 exact samples exist. | Haines, Mac Aodha, Brostow: *My Text in Your Handwriting*, ACM TOG 2016 |
| Samples written as sentences, not alphabet rows | First and last letters of a word are written differently; unfamiliar text makes writers hesitate and changes the writing; sample text is chosen by letter and letter-pair frequency. | Haines et al. 2016 (citing Srihari et al. 2002) |
| Baseline drifts and comes back | Writers stay near the rule but drift in arcs as the hand pivots; modelled with Kalman smoothing along the line. | Haines et al. 2016 |
| Drift, slope and word gaps are yours | Measured on your own sample sheet: baseline drift as a random walk pulled back to the line (Ornstein-Uhlenbeck, fitted with a variogram), word gaps ink to ink. | own measurement, [research §13](docs/research.md#13-line-habits-measured-from-the-writers-own-sample) |
| Natural variation from movement | Human-like variants of a word: perturb the timing parameters µ and σ of the sigma-lognormal model by ±15 %. | Martín-Albo, Plamondon, Vidal, ICFHR 2014 |
| Ballpoint look | Ink deposit depends on pen force and speed; ballpoint paste shows typical inner-trace patterns. | Franke & Rose, Ink-Deposition Model, IWFHR 2004 |
| Pencil look | Result depends on lead composition, paper texture and pressure. | Sousa & Buchanan, Computer Graphics Forum 2000 |
| iPad look | Stroke width from simulated pressure (thinning, smoothing, taper). | perfect-freehand |
| German hyphenation | Liang's algorithm with TeX patterns (`de-1996`, hyph-utf8, MIT); German needs it more because of long compounds. | Liang 1983; hyph-utf8 |
| Most frequent German letter pairs covered in samples | ER, EN, CH, DE, EI, ND, TE, IN, IE, GE. | University of Wuppertal / HU Berlin tables |
| Spacing by white area | Type designers space letters by the white area next to them, not by the closest point. | HT Letterspacer |
| Measuring legibility and style | German handwriting recogniser (TrOCR, 4.1 % character error rate on its test set); HWD scores handwriting style better than FID. | fhswf/TrOCR_german_handwritten; Pippi et al., BMVC 2023 |
| Editable ink, not just PDFs | GoodNotes' format is undocumented, so its ink cannot be generated; InkML is a W3C standard for exchanging digital ink; Xournal++ and Excalidraw use open formats. | W3C InkML 2011; see research notes |

Full list with links and how deeply each source was read: [docs/research.md](docs/research.md).

## Install

Needs Node.js ≥ 20, Python 3 with `numpy scipy pillow` (`pip install -r pipeline/requirements.txt`) and poppler
(`pdftocairo`, `pdftoppm`; e.g. `apt install poppler-utils`, `brew install poppler`).

```bash
npm install -g github:migl06/penclone      # or: git clone … && node bin/penclone.js
penclone status                             # what is there and what to do next
```

## Three ways to use it

**What is penclone – a CLI, an MCP server or a skill?** All three, over the same functions (`lib/commands.js`), so none can do
more than the others ([why](docs/decisions.md#2-cli-mcp-server-or-skill)):

| Way in | For | Start |
|---|---|---|
| Command line | you, scripts | `penclone help` |
| MCP server | AI apps: the AI calls penclone's tools (render, fill a worksheet, add paper from a scan, …) and gets previews back | `claude mcp add penclone -- penclone mcp` · Claude Desktop: `{"mcpServers": {"penclone": {"command": "penclone", "args": ["mcp"]}}}` |
| Agent Skill | AI agents that run commands on your computer | copy `skill/penclone/` into your agent's skills folder |

With an AI app you can simply say “write these notes in my handwriting on lined paper” or give it a scan of a worksheet; the AI
decides what goes where, penclone measures the page and fits the writing. When characters are missing in your handwriting, the
AI asks you whether to write them now (a small sheet with just those characters), leave them out or replace them.

## Handwriting profiles

Your handwriting is saved under a name and reused. Profiles live **outside the repository**
(`~/.local/share/penclone/profiles/<name>/`), so they survive updates and re-downloads.

```bash
penclone profile create me
penclone sample-sheet --out sheet.pdf                  # write it in a notes app on the iPad, export as PDF (~30 min)
penclone capture me                                    # or: write it directly in Safari on the iPad (records time and pressure)
penclone import me written.pdf --manifest sheet.json   # strokes → glyphs, measures your word gaps and line drift
penclone sample-sheet --chars "§@" --out missing.pdf   # later: only characters that are missing
penclone report me --sheet glyphs.png                  # quality report
penclone profile export me me.zip                      # backup / other computer
```

penclone improves through **more samples** (more variants, better proportions) and through **general rules** that are the same
for everyone and built into the pipeline ([docs/rules.md](docs/rules.md)) – e.g. marks stay as written, umlauts get the size of their
base letters, a variant that reads as another letter is skipped. Users cannot change these rules; personal overrides exist only
as a last resort and are normally empty. No neural network is trained.

**Teaching it your handwriting:** write the given sample sentences – not free text, not alphabet rows – normally and at normal
speed ([why](docs/decisions.md#7-teaching-penclone-your-handwriting-guided-sentences)).

## Writing

```bash
penclone render notes.txt -o notes.pdf                                     # your preferences, else blank paper, ballpoint
penclone render notes.txt --paper lin27 --pen fineliner -o notes.pdf       # German Lineatur 27, black fineliner
penclone render notes.txt --output ipad --paper dotted -o notes.pdf        # digital ink like a notes app
penclone render notes.txt -o notes.xopp                                    # editable strokes in Xournal++
penclone template add block --profile me --from empty_page.jpg             # your own paper, measured from a scan
penclone fill worksheet.pdf --fields fields.json -o filled.pdf             # answers fitted into boxes, report per field
penclone prefs me output=paper paper=lined pen=ballpoint                   # remembered defaults
```

Every line break in the text starts a new line. The writing sits on the lines of lined, squared and dotted paper; on squared
paper every second line is used if the squares are smaller than your line height. Missing characters are left out and reported –
never replaced by a font. The same `--seed` gives the same result, and changing one word leaves the other lines unchanged.

| Option | Values |
|---|---|
| `--paper` | `blank`, `lined`, `lined-narrow` / `-college` / `-wide` (US), `lin27`, `squared`, `lin22`, `lin26`, `lin28`, `dotted`, your template, or a scan file |
| `--output`, `--pen` | `paper`: `ballpoint`, `fineliner`, `gel`, `fountain`, `pencil` · `ipad`: `pen`, `pencil` |
| `--color`, `--size`, `--line-spacing`, `--grid`, `--margin`, `--page` | colour; x-height, distances in mm; page `a4`/`a5`/`letter`/`WxH` |
| `--pages N` | fit the text to N pages (writes smaller if needed) |
| output file | `.pdf`, `.svg`, `.png`, and editable ink: `.xopp` (Xournal++), `.inkml`, `.excalidraw` |

**Worksheets and scanned pages:** the AI (or you) gives each answer a rough box; penclone straightens the scan, finds printed
answer lines inside the box, fits the text (smaller if needed, never unreadably small) and reports what does not fit
([why](docs/decisions.md#9-scanned-pages-and-worksheets-the-ai-says-what-goes-where-penclone-makes-it-fit)).

GoodNotes/Notability: import the PDF and write on top; the generated strokes cannot be made editable there because the format is
closed ([details](docs/decisions.md#editable-on-the-ipad-goodnotes)).

## How it works

```
samples (iPad PDF) ──► profile ──pipeline/──► glyphs.json + layout.json ──engine/──► PDF · SVG · PNG · xopp · InkML · Excalidraw
                                                                   ▲
                                         lib/commands.js ── CLI (bin/penclone.js) · MCP server (lib/mcp.js) · skill
```

1. **Extract** (`pipeline/svg_strokes.py`): every stroked path becomes a polyline.
2. **Segment** (`pipeline/rows.py`, `build_glyphs.py`): rows by vertical gaps, characters by overlapping x-ranges.
3. **Normalise and apply the general rules**: baseline, x-height, punctuation heights, smoothing, slant; rules R1–R5.
4. **Lay out and render** (`engine/`, no browser needed): random variant per character with its own random stream per word,
   damped random walk for size/rotation, pressure per word and letter, spacing from the ink profile; lines filled like by hand,
   German hyphenation against large gaps, baseline drift and slope per line, baselines on the rules of the paper; one path per
   line. iPad look: filled outlines, thinner where the hand was fast (two-thirds power law), tapered ends.
5. **Scans** (`pipeline/scan_paper.py`): straightened by projection profiles; ruled lines, squares, dots and margin lines found
   and measured, so nobody measures by hand.

The sample sheet layout (v1) is described in [samples/README.md](samples/README.md).

## Privacy

Handwriting is personal. Your samples, glyphs and profiles stay **on your computer**: profiles live in
`~/.local/share/penclone/profiles/` (or `PENCLONE_HOME`, e.g. `./data`), and `samples/`, `data/`, `profiles/`, `scans/`, `*.pdf`,
`*.svg`, `*.zip` and glyph files are git-ignored. CI rejects commits that contain them. penclone uploads nothing.

## Goal: as human as possible

A page from penclone should look like you wrote it by hand – nobody should be able to tell otherwise. No glyph appears twice,
no line is perfectly straight, no gap is perfectly even. Every random choice (variant, size, slant, pressure, spacing, baseline)
is drawn from the distributions measured in *your* samples, so the variation is yours and not generic jitter. Anything that
gives away machine output or cut-out letters – identical repeats, constant spacing, parallel baselines, uniform strokes – counts
as a bug.

penclone writes **your own** handwriting from **your own** samples. Signatures are not part of it: where a handwritten signature
is required, a plotted or printed one does not count.

## Contributing

Bug reports, ideas and pull requests are welcome – see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
