'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  RotateCw,
  Copy,
  Trash2,
  ImagePlus,
  Loader2,
  Check,
  Palette,
} from 'lucide-react';
import {
  quote,
  type JobDocument,
  type PageItem,
  type PricingConfig,
  type Rotation,
  type BindingType,
  type PaperSize,
  type Orientation,
} from '@printflow/shared';
import type { JobSource } from '@/lib/data/job-detail';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency } from '@/lib/utils';
import { PageThumb } from './page-thumb';
import { saveJobDocument, addImageToJob } from '@/app/(student)/jobs/actions';

interface EditorProps {
  jobId: string;
  initialDocument: JobDocument;
  initialSources: Record<string, JobSource>;
  pricing: PricingConfig;
}

export function Editor({ jobId, initialDocument, initialSources, pricing }: EditorProps) {
  const router = useRouter();
  const [pages, setPages] = useState<PageItem[]>(initialDocument.pages);
  const [settings, setSettings] = useState(initialDocument.settings);
  const [sources, setSources] = useState(initialSources);
  const [selectedId, setSelectedId] = useState<string | null>(pages[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [inserting, startInsert] = useTransition();
  const imageInput = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
  );

  const doc: JobDocument = useMemo(
    () => ({ version: 1, pages, settings }),
    [pages, settings],
  );
  const price = useMemo(() => quote(doc, pricing), [doc, pricing]);

  const selectedIndex = pages.findIndex((p) => p.id === selectedId);

  function mutate(next: PageItem[]) {
    setPages(next);
    setDirty(true);
    setSaved(false);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = pages.findIndex((p) => p.id === active.id);
    const to = pages.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;
    mutate(arrayMove(pages, from, to));
  }

  function updateSelected(fn: (p: PageItem) => PageItem) {
    if (!selectedId) return;
    mutate(pages.map((p) => (p.id === selectedId ? fn(p) : p)));
  }

  function rotate() {
    updateSelected((p) => ({ ...p, rotation: (((p.rotation + 90) % 360) as Rotation) }));
  }
  function toggleColor() {
    updateSelected((p) => ({ ...p, color: p.color === 'bw' ? 'color' : 'bw' }));
  }
  function duplicate() {
    if (selectedIndex < 0) return;
    const src = pages[selectedIndex]!;
    const copy: PageItem = { ...src, id: crypto.randomUUID() };
    const next = [...pages];
    next.splice(selectedIndex + 1, 0, copy);
    mutate(next);
    setSelectedId(copy.id);
  }
  function remove() {
    if (selectedIndex < 0) return;
    const next = pages.filter((p) => p.id !== selectedId);
    mutate(next);
    setSelectedId(next[Math.max(0, selectedIndex - 1)]?.id ?? null);
  }

  function onInsertImage(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    startInsert(async () => {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await addImageToJob(jobId, fd);
        setSources((prev) => ({
          ...prev,
          [res.fileId]: { fileId: res.fileId, kind: 'image', filename: res.filename, url: res.url, pageCount: 1 },
        }));
        const newPage: PageItem = {
          id: crypto.randomUUID(),
          source: { kind: 'image', fileId: res.fileId },
          rotation: 0,
          color: 'bw',
        };
        const at = selectedIndex >= 0 ? selectedIndex + 1 : pages.length;
        const next = [...pages];
        next.splice(at, 0, newPage);
        mutate(next);
        setSelectedId(newPage.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not add image');
      }
    });
  }

  function save(then?: () => void) {
    setError(null);
    startSave(async () => {
      try {
        await saveJobDocument(jobId, doc);
        setDirty(false);
        setSaved(true);
        then?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed');
      }
    });
  }

  const canContinue = pages.length > 0;

  return (
    <div className="space-y-5 pb-40">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Arrange pages</h1>
        <p className="text-sm text-muted-foreground">
          Drag to reorder. Tap a page to rotate, duplicate, recolor, or delete.
        </p>
      </div>

      {pages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No pages. Add an image below to start.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 gap-3">
              {pages.map((page, i) => (
                <SortablePage
                  key={page.id}
                  page={page}
                  index={i}
                  source={sources[page.source.fileId]}
                  selected={page.id === selectedId}
                  onSelect={() => setSelectedId(page.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Per-page actions */}
      {selectedId && (
        <div className="flex flex-wrap gap-2">
          <ToolButton icon={RotateCw} label="Rotate" onClick={rotate} />
          <ToolButton icon={Palette} label={pages[selectedIndex]?.color === 'color' ? 'Color' : 'B&W'} onClick={toggleColor} active={pages[selectedIndex]?.color === 'color'} />
          <ToolButton icon={Copy} label="Duplicate" onClick={duplicate} />
          <ToolButton icon={Trash2} label="Delete" onClick={remove} destructive />
        </div>
      )}

      <div>
        <input
          ref={imageInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => onInsertImage(e.target.files)}
        />
        <Button variant="outline" className="w-full" disabled={inserting} onClick={() => imageInput.current?.click()}>
          {inserting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          Insert image
        </Button>
      </div>

      {/* Job settings */}
      <div className="space-y-4 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium">Print settings</h2>
        <Field label="Paper size">
          <Segmented<PaperSize>
            value={settings.paperSize}
            options={[{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }]}
            onChange={(v) => { setSettings((s) => ({ ...s, paperSize: v })); setDirty(true); }}
          />
        </Field>
        <Field label="Orientation">
          <Segmented<Orientation>
            value={settings.orientation}
            options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]}
            onChange={(v) => { setSettings((s) => ({ ...s, orientation: v })); setDirty(true); }}
          />
        </Field>
        <Field label="Binding">
          <Segmented<BindingType>
            value={settings.binding}
            options={[{ value: 'none', label: 'None' }, { value: 'staple', label: 'Staple' }, { value: 'spiral', label: 'Spiral' }]}
            onChange={(v) => { setSettings((s) => ({ ...s, binding: v })); setDirty(true); }}
          />
        </Field>
        <Field label="Copies">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => { setSettings((s) => ({ ...s, copies: Math.max(1, s.copies - 1) })); setDirty(true); }}>–</Button>
            <span className="w-8 text-center text-sm font-medium">{settings.copies}</span>
            <Button variant="outline" size="icon" onClick={() => { setSettings((s) => ({ ...s, copies: Math.min(99, s.copies + 1) })); setDirty(true); }}>+</Button>
          </div>
        </Field>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-[57px] z-10 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <div className="text-sm">
            <div className="font-semibold">{formatCurrency(price.total, price.currency)}</div>
            <div className="text-xs text-muted-foreground">
              {price.bwPages + price.colorPages} pages · {settings.copies} cop{settings.copies === 1 ? 'y' : 'ies'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => save()} disabled={saving || (!dirty && saved)}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved && !dirty ? <Check className="h-4 w-4" /> : null}
              {saved && !dirty ? 'Saved' : 'Save'}
            </Button>
            <Button size="sm" disabled={!canContinue || saving} onClick={() => save(() => router.push(`/jobs/${jobId}/pay`))}>
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortablePage({
  page,
  index,
  source,
  selected,
  onSelect,
}: {
  page: PageItem;
  index: number;
  source?: JobSource;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={cn(
        'group relative aspect-[1/1.414] cursor-pointer overflow-hidden rounded-md border bg-card',
        selected ? 'border-primary ring-2 ring-primary' : 'border-border',
        isDragging && 'opacity-50',
      )}
    >
      <PageThumb page={page} source={source} />
      <span className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded bg-foreground/80 px-1 text-[10px] font-medium text-background">
        {index + 1}
      </span>
      {page.color === 'color' && (
        <span className="absolute right-1 top-1 rounded bg-primary px-1 text-[9px] font-medium text-primary-foreground">
          Color
        </span>
      )}
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  destructive,
  active,
}: {
  icon: typeof RotateCw;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors',
        destructive
          ? 'border-border text-destructive hover:bg-destructive/5'
          : active
            ? 'border-primary bg-primary-weak text-primary'
            : 'border-border hover:bg-muted',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded px-3 py-1 text-sm transition-colors',
            value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
