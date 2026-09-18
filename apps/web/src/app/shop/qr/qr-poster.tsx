'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

export function QrPoster({
  shopName,
  url,
  shopCode,
}: {
  shopName: string;
  url: string;
  shopCode: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print poster
        </Button>
      </div>

      <div
        id="qr-poster"
        className="mx-auto max-w-sm rounded-lg border-2 border-border bg-white p-8 text-center"
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Order here
        </p>
        <h2 className="mt-2 text-2xl font-bold text-gray-900">{shopName}</h2>
        <p className="mt-1 text-sm text-gray-500">Scan with your phone camera</p>
        <div className="my-6 flex justify-center">
          <QRCodeSVG value={url} size={220} />
        </div>
        <p className="break-all text-xs text-gray-500">{url}</p>
        {shopCode && <p className="mt-2 font-mono text-xs text-gray-400">{shopCode}</p>}
      </div>
    </div>
  );
}
