/**
 * The geometry model — THE contract between the page editor and the server PDF generator.
 *
 * The editor renders its preview FROM this model, and the server generates the final
 * print-ready PDF FROM the same model. There is exactly one source of truth for page
 * layout, so the preview a student approves cannot drift from what the shop prints.
 *
 * Do not add rendering logic that lives only on one side. If it affects the output,
 * it lives here.
 */

import { z } from 'zod';
import { PAGE_COLORS, PAPER_SIZES, ORIENTATIONS, BINDING_TYPES, ROTATIONS } from './enums';

/** Where a page's pixels come from. */
export const sourceRefSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('pdf_page'),
    fileId: z.string().uuid(),
    pageIndex: z.number().int().nonnegative(), // 0-based page within the source PDF
  }),
  z.object({
    kind: z.literal('image'),
    fileId: z.string().uuid(),
  }),
]);
export type SourceRef = z.infer<typeof sourceRefSchema>;

/** One page in the final printed document. */
export const pageItemSchema = z.object({
  id: z.string().min(1), // stable id for dnd + audit
  source: sourceRefSchema,
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  color: z.enum(PAGE_COLORS),
});
export type PageItem = z.infer<typeof pageItemSchema>;

/** Job-wide print settings (apply to the whole document per MVP spec). */
export const jobSettingsSchema = z.object({
  paperSize: z.enum(PAPER_SIZES),
  orientation: z.enum(ORIENTATIONS),
  copies: z.number().int().min(1).max(99),
  binding: z.enum(BINDING_TYPES),
});
export type JobSettings = z.infer<typeof jobSettingsSchema>;

/** The complete, versioned print document. */
export const jobDocumentSchema = z.object({
  version: z.literal(1),
  pages: z.array(pageItemSchema),
  settings: jobSettingsSchema,
});
export type JobDocument = z.infer<typeof jobDocumentSchema>;

export const DEFAULT_JOB_SETTINGS: JobSettings = {
  paperSize: 'A4',
  orientation: 'portrait',
  copies: 1,
  binding: 'none',
};

export function emptyJobDocument(): JobDocument {
  return { version: 1, pages: [], settings: { ...DEFAULT_JOB_SETTINGS } };
}

/** Derived counts used for pricing + dashboards. Single source so web/db never disagree. */
export interface JobMetrics {
  totalPages: number;
  colorPages: number;
  bwPages: number;
}

export function computeMetrics(doc: JobDocument): JobMetrics {
  const totalPages = doc.pages.length;
  const colorPages = doc.pages.filter((p) => p.color === 'color').length;
  return { totalPages, colorPages, bwPages: totalPages - colorPages };
}

/** ISO 216 sizes in PostScript points (1pt = 1/72"). Portrait orientation. */
export const PAPER_POINTS = {
  A4: { width: 595.28, height: 841.89 },
  A3: { width: 841.89, height: 1190.55 },
} as const;

export { ROTATIONS };
