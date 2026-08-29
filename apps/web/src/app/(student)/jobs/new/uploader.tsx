'use client';

import { useRef, useState, useTransition } from 'react';
import { Upload, File as FileIcon, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createJobFromUploads } from '../actions';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';
const MAX_MB = 25;

export function Uploader() {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const incoming = Array.from(list);
    const tooBig = incoming.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) {
      setError(`${tooBig.name} is larger than ${MAX_MB} MB`);
      return;
    }
    setFiles((prev) => [...prev, ...incoming]);
  }

  function removeAt(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit() {
    if (files.length === 0) return;
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    setError(null);
    startTransition(async () => {
      try {
        await createJobFromUploads(fd);
      } catch (e) {
        // redirect() throws a special error we must not swallow.
        if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
        if (typeof e === 'object' && e && 'digest' in e && String((e as { digest: string }).digest).startsWith('NEXT_REDIRECT')) throw e;
        setError(e instanceof Error ? e.message : 'Upload failed');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-6 py-10 text-center transition-colors hover:bg-muted"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          <Upload className="h-5 w-5" />
        </span>
        <span className="text-sm font-medium">Tap to add files</span>
        <span className="text-xs text-muted-foreground">PDF, JPG, PNG, WEBP · up to {MAX_MB} MB each</span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
              <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" onClick={() => removeAt(i)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Remove">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button className="w-full" disabled={files.length === 0 || pending} onClick={submit}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
          </>
        ) : (
          'Continue to arrange'
        )}
      </Button>
    </div>
  );
}
