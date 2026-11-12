import { insertLocalOrder } from '@/lib/db';
import { getPayPalAccessToken } from '@/lib/paypal';
import { verifyDemoToken } from '@/lib/protection';

const PAYPAL_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';

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

function resolvePublicBaseUrl(request: Request): string {
  const configured = (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
  if (configured) {
    return configured;
  }
  return new URL(request.url).origin.replace(/\/+$/, '');
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
  const denied = verifyDemoToken(request);
  if (denied) return denied;

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
    const baseUrl = resolvePublicBaseUrl(request);
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
              return_url: `${baseUrl}/return`,
              cancel_url: `${baseUrl}/cancel`,
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
