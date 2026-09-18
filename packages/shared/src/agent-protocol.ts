/**
 * Windows Shop Agent protocol (v1) — the contract between the cloud and the
 * Electron agent on the shop's PC. The cloud says WHAT to print; the agent maps
 * it to whatever printer/driver is locally available.
 *
 * Version this object; never break an old agent silently — gate on `v`.
 */

import { z } from 'zod';

export const AGENT_PROTOCOL_VERSION = 1;

// ---------- printer capabilities (agent → cloud) ----------

export const printerCapsSchema = z.object({
  name: z.string(),
  isDefault: z.boolean().default(false),
  status: z.enum(['online', 'offline', 'error']),
  /** Capability flags probed from the driver (best-effort). */
  caps: z.object({
    color: z.boolean().default(false),
    duplex: z.boolean().default(false),
    paperSizes: z.array(z.string()).default([]),
    trays: z.array(z.string()).default([]),
    collate: z.boolean().default(false),
  }),
});
export type PrinterCaps = z.infer<typeof printerCapsSchema>;

// ---------- print group spec (cloud → agent) ----------

export const printGroupSchema = z.object({
  id: z.string(),
  /** Pages of the final PDF (0-based) belonging to this group. */
  pages: z.array(z.object({ index: z.number().int().nonnegative(), rotation: z.number() })),
  paperSize: z.enum(['A4', 'A3', 'LETTER', 'LEGAL', 'PHOTO']),
  color: z.enum(['BW', 'COLOR']),
  sides: z.enum(['SINGLE', 'DUPLEX']),
  copies: z.number().int().min(1).max(99),
  quality: z.enum(['draft', 'normal', 'high']).default('normal'),
});
export type PrintGroup = z.infer<typeof printGroupSchema>;

// ---------- agent → cloud ----------

export const agentHelloSchema = z.object({
  v: z.literal(AGENT_PROTOCOL_VERSION),
  deviceName: z.string().min(1).max(80),
  agentVersion: z.string(),
  printers: z.array(printerCapsSchema),
});
export type AgentHello = z.infer<typeof agentHelloSchema>;

export const printEventSchema = z.object({
  printJobId: z.string().uuid(),
  groupId: z.string().optional(),
  status: z.enum(['PRINTING', 'PRINTED', 'PRINT_FAILED']),
  printerName: z.string().optional(),
  error: z.string().max(500).optional(),
});
export type PrintEvent = z.infer<typeof printEventSchema>;

export const heartbeatSchema = z.object({
  v: z.literal(AGENT_PROTOCOL_VERSION),
  printers: z.array(printerCapsSchema),
});
export type Heartbeat = z.infer<typeof heartbeatSchema>;

// ---------- cloud → agent ----------

export interface AgentOrderSummary {
  orderId: string;
  orderNumber: string;
  status: string;
  customerName: string | null;
  totalPages: number;
  colorPages: number;
  copies: number;
  amount: number | null;
  hasFinalPdf: boolean;
  createdAt: string;
}

export interface AgentClaimResult {
  orderId: string;
  /** Short-TTL signed URL to the final PDF. */
  pdfUrl: string;
  groups: PrintGroup[];
}

// ---------- capability mapping helper (shared logic, runs agent-side) ----------

export interface CapabilityMapping {
  ok: boolean;
  /** Driver-ready flags to pass to the print subsystem. */
  flags: {
    grayscale: boolean;
    duplex: boolean;
    paper: string;
    copies: number;
    quality?: string;
  };
  /** Non-fatal downgrades the owner should know about. */
  warnings: string[];
  /** Fatal: the group cannot be printed on this printer. */
  blockers: string[];
}

/**
 * Map a PrintGroup to a concrete printer's capabilities. This is THE separation
 * boundary: the cloud never assumes a driver; the agent negotiates locally.
 */
export function mapGroupToPrinter(group: PrintGroup, printer: PrinterCaps): CapabilityMapping {
  const warnings: string[] = [];
  const blockers: string[] = [];

  // Paper size.
  const paperWanted = group.paperSize;
  const paperSupported = printer.caps.paperSizes.length === 0 || printer.caps.paperSizes.includes(paperWanted);
  let paper = paperWanted;
  if (!paperSupported) {
    if (printer.caps.paperSizes.includes('A4')) {
      paper = 'A4';
      warnings.push(`${paperWanted} not supported → printed as A4`);
    } else {
      blockers.push(`Printer does not support ${paperWanted} paper`);
    }
  }

  // Color.
  let grayscale = group.color === 'BW';
  if (group.color === 'COLOR' && !printer.caps.color) {
    grayscale = true;
    warnings.push('No color support → printed in grayscale');
  }

  // Duplex.
  let duplex = group.sides === 'DUPLEX';
  if (duplex && !printer.caps.duplex) {
    duplex = false;
    warnings.push('No duplex support → printed single-sided');
  }

  return {
    ok: blockers.length === 0,
    flags: { grayscale, duplex, paper, copies: group.copies, quality: group.quality },
    warnings,
    blockers,
  };
}
