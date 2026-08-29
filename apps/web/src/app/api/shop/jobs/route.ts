import { NextResponse } from 'next/server';
import { requireShopToken } from '@/lib/shop-token';
import { getShopJobs } from '@/lib/data/shop';

/** Paid jobs for the authenticated shop. Optional ?status= filter (comma list). */
export async function GET(req: Request) {
  let payload;
  try {
    payload = requireShopToken(req);
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get('status');
  const wanted = statusFilter ? new Set(statusFilter.split(',')) : null;

  const jobs = await getShopJobs(payload.shopId);
  const filtered = wanted ? jobs.filter((j) => wanted.has(j.status)) : jobs;

  return NextResponse.json({
    jobs: filtered.map((j) => ({
      id: j.id,
      orderNumber: j.order_number,
      status: j.status,
      studentName: j.student?.name ?? 'Student',
      totalPages: j.total_pages,
      colorPages: j.color_pages,
      bwPages: j.bw_pages,
      copies: j.copies,
      paperSize: j.paper_size,
      orientation: j.orientation,
      binding: j.binding,
      amount: j.price_amount != null ? Number(j.price_amount) : null,
      paymentReference: j.paymentReference,
      createdAt: j.created_at,
      hasFinalPdf: Boolean(j.final_pdf_path),
    })),
  });
}
