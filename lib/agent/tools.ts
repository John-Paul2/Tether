import {
  getLocalOrder,
  getSetting,
  getWebhookEventsForOrder,
} from '@/lib/db';
import { checkOrderDrift, type DriftItem } from '@/lib/drift';
import type { GeminiFunctionDeclaration } from '@/lib/gemini';
import { checkHealPreconditions, type HealPreconditionsResult } from '@/lib/heal';
import { getPayPalAccessToken } from '@/lib/paypal';

const PAYPAL_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';

type PayPalOrderApiResponse = {
  id?: string;
  intent?: string;
  status?: string;
  create_time?: string;
  update_time?: string;
  purchase_units?: {
    reference_id?: string;
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
        final_capture?: boolean;
        create_time?: string;
        update_time?: string;
      }[];
    };
  }[];
};

type PayPalWebhookEventItem = {
  id?: string;
  create_time?: string;
  resource_type?: string;
  event_type?: string;
  summary?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: {
      currency_code?: string;
      value?: string;
    };
    supplementary_data?: {
      related_ids?: {
        order_id?: string;
      };
    };
  };
};

type PayPalWebhookEventsListResponse = {
  events?: PayPalWebhookEventItem[];
  count?: number;
};

type PayPalWebhookRegistrationItem = {
  id?: string;
  url?: string;
  event_types?: {
    name?: string;
    description?: string;
    status?: string;
  }[];
};

type PayPalWebhooksListResponse = {
  webhooks?: PayPalWebhookRegistrationItem[];
};

export async function get_drift(): Promise<{
  drift_count: number;
  drifted_orders: DriftItem[];
}> {
  const driftedOrders = await checkOrderDrift();
  return {
    drift_count: driftedOrders.length,
    drifted_orders: driftedOrders,
  };
}

