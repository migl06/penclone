// @ts-check
/* Everything penclone can do, as functions. The command line (bin/penclone.js) and the MCP server (lib/mcp.js) are thin
 * layers over these, so nothing is possible in one interface but not in the other (docs/decisions.md §2, full parity).
 * Functions return plain objects and never print; errors are thrown with a message meant for the user. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hyphenator, layout, LAYOUT, PAGES, PAPERS, PENS, hash, resolvePaper } from '../engine/index.js';
import {
  FORMATS, ensureDir, listProfileNames, loadGlyphFile, loadProfile, paperFromTemplate, profileDir, profileTemplates,
  readJson, readProfile, writeDocument, writeProfile,
} from '../engine/node.js';
import { toPDF } from '../engine/output.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Characters a German text needs most often; status() suggests a character sheet for those missing. */
export const BASIC_CHARS = 'abcdefghijklmnopqrstuvwxyzäöüßABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ0123456789.,:;!?-()„“\'"/%&+=€§@';

// ---------------------------------------------------------------- Python pipeline

/** Run a pipeline script; returns its output. Throws with the output when it fails. */
export function python(script, args, { inherit = false } = {}) {
  const exe = process.env.PYTHON || 'python3';
  const r = spawnSync(exe, [join(ROOT, script), ...args], { encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' });
  if (r.error) throw new Error(`could not start Python (${r.error.message}); the pipeline needs Python 3 with numpy, scipy and pillow`);
  const out = ((r.stdout ?? '') + (r.stderr ?? '')).trim();
  if (r.status) throw new Error(out || `${script} failed`);
  return out;
}

// ---------------------------------------------------------------- options

/** Length in mm from a number or "8", "8mm", "0.8cm", "0.3in", "20pt". */
export function mm(v, what = 'length') {
  if (typeof v === 'number') return v;
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(mm|cm|in|pt)?\s*$/i.exec(String(v));
  if (!m) throw new Error(`${what}: not a length: ${v}`);
  return Number(m[1].replace(',', '.')) * { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72 }[(m[2] || 'mm').toLowerCase()];
}

function pageOpt(v) {
  if (Array.isArray(v)) return v.map((x) => mm(x, 'page'));
  if (PAGES[String(v).toLowerCase()]) return String(v).toLowerCase();
  const m = /^(.+?)x(.+)$/i.exec(String(v));
  if (!m) throw new Error(`page: use a4, a5, letter or WxH in mm, got ${v}`);
  return [mm(m[1], 'page'), mm(m[2], 'page')];
}

function marginOpt(v) {
  const a = Array.isArray(v) ? v : String(v).split(',');
  const x = a.map((s) => mm(s, 'margin'));
  if (![1, 4].includes(x.length)) throw new Error('margin: one value or top,right,bottom,left');
  return x.length === 1 ? [x[0], x[0], x[0], x[0]] : x;
}

/** The handwriting: a profile (with preferences) or a glyph file. */
function source(o) {
  if (o.glyphs) return loadGlyphFile(o.glyphs, o.layoutFile);
  const name = o.profile ?? defaultProfile();
  return { ...loadProfile(name, { glyphSet: o.glyphSet }), name };
}

function defaultProfile() {
  const names = listProfileNames();
  if (names.length === 1) return names[0];
  if (!names.length) throw new Error('no handwriting profile yet - run: penclone status');
  throw new Error(`several profiles (${names.join(', ')}): choose one with --profile`);
}

/**
 * Resolve the paper: explicit option, else profile preference, else blank (docs/decisions.md §12).
 * Accepts a built-in name, an own template of the profile, or a scan/PDF file (measured on the fly).
 */
function paperOpt(name, S, tmp) {
  const n = name ?? S.preferences?.paper ?? 'blank';
  if (PAPERS[n]) return { paper: n, label: n };
  if (S.dir) {
    const own = profileTemplates(S.dir);
    if (own[n]) return { paper: paperFromTemplate(own[n]), label: `${n} (own template)` };
  }
  if (existsSync(n)) {
    const out = ensureDir(join(tmp(), 'paper'));
    python('pipeline/scan_paper.py', ['--input', n, '--out', out]);
    return { paper: paperFromTemplate(out), label: `${basename(n)} (scan)` };
  }
  throw new Error(`unknown paper "${n}": built in ${Object.keys(PAPERS).join(', ')}; or an own template, or a scan file`);
}

/** Options shared by render and fill. */
function styleOpts(o, S) {
  const pref = S.preferences ?? {};
  const output = o.output ?? pref.output ?? 'paper';
  const set = PENS[output];
  if (!set) throw new Error(`output must be paper or ipad, got ${output}`);
  // a saved pen applies only where it exists (a paper pen is ignored for iPad output); an explicit pen must exist
  const pen = o.pen ?? (pref.pen && set[pref.pen] ? pref.pen : undefined);
  const penName = pen ?? (output === 'paper' ? 'ballpoint' : 'pen');
  if (!set[penName]) throw new Error(`pen "${penName}" does not exist for ${output}; use ${Object.keys(set).join(', ')}`);
  const color = o.color ?? pref.color;
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`color must look like #1f2a5a, got ${color}`);
  return { output, pen: penName, color, penScale: (o.width ? mm(o.width, 'width') : 0) || set[penName].width };
}

function missingAdvice(missing, profile) {
  const chars = Object.keys(missing);
  if (!chars.length) return null;
  return {
    chars: chars.join(''),
    ask_user: `These characters are not in the handwriting yet: ${chars.join(' ')}. They were left out. Ask the user what to do: `
      + `(1) write them once on a small sheet - create_sample_sheet with chars="${chars.join('')}", write it, then import_samples; `
      + '(2) leave them out; or (3) replace them in the text (e.g. "§" by "Paragraph").',
    cli: `penclone sample-sheet --chars '${chars.join('')}' --out missing.pdf   # write it, then: penclone import ${profile ?? 'NAME'} written.pdf --manifest missing.json`,
  };
}

// ---------------------------------------------------------------- render

/**
 * Write text in a profile's handwriting.
 * @param {Record<string, any>} o text | input, out, profile | glyphs, paper, output, pen, color, width, page, margin, size, pages,
 *   lineSpacing, grid, lang, hyphenation (bool), seed, format, glyphSet, preview (bool: also return PNG of page 1)
 */
export async function render(o) {
  const text = o.text ?? (o.input === '-' ? readFileSync(0, 'utf8') : o.input ? readFileSync(o.input, 'utf8') : null);
  if (text == null) throw new Error('nothing to write: give text or an input file');
  const S = source(o);
  const pref = S.preferences ?? {};
  let tmpDir = null;
  const tmp = () => (tmpDir ??= mkdtempSync(join(tmpdir(), 'penclone-')));
  try {
    const { paper, label } = paperOpt(o.paper, S, tmp);
    const st = styleOpts(o, S);
    const opts = { ...S.layout, paper, penScale: st.penScale };
    const pg = o.page ?? pref.page;
    if (pg) opts.page = pageOpt(pg);
    if (typeof paper === 'object' && paper.type === 'scan' && paper.page && !o.page) opts.page = paper.page;
    if (o.margin) opts.margin = marginOpt(o.margin);
    if (o.size) opts.xHeight = mm(o.size, 'size');
    if (o.lineSpacing) opts.lineSpacing = mm(o.lineSpacing, 'line spacing');
    if (o.grid) opts.grid = mm(o.grid, 'grid');
    const lang = o.lang ?? pref.lang ?? 'de';
    opts.hyphenate = o.hyphenation !== false;
    opts.hyphenator = opts.hyphenate ? await hyphenator(lang) : null;
    opts.seed = o.seed ?? 1;
    let doc = layout(S.lib, text, opts);
    let fitted = null;
    if (o.pages) {
      // fit to N pages: the largest x-height (and, on blank paper, line distance in proportion) that needs at most N pages
      const N = Number(o.pages);
      if (!(N >= 1)) throw new Error('pages: a whole number of pages');
      const natural = opts.xHeight ?? LAYOUT.xHeight, ls = opts.lineSpacing ?? LAYOUT.lineSpacing;
      const at = (s) => layout(S.lib, text, { ...opts, xHeight: s, lineSpacing: ls * s / natural });
      if (doc.pages.length > N) {
        let lo = Math.max(1.0, natural * 0.4), hi = natural, best = at(lo);
        if (best.pages.length > N) throw new Error(`does not fit on ${N} page(s) even at ${lo.toFixed(2)} mm x-height (needs ${best.pages.length})`);
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2, d = at(mid);
          if (d.pages.length <= N) { lo = mid; best = d; } else hi = mid;
        }
        doc = best;
      }
      fitted = { pages: N, xHeightMm: +doc.xHeight.toFixed(2), natural: +natural.toFixed(2) };
    }
    const format = (o.format ?? (o.out ? o.out.split('.').pop() : pref.format) ?? 'pdf').toLowerCase();
    if (!FORMATS.includes(format)) throw new Error(`format must be one of ${FORMATS.join(', ')}`);
    const out = o.out ?? (o.input && o.input !== '-' ? o.input.replace(/\.[^./]*$/, '') : 'penclone') + '.' + format;
    const style = { output: st.output, pen: st.pen, color: st.color, title: o.input && o.input !== '-' ? basename(o.input) : undefined };
    const files = await writeDocument(doc, out, { ...style, format });
    const res = {
      files: files.map((f) => resolve(f)), format, pages: doc.pages.length,
      lines: doc.pages.reduce((n, p) => n + p.lines.length, 0),
      xHeightMm: +doc.xHeight.toFixed(2), lineSpacingMm: +doc.lineSpacing.toFixed(2),
      paper: label, output: st.output, pen: st.pen, glyphs: S.glyphFiles.map((f) => basename(f)),
      measuredFromSamples: Object.keys(S.layout), missing: doc.missing, substituted: doc.substituted, overflow: doc.overflow,
      hyphenation: opts.hyphenator ? lang : opts.hyphenate ? `no patterns for ${lang}` : 'off',
      missingAdvice: missingAdvice(doc.missing, S.name), fitted,
    };
    if (o.preview) {
      const { previewPng } = await import('../engine/preview.js');
      res.previewPng = previewPng(toPDF(doc, { ...style }), 1, 80);
    }
    return res;
  } finally {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- worksheets

/**
 * Write answers into the fields of a scanned page or PDF and fit each text to its box (docs/decisions.md §9).
 * @param {Record<string, any>} o sheet (pdf/png/jpg), page, fields ({fields: [{box: [x, y, w, h] mm, text, size?, min_size?}]}
 *   or a JSON file), out, profile, pen, color, output, seed
 */
export async function fill(o) {
  if (!o.sheet || !existsSync(o.sheet)) throw new Error('sheet: give the scan or PDF to write on');
  const spec = typeof o.fields === 'string' ? readJson(o.fields) : o.fields;
  const fields = spec?.fields ?? spec;
  if (!Array.isArray(fields) || !fields.length) throw new Error('fields: a list of {box: [x, y, w, h] in mm, text}');
  const S = source(o);
  const st = styleOpts(o, S);
  const tmp = mkdtempSync(join(tmpdir(), 'penclone-'));
  try {
    const boxes = join(tmp, 'fields.json');
    writeFileSync(boxes, JSON.stringify({ fields: fields.map((f) => ({ box: f.box })) }));
    python('pipeline/scan_paper.py', ['--input', o.sheet, '--out', tmp, '--page', String(o.page ?? spec?.page ?? 1), '--boxes', boxes]);
    const t = readJson(join(tmp, 'template.json'));
    const paper = paperFromTemplate(tmp);
    const [pw, ph] = t.page;
    const H = await hyphenator(o.lang ?? S.preferences?.lang ?? 'de');
    const natural = o.size ? mm(o.size, 'size') : S.layout.xHeight ?? LAYOUT.xHeight;
    const ratio = LAYOUT.lineSpacing / LAYOUT.xHeight;          // line distance per x-height without ruled lines (assumption)
    const page = { width: pw, height: ph, lines: [], paper: { ...paper, rules: [], verticals: [] }, top: 0 };
    const report = [];
    const missing = {};
    fields.forEach((f, i) => {
      const [x, y, w, h] = f.box.map((v) => mm(v, 'box'));
      const rules = (t.fields?.[i]?.rules ?? []).filter((r) => r > y + 1 && r <= y + h + 0.5);
      const maxSize = f.size ? mm(f.size, 'size') : natural;
      const minSize = f.min_size ? mm(f.min_size, 'min_size') : Math.max(1.4, 0.6 * natural);   // assumption: still readable
      let best = null;
      for (let s = maxSize; s >= minSize - 1e-9; s *= 0.95) {
        let base;
        if (rules.length) {
          const sp = rules.length > 1 ? rules[1] - rules[0] : h;
          if (2.6 * s > sp + 0.01 && s > minSize) continue;              // writing must fit between the lines (assumption)
          base = rules;
        } else {
          // first baseline leaves room for capitals and umlaut dots (about 2.3 x-heights for the first writer, assumption)
          base = [];
          for (let b = y + Math.min(2.4 * s, h * 0.75); b + 0.6 * s <= y + h + 1e-9; b += ratio * s) base.push(b);
          if (!base.length) continue;
        }
        const doc = layout(S.lib, String(f.text ?? ''), {
          ...S.layout, xHeight: s, page: [pw, ph], margin: [0, pw - (x + w) + 0.5 * s, 0, x + 0.5 * s], rules: base, maxPages: 1,
          seed: hash(o.seed ?? 1, 'field', i), hyphenator: H, penScale: st.penScale,
        });
        best = { s, doc };
        if (!doc.unplaced.length && !doc.overflow.length) break;
      }
      if (!best) { report.push({ field: i + 1, fits: false, reason: 'box too small for one line' }); return; }
      const { s, doc } = best;
      for (const c of Object.keys(doc.missing)) missing[c] = (missing[c] ?? 0) + doc.missing[c];
      page.lines.push(...doc.pages[0].lines);
      const left = doc.unplaced.join(' ');
      report.push({
        field: i + 1, fits: !left && !doc.overflow.length, sizeMm: +s.toFixed(2), lines: doc.pages[0].lines.length,
        onRuledLines: rules.length > 0, notWritten: left || undefined,
        advice: left ? `${[...left].length} characters did not fit even at ${s.toFixed(1)} mm: shorten the text or use a bigger box` : undefined,
      });
    });
    const doc = { pages: [page], missing, substituted: {}, overflow: [], unplaced: [], xHeight: natural, lineSpacing: LAYOUT.lineSpacing };
    const out = o.out ?? o.sheet.replace(/\.[^./]*$/, '') + '-filled.pdf';
    const files = await writeDocument(doc, out, { output: st.output, pen: st.pen, color: st.color });
    const res = { files: files.map((f) => resolve(f)), skewCorrectedDeg: t.skew_deg, fields: report, missingAdvice: missingAdvice(missing, S.name) };
    if (o.preview) {
      const { previewPng } = await import('../engine/preview.js');
      res.previewPng = previewPng(toPDF(doc, { output: st.output, pen: st.pen, color: st.color }), 1, 70);
    }
    return res;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- profiles

export function listProfiles() {
  return listProfileNames().map((n) => {
    const { dir, P } = readProfile(n);
    const has = (f) => existsSync(join(dir, f));
    return {
      name: n, languages: P.languages ?? [], sources: (P.sources ?? []).map((s) => s.id),
      glyphs: ['glyphs.json', 'glyphs-v2.json', 'glyphs-chars.json'].filter(has), measuredLayout: has('layout.json'),
      templates: Object.keys(profileTemplates(dir)), preferences: P.preferences ?? {},
    };
  });
}

export function readProfileOrThrow(name) { return readProfile(name); }

export function createProfile({ name, lang = 'de' }) {
  if (!name || !/^[\w.-]+$/.test(name)) throw new Error('name: letters, digits, . _ - only');
  return python('pipeline/profiles.py', ['create', name, '--lang', lang]);
}

export function buildProfile({ profile, only }) {
  return python('pipeline/profiles.py', ['build', profile, ...(only ? ['--only', only] : [])]);
}

/** Add a written sample sheet v2 or character sheet and build what it changes. */
export function importSamples({ profile, pdf, manifest, build = true }) {
  if (!existsSync(pdf)) throw new Error(`file not found: ${pdf}`);
  if (!existsSync(manifest)) throw new Error(`manifest not found: ${manifest} (written next to the sheet by sample-sheet)`);
  const kind = readJson(manifest).sheet;
  let out = python('pipeline/profiles.py', ['add-sample', profile, '--pdf', pdf, '--manifest', manifest]);
  if (build) out += '\n' + buildProfile({ profile, only: kind === 'chars' ? 'chars' : undefined });
  return out;
}

export function sampleSheet({ out = 'sheet.pdf', chars, lines }) {
  const args = ['--out', out];
  if (chars) args.push('--chars', chars);
  if (lines) args.push('--lines', String(lines));
  const msg = python('pipeline/make_sheet.py', args);
  return {
    pdf: resolve(out), manifest: resolve(out.replace(/\.pdf$/i, '') + '.json'), output: msg,
    howToWrite: chars
      ? 'Write each line on the ruled line below it: the character between two small n, three times, in your normal size.'
      : 'Open it in a notes app on the iPad (GoodNotes, Notability, ...), write every sentence on the line below it with the Apple Pencil, normally and at normal speed (about 30 minutes), and export the written pages as PDF. Or use the capture page in Safari (penclone capture / start_capture). Writing on paper and scanning does not work yet: penclone needs the strokes as vectors.',
    next: 'import the written PDF together with the manifest (penclone import / MCP import_samples)',
  };
}

export function setPreferences({ profile, ...prefs }) {
  const allowed = ['output', 'pen', 'color', 'paper', 'page', 'lang', 'format'];
  const { dir, P } = readProfile(profile ?? defaultProfile());
  const cur = { ...(P.preferences ?? {}) };
  for (const [k, v] of Object.entries(prefs)) {
    if (v === undefined) continue;
    if (!allowed.includes(k)) throw new Error(`unknown preference ${k}; use ${allowed.join(', ')}`);
    if (v === null || v === '') delete cur[k];
    else cur[k] = String(v);
  }
  if (cur.output && !PENS[cur.output]) throw new Error(`output must be paper or ipad, got ${cur.output}`);
  if (cur.pen && !Object.values(PENS).some((set) => set[cur.pen])) {
    throw new Error(`pen "${cur.pen}" does not exist; use ${[...new Set(Object.values(PENS).flatMap((x) => Object.keys(x)))].join(', ')}`);
  }
  if (cur.paper && !PAPERS[cur.paper] && !profileTemplates(dir)[cur.paper]) throw new Error(`unknown paper ${cur.paper}`);
  P.preferences = cur;
  writeProfile(dir, P, `preferences ${JSON.stringify(cur)}`, 'chosen by the user');
  return cur;
}

export function glyphReport({ profile, sheet }) {
  return python('tools/glyph_report.py', ['--profile', profile, ...(sheet ? ['--sheet', sheet] : [])]);
}

/** Anonymous statistics of a profile for checking the general rules (P5): numbers only, nothing is sent. */
export function validate({ profile }) {
  return JSON.parse(python('pipeline/validate_profile.py', [profile ?? defaultProfile()]));
}

export function exportProfile({ profile, zip }) { return python('pipeline/profiles.py', ['export', profile, zip]); }
export function importProfile({ zip, name }) { return python('pipeline/profiles.py', ['import', zip, ...(name ? ['--name', name] : [])]); }

// ---------------------------------------------------------------- paper templates

/**
 * Add an own paper template to a profile: measured from a scan of an empty page (`from`), or from parameters.
 * @param {{profile: string, name: string, from?: string, type?: string, lineSpacing?: any, grid?: any, margins?: string[], background?: boolean}} o
 */
export function addTemplate(o) {
  const { dir, P } = readProfile(o.profile);
  if (!o.name || !/^[\w.-]+$/.test(o.name)) throw new Error('template name: letters, digits, . _ - only');
  if (PAPERS[o.name]) throw new Error(`"${o.name}" is a built-in paper; choose another name`);
  const tdir = ensureDir(join(dir, 'templates', o.name));
  let t;
  if (o.from) {
    if (!existsSync(o.from)) throw new Error(`file not found: ${o.from}`);
    python('pipeline/scan_paper.py', ['--input', o.from, '--out', tdir, ...(o.background === false ? ['--no-background'] : [])]);
    t = readJson(join(tdir, 'template.json'));
  } else {
    const type = o.type ?? 'lined';
    if (!['blank', 'lined', 'squared', 'dotted'].includes(type)) throw new Error('type: blank, lined, squared or dotted');
    t = { kind: 'built', type, note: 'own template' };
    if (type === 'lined') t.spacing = mm(o.lineSpacing ?? 8, 'line spacing');
    if (type === 'squared' || type === 'dotted') t.grid = mm(o.grid ?? 5, 'grid');
    if (o.margins?.length) t.margins = o.margins;
    writeFileSync(join(tdir, 'template.json'), JSON.stringify(t, null, 1));
  }
  writeProfile(dir, P, `template ${o.name} (${o.from ? 'scan ' + basename(o.from) : 'parameters'})`, '');
  const { rules, fields, ...summary } = t;
  return { name: o.name, ...summary, rulesFound: rules?.length };
}

export function styles({ profile } = {}) {
  let own = {};
  try { if (profile || listProfileNames().length === 1) own = profileTemplates(readProfile(profile ?? defaultProfile()).dir); } catch { /* no profile */ }
  return {
    papers: Object.fromEntries(Object.entries(PAPERS).map(([k, v]) => [k, v.note])),
    ownTemplates: Object.keys(own),
    pens: Object.fromEntries(Object.entries(PENS).map(([out, set]) => [out, Object.fromEntries(Object.entries(set).map(([k, v]) => [k, v.note]))])),
    pages: Object.keys(PAGES), formats: FORMATS,
    paperOrder: ['explicit choice', 'the worksheet itself (fill)', 'profile preference', 'blank'],
  };
}

// ---------------------------------------------------------------- status: the next step

/**
 * State of penclone and the next step - computed here so CLI, MCP and skill all show the same (docs/decisions.md §11).
 * @param {{profile?: string}} [o]
 */
export function status(o = {}) {
  const profiles = listProfileNames();
  const step = (id, say, cli, mcp, extra = {}) => ({ id, say, cli, mcp, ...extra });
  if (!profiles.length) {
    return {
      profiles, ready: false,
      next: step('create-profile', 'No handwriting profile yet. Create one, then print or open the sample sheet and write it (about 30 minutes).',
        'penclone profile create NAME && penclone sample-sheet --out sheet.pdf', 'create_profile, then create_sample_sheet'),
    };
  }
  const name = o.profile ?? (profiles.length === 1 ? profiles[0] : null);
  if (!name) {
    return { profiles, ready: false, next: step('choose-profile', `Several profiles: ${profiles.join(', ')}. Say which one to use.`, 'penclone status --profile NAME', 'get_status with profile') };
  }
  const { dir, P } = readProfile(name);
  const has = (f) => existsSync(join(dir, f));
  const mtime = (f) => (existsSync(f) ? statSync(f).mtimeMs : 0);
  const sources = P.sources ?? [];
  const base = { profiles, profile: name, sources: sources.map((s) => s.id), preferences: P.preferences ?? {} };
  if (!sources.length) {
    return { ...base, ready: false, next: step('write-samples', 'The profile has no handwriting yet. Create the sample sheet, write it, and import it.',
      `penclone sample-sheet --out sheet.pdf   # write it, then: penclone import ${name} written.pdf --manifest sheet.json`,
      'create_sample_sheet, then import_samples') };
  }
  const v2 = sources.some((s) => s.id === 'sample-v2'), v1 = sources.some((s) => s.id === 'alphabet-v1');
  const charSrc = sources.filter((s) => s.sheet === 'chars');
  if ((v1 && !has('glyphs.json')) || (v2 && !has('glyphs-v2.json'))) {
    return { ...base, ready: false, next: step('build', 'Samples are imported but not built yet.', `penclone profile build ${name}`, 'build_profile') };
  }
  const charsBuilt = mtime(join(dir, 'glyphs-chars.json'));
  if (charSrc.some((s) => mtime(join(dir, 'samples', s.id, 'sheet.json')) > charsBuilt)) {
    return { ...base, ready: false, next: step('build-chars', 'New characters were imported but not built yet.', `penclone profile build ${name} --only chars`, 'build_profile with only=chars') };
  }
  const S = loadProfile(name);
  const missing = [...BASIC_CHARS].filter((c) => !S.lib.chars.has(c)).join('');
  const optional = [];
  if (!Object.keys(P.preferences ?? {}).length) optional.push(step('preferences', 'Optional: choose your usual output, pen and paper (asked once, can be changed).', `penclone init --profile ${name}`, 'set_preferences'));
  if (missing) optional.push(step('missing-chars', `Optional: these common characters are not in your handwriting yet: ${missing}. Ask whether to write them now.`, `penclone sample-sheet --chars '${missing}' --out missing.pdf`, `create_sample_sheet with chars="${missing}"`));
  if (!has('layout.json')) optional.push(step('measure', 'Optional: word gaps and line drift use assumptions; sample sheet v2 measures your own.', 'penclone sample-sheet --out sheet.pdf', 'create_sample_sheet'));
  return {
    ...base, ready: true, glyphChars: S.lib.chars.size, missingCommonChars: missing, measuredLayout: has('layout.json'),
    templates: Object.keys(profileTemplates(dir)),
    next: step('ready', 'Ready. Write text with your handwriting.', `penclone render notes.txt --profile ${name} -o notes.pdf`, 'render_handwriting'),
    optional,
  };
}

export { profileDir };
