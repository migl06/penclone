// @ts-check
/* MCP server (Model Context Protocol) on stdin/stdout: JSON-RPC 2.0, one message per line. No dependencies.
 * Every tool calls the same function as the command line (lib/commands.js), so both can do the same.
 *
 * Add it to an AI app, e.g. Claude Code:  claude mcp add penclone -- node /path/to/penclone/bin/penclone.js mcp
 * Claude Desktop (claude_desktop_config.json): {"mcpServers": {"penclone": {"command": "node", "args": ["/path/to/penclone/bin/penclone.js", "mcp"]}}} */
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import * as C from './commands.js';
import { PAPERS, PENS } from '../engine/index.js';

const VERSION = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')).version;
/** Protocol versions this server is known to work with (tools only); the client's version is accepted if listed. */
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/** Default folder for outputs when the AI gives no path (AI apps often start servers in "/"). */
export const OUT_DIR = process.env.PENCLONE_OUT || join(homedir(), 'penclone');

const INSTRUCTIONS = `penclone writes text in the user's own handwriting (from their pen strokes) as PDF, SVG, PNG or editable ink.
1. Call get_status first and follow its "next" step; mention its optional steps briefly.
2. New users: create_profile, then create_sample_sheet; the user writes it (print, or a notes app on the iPad, ~30 min) and gives you the exported PDF; then import_samples.
3. Ask only what matters (language, paper or iPad output, paper type); save the answers with set_preferences. Everything else has defaults.
4. When render_handwriting or fill_page reports missing characters, ASK the user: write them now (create_sample_sheet with chars=..., then import_samples), leave them out, or replace them in the text.
5. Worksheets and scanned pages: look at the page, give each answer a rough box in mm from the top-left corner; penclone measures the lines, fits the text and reports what does not fit. Check the preview and the report, then adjust (shorter text or bigger box).
6. Own paper: add_template with a scan of an empty page; penclone measures line spacing and margins itself - do not estimate them.
Use absolute file paths. penclone is not for forging documents or getting around authenticity checks.`;

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = (description) => ({ type: 'number', description });
const STYLE = {
  profile: str('handwriting profile name (optional if there is only one)'),
  paper: str(`paper: ${Object.keys(PAPERS).join(', ')}; an own template name; or the path of a scan to write on`),
  output: str('paper = pen on paper; ipad = clean digital ink like a notes app', { enum: ['paper', 'ipad'] }),
  pen: str(`pen for output paper: ${Object.keys(PENS.paper).join(', ')}; for ipad: ${Object.keys(PENS.ipad).join(', ')}`),
  color: str('ink colour #rrggbb (default: the pen\'s)'),
};

