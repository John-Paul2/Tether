import { insertHealLog } from '@/lib/db';
import { healOrderDrift } from '@/lib/heal';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  let body: { orderId?: unknown } | undefined;

  try {
    body = (await request.json()) as { orderId?: unknown };
  } catch {
    const finishedAt = new Date().toISOString();
    const log = insertHealLog({
      order_id: '',
      event_id: null,
      action: 'REFUSE',
      result: 'refused',
      reason: 'Invalid JSON request body',
      started_at: startedAt,
      finished_at: finishedAt,
    });
    return Response.json(
      {
        healed: false,
        order_id: '',
        event_id: null,
        action: 'REFUSE',
        result: 'refused',
        reason: 'Invalid JSON request body',
        seconds_to_fixed: null,
        started_at: startedAt,
        finished_at: finishedAt,
        log_id: log.id,
      },
      { status: 400 },
    );
  }

  const orderId = typeof body?.orderId === 'string' ? body.orderId : '';

  try {
    const healResult = await healOrderDrift(orderId);
    const status =
      healResult.result === 'healed'
        ? 200
        : healResult.result === 'resend requested, not confirmed'
          ? 202
          : 400;

    return Response.json(healResult, { status });
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const reason = err instanceof Error ? err.message : 'Unexpected error during heal';
    const log = insertHealLog({
      order_id: orderId,
      event_id: null,
      action: 'ERROR',
      result: 'error',
      reason,
      started_at: startedAt,
      finished_at: finishedAt,
    });
    return Response.json(
      {
        healed: false,
        order_id: orderId,
        event_id: null,
        action: 'ERROR',
        result: 'error',
        reason,
        seconds_to_fixed: null,
        started_at: startedAt,
        finished_at: finishedAt,
        log_id: log.id,
      },
      { status: 500 },
    );
  }
}
