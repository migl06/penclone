# General glyph rules

German version: [de/regeln.md](de/regeln.md).

These rules are built into the pipeline (`pipeline/build_glyphs.py`). They are **the same for everyone**, users cannot change
them, and they are changed only through reviewed pull requests. Each rule states its evidence type
([evidence policy](decisions.md#5-evidence-policy)): **S** = cited source, **M** = measured on the writer's own samples,
**A** = assumption (to be validated, see P4 in [known-issues.md](known-issues.md)).

`--no-fixes` switches all of them off and reproduces the raw pipeline output (used to check that nothing else changed).

| Rule | What it does | Why | Evidence |
|---|---|---|---|
| **R1 Marks stay as written** | Small strokes (i-dots, colon, period, …) are kept exactly as drawn; they are never replaced by synthetic dots. | It is the writer's handwriting; glyph-based synthesis reuses the writer's own glyphs (Haines et al. 2016). Replacing only some marks produced mixed shapes (a colon that read as “°”). | S + user feedback |
| **R2 Umlaut size** | The body of ä ö ü Ä Ö Ü takes the median width and height of the writer's own a o u A O U; dots/dashes keep their size and gap. | Umlauts written in their own sample row can come out clearly larger than their base letters and then read as capitals. | M |
| **R3 Baseline for letters without descender** | Letters and digits that have no descender (all except g j p q y f ß J Q and the old-style figures 3 4 5 7 9) end at the baseline: a stroke that reaches further below than the tolerance is compressed from its top. Tolerance = max(0.06 em, 95th percentile of the writer's own overshoots). | A single stroke overshooting below the baseline (e.g. the first stroke of an N) can make a letter read as another one (N as “V”). Old-style figures 3 4 5 7 9 descend by typographic convention. | M (tolerance) + S (descender classes) |
| **R4 ! and ? on the baseline** | Their lowest point is placed on the baseline. | Punctuation is placed at fixed heights because the sample rows place it inconsistently (Haines et al. 2016 do the same). | S |
| **R5 Confusable variants are not used** | A variant is skipped if it is almost identical to a variant of a different character (chamfer distance < 0.25 px on a 0.025 em raster) **and** less than half as far from it as from its own variants. The most out-of-place variant of a pair is dropped, and at least 2 variants always remain. Upper/lower case of the same letter are not compared. | A variant can look like another letter (e.g. a k written with a loop reads as h). Legibility comes first. | A (thresholds, calibrated on one writer; to be validated with an OCR legibility check) |

## Personal overrides (optional)

A profile may contain **overrides** for exceptions the general rules do not cover. They are normally empty, are logged with
date and reason, and are meant as a last resort, not as the normal way to fix a handwriting:

```bash
python3 pipeline/profiles.py override NAME clean-dots ';!' --why "..."   # turn these marks into synthetic dots
python3 pipeline/profiles.py override NAME align-cap N --why "..."       # each stroke spans baseline..cap height
python3 pipeline/profiles.py block NAME k alphabet-v1:p3 --why "..."     # do not use one variant
```

If you need an override, please open an issue: it usually means a general rule is missing.
