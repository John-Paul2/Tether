import { insertLocalOrder } from '@/lib/db';

const PAYPAL_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';
const NGROK_RETURN_URL = 'https://replica-tapeless-curliness.ngrok-free.dev/return';
const NGROK_CANCEL_URL = 'https://replica-tapeless-curliness.ngrok-free.dev/cancel';

type PayPalOrderLink = {
  href: string;
  rel: string;
  method?: string;
};

type PayPalCreateOrderResponse = {
  id: string;
  status: string;
  links?: PayPalOrderLink[];
};

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

function normalizeAmount(rawAmount: unknown): string {
  if (rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === '') {
    return '450.00';
  }
  const num = Number(rawAmount);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error('Invalid amount: must be a positive number');
  }
  return num.toFixed(2);
}

export async function POST(request: Request) {
  let rawAmount: unknown;
  try {
    const text = await request.text();
    if (text.trim() !== '') {
      const body = JSON.parse(text) as { amount?: unknown };
      rawAmount = body?.amount;
    }
  } catch {
    return Response.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  let amount: string;
  try {
    amount = normalizeAmount(rawAmount);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Invalid amount' },
      { status: 400 },
    );
  }

  try {
    const accessToken = await getPayPalAccessToken();
    const response = await fetch(`${PAYPAL_SANDBOX_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: amount } }],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: NGROK_RETURN_URL,
              cancel_url: NGROK_CANCEL_URL,
              user_action: 'PAY_NOW',
            },
          },
        },
      }),
      cache: 'no-store',
    });

    const data = (await response.json()) as PayPalCreateOrderResponse & Record<string, unknown>;
    if (!response.ok || !data.id) {
      return Response.json(
        { error: 'Failed to create PayPal order', details: data },
        { status: response.status || 502 },
      );
    }

    const approveLink =
      (data.links ?? []).find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href ??
      null;

    const now = new Date().toISOString();
    insertLocalOrder({
      order_id: data.id,
      amount,
      currency: 'USD',
      local_status: 'CREATED',
      created_at: now,
      updated_at: now,
    });

    return Response.json(
      {
        order_id: data.id,
        id: data.id,
        status: data.status,
        local_status: 'CREATED',
        amount,
        currency: 'USD',
        approve_link: approveLink,
      },
      { status: 201 },
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unexpected error creating order' },
      { status: 500 },
    );
  }
}
