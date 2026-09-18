/**
 * Product variant/option configuration (spec §4.2).
 *
 * A catalog item carries an options map: option-group name → selectable values.
 * Each value may carry a price DELTA added to the base price (the shop decides —
 * a delta of 0 means the choice is free).
 *
 * Stored on CatalogItem.options as:
 *   { "Size": [{ id: "a4", label: "A4", delta: 0 },
 *              { id: "a5", label: "A5", delta: -10 }] }
 *
 * The customer's selections ride on the cart item's `options` array
 * ([{ groupId, valueId }]) and are re-priced SERVER-SIDE at quote time —
 * client prices are never trusted. Selected options are snapshotted onto
 * OrderItem.options so later catalog edits never rewrite order history.
 */

import { z } from 'zod';

/** One selectable value inside an option group, with its price delta. */
export const optionValueSchema = z.object({
  /** Stable short id used in the cart payload (e.g. "a4", "hard"). */
  id: z.string().min(1).max(40).regex(/^[a-z0-9-_]+$/i),
  /** Human label shown to customers (e.g. "A4", "Hard cover"). */
  label: z.string().min(1).max(60),
  /** Amount added to the item's base price when chosen (can be 0 or negative). */
  delta: z.number().min(-100000).max(100000).default(0),
});
export type OptionValue = z.infer<typeof optionValueSchema>;

/** An option group: "Size", "Cover", "Paper quality", etc. */
export const optionGroupSchema = z.object({
  id: z.string().min(1).max(40).regex(/^[a-z0-9-_]+$/i),
  label: z.string().min(1).max(60),
  /** Values in display order. */
  values: z.array(optionValueSchema).min(1).max(20),
  /** When true, the customer must choose one value. */
  required: z.boolean().default(false),
  /** Show as radio list (false) or compact select (true). */
  compact: z.boolean().default(false),
});
export type OptionGroup = z.infer<typeof optionGroupSchema>;

/**
 * The options map stored on CatalogItem.options:
 *   Record<groupId, OptionGroup> — keyed by group id for O(1) lookup.
 */
export const itemOptionsSchema = z.record(optionGroupSchema);
export type ItemOptions = z.infer<typeof itemOptionsSchema>;

/** Loose parse for JSON coming from the DB (never throws — returns null). */
export function parseItemOptions(raw: unknown): ItemOptions | null {
  const res = itemOptionsSchema.safeParse(raw);
  return res.success ? res.data : null;
}

/**
 * Compute the option-delta surcharge for a cart line.
 * - Only groups present on the item are considered.
 * - Unknown valueIds are ignored here; the checkout validator rejects them.
 * Returns the rounded sum of deltas for the chosen values (per unit).
 */
export function optionsSurcharge(
  options: ItemOptions | null,
  selections: { groupId: string; valueId: string }[],
): number {
  if (!options || selections.length === 0) return 0;
  let total = 0;
  for (const sel of selections) {
    const group = options[sel.groupId];
    if (!group) continue;
    const value = group.values.find((v) => v.id === sel.valueId);
    if (!value) continue;
    total += value.delta;
  }
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

/** Resolve selected values to display labels, in group order ("A4 · Hard cover"). */
export function optionLabels(
  options: ItemOptions | null,
  selections: { groupId: string; valueId: string }[],
): string[] {
  if (!options) return [];
  const labels: string[] = [];
  for (const group of Object.values(options)) {
    const sel = selections.find((s) => s.groupId === group.id);
    if (!sel) continue;
    const value = group.values.find((v) => v.id === sel.valueId);
    if (value) labels.push(value.label);
  }
  return labels;
}

/**
 * Validate a cart line's selections against the item's option config.
 * Throws with a human message when a required group is missing or a choice
 * doesn't exist (stale UI, tampering).
 */
export function validateSelections(
  options: ItemOptions | null,
  selections: { groupId: string; valueId: string }[],
): void {
  if (!options) {
    if (selections.length > 0) {
      throw new Error('This item has no options configured');
    }
    return;
  }
  for (const group of Object.values(options)) {
    const sel = selections.find((s) => s.groupId === group.id);
    if (!sel) {
      if (group.required) {
        throw new Error(`Choose an option for “${group.label}”`);
      }
      continue;
    }
    if (!group.values.some((v) => v.id === sel.valueId)) {
      throw new Error(`Invalid choice for “${group.label}”`);
    }
  }
  // No selections for groups that don't exist on the item.
  for (const sel of selections) {
    if (!options[sel.groupId]) {
      throw new Error('Invalid option for this item');
    }
  }
}
