# Decisions and roadmap

Status: 2026-11-16. Four open questions, each with the decision and its reasoning. Sources: [research.md](research.md).
German version: [de/entscheidungen.md](de/entscheidungen.md).

## 1. German only, or German + English?

**Decision: German first, English as a second language pack, planned from the start.**

- The German character set is a superset of English (plus ä ö ü ß, „ “, €). Anything that writes German can write English.
- Language only lives in a few, clearly separable parts. The engine itself stays language-neutral (Unicode):

| Part | `de` | `en` |
|---|---|---|
| Sentences for the writing sample | chosen by German letter/pair frequency | chosen by English frequency |
| Hyphenation | Liang patterns `de-1996` | `en-us` |
| Quotes, numbers | „…“ ‚…‘, decimal comma | “…” ‘…’, decimal point |
| Important letter pairs | er, en, ch, de, ei, nd, te, in, ie, ge, sch, ck, tz | th, he, in, er, an, re, … |

- Cost of English afterwards: one config file + English sample sentences.
- Repository, README, code and commits are in English so the project can be found internationally; German docs live in `docs/de/`
  and `README.de.md`.

## 2. CLI, MCP server or skill?

**Decision: core + CLI as the base; an MCP server and an Agent Skill on top. Both must be able to do *everything*.**

- **The look does not depend on it.** CLI, MCP and skill all call the same engine; quality comes only from samples + engine.
- **CLI = most independent:** works without any AI, for people and scripts.
- **MCP = open to many AI apps:** an open protocol supported by Claude, ChatGPT, Cursor, VS Code/Copilot, Zed and others.
  The server runs the code itself, so it also works in chat apps without a terminal.
- **Skill = the complete workflow:** Agent Skills are an open standard too (agentskills.io; Codex, Copilot, Cursor, Gemini CLI and
  others); they need an agent that may run commands on your machine. The skill guides an agent through the *whole* process – from
  the first writing sample to the finished PDF – using the CLI for every step.
- Everything ships as **one npm package** (`penclone`): `npx penclone render …` and `npx penclone mcp`. No duplicated logic.
- Handwriting data is **never** part of the package or the repository; it is found via `PENCLONE_GLYPHS` or
  `~/.config/penclone/glyphs.json`.

Planned usage:

```
penclone render notes.md --profile me --output paper --pen ballpoint --color blue --paper squared --grid 5mm -o notes.pdf
penclone render notes.md --profile me --output paper --pen pencil --paper lined --line-spacing 8mm -o notes.pdf
penclone render notes.md --profile me --output ipad --paper dotted --format xopp -o notes.xopp
penclone mcp        # start the MCP server (stdio)
```

### Rule: full parity

Every capability lives in the core and gets a **CLI command the moment it is built**. MCP tools and the skill are thin layers over
the same commands, so nothing is ever possible in one interface but not in the other.

| Step | CLI | MCP tool | Skill |
|---|---|---|---|
| See the state and the next step | `penclone status`, wizard `penclone init` | `get_status` | ✓ follows it |
| Add your own paper template | `penclone template add NAME --from scan.pdf` | `add_template` | ✓ |
| Create / list / show a handwriting profile (**done:** `pipeline/profiles.py`) | `penclone profile create NAME --pdf …` | `create_profile`, `list_profiles` | ✓ |
| Back up or move a profile (**done**) | `penclone profile export NAME file.zip` / `import` | `export_profile` | ✓ |
| Create a sample sheet to write on (PDF / iPad template) | `penclone sample-sheet --lang de` | `create_sample_sheet` | ✓ explains how to write it |
| Capture samples on the iPad (time, pressure, tilt) | `penclone capture` (serves the capture page) | `start_capture` | ✓ |
| Import samples (iPad PDF export or capture data) | `penclone import samples.pdf` | `import_samples` | ✓ |
| Build the glyph library | `penclone build` | `build_glyphs` | ✓ |
| Quality report, contact sheet | `penclone report --sheet` | `glyph_report` (returns image) | ✓ interprets the report, suggests fixes |
| Optional personal override (**done**, normally not needed) | `penclone override NAME …`, `penclone block NAME k alphabet-v1:p3` | `set_override` | ✓ asks why, logs it |
| Render text/Markdown | `penclone render notes.md --output paper\|ipad --pen … --paper … --format …` | `render_handwriting` (path + preview) | ✓ |
| Fit to a page count / font size | `penclone render --pages 10` | option of `render_handwriting` | ✓ |
| List paper, pens, colours, languages | `penclone styles` | `list_styles` | ✓ |
| Suggest writable fields on a scan/PDF (optional helper) | `penclone detect-fields sheet.pdf` | `detect_fields` (with numbered preview) | ✓ |
| Write text into fields of a scan/PDF, fitted to the space | `penclone fill sheet.pdf --fields fields.json` | `fill_page` (with fit report) | ✓ |
| Check legibility (OCR error rate) | `penclone check out.pdf` | `check_legibility` | ✓ |
| Export a handwriting font (OpenType) | `penclone font` | `export_font` | ✓ |

