'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { PageItem } from '@printflow/shared';
import type { JobSource } from '@/lib/data/job-detail';
import { renderPdfThumb } from '@/lib/pdf/render-client';

const THUMB_WIDTH = 240;

export function PageThumb({ page, source }: { page: PageItem; source?: JobSource }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!source || source.kind !== 'pdf' || page.source.kind !== 'pdf_page') return;
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);
    renderPdfThumb(source.url, page.source.pageIndex, THUMB_WIDTH, page.rotation)
      .then((url) => !cancelled && mounted.current && setDataUrl(url))
      .catch(() => !cancelled && mounted.current && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [source, page.source, page.rotation]);

  if (!source) {
    return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">missing</div>;
  }

  // Images render directly, rotation applied via CSS.
  if (source.kind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source.url}
        alt={source.filename}
        className="h-full w-full object-contain transition-transform"
        style={{ transform: `rotate(${page.rotation}deg)` }}
      />
    );
  }

  if (failed) {
    return <div className="flex h-full items-center justify-center text-xs text-destructive">failed</div>;
  }
  if (!dataUrl) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt="" className="h-full w-full object-contain" />;
}
