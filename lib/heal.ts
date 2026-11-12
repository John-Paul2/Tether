import {
  getLastResendAttemptForEvent,
  getLocalOrder,
  getSetting,
  hasCompletedCaptureWebhookForOrder,
  insertHealLog,
  type HealLogRow,
} from '@/lib/db';
import { getPayPalAccessToken } from '@/lib/paypal';

const PAYPAL_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';
const RESEND_COOLDOWN_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;
const MAX_POLL_SECONDS = 30;

type PayPalOrderDetails = {
  id?: string;
  status?: string;
  purchase_units?: {
    payments?: {
      captures?: {
        id?: string;
        status?: string;
      }[];
    };
  }[];
};

type PayPalWebhookEventResource = {
  id?: string;
  status?: string;
  supplementary_data?: {
    related_ids?: {
      order_id?: string;
    };
  };
};

type PayPalWebhookEventItem = {
  id?: string;
  create_time?: string;
  resource_type?: string;
  event_type?: string;
  summary?: string;
  resource?: PayPalWebhookEventResource;
};

type PayPalWebhookEventsListResponse = {
  events?: PayPalWebhookEventItem[];
  count?: number;
};

export type HealResponse = {
  healed: boolean;
  order_id: string;
  event_id: string | null;
  action: string;
  result: string;
  reason: string;
  seconds_to_fixed: number | null;
  started_at: string;
  finished_at: string;
  log_id: number;
};

export type HealConditionCheck = {
  condition: string;
  passed: boolean;
  reason: string;
};

