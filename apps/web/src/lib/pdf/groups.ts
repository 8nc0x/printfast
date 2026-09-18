import 'server-only';
import { db } from '@/lib/db';
import type { JobDocument } from '@printflow/shared';

/**
 * Group compiler (Phase 5). Pages with identical print settings collapse into
 * one PrintGroup — the unit the Windows agent sends to the printer.
 *
 * MVP geometry has job-wide paper/orientation/copies/binding and per-page color,
 * so groups differ by color today; the schema is ready for per-page paper/sides
 * when the editor grows per-page settings.
 */
export async function compileGroups(jobId: string, doc: JobDocument): Promise<number> {
  await db().printGroup.deleteMany({ where: { jobId } });

  const byKey = new Map<string, { pages: { index: number; rotation: number }[]; color: 'BW' | 'COLOR' }>();
  doc.pages.forEach((p, index) => {
    const color = p.color === 'color' ? 'COLOR' : 'BW';
    const key = `${color}`;
    const entry = byKey.get(key) ?? { pages: [], color };
    entry.pages.push({ index, rotation: p.rotation });
    byKey.set(key, entry);
  });

  const groups = [...byKey.values()];
  if (groups.length === 0) return 0;

  await db().printGroup.createMany({
    data: groups.map((g) => ({
      jobId,
      pages: g.pages as unknown as never,
      paperSize: doc.settings.paperSize,
      color: g.color,
      // Duplex applies job-wide in the MVP; surfaced per-group for the agent.
      sides: 'SINGLE',
      copies: doc.settings.copies,
      quality: 'normal',
    })),
  });

  return groups.length;
}
