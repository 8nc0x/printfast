import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal HS256 tokens for the Electron shop client. The desktop app authenticates
 * once (shop owner credentials) and then carries this bearer token — it never sees
 * Supabase keys or the student session.
 */
const TTL_SECONDS = 60 * 60 * 12; // 12h

export interface ShopTokenPayload {
  sub: string; // user id
  shopId: string;
  role: 'shop_owner';
  iat: number;
  exp: number;
}

function secret(): string {
  return process.env.SHOP_TOKEN_SECRET || process.env.AUTH_SECRET || 'insecure-dev-secret';
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

export function signShopToken(input: { sub: string; shopId: string }): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const iat = Math.floor(Date.now() / 1000);
  const payload: ShopTokenPayload = { sub: input.sub, shopId: input.shopId, role: 'shop_owner', iat, exp: iat + TTL_SECONDS };
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = createHmac('sha256', secret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyShopToken(token: string): ShopTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', secret()).update(`${header}.${body}`).digest('base64url');
  const a = Buffer.from(sig!);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('bad signature');
  const payload = JSON.parse(Buffer.from(body!, 'base64url').toString()) as ShopTokenPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('token expired');
  return payload;
}

/** Extracts + verifies the bearer token from a request. Throws on any problem. */
export function requireShopToken(req: Request): ShopTokenPayload {
  const header = req.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new Error('missing bearer token');
  return verifyShopToken(token);
}