export type HealPreconditionsResult = {
  order_id: string;
  event_id: string | null;
  capture_id: string | null;
  safe_to_heal: boolean;
  conditions: {
    paypal_order_completed: { passed: boolean; reason: string };
    no_local_capture_webhook: { passed: boolean; reason: string };
    event_in_paypal_log: { passed: boolean; reason: string };
    not_already_resent_or_on_cooldown: { passed: boolean; reason: string };
    drop_webhooks_disabled: { passed: boolean; reason: string };
  };
  checks: HealConditionCheck[];
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

function toRfc3339NoMs(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

function matchesOrderOrCapture(
  event: PayPalWebhookEventItem,
  orderId: string,
  captureId: string | null,
): boolean {
  if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
    return false;
  }

  const relatedOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
  if (typeof relatedOrderId === 'string' && relatedOrderId === orderId) {
    return true;
  }

  const resourceCaptureId = event.resource?.id;
  if (captureId && typeof resourceCaptureId === 'string' && resourceCaptureId === captureId) {
    return true;
  }

  return false;
}

async function findCaptureCompletedEventInPayPal(
  orderId: string,
  captureId: string | null,
  accessToken: string,
): Promise<PayPalWebhookEventItem | null> {
  // 1. Try filtering by transaction_id (captureId) and event_type if captureId is known
  if (captureId) {
    const byTxUrl =
      `${PAYPAL_SANDBOX_BASE_URL}/v1/notifications/webhooks-events` +
      `?transaction_id=${encodeURIComponent(captureId)}` +
      `&event_type=PAYMENT.CAPTURE.COMPLETED`;
    const txRes = await fetch(byTxUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (txRes.ok) {
      const data = (await txRes.json()) as PayPalWebhookEventsListResponse;
      const match = (data.events ?? []).find((ev) => matchesOrderOrCapture(ev, orderId, captureId));
      if (match && typeof match.id === 'string' && match.id.trim() !== '') {
        return match;
      }
    }
  }

  // 2. Query recent time window with event_type=PAYMENT.CAPTURE.COMPLETED
  const startTime = toRfc3339NoMs(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const endTime = toRfc3339NoMs(new Date(Date.now() + 5 * 60 * 1000));
  const listUrl =
    `${PAYPAL_SANDBOX_BASE_URL}/v1/notifications/webhooks-events` +
    `?event_type=PAYMENT.CAPTURE.COMPLETED` +
    `&start_time=${encodeURIComponent(startTime)}` +
    `&end_time=${encodeURIComponent(endTime)}` +
    `&page_size=50`;

  const listRes = await fetch(listUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!listRes.ok) {
    return null;
  }

  const listData = (await listRes.json()) as PayPalWebhookEventsListResponse;
  const match = (listData.events ?? []).find((ev) => matchesOrderOrCapture(ev, orderId, captureId));
  if (match && typeof match.id === 'string' && match.id.trim() !== '') {
    return match;
  }

  return null;
}

function recordAndReturn(input: {
  healed: boolean;
  order_id: string;
  event_id: string | null;
  action: string;
  result: string;
  reason: string;
  seconds_to_fixed: number | null;
  started_at: string;
}): HealResponse {
  const finishedAt = new Date().toISOString();
  const logRow: HealLogRow = insertHealLog({
    order_id: input.order_id,
    event_id: input.event_id,
    action: input.action,
    result: input.result,
    reason: input.reason,
    started_at: input.started_at,
    finished_at: finishedAt,
  });

  return {
    healed: input.healed,
    order_id: input.order_id,
    event_id: input.event_id,
    action: input.action,
    result: input.result,
    reason: input.reason,
    seconds_to_fixed: input.seconds_to_fixed,
    started_at: input.started_at,
    finished_at: finishedAt,
    log_id: logRow.id,
  };
}

export async function checkHealPreconditions(orderIdRaw: string): Promise<HealPreconditionsResult> {
  const orderId = orderIdRaw.trim();
  const dropWebhooks = getSetting('drop_webhooks', 'false');
  const dropWebhooksDisabled = {
    passed: dropWebhooks === 'false',
    reason:
      dropWebhooks === 'false'
        ? 'settings.drop_webhooks is "false"'
        : `settings.drop_webhooks is "${dropWebhooks}" (must be "false" before healing)`,
  };

  if (!orderId) {
    const failedOrder = { passed: false, reason: 'Missing orderId' };
    const noLocal = { passed: false, reason: 'Missing orderId' };
    const eventInLog = { passed: false, reason: 'Missing orderId' };
    const cooldown = { passed: false, reason: 'Missing orderId' };
    return {
      order_id: '',
      event_id: null,
      capture_id: null,
      safe_to_heal: false,
      conditions: {
        paypal_order_completed: failedOrder,
        no_local_capture_webhook: noLocal,
        event_in_paypal_log: eventInLog,
        not_already_resent_or_on_cooldown: cooldown,
        drop_webhooks_disabled: dropWebhooksDisabled,
      },
      checks: [
        { condition: 'paypal_order_completed', ...failedOrder },
        { condition: 'no_local_capture_webhook', ...noLocal },
        { condition: 'event_in_paypal_log', ...eventInLog },
        { condition: 'not_already_resent_or_on_cooldown', ...cooldown },
        { condition: 'drop_webhooks_disabled', ...dropWebhooksDisabled },
      ],
    };
  }

  const hasLocalWebhook = hasCompletedCaptureWebhookForOrder(orderId);
  const noLocalCaptureWebhook = {
    passed: !hasLocalWebhook,
    reason: hasLocalWebhook
      ? `PAYMENT.CAPTURE.COMPLETED webhook already exists in webhook_events for order ${orderId}`
      : `No PAYMENT.CAPTURE.COMPLETED webhook in webhook_events for order ${orderId}`,
  };

  const accessToken = await getPayPalAccessToken();
  const paypalOrder = await fetchPayPalOrder(orderId, accessToken);

  let paypalOrderCompleted: { passed: boolean; reason: string };
  let captureId: string | null = null;

  if (!paypalOrder) {
    paypalOrderCompleted = {
      passed: false,
      reason: `Order ${orderId} was not found in PayPal`,
    };
  } else {
    const firstCapture = paypalOrder.purchase_units?.[0]?.payments?.captures?.[0];
    captureId = typeof firstCapture?.id === 'string' ? firstCapture.id : null;
    paypalOrderCompleted = {
      passed: paypalOrder.status === 'COMPLETED',
      reason:
        paypalOrder.status === 'COMPLETED'
          ? `PayPal order ${orderId} status is COMPLETED`
          : `PayPal order status is ${paypalOrder.status ?? 'UNKNOWN'}, must be COMPLETED`,
    };
  }

  let eventId: string | null = null;
  let eventInPaypalLog: { passed: boolean; reason: string };

  if (!paypalOrder) {
    eventInPaypalLog = {
      passed: false,
      reason: `Cannot search PayPal event log because order ${orderId} was not found`,
    };
  } else {
    const paypalEvent = await findCaptureCompletedEventInPayPal(orderId, captureId, accessToken);
    eventId = typeof paypalEvent?.id === 'string' ? paypalEvent.id : null;
    eventInPaypalLog =
      paypalEvent && eventId
        ? {
            passed: true,
            reason: `Found PAYMENT.CAPTURE.COMPLETED event ${eventId} in PayPal webhook event log`,
          }
        : {
            passed: false,
            reason: `No matching PAYMENT.CAPTURE.COMPLETED event found in PayPal webhook event log for order ${orderId}`,
          };
  }

  let notAlreadyResentOrCooldown: { passed: boolean; reason: string };
  if (!eventId) {
    notAlreadyResentOrCooldown = {
      passed: false,
      reason: 'Cannot verify resend history without a PayPal event_id',
    };
  } else {
    const lastResend = getLastResendAttemptForEvent(eventId);
    if (!lastResend) {
      notAlreadyResentOrCooldown = {
        passed: true,
        reason: `Event ${eventId} has not been resent previously`,
      };
    } else if (lastResend.result === 'healed') {
      notAlreadyResentOrCooldown = {
        passed: false,
        reason: `Event ${eventId} was already resent and healed at ${lastResend.finished_at}`,
      };
    } else {
      const lastTimeMs = Date.parse(lastResend.started_at);
      const elapsedMs = Date.now() - (Number.isFinite(lastTimeMs) ? lastTimeMs : 0);
      if (elapsedMs < RESEND_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000);
        notAlreadyResentOrCooldown = {
          passed: false,
          reason: `Event ${eventId} was recently resent (${Math.floor(elapsedMs / 1000)}s ago); 60s cooldown active (${remainingSeconds}s remaining)`,
        };
      } else {
        notAlreadyResentOrCooldown = {
          passed: true,
          reason: `Previous resend for ${eventId} was ${Math.floor(elapsedMs / 1000)}s ago (cooldown expired and not yet healed)`,
        };
      }
    }
  }

  const conditions = {
    paypal_order_completed: paypalOrderCompleted,
    no_local_capture_webhook: noLocalCaptureWebhook,
    event_in_paypal_log: eventInPaypalLog,
    not_already_resent_or_on_cooldown: notAlreadyResentOrCooldown,
    drop_webhooks_disabled: dropWebhooksDisabled,
  };

  const checks: HealConditionCheck[] = [
    { condition: 'paypal_order_completed', ...paypalOrderCompleted },
    { condition: 'no_local_capture_webhook', ...noLocalCaptureWebhook },
    { condition: 'event_in_paypal_log', ...eventInPaypalLog },
    { condition: 'not_already_resent_or_on_cooldown', ...notAlreadyResentOrCooldown },
    { condition: 'drop_webhooks_disabled', ...dropWebhooksDisabled },
  ];

  const safeToHeal = checks.every((c) => c.passed);

  return {
    order_id: orderId,
    event_id: eventId,
    capture_id: captureId,
    safe_to_heal: safeToHeal,
    conditions,
    checks,
  };
}

export async function healOrderDrift(orderIdRaw: string): Promise<HealResponse> {
  const startedAt = new Date().toISOString();
  const orderId = orderIdRaw.trim();

  if (!orderId) {
    return recordAndReturn({
      healed: false,
      order_id: '',
      event_id: null,
      action: 'REFUSE',
      result: 'refused',
      reason: 'Missing orderId in request',
      seconds_to_fixed: null,
      started_at: startedAt,
    });
  }

  // Condition e) settings.drop_webhooks is "false"
  // Checked alongside all conditions; also checked before network calls or after, let's check all clearly:
  let accessToken: string;
  try {
    accessToken = await getPayPalAccessToken();
  } catch (err) {
    return recordAndReturn({
      healed: false,
      order_id: orderId,
      event_id: null,
      action: 'REFUSE',
      result: 'refused',
      reason: err instanceof Error ? err.message : 'Failed to authenticate with PayPal',
      seconds_to_fixed: null,
      started_at: startedAt,
    });
  }

  // Condition a) PayPal order status is COMPLETED (fresh call to PayPal)
  const paypalOrder = await fetchPayPalOrder(orderId, accessToken);
  if (!paypalOrder) {
    return recordAndReturn({
      healed: false,
      order_id: orderId,
      event_id: null,
      action: 'REFUSE',
      result: 'refused',
      reason: `Order ${orderId} was not found in PayPal`,
      seconds_to_fixed: null,
      started_at: startedAt,
    });
  }

  if (paypalOrder.status !== 'COMPLETED') {
    return recordAndReturn({
      healed: false,
      order_id: orderId,
      event_id: null,
      action: 'REFUSE',
      result: 'refused',
      reason: `PayPal order status is ${paypalOrder.status ?? 'UNKNOWN'}, must be COMPLETED`,
      seconds_to_fixed: null,
      started_at: startedAt,
    });
  }

  // Condition b) No PAYMENT.CAPTURE.COMPLETED for this order exists in webhook_events
  if (hasCompletedCaptureWebhookForOrder(orderId)) {
    return recordAndReturn({
      healed: false,
      order_id: orderId,
      event_id: null,
      action: 'REFUSE',
      result: 'refused',
      reason: `PAYMENT.CAPTURE.COMPLETED webhook already exists in webhook_events for order ${orderId}`,
      seconds_to_fixed: null,
      started_at: startedAt,
    });
  }

  // Condition c) The event exists in PayPal's event log and we have its event id
  const firstCapture = paypalOrder.purchase_units?.[0]?.payments?.captures?.[0];
  const captureId = typeof firstCapture?.id === 'string' ? firstCapture.id : null;
  const paypalEvent = await findCaptureCompletedEventInPayPal(orderId, captureId, accessToken);
  const eventId = typeof paypalEvent?.id === 'string' ? paypalEvent.id : null;

  if (!paypalEvent || !eventId) {
    return recordAndReturn({
      healed: false,
      order_id: orderId,
      event_id: null,
      action: 'REFUSE',
      result: 'refused',
      reason: `No matching PAYMENT.CAPTURE.COMPLETED event found in PayPal webhook event log for order ${orderId}`,
      seconds_to_fixed: null,
      started_at: startedAt,
    });
  }

  // Condition d) That event id has not already been resent (check the audit table; add a 60 second cooldown)
  const lastResend = getLastResendAttemptForEvent(eventId);
  if (lastResend) {
    if (lastResend.result === 'healed') {
      return recordAndReturn({
        healed: false,
        order_id: orderId,
        event_id: eventId,
        action: 'REFUSE',
        result: 'refused',
        reason: `Event ${eventId} was already resent and healed at ${lastResend.finished_at}`,
        seconds_to_fixed: null,
        started_at: startedAt,
      });
    }

    const lastTimeMs = Date.parse(lastResend.started_at);
    const elapsedMs = Date.now() - (Number.isFinite(lastTimeMs) ? lastTimeMs : 0);
    if (elapsedMs < RESEND_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000);
      return recordAndReturn({
        healed: false,
        order_id: orderId,
        event_id: eventId,
        action: 'REFUSE',
        result: 'refused',
        reason: `Event ${eventId} was recently resent (${Math.floor(elapsedMs / 1000)}s ago); 60s cooldown active (${remainingSeconds}s remaining)`,
        seconds_to_fixed: null,
        started_at: startedAt,
      });
    }
  }

  // Condition e) settings.drop_webhooks is "false"
  const dropWebhooks = getSetting('drop_webhooks', 'false');
  if (dropWebhooks !== 'false') {
    return recordAndReturn({
      healed: false,
      order_id: orderId,
      event_id: eventId,
      action: 'REFUSE',
      result: 'refused',
      reason: `settings.drop_webhooks is "${dropWebhooks}" (must be "false" before healing)`,
      seconds_to_fixed: null,
      started_at: startedAt,
    });
  }

  // All 5 conditions passed -> call POST /v1/notifications/webhooks-events/{event_id}/resend
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const resendBody = webhookId ? JSON.stringify({ webhook_ids: [webhookId] }) : JSON.stringify({});

  const resendStartMs = Date.now();
  const resendResponse = await fetch(
    `${PAYPAL_SANDBOX_BASE_URL}/v1/notifications/webhooks-events/${encodeURIComponent(eventId)}/resend`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: resendBody,
      cache: 'no-store',
    },
  );

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return recordAndReturn({
      healed: false,
      order_id: orderId,
      event_id: eventId,
      action: 'RESEND_WEBHOOK',
      result: 'resend_failed',
      reason: `PayPal resend failed with status ${resendResponse.status}: ${errorText.slice(0, 200)}`,
      seconds_to_fixed: null,
      started_at: startedAt,
    });
  }

  // Step 4: Verification: poll local_orders (every 1s, up to 30s) until local_status is PAID.
  // Do NOT modify local_orders directly.
  for (let second = 1; second <= MAX_POLL_SECONDS; second++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const currentOrder = getLocalOrder(orderId);
    if (currentOrder?.local_status === 'PAID') {
      const secondsToFixed = Number(((Date.now() - resendStartMs) / 1000).toFixed(2));
      return recordAndReturn({
        healed: true,
        order_id: orderId,
        event_id: eventId,
        action: 'RESEND_WEBHOOK',
        result: 'healed',
        reason: `Verified webhook received and local_orders.local_status flipped to PAID in ${secondsToFixed}s (seconds_to_fixed=${secondsToFixed})`,
        seconds_to_fixed: secondsToFixed,
        started_at: startedAt,
      });
    }
  }

  return recordAndReturn({
    healed: false,
    order_id: orderId,
    event_id: eventId,
    action: 'RESEND_WEBHOOK',
    result: 'resend requested, not confirmed',
    reason: `Resend requested for event ${eventId}, but local_orders.local_status did not flip to PAID within ${MAX_POLL_SECONDS}s`,
    seconds_to_fixed: null,
    started_at: startedAt,
  });
}
