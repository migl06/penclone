"""Handwriting profiles: your handwriting, saved under a name and reusable.

A profile keeps everything penclone knows about one person's handwriting,
outside the repository so it survives updates and re-downloads:

    $PENCLONE_HOME/profiles/<name>/          (default: ~/.local/share/penclone)
        profile.json        name, languages, sample sources, rules, change log
        samples/<source>/   the sample PDF and its extracted pages (pg1.svg ...)
        glyphs.json         glyph library built from the samples + rules
        glyphs-v2.json      glyph library from sample sheet v2 (+ report-v2.json)
        glyphs-chars.json   characters added later with character sheets (make_sheet.py --chars)
        layout.json         measured line habits from sample sheet v2: word gaps, baseline drift (measure_layout.py)

How penclone improves:
  1. more samples   -> more variants per character, better proportions
  2. general rules  -> built into the pipeline, the same for everyone, documented
                       in docs/rules.md and changed only through reviewed pull
                       requests (users cannot change them)
  3. overrides      -> optional personal exceptions in profile.json, normally
                       empty; every change is logged with a reason

Usage:
    python3 profiles.py create NAME [--pdf samples.pdf --sheet alphabet-v1] [--lang de]   # without --pdf: empty profile
    python3 profiles.py add-sample NAME --pdf written.pdf --manifest sheet.json   # written sample sheet v2 or character sheet
    python3 profiles.py list
    python3 profiles.py show NAME
    # optional overrides (normally not needed):
    python3 profiles.py override NAME clean-dots ';!' --why "..."
    python3 profiles.py override NAME align-cap N --why "..."
    python3 profiles.py block NAME k alphabet-v1:p3 --why "..."
    python3 profiles.py unblock NAME k alphabet-v1:p3
    python3 profiles.py build NAME [--only v1|v2|chars]   # rebuild the glyph libraries
    python3 profiles.py export NAME out.zip        # backup / move to another computer
    python3 profiles.py import in.zip
"""
import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys
import zipfile

VERSION = 1
SHEETS = {'alphabet-v1': 3}          # sample sheet type -> number of pages (sample-v2 has as many pages as its manifest)
V2 = 'sample-v2'                     # sample sheet v2: sentences, needs the manifest written by make_sheet.py
CHARS = 'chars'                      # character sheet (make_sheet.py --chars): missing characters added later
OVERRIDE_KEYS = {
    'clean_dots': list,         # small marks of these chars become synthetic dots (default: marks stay as written)
    'blocked': dict,            # char -> ["<source>:p<page>", ...] variants not to use
    'align_cap_height': list,   # chars whose strokes each span baseline..cap height
}


def empty_overrides():
    return {k: t() for k, t in OVERRIDE_KEYS.items()}


def home():
    base = os.environ.get('PENCLONE_HOME') or os.path.join(
        os.environ.get('XDG_DATA_HOME') or os.path.expanduser('~/.local/share'), 'penclone')
    return os.path.join(base, 'profiles')


def path(name_or_dir):
    if os.path.isdir(name_or_dir) and os.path.isfile(os.path.join(name_or_dir, 'profile.json')):
        return os.path.abspath(name_or_dir)
    return os.path.join(home(), name_or_dir)


def load(name_or_dir):
    d = path(name_or_dir)
    fn = os.path.join(d, 'profile.json')
    if not os.path.isfile(fn):
        sys.exit(f'profile not found: {d} (create it with: profiles.py create NAME --pdf FILE)')
    P = json.load(open(fn, encoding='utf-8'))
    P['_dir'] = d
    ov = empty_overrides()
    ov.update({k: v for k, v in P.get('overrides', {}).items() if k in OVERRIDE_KEYS})
    P['overrides'] = ov
    P.pop('rules', None)        # older format; general rules now live in the pipeline
    return P


