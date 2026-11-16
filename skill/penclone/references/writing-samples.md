# How the user writes the sample sheet

Explain this before the user starts:

- **Directly on the iPad:** `penclone capture NAME` prints a link to open in Safari on the iPad (same Wi-Fi); the user writes with
  the Apple Pencil and taps “Fertig”; the strokes are imported automatically (no manifest needed).
- Or **open the PDF in a notes app on the iPad** (GoodNotes, Notability, …), write with the Apple Pencil and export the pages
  as PDF. The export keeps the strokes as vectors.
- **Not supported yet:** writing on paper and scanning it. penclone needs the pen strokes as vectors; a scan is only an image.
  Tell the user this before they start.
- Write every sentence **on the ruled line below it**, normally and at normal speed - not extra neat. Unfamiliar, slow or
  careful writing changes the handwriting.
- One sentence per line; smaller is fine. Do not write over the grey text. If you slip, cross out and rewrite the whole
  sentence.
- About 30 minutes for the whole sheet.

Then import it with the manifest that was written next to the sheet:

```bash
penclone import NAME written.pdf --manifest sheet.json
```

## Character sheet (missing characters)

`penclone sample-sheet --chars "§@" --out missing.pdf` makes one line per character: `n§n n§n n§n`. The user writes the
character between two small n, three times, with a gap between the groups. The n tell penclone the size. Characters the
sheet's font cannot show are printed as `n?n` with their Unicode name. Import it the same way (`--manifest missing.json`).
