import 'server-only';
import { createHash, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';

/**
 * Windows Shop Agent auth.
 *  1. Shop panel creates a short-lived pairing token.
 *  2. Agent exchanges it (once) for a long-lived agent token.
 *  3. Agent calls carry `Authorization: Bearer <agentToken>`; we verify the hash.
 * Tokens are stored hashed (sha256) — never in plaintext.
 */

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Create a pairing token for a shop (shown once in the shop panel). */
export async function createPairingToken(shopId: string): Promise<string> {
  const token = `pp_pair_${randomBytes(16).toString('hex')}`;
  await db().agent.create({
    data: {
      shopId,
      deviceName: 'Pending device',
      pairingToken: token,
      pairingExpires: new Date(Date.now() + 15 * 60 * 1000),
      status: 'pending',
    },
  });
  return token;
}

export interface AgentExchangeResult {
  ok: boolean;
  error?: string;
  agentToken?: string;
  shopId?: string;
  agentId?: string;
}

/** Exchange a pairing token for a long-lived agent token (one-time). */
export async function exchangePairingToken(
  pairingToken: string,
  deviceName: string,
  version: string,
): Promise<AgentExchangeResult> {
  const agent = await db().agent.findUnique({
    where: { pairingToken: pairingToken.trim() },
  });
  if (!agent) return { ok: false, error: 'Invalid pairing code' };
  if (agent.status === 'revoked') return { ok: false, error: 'This pairing was revoked' };
  if (!agent.pairingExpires || agent.pairingExpires.getTime() < Date.now()) {
    return { ok: false, error: 'Pairing code expired — generate a new one' };
  }
  if (agent.agentTokenHash) return { ok: false, error: 'Pairing code already used' };

  const agentToken = `pp_agent_${randomBytes(32).toString('hex')}`;
  await db().agent.update({
    where: { id: agent.id },
    data: {
      deviceName: deviceName.slice(0, 80),
      version,
      agentTokenHash: hashToken(agentToken),
      pairingToken: null, // one-time
      pairingExpires: null,
      status: 'active',
      lastSeenAt: new Date(),
    },
  });

  return { ok: true, agentToken, shopId: agent.shopId, agentId: agent.id };
}

/** Verify an agent bearer token → agent row. Throws when invalid/revoked. */
export async function requireAgent(req: Request) {
  const header = req.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new Error('missing bearer token');

  const agent = await db().agent.findUnique({
    where: { agentTokenHash: hashToken(token) },
  });
  if (!agent || agent.status !== 'active') throw new Error('invalid or revoked agent token');

  await db().agent.update({
    where: { id: agent.id },
    data: { lastSeenAt: new Date() },
  });

  return agent;
}

/** Sign a short-TTL payload reference (for signed file URLs given to agents). */
export function signAgentPayload(payload: string): string {
  const secret = process.env.SHOP_TOKEN_SECRET ?? process.env.AUTH_SECRET ?? 'dev-agent-secret';
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function verifyAgentSignature(payload: string, sig: string): boolean {
  const expected = signAgentPayload(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
