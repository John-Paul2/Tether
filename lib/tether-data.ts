import {
  getDb,
  getLatestWebhookEvents,
  getRecentAgentRuns,
  getRecentHealLogs,
  getSetting,
  type AgentRunRow,
  type HealLogRow,
  type LocalOrderRow,
  type LocalOrderStatus,
  type VerificationStatus,
  type WebhookEventRow,
} from '@/lib/db';
import { checkOrderDrift, type DriftItem } from '@/lib/drift';

// Flat, serializable row types sent to the browser for AG Studio and the Tether panels.
// All amounts are numbers, derived fields are computed once on the server, and secrets
// or raw webhook headers/payloads never leave the server.

export type TetherWebhookEventRow = {
  id: string;
  event_type: string;
  resource_id: string | null;
  order_id: string | null;
  verification_status: VerificationStatus;
  verified: boolean;
  verified_count: number;
  event_count: number;
  received_at: string;
  event_date: string;
};

export type TetherLocalOrderRow = {
  order_id: string;
  amount: number;
  currency: string;
  local_status: LocalOrderStatus;
  is_paid: boolean;
  is_drifting: boolean;
  open_drift: number;
  created_at: string;
  updated_at: string;
  order_date: string;
};

export type TetherHealLogRow = {
  id: number;
  order_id: string;
  event_id: string | null;
  action: string;
  result: string;
  healed: boolean;
  seconds_to_fixed: number | null;
  reason: string;
  started_at: string;
  finished_at: string;
  heal_date: string;
};

export type TetherAgentRunRow = {
  id: number;
  order_id: string | null;
  root_cause: string;
  model_used: string;
  confidence: string;
  safe_to_heal: boolean;
  summary: string;
  recommended_action: string;
  step_count: number;
  evidence_count: number;
  created_at: string;
  run_date: string;
};

export type TetherDriftRow = {
  order_id: string;
  paypal_status: string;
  local_status: LocalOrderStatus;
  amount: number;
  currency: string;
  capture_id: string | null;
  has_webhook_in_log: boolean;
  drift_count: number;
  event_date: string;
};

export type TetherData = {
  asOf: string;
  dropWebhooks: boolean;
  paypalStatus: {
    slow: boolean;
    error: string | null;
    durationMs: number;
  };
  webhook_events: TetherWebhookEventRow[];
  local_orders: TetherLocalOrderRow[];
  heal_log: TetherHealLogRow[];
  agent_runs: TetherAgentRunRow[];
  drift: TetherDriftRow[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const toNumberAmount = (raw: string | number | null | undefined): number => {
  const num = Number(raw);
  return Number.isFinite(num) ? round2(num) : 0;
};

const toDateString = (iso: string | null | undefined, fallback: string): string => {
  if (!iso || typeof iso !== 'string') return fallback;
  const datePart = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : fallback;
};

function deriveSecondsToFixed(row: HealLogRow): number | null {
  if (row.result !== 'healed') {
    return null;
  }

  const explicitMatch = row.reason.match(/seconds_to_fixed=([0-9]+(?:\.[0-9]+)?)/);
  if (explicitMatch) {
    const parsed = Number(explicitMatch[1]);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return round2(parsed);
    }
  }

  const inlineMatch = row.reason.match(/in\s+([0-9]+(?:\.[0-9]+)?)s\b/);
  if (inlineMatch) {
    const parsed = Number(inlineMatch[1]);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return round2(parsed);
    }
  }

  const startMs = Date.parse(row.started_at);
  const endMs = Date.parse(row.finished_at);
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
    return round2((endMs - startMs) / 1000);
  }

  return null;
}

