'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  emptyJobDocument,
  jobDocumentSchema,
  type JobDocument,
  type PageItem,
} from '@printflow/shared';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import type { Prisma } from '@printflow/db';
import { uploadBytes, originalPath, signedUrl } from '@/lib/storage';
import { validateUpload } from '@/lib/upload/validate';
import { getPdfPageCount } from '@/lib/pdf/inspect';
import { generateUniqueOrderNumber, persistDocument } from '@/lib/data/job-service';
import { audit } from '@/lib/data/audit';
import { DEFAULT_SHOP_ID } from '@/lib/constants';

async function requireStudent() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'student') {
    throw new Error('Unauthorized');
  }
  return session.user;
}

async function getEditableJob(jobId: string, studentId: string) {
  const job = await db().printJob.findFirst({
    where: { id: jobId, studentId },
  });
  if (!job) throw new Error('Job not found');
  if (job.isLocked) throw new Error('This order is paid and locked');
  return job;
}

/**
 * Upload files and create a draft job in one step, then send the student to the
 * page editor. Each PDF contributes one page per PDF page; each image is one page.
 */
export async function createJobFromUploads(formData: FormData): Promise<void> {
  const user = await requireStudent();
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new Error('No files provided');

  const orderNumber = await generateUniqueOrderNumber();

  // 1) Create the draft job shell.
  const job = await db().printJob.create({
    data: {
      orderNumber,
      studentId: user.id,
      shopId: DEFAULT_SHOP_ID,
      status: 'draft',
      document: emptyJobDocument() as unknown as Prisma.InputJsonValue,
    },
  });

  // 2) Validate + upload each file, collect pages.
  const pages: PageItem[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const buf = new Uint8Array(await file.arrayBuffer());
    const verdict = validateUpload(file.type, file.size, buf.subarray(0, 16));
    if (!verdict.ok) throw new Error(`${file.name}: ${verdict.reason}`);

    const fileRow = await db().jobFile.create({
      data: {
        jobId: job.id,
        kind: verdict.kind,
        storagePath: 'pending',
        filename: file.name,
        mimeType: verdict.mime,
        sizeBytes: file.size,
        pageCount: 1,
        sortOrder: i,
      },
    });

    const path = originalPath(user.id, job.id, fileRow.id, verdict.ext);
    await uploadBytes('originals', path, buf, verdict.mime);
    await db().jobFile.update({
      where: { id: fileRow.id },
      data: { storagePath: path },
    });

    let pageCount = 1;
    if (verdict.kind === 'pdf') {
      pageCount = await getPdfPageCount(buf).catch(() => 1);
      await db().jobFile.update({
        where: { id: fileRow.id },
        data: { pageCount },
      });
    }

    if (verdict.kind === 'pdf') {
      for (let p = 0; p < pageCount; p++) {
        pages.push({
          id: crypto.randomUUID(),
          source: { kind: 'pdf_page', fileId: fileRow.id, pageIndex: p },
          rotation: 0,
          color: 'bw',
        });
      }
    } else {
      pages.push({
        id: crypto.randomUUID(),
        source: { kind: 'image', fileId: fileRow.id },
        rotation: 0,
        color: 'bw',
      });
    }
  }

  // 3) Persist the assembled document (sets metrics, price, status=configured).
  const doc: JobDocument = { ...emptyJobDocument(), pages };
  await persistDocument({ id: job.id, shop_id: DEFAULT_SHOP_ID }, doc);

  await audit({ actorId: user.id, jobId: job.id, action: 'job_created', toStatus: 'configured', metadata: { files: files.length, pages: pages.length } });

  redirect(`/jobs/${job.id}/edit`);
}

/**
 * Add a single image to an existing job (insert-between-pages in the editor).
 * Returns the new fileId + a signed URL so the client can render it immediately.
 */
export async function addImageToJob(
  jobId: string,
  formData: FormData,
): Promise<{ fileId: string; url: string; filename: string }> {
  const user = await requireStudent();
  const job = await getEditableJob(jobId, user.id);
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) throw new Error('No image provided');

  const buf = new Uint8Array(await file.arrayBuffer());
  const verdict = validateUpload(file.type, file.size, buf.subarray(0, 16));
  if (!verdict.ok) throw new Error(verdict.reason);
  if (verdict.kind !== 'image') throw new Error('Only images can be inserted between pages');

  const fileRow = await db().jobFile.create({
    data: {
      jobId: job.id,
      kind: 'image',
      storagePath: 'pending',
      filename: file.name,
      mimeType: verdict.mime,
      sizeBytes: file.size,
      pageCount: 1,
      sortOrder: 999,
    },
  });

  const path = originalPath(user.id, job.id, fileRow.id, verdict.ext);
  await uploadBytes('originals', path, buf, verdict.mime);
  await db().jobFile.update({ where: { id: fileRow.id }, data: { storagePath: path } });

  const url = await signedUrl('originals', path);
  return { fileId: fileRow.id, url, filename: file.name };
}

/** Save the edited document (reorder/rotate/color/settings). Blocked once locked. */
export async function saveJobDocument(jobId: string, doc: JobDocument): Promise<{ price: number }> {
  const user = await requireStudent();
  const job = await getEditableJob(jobId, user.id);
  const parsed = jobDocumentSchema.parse(doc);
  const price = await persistDocument({ id: job.id, shop_id: job.shopId }, parsed);
  await audit({ actorId: user.id, jobId, action: 'job_edited', metadata: { pages: parsed.pages.length } });
  revalidatePath(`/jobs/${jobId}`);
  return { price };
}

/** Duplicate a past job's document into a fresh draft (reorder / template reuse). */
export async function duplicateJob(jobId: string): Promise<void> {
  const user = await requireStudent();

  const source = await db().printJob.findFirst({
    where: { id: jobId, studentId: user.id },
    include: { files: true },
  });
  if (!source) throw new Error('Job not found');

  const orderNumber = await generateUniqueOrderNumber();

  const created = await db().printJob.create({
    data: {
      orderNumber,
      studentId: user.id,
      shopId: source.shopId,
      status: 'draft',
      document: emptyJobDocument() as unknown as Prisma.InputJsonValue,
    },
  });

  // Copy the original file rows with NEW ids (primary keys must be unique). They
  // point at the same immutable storage objects, and we remap the document's page
  // references old id -> new id so everything still resolves.
  const idMap = new Map<string, string>();
  for (const file of source.files) {
    const newFile = await db().jobFile.create({
      data: {
        jobId: created.id,
        kind: file.kind,
        storagePath: file.storagePath,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        pageCount: file.pageCount,
        sortOrder: file.sortOrder,
      },
    });
    idMap.set(file.id, newFile.id);
  }

  const sourceDoc = jobDocumentSchema.parse(source.document);
  const remapped: JobDocument = {
    ...sourceDoc,
    pages: sourceDoc.pages.map((p) => ({
      ...p,
      id: crypto.randomUUID(),
      source: { ...p.source, fileId: idMap.get(p.source.fileId) ?? p.source.fileId },
    })),
  };

  await persistDocument({ id: created.id, shop_id: source.shopId }, remapped);
  await audit({ actorId: user.id, jobId: created.id, action: 'job_duplicated', metadata: { from: jobId } });

  redirect(`/jobs/${created.id}/edit`);
}
