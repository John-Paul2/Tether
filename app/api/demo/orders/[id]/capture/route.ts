const PAYPAL_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';

async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing PayPal credentials');
  }

  const response = await fetch(`${PAYPAL_SANDBOX_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`PayPal token request failed with status ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('PayPal token response missing access_token');
  }

  return data.access_token;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