export async function get_paypal_order(orderId: string): Promise<{
  order_id: string;
  found_in_paypal: boolean;
  paypal_status: string | null;
  intent: string | null;
  amount: string | null;
  currency: string | null;
  captures: {
    id: string | null;
    status: string | null;
    amount: string | null;
    currency: string | null;
    final_capture: boolean | null;
    create_time: string | null;
  }[];
  local_order: {
    order_id: string;
    local_status: string;
    amount: string;
    currency: string;
    created_at: string;
    updated_at: string;
  } | null;
}> {
  const trimmedId = (orderId ?? '').trim();
  if (!trimmedId) {
    throw new Error('orderId is required for get_paypal_order');
  }

  const localOrder = getLocalOrder(trimmedId);
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(
    `${PAYPAL_SANDBOX_BASE_URL}/v2/checkout/orders/${encodeURIComponent(trimmedId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    return {
      order_id: trimmedId,
      found_in_paypal: false,
      paypal_status: null,
      intent: null,
      amount: null,
      currency: null,
      captures: [],
      local_order: localOrder,
    };
  }

  const data = (await response.json()) as PayPalOrderApiResponse;
  const firstUnit = data.purchase_units?.[0];
  const rawCaptures = firstUnit?.payments?.captures ?? [];

  return {
    order_id: data.id ?? trimmedId,
    found_in_paypal: true,
    paypal_status: data.status ?? null,
    intent: data.intent ?? null,
    amount: firstUnit?.amount?.value ?? null,
    currency: firstUnit?.amount?.currency_code ?? null,
    captures: rawCaptures.map((c) => ({
      id: c.id ?? null,
      status: c.status ?? null,
      amount: c.amount?.value ?? null,
      currency: c.amount?.currency_code ?? null,
      final_capture: typeof c.final_capture === 'boolean' ? c.final_capture : null,
      create_time: c.create_time ?? null,
    })),
    local_order: localOrder,
  };
}

export async function get_receipt_log(orderId: string): Promise<{
  order_id: string;
  event_count: number;
  events: {
    id: string;
    event_type: string;
    resource_id: string | null;
    order_id: string | null;
    verification_status: string;
    received_at: string;
  }[];
}> {
  const trimmedId = (orderId ?? '').trim();
  if (!trimmedId) {
    throw new Error('orderId is required for get_receipt_log');
  }

  const rows = getWebhookEventsForOrder(trimmedId);
  return {
    order_id: trimmedId,
    event_count: rows.length,
    events: rows.map((r) => ({
      id: r.id,
      event_type: r.event_type,
      resource_id: r.resource_id,
      order_id: r.order_id,
      verification_status: r.verification_status,
      received_at: r.received_at,
    })),
  };
}

export async function get_paypal_event_log(orderId: string): Promise<{
  order_id: string;
  event_count: number;
  events: {
    id: string | null;
    event_type: string | null;
    resource_type: string | null;
    resource_id: string | null;
    resource_status: string | null;
    related_order_id: string | null;
    create_time: string | null;
    summary: string | null;
  }[];
}> {
  const trimmedId = (orderId ?? '').trim();
  if (!trimmedId) {
    throw new Error('orderId is required for get_paypal_event_log');
  }

  const accessToken = await getPayPalAccessToken();

  // Also check capture ID from order details if available so we match by either orderId or captureId
  let captureIds: string[] = [];
  const orderRes = await fetch(
    `${PAYPAL_SANDBOX_BASE_URL}/v2/checkout/orders/${encodeURIComponent(trimmedId)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    },
  );
  if (orderRes.ok) {
    const orderData = (await orderRes.json()) as PayPalOrderApiResponse;
    captureIds = (orderData.purchase_units?.[0]?.payments?.captures ?? [])
      .map((c) => c.id)
      .filter((id): id is string => typeof id === 'string' && id.trim() !== '');
  }

  const listRes = await fetch(
    `${PAYPAL_SANDBOX_BASE_URL}/v1/notifications/webhooks-events?page_size=50`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    },
  );

  if (!listRes.ok) {
    throw new Error(`PayPal webhooks-events request failed with status ${listRes.status}`);
  }

  const listData = (await listRes.json()) as PayPalWebhookEventsListResponse;
  const allEvents = listData.events ?? [];

  const matched = allEvents.filter((ev) => {
    const relatedOrderId = ev.resource?.supplementary_data?.related_ids?.order_id;
    const resourceId = ev.resource?.id;
    if (relatedOrderId === trimmedId || resourceId === trimmedId) {
      return true;
    }
    if (resourceId && captureIds.includes(resourceId)) {
      return true;
    }
    return false;
  });

  return {
    order_id: trimmedId,
    event_count: matched.length,
    events: matched.map((ev) => ({
      id: ev.id ?? null,
      event_type: ev.event_type ?? null,
      resource_type: ev.resource_type ?? null,
      resource_id: ev.resource?.id ?? null,
      resource_status: ev.resource?.status ?? null,
      related_order_id: ev.resource?.supplementary_data?.related_ids?.order_id ?? null,
      create_time: ev.create_time ?? null,
      summary: ev.summary ?? null,
    })),
  };
}

function normalizeWebhookEndpointUrl(publicBaseUrl: string): string | null {
  const trimmed = publicBaseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  if (trimmed.endsWith('/api/webhook')) {
    return trimmed;
  }
  return `${trimmed}/api/webhook`;
}

