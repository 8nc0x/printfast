import 'server-only';
import type { PaymentProvider } from '@printflow/shared';
import { PayxmintProvider } from './payxmint-provider';
import { CustomGatewayProvider } from './custom-provider';

let provider: PaymentProvider | null = null;

/** Returns the configured payment provider. Single place to swap gateways. */
export function getPaymentProvider(): PaymentProvider {
  if (!provider) {
    switch (process.env.PAYMENT_PROVIDER) {
      case 'custom':
        provider = new CustomGatewayProvider();
        break;
      case 'payxmint':
      default:
        provider = new PayxmintProvider();
    }
  }
  return provider;
}

/** True when no real gateway credentials are configured (dev sandbox mode). */
export function isDevPaymentMode(): boolean {
  const hasRealGateway =
    Boolean(process.env.PAYMENT_GATEWAY_BASE_URL) || Boolean(process.env.PAYXMINT_API_KEY);
  return !hasRealGateway && process.env.NODE_ENV !== 'production';
}
