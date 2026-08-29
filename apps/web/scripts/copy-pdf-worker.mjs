// Copies the pdf.js worker into public/ so the editor can load it offline.
// Runs on postinstall. node_modules is hoisted to the monorepo root.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(here, '../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
  resolve(here, '../node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
];
const dest = resolve(here, '../public/pdf.worker.min.mjs');

const src = candidates.find((p) => existsSync(p));
if (!src) {
  console.warn('[copy-pdf-worker] pdfjs-dist worker not found; skipping');
  process.exit(0);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log('[copy-pdf-worker] copied worker to public/pdf.worker.min.mjs');