const TOOLS = [
  {
    name: 'get_status', description: 'State of penclone (profiles, samples, preferences) and the next step to take. Call this first.',
    inputSchema: { type: 'object', properties: { profile: STYLE.profile } },
    run: (a) => C.status(a),
  },
  {
    name: 'list_profiles', description: 'Handwriting profiles with their samples, glyph libraries, own paper templates and preferences.',
    inputSchema: { type: 'object', properties: {} },
    run: () => C.listProfiles(),
  },
  {
    name: 'list_styles', description: 'Built-in papers, own paper templates, pens, page sizes and output formats.',
    inputSchema: { type: 'object', properties: { profile: STYLE.profile } },
    run: (a) => C.styles(a),
  },
  {
    name: 'render_handwriting',
    description: 'Write text in the user\'s handwriting. Every line break starts a new line. Returns the file(s), a preview image and a report; if it lists missing characters, ask the user what to do.',
    inputSchema: {
      type: 'object', required: ['text'],
      properties: {
        text: str('the text to write'), out: str(`output file (.pdf .svg .png .xopp .inkml .excalidraw); default a new PDF in ${OUT_DIR}`),
        ...STYLE, page: str('a4, a5, letter or WIDTHxHEIGHT in mm'), margin_mm: num('page margin in mm'),
        size_mm: num('x-height in mm (default: measured from the samples)'), line_spacing_mm: num('line distance in mm'),
        grid_mm: num('square or dot size for squared/dotted paper'), seed: num('another seed gives another, equally valid version'),
        lang: str('language for hyphenation (de)'), hyphenation: { type: 'boolean', description: 'split long words at line ends (default true)' },
        preview: { type: 'boolean', description: 'return a preview image of page 1 (default true)' },
      },
    },
    run: (a) => C.render({
      text: a.text, out: outPath(a.out, 'pdf'), profile: a.profile, paper: inPath(a.paper), output: a.output, pen: a.pen,
      color: a.color, page: a.page, margin: a.margin_mm, size: a.size_mm, lineSpacing: a.line_spacing_mm, grid: a.grid_mm,
      seed: a.seed, lang: a.lang, hyphenation: a.hyphenation, preview: a.preview !== false,
    }),
  },
  {
    name: 'fill_page',
    description: 'Write answers into a scanned page or PDF (worksheet, form). Give each answer a rough box [x, y, width, height] in mm from the top-left corner; penclone finds the printed lines inside the box, fits the text (smaller if needed, never unreadably small) and reports per field whether it fits. Check the preview.',
    inputSchema: {
      type: 'object', required: ['sheet', 'fields'],
      properties: {
        sheet: str('path of the scan (png, jpg) or PDF'), page: num('page of a PDF (default 1)'),
        fields: {
          type: 'array', description: 'one entry per answer',
          items: { type: 'object', required: ['box', 'text'], properties: {
            box: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4, description: '[x, y, width, height] in mm' },
            text: str('what to write'), size_mm: num('largest x-height'), min_size_mm: num('smallest x-height allowed'),
          } },
        },
        out: str(`output file; default a new PDF in ${OUT_DIR}`), ...STYLE,
        preview: { type: 'boolean', description: 'return a preview image (default true)' },
      },
    },
    run: (a) => C.fill({
      sheet: inPath(a.sheet), page: a.page, fields: (a.fields ?? []).map((f) => ({ box: f.box, text: f.text, size: f.size_mm, min_size: f.min_size_mm })),
      out: outPath(a.out, 'pdf'), profile: a.profile, output: a.output, pen: a.pen, color: a.color, preview: a.preview !== false,
    }),
  },
  {
    name: 'create_profile', description: 'Create an empty handwriting profile (samples are added with import_samples).',
    inputSchema: { type: 'object', required: ['name'], properties: { name: str('profile name: letters, digits, . _ -'), lang: str('language (de)') } },
    run: (a) => ({ created: a.name, output: C.createProfile(a) }),
  },
  {
    name: 'create_sample_sheet',
    description: 'Create a sheet to write by hand: the full sample sheet (given sentences, about 30 minutes), or only some characters (chars) that are missing. Returns the PDF, the manifest needed for import_samples, and how to write it.',
    inputSchema: { type: 'object', properties: { out: str(`PDF path; default in ${OUT_DIR}`), chars: str('only these characters, e.g. "§@"') } },
    run: (a) => C.sampleSheet({ out: outPath(a.out, 'pdf', a.chars ? 'missing' : 'sheet'), chars: a.chars }),
  },
  {
    name: 'import_samples', description: 'Add a written sheet (PDF exported with the pen strokes) and its manifest to a profile, and build the glyphs.',
    inputSchema: { type: 'object', required: ['profile', 'pdf', 'manifest'], properties: {
      profile: str('profile name'), pdf: str('written sheet as PDF'), manifest: str('the .json written next to the sheet by create_sample_sheet') } },
    run: (a) => ({ output: C.importSamples({ profile: a.profile, pdf: inPath(a.pdf), manifest: inPath(a.manifest) }) }),
  },
  {
    name: 'build_profile', description: 'Rebuild the glyph libraries of a profile (all, or only v1, v2 or chars).',
    inputSchema: { type: 'object', required: ['profile'], properties: { profile: str('profile name'), only: str('v1, v2 or chars', { enum: ['v1', 'v2', 'chars'] }) } },
    run: (a) => ({ output: C.buildProfile(a) }),
  },
  {
    name: 'add_template',
    description: 'Add own paper to a profile: from a scan of an EMPTY page (penclone measures paper type, line spacing and margin lines itself and keeps the scan as background), or from parameters.',
    inputSchema: { type: 'object', required: ['profile', 'name'], properties: {
      profile: str('profile name'), name: str('template name'), from: str('scan or PDF of an empty page'),
      type: str('without a scan: lined, squared, dotted or blank', { enum: ['lined', 'squared', 'dotted', 'blank'] }),
      line_spacing_mm: num('lined: line distance'), grid_mm: num('squared/dotted: grid size'),
      margins: { type: 'array', items: { type: 'string', enum: ['left', 'right'] }, description: 'printed margin lines' },
      background: { type: 'boolean', description: 'keep the scan as background (default true)' } } },
    run: (a) => C.addTemplate({ profile: a.profile, name: a.name, from: inPath(a.from), type: a.type, lineSpacing: a.line_spacing_mm,
      grid: a.grid_mm, margins: a.margins, background: a.background }),
  },
  {
    name: 'set_preferences', description: 'Save the user\'s usual choices in the profile (they can be changed any time; empty string clears one).',
    inputSchema: { type: 'object', required: ['profile'], properties: { ...STYLE, profile: str('profile name'), page: str('a4, a5, letter or WxH mm'),
      lang: str('de'), format: str('pdf, svg, png, xopp, inkml, excalidraw') } },
    run: (a) => C.setPreferences(a),
  },
  {
    name: 'glyph_report', description: 'Quality report of a profile\'s glyphs, with a contact sheet image of all characters.',
    inputSchema: { type: 'object', required: ['profile'], properties: { profile: str('profile name') } },
    run: (a) => {
      const png = join(tmpdir(), `penclone-report-${process.pid}.png`);
      const text = C.glyphReport({ profile: a.profile, sheet: png });
      let image;
      try { image = readFileSync(png); rmSync(png); } catch { /* no image */ }
      return { report: text, previewPng: image };
    },
  },
  {
    name: 'anonymous_statistics',
    description: 'Numbers only (proportions relative to the x-height, word gaps, line drift) that a volunteer may share to help check penclone\'s general rules. Nothing is sent; show the numbers and let the user decide whether to post them (issue template "Share anonymous statistics").',
    inputSchema: { type: 'object', required: ['profile'], properties: { profile: str('profile name') } },
    run: (a) => C.validate(a),
  },
  {
    name: 'export_profile', description: 'Save a profile as a zip file (backup, other computer).',
    inputSchema: { type: 'object', required: ['profile', 'zip'], properties: { profile: str('profile name'), zip: str('zip file to write') } },
    run: (a) => ({ output: C.exportProfile({ profile: a.profile, zip: outPath(a.zip, 'zip') }) }),
  },
  {
    name: 'import_profile', description: 'Import a profile from a zip file made by export_profile.',
    inputSchema: { type: 'object', required: ['zip'], properties: { zip: str('zip file'), name: str('new name (optional)') } },
    run: (a) => ({ output: C.importProfile({ zip: inPath(a.zip), name: a.name }) }),
  },
];

