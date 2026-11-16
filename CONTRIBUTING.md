# Contributing to penclone

Thanks for helping! Bug reports, ideas and code are all welcome. *Deutsch ist für Issues und Diskussionen ebenfalls in Ordnung.*

## Reporting bugs and ideas

- Open an issue with the **Bug report** or **Feature request** form.
- **Never attach handwriting samples, glyph files or profiles.** Issues are public and handwriting is personal. Text output
  (e.g. `python3 tools/glyph_report.py --profile NAME`) or a small cropped screenshot is enough.
- Security problems: please report them privately (see [SECURITY.md](SECURITY.md)), not in a public issue.

## Proposing code changes

penclone uses the usual GitHub flow. Nobody pushes to `main` directly; every change goes through a pull request that the
maintainer reviews and merges.

1. **Fork** the repository and create a branch: `git switch -c fix-colon-spacing`.
2. Make your change. Keep pull requests small and about one thing.
3. Run the checks locally (the same ones CI runs):
   ```bash
   pip install -r pipeline/requirements.txt
   python3 -m py_compile pipeline/*.py tools/*.py
   node --check engine/handwriting.js
   ```
   If you changed the glyph pipeline and have your own profile, show that `--no-fixes` still reproduces the previous output, and
   describe what changed with fixes on.
4. Write **commit messages in English**, imperative mood, short subject line: `Fix colon spacing in bold text`.
5. Open a **pull request** against `main` and fill in the template.
6. CI must pass and the maintainer must approve before the change is merged. First-time contributors' CI runs start after the
   maintainer approves them (GitHub's default protection for public repositories).

## Evidence policy

penclone tries to base every feature and default on facts ([docs/decisions.md](docs/decisions.md#5-evidence-policy)):
a cited source (paper, standard, specification), a measurement of real samples, or – if neither exists – a clearly marked
assumption. Please say in your pull request which of the three applies, and add new sources to `docs/research.md`.

## Your own files

Put personal scripts, notes and anything tied to your own documents into `local/` – it is git-ignored and never pushed.

## Documentation

English docs live in `docs/`, German ones in `docs/de/`. If you change a topic that exists in both, update both or say in the
pull request that the German part still needs updating.

## Code of conduct

Be kind and constructive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