The skill lives in `skill/penclone/` (`SKILL.md` + `references/` for options and the sample-writing guide). It never contains
handwriting data.

### Non-goal

penclone aims to look natural, but it is **not** a tool for getting around authenticity checks. There are no features meant to
fool AI detectors, handwriting examiners or physical inspection.

## 3. Configurable paper and pen

**Decision: two independent layers – paper (background + where the baseline sits) and pen (what the stroke looks like).**

### Paper

| Option | Look | Effect on the writing |
|---|---|---|
| `blank` | white / slightly cream | lines may drift more and run slightly askew (line model) |
| `lined` | ruled lines, spacing configurable (German Lineatur 27: 9 mm according to one retailer), optional margin | baseline is pulled towards the rule (Kalman model as in Haines), less drift |
| `squared` | 5 mm squares (Lineatur 22 without, 26 with margin) | baseline on a grid line; size so that the x-height has a fixed ratio to the square (parameter) |
| `dotted` | 5 mm dot grid | like squared, more subtle |

Optional on top: scan look (slight paper tint, minimal skew of the whole page, edge shadow) vs. clean print.

### Pen

| Pen | Stroke | Implementation |
|---|---|---|
| `ballpoint` | almost constant width (±5 %), blue or black; darker where slow (curves, stroke start, small ink blob), lighter/thinner on fast straight strokes, fine skips | estimate speed from curvature (two-thirds power law) or from timestamps; ink model after Franke & Rose |
| `pencil` | grey, soft edge, paper grain visible, pressure → darkness | grey value × paper grain noise (SVG `feTurbulence`) × pressure (Sousa & Buchanan) |
| `fineliner` / `gel` | saturated colour, constant width, no texture | simplest variant |
| `highlighter` | wide, translucent, multiply blend, slanted ends | for highlights instead of a CSS rectangle |

Bold = **retracing** (a second, slightly offset stroke), not a thicker line.

## 4. iPad: “digital, in your own handwriting”

Two things, both worth doing:

**a) iPad look as a style** (`--style ipad`): clean vector lines, width from simulated pressure (like
[perfect-freehand](https://github.com/steveruizok/perfect-freehand)), pure colours, templates like note apps (lined, squared,
dotted). Output as PDF that can be imported into GoodNotes/Notability.

**b) The iPad as a capture device for better samples** – the bigger win: a small web page running in Safari on the iPad shows the
sample sentence and records every stroke with **time, pressure and tilt** (Pointer Events with the Apple Pencil). Compared with
the PDF export:

- The character being written is known → no character segmentation heuristics ([known-issues.md](known-issues.md)).
- Timestamps → real speed → sigma-lognormal variation (B4) and a realistic ballpoint stroke.
- Pressure → real stroke width for the iPad look.

**That is why the engine stays in JavaScript/TypeScript** (without DOM dependency): the same engine runs in the browser on the
iPad, in the CLI and MCP server (Node), and in existing HTML pages. Python stays for analysis and glyph building.

## 5. Evidence policy

Every feature and every default value must come from one of three places, and the docs say which:

1. **a cited source** – paper, standard or specification ([research.md](research.md));
2. **a measurement of your own samples** – e.g. your letter proportions or your writing size relative to the line;
3. otherwise it is marked as an **assumption** in the docs and in the config, so it can be checked later (P4: measure).

