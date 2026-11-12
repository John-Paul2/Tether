import {
  getUnpaidLocalOrders,
  hasCompletedCaptureWebhookForOrder,
  type LocalOrderStatus,
} from '@/lib/db';
import { getPayPalAccessToken } from '@/lib/paypal';

const PAYPAL_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';

export type DriftItem = {
  order_id: string;
  paypal_status: string;
  local_status: LocalOrderStatus;
  amount: string;
  capture_id: string | null;
  has_webhook_in_log: boolean;
};

type PayPalOrderDetails = {
  id?: string;
  status?: string;
  purchase_units?: {
    amount?: {
      currency_code?: string;
      value?: string;
    };
    payments?: {
      captures?: {
        id?: string;
        status?: string;
        amount?: {
          currency_code?: string;
          value?: string;
        };
      }[];
    };
  }[];
};

async function fetchPayPalOrder(
  orderId: string,
  accessToken: string,
): Promise<PayPalOrderDetails | null> {
  const response = await fetch(
    `${PAYPAL_SANDBOX_BASE_URL}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as PayPalOrderDetails;
}

/**
 * Read-only drift check:
 * Queries every local order whose local_status is not PAID, fetches its live status
 * from PayPal GET /v2/checkout/orders/{id}, and reports orders where PayPal status is
 * COMPLETED while local_status is not PAID. Does not write to PayPal or local state.
 */
export async function checkOrderDrift(): Promise<DriftItem[]> {
  const unpaidOrders = getUnpaidLocalOrders();
  if (unpaidOrders.length === 0) {
    return [];
  }

  const accessToken = await getPayPalAccessToken();
  const driftItems: DriftItem[] = [];

  for (const localOrder of unpaidOrders) {
    const paypalOrder = await fetchPayPalOrder(localOrder.order_id, accessToken);
    if (!paypalOrder || paypalOrder.status !== 'COMPLETED') {
      continue;
    }

    const firstUnit = paypalOrder.purchase_units?.[0];
    const firstCapture = firstUnit?.payments?.captures?.[0];
    const captureId = typeof firstCapture?.id === 'string' ? firstCapture.id : null;
    const amount =
      firstCapture?.amount?.value ?? firstUnit?.amount?.value ?? localOrder.amount;

    driftItems.push({
      order_id: localOrder.order_id,
      paypal_status: paypalOrder.status,
      local_status: localOrder.local_status,
      amount,
      capture_id: captureId,
      has_webhook_in_log: hasCompletedCaptureWebhookForOrder(localOrder.order_id),
    });
  }

  return driftItems;
}
