import { getRecentHealLogs } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const logs = getRecentHealLogs(50);
  return Response.json(logs, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