The README lists the facts behind each feature.

## 6. Profiles: your handwriting, saved under a name (implemented)

A profile keeps everything penclone knows about one person's handwriting, **outside the repository**, so it survives updates and
re-downloads: `~/.local/share/penclone/profiles/<name>/` (or `$PENCLONE_HOME`).

| File | Content |
|---|---|
| `profile.json` | name, languages, sample sources, optional **overrides**, and a **log** of every change with date and reason |
| `samples/<source>/` | your sample PDF and its extracted pages |
| `glyphs.json` | the glyph library built from the samples with the general rules |

**How penclone “learns”.** Nothing is trained in the neural-network sense (why: [research.md §9](research.md#9-neural-methods--why-not-yet)).
It improves in two ways:

1. **More samples** (stored in the profile) → more variants per character, better measured proportions and spacing.
2. **General rules** (built into the pipeline, the same for everyone, see [rules.md](rules.md)) → e.g. marks stay as written,
   umlauts take the size of their base letters, confusable variants (a k that reads as h) are skipped. Users cannot change them;
   they change only through reviewed pull requests.

Personal **overrides** exist as a last resort for cases the general rules miss. They are normally empty and logged with a reason;
needing one usually means a general rule is missing.

Profiles can be exported to a zip (backup, another computer) and imported again. They never go into the repository.

## 7. Teaching penclone your handwriting: guided sentences

**Decision: write given sentences, not free text and not alphabet rows.**

- With **given sentences** penclone knows exactly which letter every stroke belongs to. The sentences are chosen so that letters,
  capitals, umlauts, ß, digits, punctuation and the frequent letter pairs are all covered several times (Haines et al.).
- **Alphabet rows** (sample sheet v1) look neater than real writing and hide the size relation between rows – the cause of
  problems A3–A5 in [known-issues.md](known-issues.md).
- **Free text** (“just feed it my notes”) only works if penclone also gets the typed text of what was written (a transcript);
  without it, every letter would have to be recognised first, which adds errors. Planned later as “import with transcript”.

Sample sheet v2 (planned):

| Point | Content | Basis |
|---|---|---|
| Paper | lined template at your usual line spacing | lets penclone measure your writing size *relative to the line* (evidence type 2) |
| Text | German pangrams + sentences chosen greedily for coverage; optionally sentences from your own target text (e.g. your study notes) | Haines: source text selected by letter and pair frequency of a target corpus |
| Coverage goal | each frequent lower-case letter 6–8×, capitals and umlauts several times, frequent pairs (er, en, ch, sch, ck, ei, ie, …) | Haines: substitutes only below 8 exact matches |
| Amount | 2–4 pages, 10–30 minutes | Haines: about 4 A4 pages, 10–30 min |
| How to write | normally, at normal speed, with the pen you want to imitate | unfamiliar or slow writing changes the handwriting (Haines) |
| Capture | iPad capture page (time, pressure, tilt) or PDF export from your notes app | timing enables motion-based variation (Martín-Albo et al.) |

## 8. Output: paper or iPad, everything adjustable

**Decision: one option set; every value has a default that is either sourced, measured from your samples, or marked as assumption.**

| Option | Values | Default comes from |
|---|---|---|
| `--output` | `paper` (simulated pen on paper, for printing or a scan look) · `ipad` (clean digital ink like a notes app) | – |
| `--pen` | paper: `ballpoint`, `pencil`, `fineliner`, `gel`, `fountain`, `highlighter` · ipad: `pen`, `pencil`, `highlighter` | pen models: Franke & Rose (ballpoint), Sousa & Buchanan (pencil); iPad width: perfect-freehand |
| `--color`, `--width` | any colour; stroke width in mm | assumption until measured on scans |
| `--paper` | `blank`, `lined`, `squared`, `dotted`, presets `lin22`, `lin26`, `lin27`, `lin28`, or a scan/PDF file as background | German Lineaturen (retailer data; lin27 spacing from one source only) |
| `--line-spacing`, `--grid`, `--margin` | mm | paper preset |
| `--page` | `a4`, `a5`, `letter`, or `WxH` mm | – |
| `--size` | x-height in mm, or `auto` | `auto` = your own ratio of x-height to line spacing, measured on sample sheet v2 |
| `--pages` | fit text to N pages | – |
| `--format` | `pdf`, `svg`, `png`, `xopp`, `excalidraw`, `inkml` | see below |

### Editable on the iPad (GoodNotes)?

Facts: GoodNotes stores notebooks in an **undocumented format**; users have asked for an open format and community attempts to
reverse engineer it are incomplete ([research.md §11](research.md#11-editable-digital-ink)). So penclone **cannot create
editable GoodNotes ink**. What works:

| Target | Strokes editable? | How |
|---|---|---|
| GoodNotes, Notability | no – the writing is the page background or an image | import the PDF and write on top; or PNG lines that can be moved/resized with the lasso |
| Xournal++ (`.xopp`) | **yes** | open format: gzip-compressed XML, same lineage as Xournal `.xoj` |
| Excalidraw (`.excalidraw`, runs in Safari on the iPad) | **yes** (freedraw strokes) | open JSON format |
| OneNote | **yes**, via InkML (Microsoft ink API, beta 2017 – to be verified) | InkML |
| any app reading InkML | **yes** | InkML is a W3C Recommendation (2011) for exchanging digital ink |

## 9. Scanned pages and worksheets: the AI says what goes where, penclone makes it fit

**Decision: the AI (or a person) decides *what* goes *where* and gives a rough box. penclone measures the space and fits the
text. No separate detection step is required.**

1. The AI looks at the page and returns a field list: for each answer a rough box and the text.
2. `penclone fill` writes each text into its box and **fits it**: line breaks with hyphenation; size as close to your natural
   writing size as possible, smaller if needed, but never below a minimum readable size. If a text still does not fit, penclone
   **reports how much is missing** instead of shrinking it unreadably, so the AI can shorten the text or pick a bigger box.
3. penclone **snaps to the page**: if the box contains ruled lines, the writing sits on them (line detection inside the box,
   e.g. Hough transform, Duda & Hart, CACM 1972). The AI's box may therefore be rough.
4. penclone returns the result and a preview image plus a fit report per field; the AI checks the preview and corrects if needed.

Why penclone measures the space and not the AI:

- Only penclone knows how much room *your* handwriting needs (glyph widths, spacing and line height from your profile).
- Vision-language models understand page content well but are less reliable with exact geometry: in “Vision language models are
  blind” (Rahmanzadehgervi et al., ACCV 2024) four 2024 models solved simple geometric tasks such as “do two lines cross?” with
  56 % accuracy on average (best: 74 %). So the AI gives rough boxes and penclone does the exact geometry.
- penclone stays deterministic and testable, and it works without AI (field list written by hand).

Optional helper: `penclone detect-fields` lists candidate lines and boxes with numbers and a preview image – useful without AI,
or when the AI prefers to pick numbered fields instead of giving coordinates.

Field list (box in mm from the top-left corner; `size` and `min_size` are optional):

```json
{"page": 1, "unit": "mm", "fields": [
  {"box": [25, 80, 160, 12], "text": "Confidentiality, integrity, availability"}
]}
```

```
penclone fill sheet.pdf --fields fields.json --profile me --pen ballpoint -o filled.pdf   # fits, reports overflow
penclone detect-fields sheet.pdf -o fields.json --preview fields.png                      # optional helper
```

MCP tools: `fill_page` (PDF, preview and fit report per field: size used, overflow), `detect_fields` (optional). The skill
describes the loop: look at the page → write the field list → fill → check preview and fit report → adjust.

Your own paper also works as a template: `--paper my_paper_scan.pdf` uses any scan or PDF as the page background.

## 10. Your data stays local

- Profiles (samples, overrides, glyphs) live in `~/.local/share/penclone/profiles/` – or, if you prefer everything inside the tool
  folder, set `PENCLONE_HOME=./data`. `data/`, `profiles/`, `samples/`, `scans/`, `*.zip`, `*.pdf`, `*.svg` and glyph files are
  git-ignored.
- CI rejects any commit that contains such files (“No handwriting data in the repository”).
- Nothing is uploaded anywhere by penclone. Only what an AI client itself sends (e.g. a preview image you let it look at) leaves
  your computer.

## 11. Onboarding: penclone knows the next step, the AI (or a wizard) asks only what matters

**Decision: the next step is computed by penclone itself, not guessed by the AI, and every interface shows it the same way.**

- `penclone status` returns the current state and the **next step**, e.g. “no profile → create a sample sheet”, “samples
  imported, not built → build”, “report has warnings → review”, “ready”. The MCP tool `get_status` returns the same; the skill
  tells the agent to call it first and follow it; the wizard `penclone init` walks through the same steps without any AI.
- **Ask only what matters, defaults for the rest.** Progressive disclosure – deferring rarely used options – makes software easier
  to learn and less error-prone (Nielsen 2006, Nielsen Norman Group; empirical evidence is reported to be limited). The first run
  asks three things: language, output (`paper` / `ipad`), paper. Pen, colour and sizes start with defaults.
- **Choices are remembered** as `preferences` in the profile (default output, pen, colour, paper). Preferences are the user's own
  defaults and can always be changed – unlike the general glyph rules, which users cannot change.
- **The AI suggests, the user decides:** from the task the AI proposes options (e.g. “worksheet → write on the scan itself”),
  shows a preview and asks before writing files.
- First run: create profile → open/print the sample sheet → write the sentences (2–4 pages) → import → build and report
  (penclone explains warnings) → first preview → done.

## 12. Paper templates: built in, your own, and how one is chosen

**Decision: built-in templates are generated from parameters (no image files, exact at any size); your own templates live in your
profile; the paper is chosen in a fixed order.**

Built-in templates (in the repository, the same for everyone; every value can be overridden, e.g. `--line-spacing 8mm --page a5`):

| Name | Type | Spacing | Source |
|---|---|---|---|
| `blank` | no lines | – | – |
| `lined-narrow` / `lined-college` / `lined-wide` | lined | 6.35 / 7.1 / 8.7 mm (1/4, 9/32, 11/32 in) | US ruled paper ([Wikipedia](https://en.wikipedia.org/wiki/Ruled_paper) and retailer data) |
| `lin27` | lined, double margin | 9 mm | German Lineatur 27 (one retailer source) |
| `lin22`, `lin26` | squared, without / with margin | 5 mm | German Lineatur 22 / 26 |
| `lin28` | squared, double margin | 5 mm (assumption) | German Lineatur 28 (spacing not found) |
| `dotted` | dot grid | 5 mm (assumption) | – |

Your own templates (stored in your profile, never in the repository):

```
penclone template add my-pad --from empty_page_scan.pdf     # penclone measures line spacing, grid and margins automatically
penclone template add my-pad --type lined --line-spacing 7mm --margin-left 20mm
```

Nobody measures by hand. With `--from`, penclone detects the lines (Hough transform) and can keep the scan as background for a
real paper look. penclone measures rather than the AI because small errors add up: a spacing estimated as 7.0 mm instead of
7.1 mm puts line 30 already 3 mm off the rule, and vision-language models are unreliable with exact geometry (Rahmanzadehgervi
et al., ACCV 2024). The AI's part is to ask which paper you want and to show the choices.

How the paper is chosen (first match wins):

1. explicitly given (`--paper …`, or what the AI passes after asking you)
2. the task: when filling a worksheet, the worksheet scan itself is the paper
3. your profile preference (`preferences.paper`)
4. the paper your samples were written on (sample sheet v2 is lined at your spacing), so size and lines match by default
5. `blank`

`penclone styles` lists built-in and own templates; the MCP tool `list_styles` returns them with small preview images so the AI
can show the choice.

## 13. The engine without a browser (P2)

**Decision: plain JavaScript modules (with `// @ts-check` type comments) that run unchanged in Node and in the browser; no build
step and no dependencies.** The same files serve the CLI, the planned MCP server and a future iPad page.

| Part | File | What it does | Basis |
|---|---|---|---|
| Randomness | `engine/rng.js` | one random stream per decision, keyed by what is decided (word + which occurrence, line, hyphen) | known issue C5 |
| Glyphs | `engine/glyphs.js` | loads v1/v2 libraries, measures the x-height, picks look-alikes for missing characters and reports them | – |
| Words | `engine/shape.js` | variant choice (position in the word if the variants carry one), slight deformation, spacing by ink profile | earlier renderer; Haines et al. (positions) |
| Hyphenation | `engine/hyphenate.js`, `engine/hyph/de-1996.js` | Liang's algorithm with the TeX patterns of hyph-utf8 (MIT) | Liang 1983 |
| Lines and pages | `engine/layout.js` | greedy line filling (people write until the line is full), hyphenation only against large gaps, line model | measured habits, [research.md §13](research.md#13-line-habits-measured-from-the-writers-own-sample) |
| Output | `engine/output.js` | SVG per page, PDF 1.4 with vector strokes; one path per line and stroke width | own comparison: straight segments look the same at 600 dpi, files 2.5× smaller |
| Command line | `bin/penclone.js` | `penclone render`; `profile` and `sample-sheet` forward to the Python pipeline until P6 | parity rule §2 |

Line model, in x-heights of the writer (defaults from `layout.json` in the profile, otherwise marked assumptions):

| Value | migl06 (example) | Fallback |
|---|---|---|
| word gap (ink to ink), log-normal from median and quartiles | 1.45 (1.22–1.81) | 1.4 (1.15–1.75), assumption |
| writing sits above the line | 0.23 | 0.2, assumption |
| line slope | −0.1° ± 0.25° | 0° ± 0.25°, assumption |
| slow baseline drift (sd, correlation length) | 0.15, 4.2 | 0.15, 4, assumption |
| x-height | 2.33 mm | 2.5 mm, assumption |
| start of the line, hyphenation gap, line spacing, margins | – | assumptions (not measurable on sample sheet v2) |

Hyphenation is deliberately rare: a word is split only if moving it to the next line would leave more than 6 x-heights empty, or
if it does not fit on a line at all. Handwriting is ragged; the threshold is an assumption to be checked in P4.

## Target architecture

```
writing sample ─┬─ iPad web capture (strokes + time + pressure, character known)
                └─ PDF export (shape only, current path)
                      │
                pipeline/ (Python) ──► glyph library (JSON, local, private)
                                              │
engine/ (JavaScript ES modules with type comments, no DOM, no dependencies):
  text ─► layout (line breaking + hyphenation) ─► writer model (glyph choice, spacing, baseline)
       ─► pen renderer (ballpoint | pencil | fineliner | ipad) ─► paper (blank | lined | squared | dotted) ─► SVG/PDF
                                              │
profiles (~/.local/share/penclone/profiles/<name>: samples, overrides + log, glyphs)  ◄── read by every interface

     CLI (Node) ◄─┬─ MCP server   (same commands, full parity)        web/PWA (iPad)
                  └─ skill        (SKILL.md, whole workflow)

outputs: pdf · svg · png · xopp · excalidraw · inkml
```

## Roadmap

| Step | Content | Result |
|---|---|---|
| **P0** ✓ | Glyph bugs A1, A2, A4, A6, A7 ([known-issues.md](known-issues.md)) as general rules R1–R5; automatic row detection | done |
| P1 | Sample v2: German sentences (pangram + frequent pairs), mixed case, word positions; iPad web capture | 6–8 variants, correct proportions |
| **P2** ✓ | DOM-free engine: layout + hyphenation, line model, per-position seeds, one path per line; `penclone render` | done: [§13](#13-the-engine-without-a-browser-p2) |
| P3 | Paper + pens + iPad style; CLI, MCP server and skill with full parity | every step usable from the CLI, any MCP client or the skill |
| P4 | Measure: OCR error rate (German TrOCR), HWD, blind test | parameters justified |
| P5 | **Validate the general rules with other writers**, privacy-preserving: `penclone validate` computes only anonymous statistics (no strokes, no images) that volunteers post in an issue | thresholds no longer an assumption |
| P6 | **Packaging and user guide**: one npm package (CLI + MCP server; pipeline ported to TypeScript or shipped via pipx so users need no manual Python setup) + end-user guide (EN/DE) | install with one command |
| later | English language pack, OpenType export | – |
