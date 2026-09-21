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
import { db } from '@/lib/db';
import type { PrintJobRow, ShopSettingsRow } from '@/lib/db.types';
import type { Prisma } from '@printflow/db';

/**
 * Resolve the shop a new student draft belongs to. MVP: the first active shop.
 * (The old code hardcoded a fixed UUID that only matches the demo seed's shop id.)
 */
export async function resolveDefaultShopId(): Promise<string> {
  const shop = await db().shop.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!shop) throw new Error('No active shop configured');
  return shop.id;
}

/** Generate an order number not already taken (retries on the rare collision). */
export async function generateUniqueOrderNumber(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const candidate = generateOrderNumber();
    const exists = await db().printJob.findUnique({
      where: { orderNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  // Extremely unlikely fallback.
  return `${generateOrderNumber()}${Date.now().toString(36).slice(-2).toUpperCase()}`;
}

export async function getShopPricing(shopId: string): Promise<PricingConfig> {
  try {
    const s = await db().shopSettings.findUnique({ where: { shopId } });
    if (!s) return DEFAULT_PRICING;
    return {
      currency: s.currency,
      priceBwPage: Number(s.priceBwPage),
      priceColorPage: Number(s.priceColorPage),
      paperMultiplier: s.paperMultiplier as PricingConfig['paperMultiplier'],
      bindingPrice: s.bindingPrice as PricingConfig['bindingPrice'],
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
export async function persistDocument(job: Pick<PrintJobRow, 'id' | 'shop_id'>, doc: JobDocument): Promise<number> {
  const parsed = jobDocumentSchema.parse(doc);
  const metrics = computeMetrics(parsed);
  const pricing = await getShopPricing(job.shop_id);
  const price = quote(parsed, pricing).total;

  await db().$transaction(async (tx) => {
    await tx.printJob.update({
      where: { id: job.id },
      data: {
        document: parsed as unknown as Prisma.InputJsonValue,
        totalPages: metrics.totalPages,
        colorPages: metrics.colorPages,
        bwPages: metrics.bwPages,
        copies: parsed.settings.copies,
        paperSize: parsed.settings.paperSize,
        orientation: parsed.settings.orientation,
        binding: parsed.settings.binding,
        priceAmount: price,
        status: parsed.pages.length > 0 ? 'configured' : 'draft',
      },
    });

    // Rebuild job_pages to mirror the document order.
    await tx.jobPage.deleteMany({ where: { jobId: job.id } });
    if (parsed.pages.length > 0) {
      await tx.jobPage.createMany({
        data: parsed.pages.map((p, index) => ({
          jobId: job.id,
          pageIndex: index,
          sourceFile: p.source.fileId,
          sourcePage: p.source.kind === 'pdf_page' ? p.source.pageIndex : null,
          rotation: p.rotation,
          color: p.color,
        })),
      });
    }
  });

  return price;
}

export const EMPTY_DOCUMENT = emptyJobDocument;
