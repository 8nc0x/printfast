import 'server-only';
import { PDFDocument } from 'pdf-lib';

/** Returns the page count of a PDF, or throws if it can't be parsed. */
export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  return doc.getPageCount();
}
