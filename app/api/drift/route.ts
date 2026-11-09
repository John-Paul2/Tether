import { checkOrderDrift } from '@/lib/drift';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const driftItems = await checkOrderDrift();
    return Response.json(driftItems, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to run drift check' },
      { status: 500 },
    );
  }
}
