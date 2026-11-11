// AG Studio's data sources for Tether: one source per table in lib/tether-data.ts,
// relationships joined on order_id, a shared calendar over event dates, and expressions
// for money at risk, verification rate, open drift count, and avg time to fix.

import type {
  AgDataSourcesDefinition,
  AgExpressionFieldDefinition,
  AgFieldDefinition,
  AgFormat,
  AgRelationDefinition,
} from 'ag-studio';
import type { TetherData } from '@/lib/tether-data';

const CALENDAR_ID = 'calendar';

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const orderDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const formatCurrencyValue = (value: unknown): string => {
  if (value == null) return '—';
  const num = Number(value);
  return Number.isFinite(num) ? usdFormatter.format(num) : '—';
};

const formatOrderDateTime = (value: unknown): string => {
  if (value == null) return '—';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return orderDateTimeFormatter.format(date);
};

type FieldExtra = Partial<
  Pick<AgFieldDefinition, 'hide' | 'formatOptions' | 'createValueFormatter'>
>;

type FieldSpec = [id: string, name: string, format: AgFormat, hideOrExtra?: boolean | FieldExtra];

const fields = (specs: FieldSpec[]): AgFieldDefinition[] =>
  specs.map(([id, name, format, hideOrExtra]) => {
    const extra: FieldExtra =
      typeof hideOrExtra === 'boolean' ? { hide: hideOrExtra } : (hideOrExtra ?? {});
    return {
      id,
      name,
      format,
      ...extra,
    };
  });

const manyToOne = (id: string, source: string, target: string): AgRelationDefinition => {
  const [sourceTable, sourceField] = source.split('.');
  const [targetTable, targetField] = target.split('.');
  return {
    id,
    source: { tableId: sourceTable, fieldId: sourceField },
    target: { tableId: targetTable, fieldId: targetField },
    type: 'many-to-one',
  };
};

const onCalendar = (tableId: string, fieldId: string): AgRelationDefinition => ({
  id: `${tableId}-${fieldId}-calendar`,
  source: { tableId, fieldId },
  target: { calendarId: CALENDAR_ID },
});

const sumOf = (id: string) => ({ id, aggregation: 'sum' as const });
const avgOf = (id: string) => ({ id, aggregation: 'avg' as const });

export const hasData = (data: TetherData) => Boolean(data.asOf);

