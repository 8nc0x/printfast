import 'server-only';
import { supabaseAdmin } from './admin';

export const BUCKETS = {
  originals: 'originals',
  finals: 'finals',
  previews: 'previews',
} as const;

const SIGNED_TTL = Number(process.env.SIGNED_URL_TTL_SECONDS ?? 300);

export function originalPath(userId: string, jobId: string, fileId: string, ext: string) {
  return `users/${userId}/jobs/${jobId}/original/${fileId}.${ext}`;
}
export function finalPath(userId: string, jobId: string) {
  return `users/${userId}/jobs/${jobId}/final/final.pdf`;
}
export function previewPath(userId: string, jobId: string, pageId: string) {
  return `users/${userId}/jobs/${jobId}/previews/${pageId}.webp`;
}

export async function uploadBytes(
  bucket: keyof typeof BUCKETS,
  path: string,
  bytes: Uint8Array | Buffer,
  contentType: string,
) {
  const { error } = await supabaseAdmin()
    .storage.from(BUCKETS[bucket])
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

export async function downloadBytes(bucket: keyof typeof BUCKETS, path: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKETS[bucket]).download(path);
  if (error || !data) throw new Error(`Download failed: ${error?.message ?? 'no data'}`);
  return new Uint8Array(await data.arrayBuffer());
}

/** Short-lived signed URL. Minted server-side only, after an RBAC check by the caller. */
export async function signedUrl(bucket: keyof typeof BUCKETS, path: string, ttl = SIGNED_TTL) {
  const { data, error } = await supabaseAdmin().storage.from(BUCKETS[bucket]).createSignedUrl(path, ttl);
  if (error || !data) throw new Error(`Signed URL failed: ${error?.message ?? 'no data'}`);
  return data.signedUrl;
}
