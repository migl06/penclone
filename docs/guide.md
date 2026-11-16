# User guide

From zero to text in your own handwriting. Deutsch: [de/anleitung.md](de/anleitung.md).

## 1. Install

Needs Node.js ≥ 20, Python 3 with `numpy scipy pillow`, and poppler (`pdftocairo`, `pdftoppm`).

```bash
pip install numpy scipy pillow                  # or: pip install -r pipeline/requirements.txt
sudo apt install poppler-utils                  # macOS: brew install poppler
npm install -g github:migl06/penclone
penclone status
```

`penclone status` always tells you the next step.

## 2. Teach it your handwriting (once, about 30 minutes)

```bash
penclone profile create me
penclone sample-sheet --out sheet.pdf
```

`sheet.pdf` contains given sentences, each with a ruled line below.

- **On an iPad (recommended):** open the PDF in GoodNotes, Notability or similar, write with the Apple Pencil and export the
  pages as PDF (the strokes stay vectors, which gives the cleanest result).
- **Directly in the browser on the iPad:** `penclone capture me` prints a link; open it in Safari on the iPad (same Wi-Fi),
  write with the Pencil (the finger scrolls), tap “Fertig” – the strokes are imported at once, with time and pressure.
- **Not possible yet:** writing on paper and scanning it – penclone needs the strokes as vectors; a scan is only an image.
  (A scan of *empty* paper as a template works, see 5.)

Write every sentence on the line below it, normally and at normal speed – not extra neat. If you slip, cross out the whole
sentence and write it again.

```bash
penclone import me written.pdf --manifest sheet.json
```

penclone assigns the strokes to letters, builds several variants per character and measures your word gaps, how your baseline
drifts and how your lines slope. The sample sheet is in German for now; English sentences come with the English language pack.

## 3. Write

```bash
penclone render notes.txt -o notes.pdf
penclone render notes.txt --paper lin27 --pen fineliner -o notes.pdf      # German Lineatur 27, fineliner
penclone render notes.txt --paper squared -o notes.pdf                    # squared (every second line)
penclone render notes.txt --output ipad --paper dotted -o notes.pdf       # like a notes app
penclone render notes.txt -o notes.xopp                                   # editable in Xournal++
penclone styles                                                           # everything available
penclone init                                                             # asks language, output and paper once
penclone prefs me paper=lined pen=fineliner                               # change any time; "paper=" clears one
```

Every line break in the text is a line break on the paper. Long words are split at the end of a line only when a large gap would
be left otherwise. `--seed 2` gives another version of the same text.

## 4. Missing characters

If you never wrote a character (e.g. `§`), penclone leaves it out and tells you – there is no font fallback. Add it in two
minutes:

```bash
penclone sample-sheet --chars "§@" --out missing.pdf
# write each character between two small n, three times ("n§n n§n n§n")
penclone import me missing-written.pdf --manifest missing.json
```

## 5. Your own paper

Scan or photograph an **empty** page of your notepad:

```bash
penclone template add pad --profile me --from empty_page.jpg
penclone render notes.txt --paper pad -o notes.pdf
```

penclone straightens the scan, recognises lined, squared, dotted or blank paper, measures line spacing and margin lines, and keeps
the scan as background (`--no-background`: measurements only).

## 6. Worksheets

Give each answer a rough box in mm from the top-left corner (`fields.json`):

```json
{"fields": [{"box": [18, 50, 175, 28], "text": "Confidentiality, integrity and availability"}]}
```

```bash
penclone fill worksheet.pdf --fields fields.json -o filled.pdf
```

penclone writes on printed answer lines inside the box, writes smaller if needed (never unreadably small) and reports what does
not fit. With an AI app (section 7), the AI decides the boxes for you.

## 7. With an AI app (MCP)

```bash
claude mcp add penclone -- penclone mcp          # Claude Code
```

Claude Desktop (`claude_desktop_config.json`): `{"mcpServers": {"penclone": {"command": "penclone", "args": ["mcp"]}}}`.

Then just ask, e.g. “write these notes in my handwriting on lined paper” or “fill in this worksheet” (with a scan). When
characters are missing, the AI asks you what to do. Files without a given path go to `~/penclone/`. For agents that run
commands there is the skill in `skill/penclone/`.

## 8. Privacy and limits

Samples, glyphs and profiles stay on your computer (`~/.local/share/penclone/`); penclone uploads nothing. Backup:
`penclone profile export me me.zip`. To help: `penclone validate me` prints numbers only (proportions, gaps) that you may paste
into an issue to check the general rules. penclone writes your own handwriting; signatures you still write yourself.
