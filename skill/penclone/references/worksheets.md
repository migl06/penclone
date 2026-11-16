# Filling worksheets and scanned pages

penclone does not read documents. You (the AI) decide **what** goes **where**; penclone measures the space and fits the
handwriting (docs/decisions.md §9).

1. Look at the page (scan, photo or PDF). For each answer, write a rough box `[x, y, width, height]` in **mm from the
   top-left corner** of the page, and the text. The box may be rough: if it contains printed answer lines, penclone finds
   them and writes on them.
2. Save the field list and run fill:

```json
{"page": 1, "fields": [
  {"box": [18, 50, 175, 28], "text": "Vertraulichkeit, Integrität und Verfügbarkeit"},
  {"box": [21, 101, 168, 28], "text": "…", "min_size": 1.8}
]}
```

```bash
penclone fill worksheet.pdf --fields fields.json --profile NAME -o filled.pdf --json
```

3. Read the report per field: `fits`, `sizeMm`, `onRuledLines`, and `notWritten` / `advice` when the text did not fit even
   at the smallest readable size. Then shorten the text or give a bigger box, and run fill again.
4. Look at the result (open the PDF or render a PNG) and correct boxes that are off.

Options per field: `size` (largest x-height, mm), `min_size` (smallest allowed, default 60 % of the natural size, at least
1.4 mm). The scan is straightened automatically; the report says by how many degrees.

Do not fill in documents where handwriting is used as proof of who wrote it (signatures, exams, official forms) - penclone
is not for forging documents.