function getAllLocalOrders(): LocalOrderRow[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      order_id,
      amount,
      currency,
      local_status,
      created_at,
      updated_at
    FROM local_orders
    ORDER BY created_at DESC, rowid DESC
  `);
  return stmt.all() as LocalOrderRow[];
}

function flattenWebhookEvents(rows: WebhookEventRow[], today: string): TetherWebhookEventRow[] {
  return rows.map((row) => {
    const verified = row.verification_status === 'SUCCESS';
    const resolvedOrderId =
      row.order_id ??
      (row.event_type.startsWith('CHECKOUT.ORDER.') ? row.resource_id : null);

    return {
      id: row.id,
      event_type: row.event_type,
      resource_id: row.resource_id,
      order_id: resolvedOrderId,
      verification_status: row.verification_status,
      verified,
      verified_count: verified ? 1 : 0,
      event_count: 1,
      received_at: row.received_at,
      event_date: toDateString(row.received_at, today),
    };
  });
}

function flattenLocalOrders(
  rows: LocalOrderRow[],
  driftOrderIds: Set<string>,
  today: string,
): TetherLocalOrderRow[] {
  return rows.map((row) => {
    const isDrifting = driftOrderIds.has(row.order_id);
    return {
      order_id: row.order_id,
      amount: toNumberAmount(row.amount),
      currency: row.currency || 'USD',
      local_status: row.local_status,
      is_paid: row.local_status === 'PAID',
      is_drifting: isDrifting,
      open_drift: isDrifting ? 1 : 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      order_date: toDateString(row.created_at, today),
    };
  });
}

function flattenHealLog(rows: HealLogRow[], today: string): TetherHealLogRow[] {
  return rows.map((row) => ({
    id: row.id,
    order_id: row.order_id,
    event_id: row.event_id,
    action: row.action,
    result: row.result,
    healed: row.result === 'healed',
    seconds_to_fixed: deriveSecondsToFixed(row),
    reason: row.reason,
    started_at: row.started_at,
    finished_at: row.finished_at,
    heal_date: toDateString(row.started_at, today),
  }));
}

function flattenAgentRuns(rows: AgentRunRow[], today: string): TetherAgentRunRow[] {
  return rows.map((row) => {
    let rootCause = 'UNKNOWN';
    let confidence = 'low';
    let safeToHeal = false;
    let summary = '';
    let recommendedAction = '';
    let evidenceCount = 0;
    let stepCount = 0;

    try {
      const parsedResult = JSON.parse(row.result_json) as {
        root_cause?: string;
        confidence?: string;
        safe_to_heal?: boolean;
        summary?: string;
        recommended_action?: string;
        evidence?: unknown[];
      };
      if (typeof parsedResult.root_cause === 'string') rootCause = parsedResult.root_cause;
      if (typeof parsedResult.confidence === 'string') confidence = parsedResult.confidence;
      safeToHeal = Boolean(parsedResult.safe_to_heal);
      if (typeof parsedResult.summary === 'string') summary = parsedResult.summary;
      if (typeof parsedResult.recommended_action === 'string') {
        recommendedAction = parsedResult.recommended_action;
      }
      if (Array.isArray(parsedResult.evidence)) {
        evidenceCount = parsedResult.evidence.length;
      }
    } catch {
      // Fallback to defaults if malformed JSON
    }

    try {
      const parsedTrace = JSON.parse(row.trace_json) as unknown[];
      if (Array.isArray(parsedTrace)) {
        stepCount = parsedTrace.length;
      }
    } catch {
      // Ignore malformed trace JSON
    }

    return {
      id: row.id,
      order_id: row.order_id,
      root_cause: rootCause,
      model_used: row.model_used,
      confidence,
      safe_to_heal: safeToHeal,
      summary,
      recommended_action: recommendedAction,
      step_count: stepCount,
      evidence_count: evidenceCount,
      created_at: row.created_at,
      run_date: toDateString(row.created_at, today),
    };
  });
}

function flattenDrift(
  items: DriftItem[],
  ordersById: Map<string, LocalOrderRow>,
  today: string,
): TetherDriftRow[] {
  return items.map((item) => {
    const order = ordersById.get(item.order_id);
    return {
      order_id: item.order_id,
      paypal_status: item.paypal_status,
      local_status: item.local_status,
      amount: toNumberAmount(item.amount),
      currency: order?.currency ?? 'USD',
      capture_id: item.capture_id,
      has_webhook_in_log: item.has_webhook_in_log,
      drift_count: 1,
      event_date: toDateString(order?.created_at, today),
    };
  });
}

const PAYPAL_SLOW_THRESHOLD_MS = 4_000;
const PAYPAL_TIMEOUT_MS = 12_000;

export async function getTetherData(asOf = new Date()): Promise<TetherData> {
  const today = asOf.toISOString().slice(0, 10);

  const rawWebhookEvents = getLatestWebhookEvents(500);
  const rawLocalOrders = getAllLocalOrders();
  const rawHealLogs = getRecentHealLogs(200);
  const rawAgentRuns = getRecentAgentRuns(200);
  const dropWebhooks = getSetting('drop_webhooks', 'false') === 'true';

  const startMs = Date.now();
  let driftItems: DriftItem[] = [];
  let paypalError: string | null = null;

  try {
    driftItems = await Promise.race([
      checkOrderDrift(),
      new Promise<DriftItem[]>((_, reject) =>
        setTimeout(
          () => reject(new Error('PayPal sandbox drift check timed out after 12s')),
          PAYPAL_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    paypalError =
      err instanceof Error ? err.message : 'Unable to reach PayPal sandbox for live drift check';
  }

  const durationMs = Date.now() - startMs;
  const paypalSlow = durationMs >= PAYPAL_SLOW_THRESHOLD_MS || paypalError !== null;

  const driftOrderIds = new Set(driftItems.map((d) => d.order_id));
  const ordersById = new Map(rawLocalOrders.map((o) => [o.order_id, o]));

  return {
    asOf: asOf.toISOString(),
    dropWebhooks,
    paypalStatus: {
      slow: paypalSlow,
      error: paypalError,
      durationMs,
    },
    webhook_events: flattenWebhookEvents(rawWebhookEvents, today),
    local_orders: flattenLocalOrders(rawLocalOrders, driftOrderIds, today),
    heal_log: flattenHealLog(rawHealLogs, today),
    agent_runs: flattenAgentRuns(rawAgentRuns, today),
    drift: flattenDrift(driftItems, ordersById, today),
  };
}
