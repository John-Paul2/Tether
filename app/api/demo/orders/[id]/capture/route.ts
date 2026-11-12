import { getPayPalAccessToken } from '@/lib/paypal';
import { verifyDemoToken } from '@/lib/protection';

const PAYPAL_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = verifyDemoToken(request);
  if (denied) return denied;

  const { id } = await params;

  if (!id || id.trim() === '') {
    return Response.json({ error: 'Missing order id' }, { status: 400 });
  }

  try {
    const accessToken = await getPayPalAccessToken();
    // Capture via PayPal only. Intentionally does NOT change local_orders.local_status;
    // local state is updated exclusively via verified webhooks.
    const response = await fetch(
      `${PAYPAL_SANDBOX_BASE_URL}/v2/checkout/orders/${encodeURIComponent(id)}/capture`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      },
    );

    const data = await response.json();
    return Response.json(data, { status: response.status });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unexpected error capturing order' },
      { status: 500 },
    );
  }
}
