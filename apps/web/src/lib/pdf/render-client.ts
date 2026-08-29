'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';

// Lazy-load pdfjs only in the browser so it never executes during SSR.
type PdfjsModule = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfjsModule> | null = null;

function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return mod;
    });
  }
  return pdfjsPromise;
}

const docCache = new Map<string, Promise<PDFDocumentProxy>>();

async function loadDoc(url: string): Promise<PDFDocumentProxy> {
  let p = docCache.get(url);
  if (!p) {
    p = getPdfjs().then((mod) => mod.getDocument({ url }).promise);
    docCache.set(url, p);
  }
  return p;
}

/**
 * Render one PDF page to a data URL thumbnail at a target CSS width.
 * Rotation is applied on top of the page's own rotation.
 */
export async function renderPdfThumb(
  url: string,
  pageIndex: number,
  targetWidth: number,
  rotation = 0,
): Promise<string> {
  const doc = await loadDoc(url);
  const page = await doc.getPage(pageIndex + 1); // pdfjs is 1-based
  const base = page.getViewport({ scale: 1, rotation });
  const scale = targetWidth / base.width;
  const viewport = page.getViewport({ scale, rotation });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}

export function clearPdfCache() {
  docCache.clear();
}
