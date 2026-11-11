// The built-in Tether report (initialState) with two pages:
//   1. "Health": Seconds-to-fixed bar chart, Orders-by-status bar chart, and a full-width
//      Local orders grid (paired above the Studio canvas with MoneyBox + ReconciliationStrip).
//   2. "Incidents": Secondary KPIs (Open drift, Verification rate, Avg time to fix),
//      Webhook events over time by event type chart, heal_log grid, and agent_runs grid.

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
const count = (id: string) => ({ id, aggregation: 'count' as const });

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
    'seconds-to-fixed-chart': {
      type: 'column-chart-grouped',
      dataMapping: {
        categoryKey: [{ id: 'heal_log.id' }],
        valueKey: [avg('heal_log.seconds_to_fixed')],
        tooltipKey: [{ id: 'heal_log.order_id' }],
      },
      sort: [{ field: { id: 'heal_log.id' }, direction: 'asc' }],
      format: {
        ...title('Seconds to fixed per heal'),
        style: {
          theme: {
            common: { legend: { enabled: false } },
            bar: { series: { width: 48 } },
          },
          custom: {
            categoryAxisMode: 'categorical',
            categoryAxis: { title: { enabled: true, text: 'Heal #' } },
            valueAxis: { title: { enabled: true, text: 'Seconds' } },
          },
        },
      },
    },
    'orders-by-status-chart': {
      type: 'column-chart-grouped',
      dataMapping: {
        categoryKey: [{ id: 'local_orders.local_status' }],
        valueKey: [count('local_orders.order_id')],
      },
      sort: [{ field: { id: 'local_orders.local_status' }, direction: 'asc' }],
      format: {
        ...title('Orders by status'),
        style: {
          theme: {
            common: { legend: { enabled: false } },
            bar: { series: { width: 48 } },
          },
          custom: {
            categoryAxis: { title: { enabled: true, text: 'Status' } },
            valueAxis: { title: { enabled: true, text: 'Orders' } },
          },
        },
      },
    },
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
  filter: {
    widget: {
      'seconds-to-fixed-chart': [
        {
          field: { id: 'heal_log.healed' },
          model: { operator: 'isTrue' },
        },
      ],
    },
  },
  widgetLayout: {
    'seconds-to-fixed-chart': at(0, 0, 12, 15),
    'orders-by-status-chart': at(12, 0, 12, 15),
    'local-orders-grid': at(0, 15, 24, 21),
  },
};

const incidents: AgPageState = {
  id: 'incidents',
  widgets: {
    'kpi-open-drift': kpi('Open drift', { id: 'openDriftCount' }),
    'kpi-verification-rate': kpi('Verification rate', { id: 'verificationRate' }),
    'kpi-avg-seconds-to-fixed': kpi('Avg time to fix', { id: 'avgSecondsToFixed' }),
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
    'kpi-open-drift': at(0, 0, 8, 8),
    'kpi-verification-rate': at(8, 0, 8, 8),
    'kpi-avg-seconds-to-fixed': at(16, 0, 8, 8),
    'events-over-time': at(0, 8, 24, 15),
    'heal-log-grid': at(0, 23, 24, 20),
    'agent-runs-grid': at(0, 43, 24, 20),
  },
};

export const dashboardReport: AgReportState = {
  selectedPageId: health.id,
  pages: [health, incidents],
};
