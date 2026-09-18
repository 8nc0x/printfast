import { NextRequest, NextResponse } from 'next/server';
import { verifySignedUrl, downloadBytes, contentTypeFor, type Bucket } from '@/lib/storage';
import { BUCKETS } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * Signed-URL file server. Replaces Supabase Storage's signed URLs:
 *   /api/files/{bucket}/{path}?exp=...&sig=...
 * The signature is HMAC over bucket/path/expiry, verified before any disk read.
 * Access control happens at URL-minting time (callers must pass an RBAC check
 * before calling signedUrl), and every URL is short-lived.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const [bucket, ...rest] = segments;
  const relPath = rest.join('/');

  if (!bucket || !(bucket in BUCKETS) || rest.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const exp = req.nextUrl.searchParams.get('exp');
  const sig = req.nextUrl.searchParams.get('sig');
  const verdict = verifySignedUrl(bucket, relPath, exp, sig);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason ?? 'forbidden' }, { status: 403 });
  }

  try {
    const bytes = await downloadBytes(bucket as Bucket, relPath);
    const body = new Uint8Array(bytes);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': contentTypeFor(relPath),
        'content-length': String(body.byteLength),
        'cache-control': 'private, max-age=60',
        'content-disposition': 'inline',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
