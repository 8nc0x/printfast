import 'server-only';
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Local-disk storage layer. Replaces Supabase Storage with the same function
 * surface (uploadBytes / downloadBytes / signedUrl) so callers don't change.
 *
 * - Files live under STORAGE_ROOT (default `.data/storage`), never inside public/.
 * - All reads go through short-lived signed URLs verified by /api/files/[...path].
 * - Buckets map to subdirectories, mirroring the previous Supabase layout.
 */

export const BUCKETS = {
  originals: 'originals',
  finals: 'finals',
  previews: 'previews',
} as const;

export type Bucket = keyof typeof BUCKETS;

const SIGNED_TTL = Number(process.env.SIGNED_URL_TTL_SECONDS ?? 300);

function storageRoot(): string {
  const root = process.env.STORAGE_ROOT ?? join(process.cwd(), '.data', 'storage');
  return resolve(root);
}

function bucketDir(bucket: Bucket): string {
  return join(storageRoot(), BUCKETS[bucket]);
}

function safeJoin(base: string, relative: string): string {
  const full = resolve(join(base, relative));
  if (!full.startsWith(base)) throw new Error('Invalid storage path');
  return full;
}

function signingSecret(): string {
  return process.env.STORAGE_SIGNING_SECRET ?? process.env.AUTH_SECRET ?? 'insecure-dev-storage-secret';
}

function hmac(payload: string): string {
  return createHmac('sha256', signingSecret()).update(payload).digest('base64url');
}

// ---------- path helpers (same signatures as before) ----------

export function originalPath(userId: string, jobId: string, fileId: string, ext: string) {
  return `users/${userId}/jobs/${jobId}/original/${fileId}.${ext}`;
}
export function finalPath(userId: string, jobId: string) {
  return `users/${userId}/jobs/${jobId}/final/final.pdf`;
}
export function previewPath(userId: string, jobId: string, pageId: string) {
  return `users/${userId}/jobs/${jobId}/previews/${pageId}.webp`;
}

// ---------- byte operations ----------

export async function uploadBytes(
  bucket: Bucket,
  path: string,
  bytes: Uint8Array | Buffer,
  contentType: string,
): Promise<string> {
  const full = safeJoin(bucketDir(bucket), path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, bytes);
  // Supabase needed the content type; the local filesystem doesn't, but the
  // /api/files route will serve with a mime derived from the extension.
  return path;
}

export async function downloadBytes(bucket: Bucket, path: string): Promise<Uint8Array> {
  const full = safeJoin(bucketDir(bucket), path);
  const buf = await readFile(full);
  return new Uint8Array(buf);
}

export async function fileExists(bucket: Bucket, path: string): Promise<boolean> {
  try {
    await stat(safeJoin(bucketDir(bucket), path));
    return true;
  } catch {
    return false;
  }
}

export async function fileMtimeMs(bucket: Bucket, path: string): Promise<number | null> {
  try {
    const s = await stat(safeJoin(bucketDir(bucket), path));
    return s.mtimeMs;
  } catch {
    return null;
  }
}

// ---------- signed URLs (consumed by /api/files/[...path]) ----------

export interface SignedUrlParts {
  bucket: Bucket;
  path: string;
  exp: number; // unix seconds
  sig: string;
}

/**
 * Mint a short-lived signed URL. Format:
 *   /api/files/{bucket}/{path}?exp={unix}&sig={hmac(bucket/path/exp)}
 */
export async function signedUrl(bucket: Bucket, path: string, ttl: number = SIGNED_TTL): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const payload = `${bucket}/${path}/${exp}`;
  const sig = hmac(payload);
  const qs = new URLSearchParams({ exp: String(exp), sig });
  return `/api/files/${bucket}/${path}?${qs.toString()}`;
}

export function verifySignedUrl(
  bucket: string,
  path: string,
  exp: string | null,
  sig: string | null,
): { ok: boolean; reason?: string } {
  if (!exp || !sig) return { ok: false, reason: 'missing signature' };
  const expNum = Number(exp);
  if (!Number.isFinite(expNum)) return { ok: false, reason: 'bad expiry' };
  if (expNum < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };

  const expected = hmac(`${bucket}/${path}/${expNum}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad signature' };
  }
  return { ok: true };
}

/** Content-type for serving, derived from extension (no trusting clients). */
export function contentTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

/** Integrity hash (used by tests / audit where needed). */
export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
