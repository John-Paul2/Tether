// The built-in Tether report (initialState) with two pages:
//   1. "Health": KPI cards (Money at risk, Open drift, Verification rate, Avg time to fix),
//      and a spacious Local orders grid sorted drifting-first then newest-first.
//   2. "Incidents": Webhook events over time by event type chart, heal_log grid, and agent_runs grid.

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
      wrapping: true,
      typography: {
        fontFamily: SANS_FONT,
        fontSize: 14,
        fontWeight: 'bold' as const,
        fontStyle: 'normal' as const,
      },
    },
    caption: {
      enabled: false,
    },
    style: {
      textScaling: { enabled: false },
      typography: {
        fontFamily: DISPLAY_FONT,
        fontSize: 40,
        fontWeight: 'bold' as const,
        fontStyle: 'normal' as const,
      },
    },
  },
});

const health: AgPageState = {
  id: 'health',
  widgets: {
    'kpi-money-at-risk': kpi('Money at risk', { id: 'moneyAtRisk' }),
    'kpi-open-drift': kpi('Open drift', { id: 'openDriftCount' }),
    'kpi-verification-rate': kpi('Verification rate', { id: 'verificationRate' }),
    'kpi-avg-seconds-to-fixed': kpi('Avg time to fix', { id: 'avgSecondsToFixed' }),
    'local-orders-grid': {
      type: 'grid',
      dataMapping: {
        cols: [
          { id: 'local_orders.order_id' },
          { id: 'local_orders.local_status' },
          { id: 'local_orders.amount' },
          { id: 'local_orders.currency' },
          { id: 'local_orders.is_drifting' },
          { id: 'local_orders.created_at' },
          { id: 'local_orders.updated_at' },
        ],
      },
      // Studio dev-validation permits 1 sort item in report state; TetherLocalOrdersGrid adds secondary created_at desc sort.
      sort: [{ field: { id: 'local_orders.is_drifting' }, direction: 'desc' }],
      format: title('Local orders'),
    },
  },
  widgetLayout: {
    'kpi-money-at-risk': at(0, 0, 9, 8),
    'kpi-open-drift': at(9, 0, 5, 8),
    'kpi-verification-rate': at(14, 0, 5, 8),
    'kpi-avg-seconds-to-fixed': at(19, 0, 5, 8),
    'local-orders-grid': at(0, 8, 24, 24),
  },
};

const incidents: AgPageState = {
  id: 'incidents',
  widgets: {
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
    'events-over-time': at(0, 0, 24, 15),
    'heal-log-grid': at(0, 15, 24, 22),
    'agent-runs-grid': at(0, 37, 24, 22),
  },
};

export const dashboardReport: AgReportState = {
  selectedPageId: health.id,
  pages: [health, incidents],
};
