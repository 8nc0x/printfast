import { ACCEPTED_MIME_TYPES, MAX_FILE_BYTES, type FileKind } from '@printflow/shared';

export interface ValidatedUpload {
  ok: true;
  kind: FileKind;
  mime: (typeof ACCEPTED_MIME_TYPES)[number];
  ext: string;
}
export interface RejectedUpload {
  ok: false;
  reason: string;
}

const SIGNATURES: { mime: (typeof ACCEPTED_MIME_TYPES)[number]; ext: string; kind: FileKind; test: (b: Uint8Array) => boolean }[] = [
  {
    mime: 'application/pdf',
    ext: 'pdf',
    kind: 'pdf',
    test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46, // %PDF
  },
  {
    mime: 'image/png',
    ext: 'png',
    kind: 'image',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    kind: 'image',
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    kind: 'image',
    // RIFF....WEBP
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

/**
 * Validates a file by size, declared MIME, AND magic-byte sniffing. The declared
 * type is never trusted on its own.
 */
export function validateUpload(declaredMime: string, size: number, head: Uint8Array): ValidatedUpload | RejectedUpload {
  if (size <= 0) return { ok: false, reason: 'Empty file' };
  if (size > MAX_FILE_BYTES) {
    return { ok: false, reason: `File exceeds ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB limit` };
  }
  if (!ACCEPTED_MIME_TYPES.includes(declaredMime as never)) {
    return { ok: false, reason: `Unsupported type: ${declaredMime || 'unknown'}` };
  }

  const match = SIGNATURES.find((s) => s.test(head));
  if (!match) {
    return { ok: false, reason: 'File content does not match an accepted format' };
  }
  // Declared MIME must be consistent with sniffed type (jpeg/jpg equivalence handled by match.mime).
  if (match.mime !== declaredMime && !(declaredMime === 'image/jpg' && match.mime === 'image/jpeg')) {
    return { ok: false, reason: 'File content does not match its declared type' };
  }

  return { ok: true, kind: match.kind, mime: match.mime, ext: match.ext };
}
