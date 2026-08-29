import 'server-only';
import type { PaymentProvider } from '@printflow/shared';
import { CustomGatewayProvider } from './custom-provider';

let provider: PaymentProvider | null = null;

/** Returns the configured payment provider. Single place to swap gateways. */
export function getPaymentProvider(): PaymentProvider {
  if (!provider) {
    switch (process.env.PAYMENT_PROVIDER) {
      case 'custom':
      default:
        provider = new CustomGatewayProvider();
    }
  }
  return provider;
}

export function isDevPaymentMode(): boolean {
  return !process.env.PAYMENT_GATEWAY_BASE_URL && process.env.NODE_ENV !== 'production';
}
