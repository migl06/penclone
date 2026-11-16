# Security policy

## Reporting a problem

Please **do not open a public issue** for security problems. Report them privately via
[GitHub private vulnerability reporting](https://github.com/migl06/penclone/security/advisories/new). Only the maintainer can
see the report.

Helpful details: what the problem is, how to reproduce it, which commit you used, and what impact you expect.

## Scope

penclone runs locally and reads files you give it (sample PDFs/SVGs, profile archives). Problems that are in scope include, for
example, a crafted sample or profile archive that writes files outside the profile directory, or anything that could leak a
user's handwriting data.

## Supported versions

penclone is in early development; only the latest commit on `main` is supported.
