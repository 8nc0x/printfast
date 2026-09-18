import { NextResponse } from 'next/server';
import { requireShopToken } from '@/lib/shop-token';
import { getFinalPdfUrl } from '@/lib/data/shop-actions';
import { db } from '@/lib/db';

/** Short-lived signed URL to the final PDF, scoped to the shop's own jobs. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let payload;
  try {
    payload = requireShopToken(req);
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  // Ensure the job belongs to this shop before signing.
  const row = await db().printJob.findUnique({
    where: { id },
    select: { shopId: true },
  });
  if (!row || row.shopId !== payload.shopId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  try {
    const url = await getFinalPdfUrl(id);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unavailable' }, { status: 404 });
  }
}
