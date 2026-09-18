/**
 * PaymentProvider abstraction. The rest of the codebase knows only this interface;
 * the concrete gateway (the owner's custom gateway) is injected server-side.
 *
 * Critical rule: a job becomes PAID only after verifyCallback() confirms success
 * server-side. The client can never assert payment.
 */

export interface CreatePaymentInput {
  jobId: string;
  amount: number;
  currency: string;
  /** Human-readable order number, echoed back by the gateway when possible. */
  orderNumber: string;
}

export interface CreatePaymentResult {
  /** Our internal reference stored on the payment row. */
  paymentReference: string;
  /**
   * Whatever the client needs to start checkout: a redirect URL, or params for
   * an embedded widget / UPI intent. Opaque to the rest of the app.
   */
  redirectUrl?: string;
  params?: Record<string, unknown>;
}

export interface VerifiedCallback {
  ok: boolean;
  jobId: string;
  gatewayReference: string;
  status: 'success' | 'failed';
  amount?: number;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Verify signature/authenticity of an inbound gateway callback (server-side only). */
  verifyCallback(req: Request): Promise<VerifiedCallback>;
  /**
   * Optional authoritative status check (PayXmint check-status). Providers that
   * support polling implement this; the checkout status proxy uses it. Polling
   * never fulfills orders on its own — the webhook remains authoritative.
   */
  checkStatus?(orderIdExternal: string): Promise<'PENDING' | 'SUCCESS' | 'EXPIRED'>;
}
