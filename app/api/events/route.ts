import { getLatestWebhookEvents } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const events = getLatestWebhookEvents(100);
  return Response.json(events, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
