/**
 * Config-driven pricing engine. Rules come from shop_settings so the shop can
 * reconfigure without a code change. Pure functions only — no I/O.
 */

import { z } from 'zod';
import type { JobDocument } from './geometry';
import { computeMetrics } from './geometry';
import { PAPER_SIZES, BINDING_TYPES } from './enums';

export const pricingConfigSchema = z.object({
  currency: z.string().default('INR'),
  priceBwPage: z.number().nonnegative(),
  priceColorPage: z.number().nonnegative(),
  /** Multiplier applied to per-page cost by paper size, e.g. { A4: 1, A3: 2 }. */
  paperMultiplier: z.record(z.enum(PAPER_SIZES), z.number().positive()),
  /** Flat add-on per copy for finishing, e.g. { none: 0, staple: 5, spiral: 30 }. */
  bindingPrice: z.record(z.enum(BINDING_TYPES), z.number().nonnegative()),
});
export type PricingConfig = z.infer<typeof pricingConfigSchema>;

export const DEFAULT_PRICING: PricingConfig = {
  currency: 'INR',
  priceBwPage: 2,
  priceColorPage: 10,
  paperMultiplier: { A4: 1, A3: 2 },
  bindingPrice: { none: 0, staple: 5, spiral: 30 },
};

export interface PriceBreakdown {
  currency: string;
  bwPages: number;
  colorPages: number;
  copies: number;
  perCopyPagesCost: number; // one copy of all pages, paper multiplier applied
  bindingCostPerCopy: number;
  total: number; // rounded to 2dp
  lines: { label: string; amount: number }[];
}

/** Deterministic price for a job document under a pricing config. */
export function quote(doc: JobDocument, config: PricingConfig): PriceBreakdown {
  const { bwPages, colorPages } = computeMetrics(doc);
  const { copies, paperSize, binding } = doc.settings;

  const paperMult = config.paperMultiplier[paperSize] ?? 1;
  const bwCost = bwPages * config.priceBwPage * paperMult;
  const colorCost = colorPages * config.priceColorPage * paperMult;
  const perCopyPagesCost = round2(bwCost + colorCost);

  const bindingCostPerCopy = config.bindingPrice[binding] ?? 0;

  const total = round2((perCopyPagesCost + bindingCostPerCopy) * copies);

  const lines = [
    { label: `${bwPages} B&W page(s) × ₹${config.priceBwPage} × ${paperMult}`, amount: round2(bwCost) },
    { label: `${colorPages} color page(s) × ₹${config.priceColorPage} × ${paperMult}`, amount: round2(colorCost) },
    { label: `Binding (${binding})`, amount: bindingCostPerCopy },
    { label: `× ${copies} cop${copies === 1 ? 'y' : 'ies'}`, amount: 0 },
  ];

  return {
    currency: config.currency,
    bwPages,
    colorPages,
    copies,
    perCopyPagesCost,
    bindingCostPerCopy,
    total,
    lines,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