function inPath(p) {
  if (!p) return p;
  if (PAPERS[p] || !/[\\/.]/.test(p)) return p;            // a paper or template name, not a path
  return isAbsolute(p) ? p : resolve(homedir(), p.replace(/^~[\\/]/, ''));
}

function outPath(p, ext, stem = 'penclone') {
  if (p) return isAbsolute(p) ? p : resolve(homedir(), p.replace(/^~[\\/]/, ''));
  mkdirSync(OUT_DIR, { recursive: true });
  const t = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
  return join(OUT_DIR, `${stem}-${t}.${ext}`);
}

/** MCP tool result: JSON text (without image bytes) + the preview image, if any. */
function result(r) {
  const content = [];
  const { previewPng, ...rest } = r && typeof r === 'object' && !Array.isArray(r) ? r : { result: r };
  content.push({ type: 'text', text: JSON.stringify(rest, null, 1) });
  if (rest.missingAdvice?.ask_user) content.push({ type: 'text', text: rest.missingAdvice.ask_user });
  if (previewPng) content.push({ type: 'image', data: Buffer.from(previewPng).toString('base64'), mimeType: 'image/png' });
  return { content };
}

async function handle(msg) {
  const { id, method, params } = msg;
  const reply = (res) => (id === undefined ? null : { jsonrpc: '2.0', id, result: res });
  const fail = (code, message) => (id === undefined ? null : { jsonrpc: '2.0', id, error: { code, message } });
  switch (method) {
    case 'initialize': {
      const want = params?.protocolVersion;
      return reply({
        protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'penclone', version: VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS.map(({ run, ...t }) => t) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return fail(-32602, `unknown tool ${params?.name}`);
      try {
        return reply(result(await tool.run(params.arguments ?? {})));
      } catch (e) {
        return reply({ content: [{ type: 'text', text: `penclone: ${e.message}` }], isError: true });
      }
    }
    default:
      if (method?.startsWith('notifications/')) return null;
      return fail(-32601, `method not found: ${method}`);
  }
}

/** Serve on stdin/stdout until stdin closes. */
export function serve(input = process.stdin, output = process.stdout) {
  const rl = createInterface({ input });
  const send = (m) => { if (m) output.write(JSON.stringify(m) + '\n'); };
  let queue = Promise.resolve();
  rl.on('line', (line) => {
    if (!line.trim()) return;
    queue = queue.then(async () => {
      let msg;
      try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
      if (Array.isArray(msg)) { for (const m of msg) send(await handle(m)); return; }
      send(await handle(msg));
    });
  });
  return new Promise((res) => rl.on('close', () => queue.then(res)));
}

export { TOOLS, INSTRUCTIONS };
