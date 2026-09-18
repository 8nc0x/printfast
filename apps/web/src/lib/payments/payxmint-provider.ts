import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  PaymentProvider,
  CreatePaymentInput,
  CreatePaymentResult,
  VerifiedCallback,
} from '@printflow/shared';

/**
 * PayXmint provider (https://payxmint.com/docs) — UPI collections.
 *
 *  - create-intent → checkout_url + upi_links + qr_data (white-label checkout)
 *  - check-status  → PENDING | SUCCESS | EXPIRED (polling + reconcile)
 *  - webhook       → payment.success, X-PayxMint-Signature = HMAC-SHA256 hex of raw body
 *
 * Idempotency rules from the docs are enforced in the webhook route + Payment
 * model (unique utr / gatewayReference); this provider only creates and verifies.
 */
export class PayxmintProvider implements PaymentProvider {
  readonly name = 'payxmint';

  private base(): string {
    return (process.env.PAYXMINT_BASE_URL ?? 'https://payxmint.com').replace(/\/$/, '');
  }

  private key(): string {
    const k = process.env.PAYXMINT_API_KEY;
    if (!k) throw new Error('PAYXMINT_API_KEY is not configured');
    return k;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const base = this.base();

    // Dev mode without keys: fall through to the built-in simulator page.
    if (process.env.NODE_ENV !== 'production' && !process.env.PAYXMINT_API_KEY) {
      return {
        paymentReference: `PP-PAY-${input.orderNumber.replace(/^(PF-|PP-)/, '')}-${randomSuffix()}`,
        redirectUrl: `/dev/pay?ref=${encodeURIComponent(input.orderNumber)}&job=${input.jobId}`,
      };
    }

    // order_id: alphanumeric, >= 8 chars — use our order number + short suffix.
    const orderIdExternal = `${input.orderNumber.replace(/-/g, '')}${randomSuffix()}`;

    const res = await fetch(`${base}/api/v1/create-intent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.key()}`,
        'idempotency-key': orderIdExternal,
      },
      body: JSON.stringify({
        amount: input.amount.toFixed(2),
        order_id: orderIdExternal,
        redirect_url: `${process.env.AUTH_URL ?? process.env.APP_URL ?? ''}/jobs/${input.jobId}`,
        metadata: { jobId: input.jobId, orderNumber: input.orderNumber },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`PayXmint create-intent failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      id?: string;
      checkout_url?: string;
      upi_links?: Record<string, string>;
      qr_data?: string;
    };

    return {
      paymentReference: orderIdExternal,
      redirectUrl: data.checkout_url,
      params: {
        intentId: data.id ?? null,
        upiLinks: data.upi_links ?? null,
        qrData: data.qr_data ?? null,
      },
    };
  }

  /** Poll PayXmint for authoritative status (used by reconcile + status proxy). */
  async checkStatus(orderIdExternal: string): Promise<'PENDING' | 'SUCCESS' | 'EXPIRED'> {
    const res = await fetch(`${this.base()}/api/v1/check-status`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.key()}`,
      },
      body: JSON.stringify({ order_id: orderIdExternal }),
    });
    if (!res.ok) throw new Error(`PayXmint check-status failed (${res.status})`);
    const data = (await res.json()) as { status?: string };
    if (data.status === 'SUCCESS') return 'SUCCESS';
    if (data.status === 'EXPIRED') return 'EXPIRED';
    return 'PENDING';
  }

  async verifyCallback(req: Request): Promise<VerifiedCallback> {
    const bodyText = await req.text(); // raw body — HMAC is computed over this
    const secret = process.env.PAYXMINT_WEBHOOK_SECRET ?? '';
    const provided = req.headers.get('x-payxmint-signature') ?? '';

    const expected = createHmac('sha256', secret).update(bodyText).digest('hex');
    const ok =
      secret.length > 0 &&
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      return { ok: false, jobId: '', gatewayReference: '', status: 'failed', raw: bodyText };
    }

    const meta = (payload.metadata ?? {}) as Record<string, unknown>;
    const orderNumber = String(payload.order_id ?? '');

    return {
      ok,
      // jobId comes from metadata (set at create-intent) — fall back to '' and
      // let the route resolve by order_id if needed.
      jobId: String(meta.jobId ?? ''),
      gatewayReference: String(payload.utr ?? payload.id ?? orderNumber),
      status: payload.status === 'SUCCESS' || payload.event === 'payment.success' ? 'success' : 'failed',
      amount: typeof payload.amount === 'number' ? payload.amount : undefined,
      raw: payload,
    };
  }
}

function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}
