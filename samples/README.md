# Writing samples

This folder is ignored by git (except this file). Your samples are best kept in a profile (`pipeline/profiles.py`), which lives
outside the repository. Handwriting is personal – none of it belongs
in a public repository.

## Sample sheet v1 (current)

3 pages, every character exactly once per page, in this row order:

| Row | Content |
|---|---|
| 1 | `abcdefghijklmnopqrstuvwxyz` |
| 2 | `ABCDEFGHIJKLMNOPQRSTUVWXYZ` |
| 3 | `0123456789` |
| 4 | `äöüÄÖÜß` |
| 5 | `.,;-()/+=*%?!"'<>_[]` |
| 6 | `→⇒↔⊕` |
| 7 | `#~&{}$≠≈≤≥φℕℤℝ` |
| 8 | `⓪①②③④⑤⑥⑦⑧⑨` |
| 9 | `:✓↑↓\|\^€ℚℂ` |
| 10 | `éèà` |
| 11 | `∧∨¬∈∉≡‖±` |
| 12 | `▷` (filled to ▶) |

Export the pages from the iPad as a PDF with vector strokes, then create a profile from it (the PDF is copied into the profile,
outside the repository):

```bash
python3 pipeline/profiles.py create me --pdf samples.pdf --lang de
python3 pipeline/profiles.py build me
```

Weaknesses of this sheet: see [docs/known-issues.md](../docs/known-issues.md) (size relations between rows cannot be measured, only 3
variants, no word positions). Sample sheet v2 is described in [docs/decisions.md](../docs/decisions.md).
