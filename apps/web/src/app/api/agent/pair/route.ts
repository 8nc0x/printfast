import { NextResponse } from 'next/server';
import { agentHelloSchema } from '@printflow/shared';
import { exchangePairingToken } from '@/lib/agent-auth';

export const runtime = 'nodejs';

/**
 * Agent pairing: exchange a one-time pairing token for a long-lived agent token.
 * Body: { pairingToken, hello: AgentHello }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    pairingToken?: string;
    hello?: unknown;
  } | null;
  if (!body?.pairingToken) {
    return NextResponse.json({ error: 'pairingToken required' }, { status: 400 });
  }

  const hello = agentHelloSchema.safeParse(body.hello);
  if (!hello.success) {
    return NextResponse.json({ error: 'invalid hello payload' }, { status: 400 });
  }

  const result = await exchangePairingToken(
    body.pairingToken,
    hello.data.deviceName,
    hello.data.agentVersion,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  return NextResponse.json({
    agentToken: result.agentToken,
    agentId: result.agentId,
    shopId: result.shopId,
    protocolVersion: 1,
  });
}
