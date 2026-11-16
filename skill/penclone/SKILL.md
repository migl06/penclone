---
name: penclone
description: Write text in the user's own handwriting (from their real pen strokes) as PDF, SVG, PNG or editable ink, on blank, lined, squared or dotted paper, on their own scanned paper, or into the fields of a scanned worksheet. Use when the user wants notes, letters, cards or worksheet answers in their handwriting, or wants to set up / improve their handwriting profile. Requires the penclone command line on this computer.
---

# penclone

penclone turns text into the user's own handwriting. It needs a **handwriting profile** made from a sample sheet the user
wrote once. Everything runs locally; nothing is uploaded.

Run every step with the command line (`penclone …`, or `node /path/to/penclone/bin/penclone.js …`). Prefer `--json` where
offered and read the result instead of guessing. If an MCP server named penclone is connected, its tools do the same.

## 1. Always start with the status

```bash
penclone status --json
```

Follow `next` (one step). Mention the `optional` steps briefly; do not push them.

| next.id | what to do |
|---|---|
| `create-profile` | ask for a profile name, `penclone profile create NAME`, then step `write-samples` |
| `write-samples` | iPad in the same Wi-Fi: `penclone capture NAME`, give the user the link, wait until it reports the import. Otherwise `penclone sample-sheet --out sheet.pdf`, explain how to write it in a notes app ([references/writing-samples.md](references/writing-samples.md)), wait for the exported PDF, `penclone import NAME written.pdf --manifest sheet.json`. Written paper scans do not work yet. |
| `build` / `build-chars` | `penclone profile build NAME` (with `--only chars` for build-chars) |
| `ready` | write text (step 3) |

## 2. Ask only what matters, once

First time only: language, output (`paper` = pen on paper, `ipad` = digital ink), paper type. Save the answers:

```bash
penclone prefs NAME output=paper paper=lined pen=ballpoint
```

Everything else has defaults (size and spacing are measured from the user's samples). Do not ask about them unless the
user cares.

## 3. Write text

```bash
penclone render notes.txt --profile NAME -o notes.pdf --json
```

Every line break starts a new line. Options: [references/options.md](references/options.md). Show the result (open the
PDF or a PNG) and ask if it is fine.

**Missing characters - always ask.** If the result has `missing` characters (they were left out), tell the user which
ones and ask what to do:

1. write them now: `penclone sample-sheet --chars "§@" --out missing.pdf` → the user writes each character between two
   small n, three times → `penclone import NAME written.pdf --manifest missing.json` → render again;
2. leave them out;
3. replace them in the text (e.g. "§" → "Paragraph").

Never replace a missing character silently and never use a font instead.

## 4. Own paper from a scan

If the user has their own paper (a notepad, a school block), ask for a scan or photo of an **empty** page:

```bash
penclone template add block --profile NAME --from empty_page.jpg
```

penclone measures paper type, line spacing and margin lines itself - do not estimate them. Then `--paper block`.

## 5. Worksheets and scanned pages

See [references/worksheets.md](references/worksheets.md): look at the page, decide what goes where, give each answer a rough
box in mm; penclone fits the text, writes on printed lines and reports what does not fit.

## Rules

- Ask before writing files the user did not ask for; use the paths they give.
- Write only in the user's own handwriting (their own profile). Leave signature fields empty for the user to sign by hand.
- Never send handwriting samples, glyph files or profiles anywhere. `penclone validate NAME` gives anonymous numbers the user
  may choose to share.