export function buildStudioData(data: TetherData): AgDataSourcesDefinition {
  const dates = [
    ...data.webhook_events.map((r) => r.event_date),
    ...data.local_orders.map((r) => r.order_date),
    ...data.heal_log.map((r) => r.heal_date),
    ...data.agent_runs.map((r) => r.run_date),
    ...data.drift.map((r) => r.event_date),
  ]
    .filter((d): d is string => Boolean(d))
    .sort();

  const today = data.asOf.slice(0, 10);

  const expressions: AgExpressionFieldDefinition[] = [
    {
      id: 'moneyAtRisk',
      name: 'Money at Risk',
      description:
        'Total dollar amount across PayPal sandbox orders with open drift (COMPLETED in PayPal, CREATED locally).',
      format: 'currencyFormat',
      formatOptions: { format: '$#,##0.00' },
      isMeasure: true,
      createValueFormatter: () => (value) => {
        if (value == null) return '$0.00';
        const num = Number(value);
        return Number.isFinite(num) ? usdFormatter.format(num) : '$0.00';
      },
      expression: {
        operator: 'if',
        inputs: [
          { operator: 'isNull', inputs: [sumOf('drift.amount')] },
          { type: 'number', value: 0 },
          sumOf('drift.amount'),
        ],
      },
    },
    {
      id: 'verificationRate',
      name: 'Verification Rate',
      description:
        'Share of received PayPal webhook events that passed cryptographic signature verification (verified / total events).',
      format: 'percentageFormat',
      isMeasure: true,
      expression: {
        operator: 'divide',
        inputs: [sumOf('webhook_events.verified_count'), sumOf('webhook_events.event_count')],
      },
    },
    {
      id: 'openDriftCount',
      name: 'Open Drift Count',
      description:
        'Number of orders that are COMPLETED in PayPal sandbox but still unpaid (CREATED) in local_orders.',
      format: 'integerFormat',
      isMeasure: true,
      expression: sumOf('local_orders.open_drift'),
    },
    {
      id: 'avgSecondsToFixed',
      name: 'Avg time to fix',
      description:
        'Average time in seconds from triggering a guarded PayPal webhook resend until the verified webhook flips local_status to PAID.',
      format: 'decimalFormat',
      isMeasure: true,
      createValueFormatter: () => (value) => {
        if (value == null) return '—';
        const num = Number(value);
        return Number.isFinite(num) ? `${num.toFixed(2)}s` : '—';
      },
      expression: avgOf('heal_log.seconds_to_fixed'),
    },
  ];

  return {
    description:
      'Tether payment-event doctor data model. Combines incoming PayPal webhook receipts (with signature verification status), local order state, guarded webhook resend audit logs (heal_log), Gemini diagnostic agent runs (agent_runs), and live PayPal order drift items joined on order_id.',
    sources: [
      {
        id: 'webhook_events',
        name: 'Webhook Events',
        description:
          'Every PayPal webhook received by /api/webhook, with PayPal cryptographic signature verification status and derived event date.',
        data: data.webhook_events,
        fields: fields([
          ['id', 'Event ID', 'textFormat'],
          ['event_type', 'Event Type', 'textFormat'],
          ['resource_id', 'Resource ID', 'textFormat'],
          ['order_id', 'Order ID', 'textFormat'],
          ['verification_status', 'Verification Status', 'textFormat'],
          ['verified', 'Verified', 'booleanFormat'],
          ['verified_count', 'Verified Events', 'integerFormat', true],
          ['event_count', 'Events Received', 'integerFormat'],
          ['received_at', 'Received At', 'dateTimeFormat'],
          ['event_date', 'Event Date', 'dateFormat'],
        ]),
      },
      {
        id: 'local_orders',
        name: 'Local Orders',
        description:
          'Merchant local order table. Orders start in CREATED and only transition to PAID when a verified PAYMENT.CAPTURE.COMPLETED webhook is processed.',
        data: data.local_orders,
        fields: fields([
          ['order_id', 'Order ID', 'textFormat'],
          ['local_status', 'Local Status', 'textFormat'],
          [
            'amount',
            'Amount',
            'currencyFormat',
            {
              formatOptions: { format: '$#,##0.00' },
              createValueFormatter: () => formatCurrencyValue,
            },
          ],
          ['currency', 'Currency', 'textFormat'],
          ['is_paid', 'Is Paid', 'booleanFormat'],
          ['is_drifting', 'Has Open Drift', 'booleanFormat'],
          ['open_drift', 'Open Drift', 'integerFormat', true],
          [
            'created_at',
            'Created At',
            'dateTimeFormat',
            {
              createValueFormatter: () => formatOrderDateTime,
            },
          ],
          [
            'updated_at',
            'Updated At',
            'dateTimeFormat',
            {
              createValueFormatter: () => formatOrderDateTime,
            },
          ],
          ['order_date', 'Order Date', 'dateFormat'],
        ]),
      },
      {
        id: 'heal_log',
        name: 'Heal Log',
        description:
          'Audit trail of guarded webhook heal attempts (POST /api/heal and POST /api/agent/approve), recording preconditions, action taken, result, and seconds-to-fixed.',
        data: data.heal_log,
        fields: fields([
          ['id', 'Heal ID', 'integerFormat'],
          ['order_id', 'Order ID', 'textFormat'],
          ['event_id', 'Webhook Event ID', 'textFormat'],
          ['action', 'Action', 'textFormat'],
          ['result', 'Result', 'textFormat'],
          ['healed', 'Healed', 'booleanFormat'],
          ['seconds_to_fixed', 'Seconds to Fixed', 'decimalFormat'],
          ['reason', 'Reason', 'textFormat'],
          ['started_at', 'Started At', 'dateTimeFormat'],
          ['finished_at', 'Finished At', 'dateTimeFormat'],
          ['heal_date', 'Heal Date', 'dateFormat'],
        ]),
      },
      {
        id: 'agent_runs',
        name: 'Agent Runs',
        description:
          'Diagnostic investigations executed by the Tether Doctor Agent over Gemini tool calls, recording root cause, model used, confidence, and server-verified safe_to_heal.',
        data: data.agent_runs,
        fields: fields([
          ['id', 'Run ID', 'integerFormat'],
          ['order_id', 'Order ID', 'textFormat'],
          ['root_cause', 'Root Cause', 'textFormat'],
          ['model_used', 'Model Used', 'textFormat'],
          ['confidence', 'Confidence', 'textFormat'],
          ['safe_to_heal', 'Safe to Heal', 'booleanFormat'],
          ['summary', 'Summary', 'textFormat'],
          ['recommended_action', 'Recommended Action', 'textFormat'],
          ['step_count', 'Tool Steps', 'integerFormat'],
          ['evidence_count', 'Evidence Count', 'integerFormat'],
          ['created_at', 'Created At', 'dateTimeFormat'],
          ['run_date', 'Run Date', 'dateFormat'],
        ]),
      },
      {
        id: 'drift',
        name: 'Open Drift',
        description:
          'Live read-only drift items where PayPal order status is COMPLETED in sandbox while local_orders.local_status is still CREATED.',
        data: data.drift,
        fields: fields([
          ['order_id', 'Order ID', 'textFormat'],
          ['paypal_status', 'PayPal Status', 'textFormat'],
          ['local_status', 'Local Status', 'textFormat'],
          [
            'amount',
            'Drift Amount',
            'currencyFormat',
            {
              formatOptions: { format: '$#,##0.00' },
              createValueFormatter: () => formatCurrencyValue,
            },
          ],
          ['currency', 'Currency', 'textFormat'],
          ['capture_id', 'Capture ID', 'textFormat'],
          ['has_webhook_in_log', 'Webhook in Local Log', 'booleanFormat'],
          ['drift_count', 'Drift Items', 'integerFormat'],
          ['event_date', 'Order Date', 'dateFormat'],
        ]),
      },
    ],
    relationships: [
      manyToOne('webhook-events-order', 'webhook_events.order_id', 'local_orders.order_id'),
      manyToOne('heal-log-order', 'heal_log.order_id', 'local_orders.order_id'),
      manyToOne('agent-runs-order', 'agent_runs.order_id', 'local_orders.order_id'),
      manyToOne('drift-order', 'drift.order_id', 'local_orders.order_id'),
      onCalendar('webhook_events', 'event_date'),
      onCalendar('local_orders', 'order_date'),
      onCalendar('heal_log', 'heal_date'),
      onCalendar('agent_runs', 'run_date'),
      onCalendar('drift', 'event_date'),
    ],
    calendars: [
      {
        id: CALENDAR_ID,
        label: 'Event Calendar',
        range: {
          from: { type: 'date', value: dates[0] ?? today },
          to: { type: 'date', value: dates.at(-1) ?? today },
        },
        fragments: ['year', 'quarter', 'month', 'week', 'day', 'dayOfWeek'],
      },
    ],
    expressions,
  };
}
