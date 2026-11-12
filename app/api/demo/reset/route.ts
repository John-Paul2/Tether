import { resetDemoDatabase } from '@/lib/db';
import { verifyDemoToken } from '@/lib/protection';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = verifyDemoToken(request);
  if (denied) return denied;

  try {
    const { seeded_count, demo_reset_at } = resetDemoDatabase();
    return Response.json(
      {
        ok: true,
        seeded_count,
        demo_reset_at,
      },
      { status: 200 },
    );
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : 'Failed to reset demo database',
      },
      { status: 500 },
    );
  }
}
