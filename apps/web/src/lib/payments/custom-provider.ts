import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  PaymentProvider,
  CreatePaymentInput,
  CreatePaymentResult,
  VerifiedCallback,
} from '@printflow/shared';

/**
 * Concrete provider for the owner's custom gateway. The rest of the app depends
 * only on the PaymentProvider interface, so swapping gateways is a one-file change.
 *
 * Behaviour:
 *  - If PAYMENT_GATEWAY_BASE_URL is set, we create an order against the real gateway.
 *  - Otherwise (local dev) we return a redirect to the built-in simulator so the
 *    full PAID → shop flow is exercisable without live credentials.
 */
export class CustomGatewayProvider implements PaymentProvider {
  readonly name = 'custom';

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const base = process.env.PAYMENT_GATEWAY_BASE_URL;
    const paymentReference = `PF-PAY-${input.orderNumber.replace('PF-', '')}-${randomSuffix()}`;

    if (!base) {
      // Dev simulator (guarded route only mounts outside production).
      return {
        paymentReference,
        redirectUrl: `/dev/pay?ref=${encodeURIComponent(paymentReference)}&job=${input.jobId}`,
      };
    }

    const res = await fetch(`${base.replace(/\/$/, '')}/orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.PAYMENT_GATEWAY_KEY ?? ''}`,
      },
      body: JSON.stringify({
        amount: input.amount,
        currency: input.currency,
        reference: paymentReference,
        orderNumber: input.orderNumber,
        callbackUrl: `${process.env.AUTH_URL ?? ''}/api/payments/callback`,
      }),
    });
    if (!res.ok) throw new Error(`Gateway create failed (${res.status})`);
    const data = (await res.json()) as { redirectUrl?: string; url?: string };
    return {
      paymentReference,
      redirectUrl: data.redirectUrl ?? data.url,
      params: data as Record<string, unknown>,
    };
  }

  async verifyCallback(req: Request): Promise<VerifiedCallback> {
    const bodyText = await req.text();
    const secret = process.env.PAYMENT_GATEWAY_SECRET ?? '';
    const provided = req.headers.get('x-signature') ?? '';

    const expected = createHmac('sha256', secret).update(bodyText).digest('hex');
    const ok =
      secret.length > 0 &&
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return { ok: false, jobId: '', gatewayReference: '', status: 'failed', raw: bodyText };
    }

    return {
      ok,
      jobId: String(payload.jobId ?? ''),
      gatewayReference: String(payload.gatewayReference ?? payload.txnId ?? ''),
      status: payload.status === 'success' ? 'success' : 'failed',
      amount: typeof payload.amount === 'number' ? payload.amount : undefined,
      raw: payload,
    };
  }
}

function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}
