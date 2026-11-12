import { getSetting, setSetting } from '@/lib/db';
import { verifyDemoToken } from '@/lib/protection';

export const dynamic = 'force-dynamic';

export async function GET() {
  const value = getSetting('drop_webhooks', 'false');
  return Response.json(
    { drop: value === 'true', drop_webhooks: value },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const denied = verifyDemoToken(request);
  if (denied) return denied;

  let body: { drop?: unknown } | undefined;
  try {
    body = (await request.json()) as { drop?: unknown };
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body?.drop !== 'boolean') {
    return Response.json(
      { error: 'Request body must include boolean {"drop": true|false}' },
      { status: 400 },
    );
  }

  const value = body.drop ? 'true' : 'false';
  setSetting('drop_webhooks', value);

  return Response.json(
    { drop: body.drop, drop_webhooks: value },
    { status: 200 },
  );
}
