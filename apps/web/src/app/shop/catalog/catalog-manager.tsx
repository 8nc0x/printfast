'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, Eye, EyeOff, Loader2, Package, SlidersHorizontal, X } from 'lucide-react';
import type { OptionGroup } from '@printflow/shared';
import type { CatalogItemView } from '@/lib/data/catalog';
import {
  addCatalogItemAction,
  toggleCatalogItemAction,
  deleteCatalogItemAction,
  updateStockAction,
  updateCatalogItemAction,
} from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';

const SECTIONS = [
  { kind: 'PRINT', label: 'Printing' },
  { kind: 'PRODUCT', label: 'Stationery' },
  { kind: 'SERVICE', label: 'Services' },
] as const;

/** Stable id from a label ("Hard cover" → "hard-cover"). */
function slugId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function CatalogManager({
  shopId,
  initialItems,
}: {
  shopId: string;
  initialItems: CatalogItemView[];
}) {
  const [items, setItems] = useState(initialItems);
  const [showForm, setShowForm] = useState(false);
  const [editingOptions, setEditingOptions] = useState<string | null>(null); // item id
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(itemId: string, isVisible: boolean) {
    start(async () => {
      const res = await toggleCatalogItemAction(itemId, isVisible);
      if (res.ok) {
        setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, isVisible } : i)));
      } else setError(res.error ?? 'Failed');
    });
  }

  function remove(itemId: string) {
    start(async () => {
      const res = await deleteCatalogItemAction(itemId);
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== itemId));
      else setError(res.error ?? 'Failed');
    });
  }

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" /> Add item
        </Button>
      </div>

      {showForm && (
        <ItemForm
          onDone={(item) => {
            setItems((prev) => [...prev, item]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {SECTIONS.map((section) => {
        const sectionItems = items.filter((i) => i.kind === section.kind);
        return (
          <section key={section.kind} className="rounded-lg border border-border">
            <header className="border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-medium">{section.label}</h2>
            </header>
            <div className="divide-y divide-border">
              {sectionItems.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Nothing here yet
                </p>
              ) : (
                sectionItems.map((item) => (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(item.price)} / {item.unit}
                          {!item.isVisible && ' · hidden'}
                          {item.trackStock && ` · stock ${item.stock}`}
                          {item.trackStock &&
                            item.lowStockThreshold != null &&
                            item.stock <= item.lowStockThreshold &&
                            ' · LOW'}
                          {item.options && item.options.length > 0 && (
                            <> · {item.options.length} option group{item.options.length === 1 ? '' : 's'}</>
                          )}
                        </p>
                      </div>
                      {item.kind === 'PRODUCT' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Set stock"
                          disabled={pending}
                          onClick={() => {
                            const input = window.prompt(`Stock for ${item.name}`, String(item.stock));
                            if (input == null) return;
                            const threshold = window.prompt('Low-stock alert threshold', String(item.lowStockThreshold ?? 5));
                            start(async () => {
                              const res = await updateStockAction(item.id, Number(input), true, threshold != null ? Number(threshold) : null);
                              if (res.ok) {
                                setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, stock: Number(input), trackStock: true, lowStockThreshold: threshold != null ? Number(threshold) : null } : i)));
                              }
                            });
                          }}
                        >
                          <Package className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Configure options / variants"
                        onClick={() =>
                          setEditingOptions((cur) => (cur === item.id ? null : item.id))
                        }
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggle(item.id, !item.isVisible)} disabled={pending}>
                        {item.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(item.id)} disabled={pending}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    {editingOptions === item.id && (
                      <div className="mt-3 border-t border-border pt-3">
                        <OptionsEditor
                          item={item}
                          onSaved={(options) => {
                            setItems((prev) =>
                              prev.map((i) => (i.id === item.id ? { ...i, options } : i)),
                            );
                            setEditingOptions(null);
                          }}
                          onCancel={() => setEditingOptions(null)}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ───────────────────────── options editor ─────────────────────────

/**
 * Build a Record<groupId, OptionGroup> payload for the server from the
 * editable draft state. Group/value ids are slugged from labels.
 */
function buildPayload(groups: DraftGroup[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const g of groups) {
    if (!g.label.trim() || g.values.length === 0) continue;
    const gid = slugId(g.label);
    out[gid] = {
      id: gid,
      label: g.label.trim(),
      required: g.required,
      compact: g.compact,
      values: g.values
        .filter((v) => v.label.trim())
        .map((v) => ({
          id: slugId(v.label),
          label: v.label.trim(),
          delta: Number.isFinite(v.delta) ? v.delta : 0,
        })),
    };
  }
  return out;
}

interface DraftValue {
  key: number;
  label: string;
  delta: number;
}
interface DraftGroup {
  key: number;
  label: string;
  required: boolean;
  compact: boolean;
  values: DraftValue[];
}

let draftKey = 1;
function nextKey(): number {
  return draftKey++;
}

function toDraft(options: OptionGroup[] | null): DraftGroup[] {
  return (options ?? []).map((g) => ({
    key: nextKey(),
    label: g.label,
    required: g.required,
    compact: g.compact,
    values: g.values.map((v) => ({ key: nextKey(), label: v.label, delta: v.delta })),
  }));
}

/**
 * Add / edit an item's option groups and values with per-value price deltas.
 * Two entry points share this editor: the new-item form and existing rows.
 */
export function OptionsEditor({
  item,
  onSaved,
  onCancel,
}: {
  item?: CatalogItemView;
  onSaved?: (options: OptionGroup[] | null) => void;
  onCancel: () => void;
}) {
  const [groups, setGroups] = useState<DraftGroup[]>(() => toDraft(item?.options ?? null));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(groupKey: number, fn: (g: DraftGroup) => DraftGroup) {
    setGroups((prev) => prev.map((g) => (g.key === groupKey ? fn(g) : g)));
  }

  function save() {
    if (!item) return;
    setError(null);
    const payload = groups.length > 0 ? buildPayload(groups) : null;
    start(async () => {
      const res = await updateCatalogItemAction(item.id, { options: payload });
      if (res.ok) {
        // Re-derive the view shape from the payload (ids/labels validated server-side).
        const { itemOptionsSchema } = await import('@printflow/shared');
        const parsed = payload ? itemOptionsSchema.parse(payload) : null;
        onSaved?.(parsed ? Object.values(parsed) : null);
      } else {
        setError(res.error ?? 'Save failed');
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Option groups (size, cover, paper quality…) — each choice can add a price delta
      </p>

      {groups.map((group) => (
        <div key={group.key} className="space-y-2 rounded-md border border-border bg-background p-3">
          <div className="flex items-center gap-2">
            <Input
              value={group.label}
              placeholder="Group name (e.g. Size)"
              onChange={(e) => update(group.key, (g) => ({ ...g, label: e.target.value }))}
              className="h-8 flex-1"
              aria-label="Option group name"
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={group.required}
                onChange={(e) => update(group.key, (g) => ({ ...g, required: e.target.checked }))}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Required
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={group.compact}
                onChange={(e) => update(group.key, (g) => ({ ...g, compact: e.target.checked }))}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Dropdown
            </label>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Remove group"
              onClick={() => setGroups((prev) => prev.filter((g) => g.key !== group.key))}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-1.5">
            {group.values.map((value) => (
              <div key={value.key} className="flex items-center gap-2">
                <Input
                  value={value.label}
                  placeholder="Value (e.g. Hard cover)"
                  onChange={(e) =>
                    update(group.key, (g) => ({
                      ...g,
                      values: g.values.map((v) =>
                        v.key === value.key ? { ...v, label: e.target.value } : v,
                      ),
                    }))
                  }
                  className="h-8 flex-1"
                  aria-label="Option value"
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    step="0.5"
                    value={value.delta}
                    onChange={(e) =>
                      update(group.key, (g) => ({
                        ...g,
                        values: g.values.map((v) =>
                          v.key === value.key ? { ...v, delta: Number(e.target.value) } : v,
                        ),
                      }))
                    }
                    className="h-8 w-20"
                    aria-label="Price delta"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove value"
                  onClick={() =>
                    update(group.key, (g) => ({
                      ...g,
                      values: g.values.filter((v) => v.key !== value.key),
                    }))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                update(group.key, (g) => ({
                  ...g,
                  values: [...g.values, { key: nextKey(), label: '', delta: 0 }],
                }))
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add value
            </Button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setGroups((prev) => [
              ...prev,
              { key: nextKey(), label: '', required: false, compact: false, values: [{ key: nextKey(), label: '', delta: 0 }] },
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" /> Add option group
        </Button>
        {item && (
          <>
            <Button size="sm" onClick={save} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Save options
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Done
            </Button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ───────────────────────── new-item form ─────────────────────────

function ItemForm({
  onDone,
  onCancel,
}: {
  onDone: (item: CatalogItemView) => void;
  onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optionGroups, setOptionGroups] = useState<DraftGroup[]>([]);

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const kind = (formData.get('kind') as 'PRINT' | 'PRODUCT' | 'SERVICE') ?? 'PRODUCT';
      const res = await addCatalogItemAction({
        kind,
        name: String(formData.get('name') ?? ''),
        price: Number(formData.get('price') ?? 0),
        unit: String(formData.get('unit') ?? 'piece'),
        category: (formData.get('category') as string) || null,
        description: (formData.get('description') as string) || null,
        options: optionGroups.length > 0 ? buildPayload(optionGroups) : null,
      });
      if (res.ok) {
        const { itemOptionsSchema } = await import('@printflow/shared');
        const parsedOptions =
          optionGroups.length > 0 ? itemOptionsSchema.parse(buildPayload(optionGroups)) : null;
        onDone({
          id: crypto.randomUUID(), // replaced by revalidate on next render
          kind,
          name: String(formData.get('name') ?? ''),
          description: (formData.get('description') as string) || null,
          category: (formData.get('category') as string) || null,
          unit: String(formData.get('unit') ?? 'piece'),
          price: Number(formData.get('price') ?? 0),
          isVisible: true,
          minQty: 1,
          maxQty: null,
          options: parsedOptions ? Object.values(parsedOptions) : null,
          sortOrder: 0,
          trackStock: false,
          stock: 0,
          lowStockThreshold: null,
        });
      } else {
        setError(res.error ?? 'Failed');
      }
    });
  }

  return (
    <form action={submit} className="space-y-3 rounded-lg border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="kind">Type</Label>
          <select id="kind" name="kind" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option value="PRINT">Printing</option>
            <option value="PRODUCT">Stationery</option>
            <option value="SERVICE">Service</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="A4 B&W print" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="price">Price (₹)</Label>
          <Input id="price" name="price" type="number" min="0" step="0.5" placeholder="2" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit">Unit</Label>
          <Input id="unit" name="unit" placeholder="page / piece / job" defaultValue="piece" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="category">Category (optional)</Label>
          <Input id="category" name="category" placeholder="e.g. Notebooks" />
        </div>
      </div>

      <OptionsEditorDraft groups={optionGroups} setGroups={setOptionGroups} />

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Add
        </Button>
      </div>
    </form>
  );
}

/** The editor inside the new-item form: state lives in ItemForm, save happens with the item. */
function OptionsEditorDraft({
  groups,
  setGroups,
}: {
  groups: DraftGroup[];
  setGroups: React.Dispatch<React.SetStateAction<DraftGroup[]>>;
}) {
  function update(groupKey: number, fn: (g: DraftGroup) => DraftGroup) {
    setGroups((prev) => prev.map((g) => (g.key === groupKey ? fn(g) : g)));
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Options / variants (optional) — e.g. Size: A4 +₹0, A5 −₹10
      </p>
      {groups.map((group) => (
        <div key={group.key} className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Input
              value={group.label}
              placeholder="Group name (e.g. Size)"
              onChange={(e) => update(group.key, (g) => ({ ...g, label: e.target.value }))}
              className="h-8 flex-1"
              aria-label="Option group name"
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={group.required}
                onChange={(e) => update(group.key, (g) => ({ ...g, required: e.target.checked }))}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Required
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={group.compact}
                onChange={(e) => update(group.key, (g) => ({ ...g, compact: e.target.checked }))}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Dropdown
            </label>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Remove group"
              onClick={() => setGroups((prev) => prev.filter((g) => g.key !== group.key))}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-1.5">
            {group.values.map((value) => (
              <div key={value.key} className="flex items-center gap-2">
                <Input
                  value={value.label}
                  placeholder="Value (e.g. Hard cover)"
                  onChange={(e) =>
                    update(group.key, (g) => ({
                      ...g,
                      values: g.values.map((v) =>
                        v.key === value.key ? { ...v, label: e.target.value } : v,
                      ),
                    }))
                  }
                  className="h-8 flex-1"
                  aria-label="Option value"
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    step="0.5"
                    value={value.delta}
                    onChange={(e) =>
                      update(group.key, (g) => ({
                        ...g,
                        values: g.values.map((v) =>
                          v.key === value.key ? { ...v, delta: Number(e.target.value) } : v,
                        ),
                      }))
                    }
                    className="h-8 w-20"
                    aria-label="Price delta"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove value"
                  onClick={() =>
                    update(group.key, (g) => ({
                      ...g,
                      values: g.values.filter((v) => v.key !== value.key),
                    }))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                update(group.key, (g) => ({
                  ...g,
                  values: [...g.values, { key: nextKey(), label: '', delta: 0 }],
                }))
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add value
            </Button>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setGroups((prev) => [
            ...prev,
            { key: nextKey(), label: '', required: false, compact: false, values: [{ key: nextKey(), label: '', delta: 0 }] },
          ])
        }
      >
        <Plus className="h-3.5 w-3.5" /> Add option group
      </Button>
    </div>
  );
}