def save(P):
    d = P.pop('_dir')
    json.dump(P, open(os.path.join(d, 'profile.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    P['_dir'] = d


def glyphs_path(P):
    return os.path.join(P['_dir'], 'glyphs.json')


def source_dir(P, source_id):
    return os.path.join(P['_dir'], 'samples', source_id)


def log(P, change, why=None):
    P.setdefault('log', []).append({'date': datetime.date.today().isoformat(), 'change': change, 'why': why or ''})


def create(name, pdf=None, sheet='alphabet-v1', langs=('de',)):
    """Create a profile; without pdf it starts empty (add sample sheet v2 later with add-sample)."""
    d = path(name)
    if os.path.exists(d):
        sys.exit(f'profile already exists: {d}')
    if pdf is None:
        os.makedirs(d)
        P = {'name': name, 'version': VERSION, 'created': datetime.date.today().isoformat(), 'languages': list(langs),
             'sources': [], 'overrides': empty_overrides(), 'preferences': {}, '_dir': d}
        log(P, 'create (empty; samples follow)')
        save(P)
        return P
    if sheet not in SHEETS:
        sys.exit(f'unknown sample sheet {sheet!r}; known: {", ".join(SHEETS)}')
    src = os.path.join(d, 'samples', sheet)
    os.makedirs(src)
    shutil.copy(pdf, os.path.join(src, os.path.basename(pdf)))
    for n in range(1, SHEETS[sheet] + 1):
        subprocess.run(['pdftocairo', '-svg', '-f', str(n), '-l', str(n), pdf, os.path.join(src, f'pg{n}.svg')], check=True)
    P = {'name': name, 'version': VERSION, 'created': datetime.date.today().isoformat(), 'languages': list(langs),
         'sources': [{'id': sheet, 'sheet': sheet, 'file': os.path.basename(pdf), 'pages': SHEETS[sheet],
                      'added': datetime.date.today().isoformat()}],
         'overrides': empty_overrides(), '_dir': d}
    log(P, f'create from {os.path.basename(pdf)} ({sheet})')
    save(P)
    return P


def add_sample_v2(name, pdf, manifest):
    """Add a written sample sheet v2 or a character sheet (PDF with pen strokes + its manifest) to an existing profile."""
    P = load(name)
    man = json.load(open(manifest, encoding='utf-8'))
    kind = man.get('sheet', V2)
    if kind == CHARS:
        n = 1 + sum(1 for s in P['sources'] if s.get('sheet') == CHARS)
        sid = f'{CHARS}-{n}'
        while os.path.exists(source_dir(P, sid)):
            n += 1; sid = f'{CHARS}-{n}'
    elif kind == V2:
        sid = V2
        if any(s['id'] == V2 for s in P['sources']):
            sys.exit(f'profile {name} already has a {V2} source; remove it first or use another profile')
    else:
        sys.exit(f'unknown sheet type {kind!r} in {manifest}')
    src = source_dir(P, sid)
    os.makedirs(src)
    shutil.copy(pdf, os.path.join(src, 'written.pdf'))
    shutil.copy(manifest, os.path.join(src, 'sheet.json'))
    pages = max(l['page'] for l in man['lines'])
    entry = {'id': sid, 'sheet': kind, 'file': 'written.pdf', 'pages': pages, 'sentences': len(man['lines']),
             'added': datetime.date.today().isoformat()}
    if kind == CHARS:
        entry['chars'] = man.get('chars', '')
    P['sources'].append(entry)
    what = f'characters {entry["chars"]}' if kind == CHARS else f'{len(man["lines"])} sentences, {pages} pages'
    log(P, f'add {sid} ({what}) from {os.path.basename(pdf)}')
    save(P)
    return P, sid


def build_chars(P):
    """Build glyphs-chars.json from all character sheets: only the target characters are kept (the n give the size)."""
    import tempfile
    here = os.path.dirname(os.path.abspath(__file__))
    out, report = {}, {}
    for s in P['sources']:
        if s.get('sheet') != CHARS:
            continue
        src = source_dir(P, s['id'])
        with tempfile.TemporaryDirectory() as d:
            g, r = os.path.join(d, 'g.json'), os.path.join(d, 'r.json')
            rc = subprocess.run([sys.executable, os.path.join(here, 'build_glyphs_v2.py'), '--pdf',
                                 os.path.join(src, 'written.pdf'), '--manifest', os.path.join(src, 'sheet.json'),
                                 '--out', g, '--report', r], stdout=subprocess.DEVNULL).returncode
            if rc:
                print(f'{s["id"]}: could not read the sheet')
                return rc
            glyphs = json.load(open(g, encoding='utf-8'))
        for c in s.get('chars', ''):
            got = glyphs.get(c, [])
            report[c] = report.get(c, 0) + len(got)
            if got:
                out.setdefault(c, []).extend(got)
    json.dump(out, open(os.path.join(P['_dir'], 'glyphs-chars.json'), 'w', encoding='utf-8'), ensure_ascii=False,
              separators=(',', ':'))
    for c, n in report.items():
        print(f'  {c!r}: {n} variant(s)' + ('' if n else ' - not found; write it again with clear gaps to the n'))
    return 0


def build_v2(P, limit=0.9):
    """Build glyphs-v2.json from the sample-v2 source of a profile; the sheet-v1 glyphs (if built) serve as templates."""
    src = source_dir(P, V2)
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(P['_dir'], 'glyphs-v2.json')
    cmd = [sys.executable, os.path.join(here, 'build_glyphs_v2.py'), '--pdf', os.path.join(src, 'written.pdf'),
           '--manifest', os.path.join(src, 'sheet.json'), '--out', out,
           '--report', os.path.join(P['_dir'], 'report-v2.json'), '--limit', str(limit)]
    if os.path.isfile(glyphs_path(P)):
        cmd += ['--templates', glyphs_path(P)]
    else:
        print('note: no sheet-v1 glyphs yet; sample-v2 is read without templates (joined letters are not recognised)')
    rc = subprocess.run(cmd).returncode
    if rc:
        return rc
    # line-level habits (word gaps, baseline drift) for the renderer, measured at the same x-height as the glyphs
    rep = json.load(open(os.path.join(P['_dir'], 'report-v2.json'), encoding='utf-8'))
    cmd = [sys.executable, os.path.join(here, 'measure_layout.py'), '--pdf', os.path.join(src, 'written.pdf'),
           '--manifest', os.path.join(src, 'sheet.json'), '--xheight-pt', str(rep['xheight_pt']),
           '--out', os.path.join(P['_dir'], 'layout.json')]
    return subprocess.run(cmd, stdout=subprocess.DEVNULL).returncode


def set_chars(P, key, chars, add=True):
    cur = list(P['overrides'].get(key, []))
    for c in chars:
        if add and c not in cur:
            cur.append(c)
        if not add and c in cur:
            cur.remove(c)
    P['overrides'][key] = cur


def main():
    ap = argparse.ArgumentParser(description='Manage handwriting profiles.')
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('create'); c.add_argument('name'); c.add_argument('--pdf', help='alphabet sample sheet v1 (optional)')
    c.add_argument('--sheet', default='alphabet-v1'); c.add_argument('--lang', default='de')
    sv = sub.add_parser('add-sample', help='add a written sample sheet v2 or character sheet'); sv.add_argument('name')
    sv.add_argument('--pdf', required=True); sv.add_argument('--manifest', required=True)
    sub.add_parser('list')
    s = sub.add_parser('show'); s.add_argument('name')
    r = sub.add_parser('override', help='optional personal exception (normally not needed)'); r.add_argument('name')
    r.add_argument('kind', choices=['clean-dots', 'align-cap'])
    r.add_argument('chars'); r.add_argument('--remove', action='store_true'); r.add_argument('--why')
    for cmd in ('block', 'unblock'):
        b = sub.add_parser(cmd, help='optional personal exception: do not use a variant'); b.add_argument('name'); b.add_argument('char'); b.add_argument('variant')
        b.add_argument('--why')
    bd = sub.add_parser('build'); bd.add_argument('name'); bd.add_argument('--no-fixes', action='store_true')
    bd.add_argument('--only', choices=['v1', 'v2', 'chars'], help='rebuild only one glyph library')
    e = sub.add_parser('export'); e.add_argument('name'); e.add_argument('zip')
    i = sub.add_parser('import'); i.add_argument('zip'); i.add_argument('--name')
    a = ap.parse_args()

    if a.cmd == 'create':
        P = create(a.name, a.pdf, a.sheet, a.lang.split(','))
        print('created', P['_dir'])
    elif a.cmd == 'add-sample':
        P, sid = add_sample_v2(a.name, a.pdf, a.manifest)
        only = ' --only chars' if sid.startswith(CHARS) else ''
        print('added', sid, 'to', P['_dir'], f'- now run: build {a.name}{only}')
    elif a.cmd == 'list':
        h = home()
        for n in sorted(os.listdir(h)) if os.path.isdir(h) else []:
            if os.path.isfile(os.path.join(h, n, 'profile.json')):
                P = load(n)
                built = 'built' if os.path.isfile(glyphs_path(P)) else 'not built'
                if os.path.isfile(os.path.join(P['_dir'], 'glyphs-v2.json')):
                    built += ' + v2'
                print(f"{n:20s} {','.join(P['languages']):6s} {len(P['sources'])} source(s), {built}")
    elif a.cmd == 'show':
        P = load(a.name)
        print(json.dumps({k: v for k, v in P.items() if k != '_dir'}, ensure_ascii=False, indent=2))
        print('dir:', P['_dir'])
    elif a.cmd == 'override':
        P = load(a.name)
        key = {'clean-dots': 'clean_dots', 'align-cap': 'align_cap_height'}[a.kind]
        set_chars(P, key, list(a.chars), add=not a.remove)
        log(P, f"{'remove' if a.remove else 'add'} override {a.kind} {a.chars}", a.why)
        save(P); print(key, '=', P['overrides'][key])
    elif a.cmd in ('block', 'unblock'):
        P = load(a.name)
        bl = P['overrides'].setdefault('blocked', {})
        cur = bl.setdefault(a.char, [])
        if a.cmd == 'block' and a.variant not in cur:
            cur.append(a.variant)
        if a.cmd == 'unblock' and a.variant in cur:
            cur.remove(a.variant)
        if not cur:
            bl.pop(a.char)
        log(P, f'override {a.cmd} {a.char} {a.variant}', a.why)
        save(P); print('blocked =', bl)
    elif a.cmd == 'build':
        P = load(a.name)
        here = os.path.dirname(os.path.abspath(__file__))
        rc = 0
        want = lambda k: a.only in (None, k)
        if want('v1') and any(x['id'] == 'alphabet-v1' for x in P['sources']):
            cmd = [sys.executable, os.path.join(here, 'build_glyphs.py'), '--profile', a.name]
            if a.no_fixes:
                cmd.append('--no-fixes')
            rc = subprocess.run(cmd).returncode
        if rc == 0 and want('v2') and any(x['id'] == V2 for x in P['sources']):
            rc = build_v2(P)
        if rc == 0 and want('chars') and any(x.get('sheet') == CHARS for x in P['sources']):
            rc = build_chars(P)
        sys.exit(rc)
    elif a.cmd == 'export':
        P = load(a.name)
        shutil.make_archive(a.zip[:-4] if a.zip.endswith('.zip') else a.zip, 'zip', os.path.dirname(P['_dir']),
                            os.path.basename(P['_dir']))
        print('exported to', a.zip)
    elif a.cmd == 'import':
        with zipfile.ZipFile(a.zip) as z:
            names = {n.split('/')[0] for n in z.namelist()}
            if len(names) != 1 or any(n.startswith('/') or '..' in n.split('/') for n in z.namelist()):
                sys.exit('not a penclone profile archive')
            src = names.pop(); dst = a.name or src
            if os.path.exists(path(dst)):
                sys.exit(f'profile already exists: {path(dst)}')
            os.makedirs(home(), exist_ok=True)
            tmp = os.path.join(home(), '.import-tmp')
            shutil.rmtree(tmp, ignore_errors=True); z.extractall(tmp)
            shutil.move(os.path.join(tmp, src), path(dst)); shutil.rmtree(tmp)
        P = load(dst); P['name'] = dst; log(P, f'import from {os.path.basename(a.zip)}'); save(P)
        print('imported', path(dst))


if __name__ == '__main__':
    main()
