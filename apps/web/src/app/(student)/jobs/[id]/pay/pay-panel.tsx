'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Smartphone, QrCode, CheckCircle2, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { PriceBreakdown } from '@printflow/shared';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { startPayment } from './actions';

/**
 * Custom (white-label) checkout per PayXmint docs §4:
 *  - mobile → UPI app deep links (upi_links from create-intent)
 *  - desktop → QR (qr_data)
 *  - polls /api/payments/status every 3.5s for UI updates only —
 *    fulfillment stays authoritative on the signed webhook.
 */

interface UpiLinks {
  upi?: string;
  gpay?: string;
  phonepe?: string;
  paytm?: string;
}

interface StartResult {
  redirectUrl?: string;
  params?: {
    upiLinks?: UpiLinks | null;
    qrData?: string | null;
  } | null;
  error?: string;
}

export function PayPanel({
  jobId,
  breakdown,
  orderNumber,
}: {
  jobId: string;
  breakdown: PriceBreakdown;
  orderNumber: string;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [upiLinks, setUpiLinks] = useState<UpiLinks | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const [payState, setPayState] = useState<'idle' | 'waiting' | 'success' | 'expired'>('idle');
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function pay() {
    setError(null);
    setStarting(true);
    try {
      const res = (await startPayment(jobId)) as StartResult;
      if (res.error) {
        setError(res.error);
        return;
      }
      // Hosted-checkout providers (or dev sandbox): just follow the redirect.
      if (res.redirectUrl) {
        // If params carry UPI/QR too, show the custom sheet instead of redirecting.
        if (res.params?.upiLinks || res.params?.qrData) {
          setUpiLinks(res.params.upiLinks ?? null);
          setQrData(res.params.qrData ?? null);
          setPayState('waiting');
          startPolling();
        } else {
          window.location.href = res.redirectUrl;
        }
        return;
      }
      setUpiLinks(res.params?.upiLinks ?? null);
      setQrData(res.params?.qrData ?? null);
      setPayState('waiting');
      startPolling();
    } finally {
      setStarting(false);
    }
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/status?jobId=${encodeURIComponent(jobId)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string };
        if (data.status === 'SUCCESS' || data.status === 'shop_received' || data.status === 'paid') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPayState('success');
          setTimeout(() => router.push(`/jobs/${jobId}`), 1200);
        } else if (data.status === 'EXPIRED') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPayState('expired');
        }
      } catch {
        /* transient network error — keep polling */
      }
    }, 3500);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">Order</p>
          <p className="font-medium">{orderNumber}</p>
        </div>
        <dl className="divide-y divide-border">
          {breakdown.lines
            .filter((l) => l.amount > 0 || l.label.startsWith('×'))
            .map((line, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <dt className="text-muted-foreground">{line.label}</dt>
                <dd className="font-medium">{line.amount > 0 ? formatCurrency(line.amount, breakdown.currency) : ''}</dd>
              </div>
            ))}
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="font-semibold">Total</dt>
            <dd className="text-lg font-semibold">{formatCurrency(breakdown.total, breakdown.currency)}</dd>
          </div>
        </dl>
      </div>

      {payState === 'waiting' && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for payment…
          </p>
          {upiLinks && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {upiLinks.gpay && (
                <a href={upiLinks.gpay} className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                  <Smartphone className="h-4 w-4" /> GPay
                </a>
              )}
              {upiLinks.phonepe && (
                <a href={upiLinks.phonepe} className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                  <Smartphone className="h-4 w-4" /> PhonePe
                </a>
              )}
              {upiLinks.paytm && (
                <a href={upiLinks.paytm} className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                  <Smartphone className="h-4 w-4" /> Paytm
                </a>
              )}
              {upiLinks.upi && (
                <a href={upiLinks.upi} className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                  <Smartphone className="h-4 w-4" /> Any UPI
                </a>
              )}
            </div>
          )}
          {qrData && (
            <div className="flex flex-col items-center gap-2 pt-1">
              <div className="rounded-lg border border-border p-3">
                <QRCodeSVG value={qrData} size={200} />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <QrCode className="h-3.5 w-3.5" /> Scan with any UPI app
              </p>
            </div>
          )}
        </div>
      )}

      {payState === 'success' && (
        <div className="flex items-center gap-2 rounded-lg border border-primary bg-primary-weak p-4 text-sm font-medium text-primary">
          <CheckCircle2 className="h-5 w-5" /> Payment received. Redirecting…
        </div>
      )}

      {payState === 'expired' && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <XCircle className="h-5 w-5" /> Payment window expired. Tap Pay to try again.
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        Once paid, your order is locked and sent to the shop. It can&rsquo;t be edited or cancelled.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        className="w-full"
        size="lg"
        onClick={pay}
        disabled={starting || payState === 'waiting' || payState === 'success'}
      >
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {payState === 'waiting' ? 'Waiting for payment…' : `Pay ${formatCurrency(breakdown.total, breakdown.currency)}`}
      </Button>
    </div>
  );
}
