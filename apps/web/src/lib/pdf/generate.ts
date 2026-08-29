import { PDFDocument, degrees, type PDFEmbeddedPage } from 'pdf-lib';
import sharp from 'sharp';
import { PAPER_POINTS, type JobDocument, type Rotation } from '@printflow/shared';

/** Resolves the raw bytes of an original file by its id. */
export type SourceResolver = (fileId: string) => Promise<Uint8Array>;

/**
 * Compute where to draw a source page of size (W×H) onto a (pw×ph) page so that,
 * after a CLOCKWISE rotation of R degrees, it is centered and fit-to-page.
 *
 * page.rotation is degrees clockwise — matching the pdf.js preview and CSS image
 * rotation the student saw. pdf-lib rotates counter-clockwise, so we translate.
 */
function placement(R: Rotation, W: number, H: number, pw: number, ph: number) {
  // Footprint dimensions after rotation (swap for 90/270).
  const swap = R === 90 || R === 270;
  const fitW = swap ? H : W;
  const fitH = swap ? W : H;
  const scale = Math.min(pw / fitW, ph / fitH);
  const w = W * scale;
  const h = H * scale;

  // Anchor (lower-left the draw call rotates about) per rotation case, so the
  // rotated footprint is centered. Derived from rotating the [0,w]×[0,h] box.
  let x: number, y: number;
  switch (R) {
    case 90:
      x = (pw - h) / 2;
      y = (ph + w) / 2;
      break;
    case 180:
      x = (pw + w) / 2;
      y = (ph + h) / 2;
      break;
    case 270:
      x = (pw + h) / 2;
      y = (ph - w) / 2;
      break;
    default: // 0
      x = (pw - w) / 2;
      y = (ph - h) / 2;
  }
  // pdf-lib CCW angle equivalent to clockwise R.
  const pdfAngle = (360 - R) % 360;
  return { x, y, w, h, pdfAngle };
}

/**
 * Assemble the final print-ready PDF from a JobDocument, rendering each page from
 * the SAME instructions the editor previewed. Single copy — the shop's printer
 * applies the copies count. Returns the PDF bytes.
 */
export async function generateFinalPdf(doc: JobDocument, resolve: SourceResolver): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setTitle('PrintFlow order');

  const paper = PAPER_POINTS[doc.settings.paperSize];
  const [pw, ph] =
    doc.settings.orientation === 'landscape'
      ? [paper.height, paper.width]
      : [paper.width, paper.height];

  const bytesCache = new Map<string, Promise<Uint8Array>>();
  const getBytes = (fileId: string) => {
    let p = bytesCache.get(fileId);
    if (!p) {
      p = resolve(fileId);
      bytesCache.set(fileId, p);
    }
    return p;
  };
  const embedCache = new Map<string, PDFEmbeddedPage>();

  for (const page of doc.pages) {
    const out_page = out.addPage([pw, ph]);

    if (page.source.kind === 'pdf_page') {
      const key = `${page.source.fileId}:${page.source.pageIndex}`;
      let emb = embedCache.get(key);
      if (!emb) {
        const bytes = await getBytes(page.source.fileId);
        [emb] = await out.embedPdf(bytes, [page.source.pageIndex]);
        embedCache.set(key, emb!);
      }
      const { x, y, w, h, pdfAngle } = placement(page.rotation, emb!.width, emb!.height, pw, ph);
      out_page.drawPage(emb!, { x, y, width: w, height: h, rotate: degrees(pdfAngle) });
    } else {
      // Image: normalize (incl. webp) to PNG and bake rotation via sharp, so we
      // embed an already-oriented raster and place it upright (R handled).
      const raw = await getBytes(page.source.fileId);
      const rotated = await sharp(Buffer.from(raw))
        .rotate(page.rotation) // sharp rotates clockwise for positive degrees
        .png()
        .toBuffer();
      const img = await out.embedPng(rotated);
      const { x, y, w, h } = placement(0, img.width, img.height, pw, ph);
      out_page.drawImage(img, { x, y, width: w, height: h });
    }
  }

  return out.save();
}
