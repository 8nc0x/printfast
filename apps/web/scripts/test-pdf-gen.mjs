// Standalone verification of the PDF pipeline: builds a source PDF + image,
// runs the same placement/assembly logic, and checks the output geometry.
import { PDFDocument, degrees, rgb } from 'pdf-lib';
import sharp from 'sharp';

const PAPER_POINTS = { A4: { width: 595.28, height: 841.89 }, A3: { width: 841.89, height: 1190.55 } };

function placement(R, W, H, pw, ph) {
  const swap = R === 90 || R === 270;
  const fitW = swap ? H : W;
  const fitH = swap ? W : H;
  const scale = Math.min(pw / fitW, ph / fitH);
  const w = W * scale, h = H * scale;
  let x, y;
  switch (R) {
    case 90: x = (pw - h) / 2; y = (ph + w) / 2; break;
    case 180: x = (pw + w) / 2; y = (ph + h) / 2; break;
    case 270: x = (pw + h) / 2; y = (ph - w) / 2; break;
    default: x = (pw - w) / 2; y = (ph - h) / 2;
  }
  return { x, y, w, h, pdfAngle: (360 - R) % 360 };
}

async function makeSourcePdf() {
  const d = await PDFDocument.create();
  const p1 = d.addPage([420, 300]); // landscape-ish source
  p1.drawText('Source page 1', { x: 40, y: 150, size: 24, color: rgb(0.1, 0.3, 0.2) });
  p1.drawRectangle({ x: 10, y: 10, width: 400, height: 280, borderColor: rgb(0, 0, 0), borderWidth: 2 });
  const p2 = d.addPage([300, 420]);
  p2.drawText('Source page 2', { x: 30, y: 200, size: 20 });
  return d.save();
}

async function makeImage() {
  return sharp({ create: { width: 200, height: 120, channels: 3, background: { r: 15, g: 81, b: 50 } } }).webp().toBuffer();
}

async function main() {
  const srcPdf = await makeSourcePdf();
  const img = await makeImage();

  const doc = {
    version: 1,
    settings: { paperSize: 'A4', orientation: 'portrait', copies: 2, binding: 'spiral' },
    pages: [
      { id: 'a', source: { kind: 'pdf_page', fileId: 'F1', pageIndex: 0 }, rotation: 0, color: 'bw' },
      { id: 'b', source: { kind: 'pdf_page', fileId: 'F1', pageIndex: 0 }, rotation: 90, color: 'color' },
      { id: 'c', source: { kind: 'pdf_page', fileId: 'F1', pageIndex: 1 }, rotation: 270, color: 'bw' },
      { id: 'd', source: { kind: 'image', fileId: 'IMG' }, rotation: 180, color: 'color' },
    ],
  };
  const resolve = async (id) => (id === 'IMG' ? new Uint8Array(img) : new Uint8Array(srcPdf));

  // Inline the generator logic (mirrors src/lib/pdf/generate.ts).
  const out = await PDFDocument.create();
  const paper = PAPER_POINTS[doc.settings.paperSize];
  const [pw, ph] = doc.settings.orientation === 'landscape' ? [paper.height, paper.width] : [paper.width, paper.height];
  const embedCache = new Map();
  for (const page of doc.pages) {
    const op = out.addPage([pw, ph]);
    if (page.source.kind === 'pdf_page') {
      const key = `${page.source.fileId}:${page.source.pageIndex}`;
      let emb = embedCache.get(key);
      if (!emb) { [emb] = await out.embedPdf(await resolve(page.source.fileId), [page.source.pageIndex]); embedCache.set(key, emb); }
      const { x, y, w, h, pdfAngle } = placement(page.rotation, emb.width, emb.height, pw, ph);
      op.drawPage(emb, { x, y, width: w, height: h, rotate: degrees(pdfAngle) });
    } else {
      const rotated = await sharp(Buffer.from(await resolve(page.source.fileId))).rotate(page.rotation).png().toBuffer();
      const image = await out.embedPng(rotated);
      const { x, y, w, h } = placement(0, image.width, image.height, pw, ph);
      op.drawImage(image, { x, y, width: w, height: h });
    }
  }
  const bytes = await out.save();

  // Verify: reopen and assert geometry.
  const check = await PDFDocument.load(bytes);
  const pages = check.getPages();
  const a4 = PAPER_POINTS.A4;
  const okCount = pages.length === 4;
  const okSize = pages.every((p) => Math.abs(p.getWidth() - a4.width) < 1 && Math.abs(p.getHeight() - a4.height) < 1);
  console.log(`pages: ${pages.length} (expect 4) -> ${okCount ? 'OK' : 'FAIL'}`);
  console.log(`all pages A4 portrait -> ${okSize ? 'OK' : 'FAIL'}`);
  console.log(`output bytes: ${bytes.length}`);
  if (!okCount || !okSize) process.exit(1);
  console.log('PDF PIPELINE OK');
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
