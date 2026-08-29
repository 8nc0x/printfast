import 'server-only';
import {
  computeMetrics,
  emptyJobDocument,
  generateOrderNumber,
  jobDocumentSchema,
  quote,
  type JobDocument,
  type PricingConfig,
  DEFAULT_PRICING,
} from '@printflow/shared';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PrintJobRow, ShopSettingsRow } from '@/lib/db.types';

/** Generate an order number not already taken (retries on the rare collision). */
export async function generateUniqueOrderNumber(): Promise<string> {
  const db = supabaseAdmin();
  for (let i = 0; i < 8; i++) {
    const candidate = generateOrderNumber();
    const { data } = await db.from('print_jobs').select('id').eq('order_number', candidate).maybeSingle();
    if (!data) return candidate;
  }
  // Extremely unlikely fallback.
  return `${generateOrderNumber()}${Date.now().toString(36).slice(-2).toUpperCase()}`;
}

export async function getShopPricing(shopId: string): Promise<PricingConfig> {
  try {
    const { data } = await supabaseAdmin()
      .from('shop_settings')
      .select('*')
      .eq('shop_id', shopId)
      .maybeSingle();
    const s = data as ShopSettingsRow | null;
    if (!s) return DEFAULT_PRICING;
    return {
      currency: s.currency,
      priceBwPage: Number(s.price_bw_page),
      priceColorPage: Number(s.price_color_page),
      paperMultiplier: s.paper_multiplier,
      bindingPrice: s.binding_price,
    };
  } catch {
    return DEFAULT_PRICING;
  }
}

/**
 * Persist a job's document: writes the JobDocument, re-derives denormalized
 * metrics + settings columns, and rebuilds job_pages. Also recomputes the price
 * snapshot. Returns the new price total.
 */
export async function persistDocument(job: PrintJobRow, doc: JobDocument): Promise<number> {
  const parsed = jobDocumentSchema.parse(doc);
  const db = supabaseAdmin();
  const metrics = computeMetrics(parsed);
  const pricing = await getShopPricing(job.shop_id);
  const price = quote(parsed, pricing).total;

  await db
    .from('print_jobs')
    .update({
      document: parsed,
      total_pages: metrics.totalPages,
      color_pages: metrics.colorPages,
      bw_pages: metrics.bwPages,
      copies: parsed.settings.copies,
      paper_size: parsed.settings.paperSize,
      orientation: parsed.settings.orientation,
      binding: parsed.settings.binding,
      price_amount: price,
      status: parsed.pages.length > 0 ? 'configured' : 'draft',
    } as never)
    .eq('id', job.id);

  // Rebuild job_pages to mirror the document order.
  await db.from('job_pages').delete().eq('job_id', job.id);
  if (parsed.pages.length > 0) {
    const rows = parsed.pages.map((p, index) => ({
      job_id: job.id,
      page_index: index,
      source_file: p.source.fileId,
      source_page: p.source.kind === 'pdf_page' ? p.source.pageIndex : null,
      rotation: p.rotation,
      color: p.color,
    }));
    await db.from('job_pages').insert(rows as never);
  }

  return price;
}

export const EMPTY_DOCUMENT = emptyJobDocument;
