import { loadDriftingDemoOrder } from '@/lib/db';
import { verifyDemoToken } from '@/lib/protection';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = verifyDemoToken(request);
  if (denied) return denied;

  let preferredOrderId: string | undefined;
  try {
    const raw = await request.text();
    if (raw.trim() !== '') {
      const parsed = JSON.parse(raw) as { orderId?: unknown; order_id?: unknown };
      const candidate = parsed.orderId ?? parsed.order_id;
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        preferredOrderId = candidate.trim();
      }
    }
  } catch {
    return Response.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  try {
    const { order, demo_reset_at } = loadDriftingDemoOrder(preferredOrderId);
    return Response.json(
      {
        ok: true,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        local_status: order.local_status,
        demo_reset_at,
        order,
      },
      { status: 200 },
    );
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : 'Failed to load drifting demo order',
      },
      { status: 500 },
    );
  }
}
