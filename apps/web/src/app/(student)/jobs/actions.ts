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
import { supabaseAdmin } from '@/lib/supabase/admin';
import { uploadBytes, originalPath, signedUrl } from '@/lib/supabase/storage';
import { validateUpload } from '@/lib/upload/validate';
import { getPdfPageCount } from '@/lib/pdf/inspect';
import { generateUniqueOrderNumber, persistDocument } from '@/lib/data/job-service';
import { audit } from '@/lib/data/audit';
import { DEFAULT_SHOP_ID } from '@/lib/constants';
import type { PrintJobRow } from '@/lib/db.types';

async function requireStudent() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'student') {
    throw new Error('Unauthorized');
  }
  return session.user;
}

async function getEditableJob(jobId: string, studentId: string): Promise<PrintJobRow> {
  const { data } = await supabaseAdmin()
    .from('print_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('student_id', studentId)
    .maybeSingle();
  const job = data as PrintJobRow | null;
  if (!job) throw new Error('Job not found');
  if (job.is_locked) throw new Error('This order is paid and locked');
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

  const db = supabaseAdmin();
  const orderNumber = await generateUniqueOrderNumber();

  // 1) Create the draft job shell.
  const jobId = crypto.randomUUID();
  const { error: jobErr } = await db.from('print_jobs').insert({
    id: jobId,
    order_number: orderNumber,
    student_id: user.id,
    shop_id: DEFAULT_SHOP_ID,
    status: 'draft',
    document: emptyJobDocument(),
  } as never);
  if (jobErr) throw new Error('Could not create job');

  // 2) Validate + upload each file, collect pages.
  const pages: PageItem[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const buf = new Uint8Array(await file.arrayBuffer());
    const verdict = validateUpload(file.type, file.size, buf.subarray(0, 16));
    if (!verdict.ok) throw new Error(`${file.name}: ${verdict.reason}`);

    const fileId = crypto.randomUUID();
    const path = originalPath(user.id, jobId, fileId, verdict.ext);
    await uploadBytes('originals', path, buf, verdict.mime);

    let pageCount = 1;
    if (verdict.kind === 'pdf') {
      pageCount = await getPdfPageCount(buf).catch(() => 1);
    }

    await db.from('job_files').insert({
      id: fileId,
      job_id: jobId,
      kind: verdict.kind,
      storage_path: path,
      filename: file.name,
      mime_type: verdict.mime,
      size_bytes: file.size,
      page_count: verdict.kind === 'pdf' ? pageCount : 1,
      sort_order: i,
    } as never);

    if (verdict.kind === 'pdf') {
      for (let p = 0; p < pageCount; p++) {
        pages.push({
          id: crypto.randomUUID(),
          source: { kind: 'pdf_page', fileId, pageIndex: p },
          rotation: 0,
          color: 'bw',
        });
      }
    } else {
      pages.push({
        id: crypto.randomUUID(),
        source: { kind: 'image', fileId },
        rotation: 0,
        color: 'bw',
      });
    }
  }

  // 3) Persist the assembled document (sets metrics, price, status=configured).
  const doc: JobDocument = { ...emptyJobDocument(), pages };
  const jobRow = { id: jobId, shop_id: DEFAULT_SHOP_ID } as PrintJobRow;
  await persistDocument(jobRow, doc);

  await audit({ actorId: user.id, jobId, action: 'job_created', toStatus: 'configured', metadata: { files: files.length, pages: pages.length } });

  redirect(`/jobs/${jobId}/edit`);
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

  const fileId = crypto.randomUUID();
  const path = originalPath(user.id, job.id, fileId, verdict.ext);
  await uploadBytes('originals', path, buf, verdict.mime);

  await supabaseAdmin().from('job_files').insert({
    id: fileId,
    job_id: job.id,
    kind: 'image',
    storage_path: path,
    filename: file.name,
    mime_type: verdict.mime,
    size_bytes: file.size,
    page_count: 1,
    sort_order: 999,
  } as never);

  const url = await signedUrl('originals', path);
  return { fileId, url, filename: file.name };
}

/** Save the edited document (reorder/rotate/color/settings). Blocked once locked. */
export async function saveJobDocument(jobId: string, doc: JobDocument): Promise<{ price: number }> {
  const user = await requireStudent();
  const job = await getEditableJob(jobId, user.id);
  const parsed = jobDocumentSchema.parse(doc);
  const price = await persistDocument(job, parsed);
  await audit({ actorId: user.id, jobId, action: 'job_edited', metadata: { pages: parsed.pages.length } });
  revalidatePath(`/jobs/${jobId}`);
  return { price };
}

/** Duplicate a past job's document into a fresh draft (reorder / template reuse). */
export async function duplicateJob(jobId: string): Promise<void> {
  const user = await requireStudent();
  const db = supabaseAdmin();

  const { data } = await db
    .from('print_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('student_id', user.id)
    .maybeSingle();
  const source = data as PrintJobRow | null;
  if (!source) throw new Error('Job not found');

  const newId = crypto.randomUUID();
  const orderNumber = await generateUniqueOrderNumber();

  // Copy the original file rows with NEW ids (primary keys must be unique). They
  // point at the same immutable storage objects, and we remap the document's page
  // references old id -> new id so everything still resolves.
  const { data: files } = await db.from('job_files').select('*').eq('job_id', jobId);
  const idMap = new Map<string, string>();

  await db.from('print_jobs').insert({
    id: newId,
    order_number: orderNumber,
    student_id: user.id,
    shop_id: source.shop_id,
    status: 'draft',
    document: emptyJobDocument(),
  } as never);

  for (const file of (files ?? []) as JobFileLike[]) {
    const newFileId = crypto.randomUUID();
    idMap.set(file.id, newFileId);
    await db.from('job_files').insert({
      id: newFileId,
      job_id: newId,
      kind: file.kind,
      storage_path: file.storage_path,
      filename: file.filename,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      page_count: file.page_count,
      sort_order: file.sort_order,
    } as never);
  }

  const remapped: JobDocument = {
    ...source.document,
    pages: source.document.pages.map((p) => ({
      ...p,
      id: crypto.randomUUID(),
      source: { ...p.source, fileId: idMap.get(p.source.fileId) ?? p.source.fileId },
    })),
  };

  await persistDocument({ id: newId, shop_id: source.shop_id } as PrintJobRow, remapped);
  await audit({ actorId: user.id, jobId: newId, action: 'job_duplicated', metadata: { from: jobId } });

  redirect(`/jobs/${newId}/edit`);
}

type JobFileLike = {
  id: string;
  kind: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  sort_order: number;
};
