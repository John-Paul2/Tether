// The built-in Tether report (initialState) with two pages:
//   1. "Health": KPI cards (events received, verification rate, open drift, avg seconds-to-fixed),
//      a chart of events over time by event type, and a grid of local orders with local_status.
//   2. "Incidents": a grid of heal_log and a grid of agent_runs (root cause, model used, confidence).

import type { AgPageState, AgReportState, AgWidgetLayoutState } from 'ag-studio';

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({
  xTrack,
  yTrack,
  xSpan,
  ySpan,
});

const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: 'sum' as const });
const avg = (id: string) => ({ id, aggregation: 'avg' as const });

const DISPLAY_FONT = 'var(--font-display-stack)';
const SANS_FONT = 'var(--font-sans-stack)';

const kpi = (
  text: string,
  value: { id: string; aggregation?: 'sum' | 'avg' | 'count' | 'countd' },
) => ({
  type: 'value' as const,
  dataMapping: {
    value: [value],
  },
  format: {
    title: {
      enabled: true,
      text,
      typography: {
        fontFamily: SANS_FONT,
        fontSize: 14,
        fontWeight: 'normal' as const,
        fontStyle: 'normal' as const,
      },
    },
    caption: {
      enabled: true,
      text: '',
      typography: {
        fontFamily: SANS_FONT,
        fontSize: 0,
        fontWeight: 'normal' as const,
        fontStyle: 'normal' as const,
      },
    },
    style: {
      typography: {
        fontFamily: DISPLAY_FONT,
        fontSize: 32,
        fontWeight: 'bold' as const,
        fontStyle: 'normal' as const,
      },
    },
  },
});

const health: AgPageState = {
  id: 'health',
  widgets: {
    'kpi-events-received': kpi('Events received', sum('webhook_events.event_count')),
    'kpi-verification-rate': kpi('Verification rate', { id: 'verificationRate' }),
    'kpi-open-drift': kpi('Open drift', { id: 'openDriftCount' }),
    'kpi-avg-seconds-to-fixed': kpi('Avg seconds-to-fixed', { id: 'avgSecondsToFixed' }),
    'events-over-time': {
      type: 'column-chart-stacked',
      dataMapping: {
        categoryKey: [{ id: 'calendar::day' }],
        valueKey: [sum('webhook_events.event_count')],
        legendKey: [{ id: 'webhook_events.event_type' }],
      },
      format: {
        ...title('Webhook events over time by event type'),
        style: { theme: { common: { legend: { enabled: true } } } },
      },
    },
    'local-orders-grid': {
      type: 'grid',
      dataMapping: {
        cols: [
          { id: 'local_orders.order_id' },
          { id: 'local_orders.local_status' },
          sum('local_orders.amount'),
          { id: 'local_orders.currency' },
          { id: 'local_orders.is_drifting' },
          { id: 'local_orders.created_at' },
          { id: 'local_orders.updated_at' },
        ],
      },
      sort: [{ field: { id: 'local_orders.created_at' }, direction: 'desc' }],
      format: title('Local orders'),
    },
  },
  widgetLayout: {
    'kpi-events-received': at(0, 0, 6, 7),
    'kpi-verification-rate': at(6, 0, 6, 7),
    'kpi-open-drift': at(12, 0, 6, 7),
    'kpi-avg-seconds-to-fixed': at(18, 0, 6, 7),
    'events-over-time': at(0, 7, 24, 15),
    'local-orders-grid': at(0, 22, 24, 18),
  },
};

const incidents: AgPageState = {
  id: 'incidents',
  widgets: {
    'heal-log-grid': {
      type: 'grid',
      dataMapping: {
        cols: [
          { id: 'heal_log.id' },
          { id: 'heal_log.order_id' },
          { id: 'heal_log.event_id' },
          { id: 'heal_log.action' },
          { id: 'heal_log.result' },
          avg('heal_log.seconds_to_fixed'),
          { id: 'heal_log.reason' },
          { id: 'heal_log.started_at' },
          { id: 'heal_log.finished_at' },
        ],
      },
      sort: [{ field: { id: 'heal_log.started_at' }, direction: 'desc' }],
      format: title('Heal log'),
    },
    'agent-runs-grid': {
      type: 'grid',
      dataMapping: {
        cols: [
          { id: 'agent_runs.id' },
          { id: 'agent_runs.order_id' },
          { id: 'agent_runs.root_cause' },
          { id: 'agent_runs.model_used' },
          { id: 'agent_runs.confidence' },
          { id: 'agent_runs.safe_to_heal' },
          { id: 'agent_runs.summary' },
          { id: 'agent_runs.recommended_action' },
          { id: 'agent_runs.created_at' },
        ],
      },
      sort: [{ field: { id: 'agent_runs.created_at' }, direction: 'desc' }],
      format: title('Agent runs'),
    },
  },
  widgetLayout: {
    'heal-log-grid': at(0, 0, 24, 18),
    'agent-runs-grid': at(0, 18, 24, 20),
  },
};

export const dashboardReport: AgReportState = {
  selectedPageId: health.id,
  pages: [health, incidents],
};