export async function check_webhook_registration(): Promise<{
  public_base_url: string | null;
  expected_webhook_url: string | null;
  configured_webhook_id: string | null;
  matching_webhook_found: boolean;
  webhooks: {
    id: string | null;
    url: string | null;
    url_matches_public_base_url: boolean;
    subscribes_to_payment_capture_completed: boolean;
    subscribed_event_types: string[];
  }[];
}> {
  const publicBaseUrl = (process.env.PUBLIC_BASE_URL ?? '').trim() || null;
  const expectedWebhookUrl = publicBaseUrl ? normalizeWebhookEndpointUrl(publicBaseUrl) : null;
  const configuredWebhookId = (process.env.PAYPAL_WEBHOOK_ID ?? '').trim() || null;

  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_SANDBOX_BASE_URL}/v1/notifications/webhooks`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`PayPal GET /v1/notifications/webhooks failed with status ${response.status}`);
  }

  const data = (await response.json()) as PayPalWebhooksListResponse;
  const rawWebhooks = data.webhooks ?? [];

  const webhooks = rawWebhooks.map((w) => {
    const url = typeof w.url === 'string' ? w.url.trim() : null;
    const normalizedUrl = url ? url.replace(/\/+$/, '') : null;
    const eventTypes = (w.event_types ?? [])
      .map((et) => et.name)
      .filter((name): name is string => typeof name === 'string' && name.trim() !== '');
    const subscribesToCaptureCompleted =
      eventTypes.includes('PAYMENT.CAPTURE.COMPLETED') || eventTypes.includes('*');
    const urlMatches = Boolean(
      expectedWebhookUrl && normalizedUrl && normalizedUrl === expectedWebhookUrl,
    );

    return {
      id: w.id ?? null,
      url,
      url_matches_public_base_url: urlMatches,
      subscribes_to_payment_capture_completed: subscribesToCaptureCompleted,
      subscribed_event_types: eventTypes,
    };
  });

  const matchingWebhookFound = webhooks.some(
    (w) => w.url_matches_public_base_url && w.subscribes_to_payment_capture_completed,
  );

  return {
    public_base_url: publicBaseUrl,
    expected_webhook_url: expectedWebhookUrl,
    configured_webhook_id: configuredWebhookId,
    matching_webhook_found: matchingWebhookFound,
    webhooks,
  };
}

export async function check_fault_switch(): Promise<{
  drop_webhooks: string;
  is_dropping_webhooks: boolean;
}> {
  const value = getSetting('drop_webhooks', 'false');
  return {
    drop_webhooks: value,
    is_dropping_webhooks: value === 'true',
  };
}

export async function propose_heal(orderId: string): Promise<HealPreconditionsResult> {
  return checkHealPreconditions(orderId ?? '');
}

export const AGENT_TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'get_drift',
    description:
      'Runs the read-only order drift check comparing unpaid local orders against live PayPal order status.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'get_paypal_order',
    description:
      'Fetches the live PayPal order and capture status from PayPal GET /v2/checkout/orders/{orderId}, plus local order status.',
    parameters: {
      type: 'OBJECT',
      properties: {
        orderId: {
          type: 'STRING',
          description: 'The PayPal order ID to inspect.',
        },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'get_receipt_log',
    description:
      'Returns webhook events stored in our local webhook_events table for the given orderId, including verification_status.',
    parameters: {
      type: 'OBJECT',
      properties: {
        orderId: {
          type: 'STRING',
          description: 'The PayPal order ID to query in local webhook_events.',
        },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'get_paypal_event_log',
    description:
      "Returns webhook events from PayPal's own webhook event listing (GET /v1/notifications/webhooks-events) matching the given orderId.",
    parameters: {
      type: 'OBJECT',
      properties: {
        orderId: {
          type: 'STRING',
          description: 'The PayPal order ID to search in PayPal webhook events.',
        },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'check_webhook_registration',
    description:
      'Lists the webhooks registered in PayPal (GET /v1/notifications/webhooks) and reports their URL, subscribed event types, and whether the URL matches PUBLIC_BASE_URL.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'check_fault_switch',
    description:
      'Returns the current value of settings.drop_webhooks (the demo fault injection switch).',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'propose_heal',
    description:
      'Runs the 5 heal pre-condition checks from lib/heal.ts WITHOUT executing the heal or resending any webhook, returning which conditions pass or fail and safe_to_heal.',
    parameters: {
      type: 'OBJECT',
      properties: {
        orderId: {
          type: 'STRING',
          description: 'The PayPal order ID to evaluate for healing.',
        },
      },
      required: ['orderId'],
    },
  },
];

export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'get_drift':
      return get_drift();
    case 'get_paypal_order':
      return get_paypal_order(String(args.orderId ?? ''));
    case 'get_receipt_log':
      return get_receipt_log(String(args.orderId ?? ''));
    case 'get_paypal_event_log':
      return get_paypal_event_log(String(args.orderId ?? ''));
    case 'check_webhook_registration':
      return check_webhook_registration();
    case 'check_fault_switch':
      return check_fault_switch();
    case 'propose_heal':
      return propose_heal(String(args.orderId ?? ''));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
