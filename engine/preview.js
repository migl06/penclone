// @ts-check
/* PNG pages and previews through poppler's pdftoppm (already needed by the Python pipeline). Node only. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(pdfBytes, dpi, first, last) {
  const d = mkdtempSync(join(tmpdir(), 'penclone-'));
  const pdf = join(d, 'in.pdf');
  writeFileSync(pdf, pdfBytes);
  const args = ['-r', String(dpi), '-png'];
  if (first) args.push('-f', String(first), '-l', String(last ?? first));
  const r = spawnSync('pdftoppm', [...args, pdf, join(d, 'p')]);
  if (r.error || r.status) {
    rmSync(d, { recursive: true, force: true });
    throw new Error('PNG needs pdftoppm (poppler-utils); install it or choose pdf/svg');
  }
  const pages = readdirSync(d).filter((f) => f.startsWith('p') && f.endsWith('.png')).sort();
  return { d, pages };
}

/** Write every page of a PDF as PNG to the given names. */
export async function pdfToPng(pdfBytes, names, dpi = 200) {
  const { d, pages } = run(pdfBytes, dpi);
  pages.forEach((f, i) => renameSync(join(d, f), names[i]));
  rmSync(d, { recursive: true, force: true });
}

/** PNG bytes of one page (for previews in MCP answers). */
export function previewPng(pdfBytes, page = 1, dpi = 80) {
  const { d, pages } = run(pdfBytes, dpi, page, page);
  const png = readFileSync(join(d, pages[0]));
  rmSync(d, { recursive: true, force: true });
  return png;
}
