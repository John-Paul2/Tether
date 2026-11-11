'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AllCommunityModule,
  themeQuartz,
  type ColDef,
  type RowClassParams,
  type ValueFormatterParams,
} from 'ag-grid-community';
import { AgGridReact, type CustomCellRendererProps } from 'ag-grid-react';
import type { AgValueWidget, AgWidgetField, AgWidgetParams } from 'ag-studio';
import { createWidgets, GridWidget, type AgGridWidgetProps } from 'ag-studio-react';
import type { TetherData } from '@/lib/tether-data';

export type TetherStudioContextValue = {
  data: TetherData;
};

export const TetherStudioContext = createContext<TetherStudioContextValue | null>(null);

function useTetherStudioData(): TetherData | null {
  return useContext(TetherStudioContext)?.data ?? null;
}

const usdDecimals = new Intl.NumberFormat('en-US', {
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

function formatOrderDate(raw: unknown): string {
  if (raw == null) return '—';
  const date = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(date.getTime())) return '—';
  return orderDateTimeFormatter.format(date);
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return reduced;
}

type KpiAccent = 'positive' | 'negative' | 'warning' | 'neutral';

function TetherValueWidget(params: AgWidgetParams<AgValueWidget>) {
  const { widgetId, dataMapping, widgetApi, format } = params;
  const tetherData = useTetherStudioData();
  const field = dataMapping.value?.[0];
  const hasLoadedRef = useRef(false);
  const dataVersion = tetherData?.asOf ?? '';

  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    rawValue: unknown;
  }>({
    loading: true,
    error: null,
    rawValue: null,
  });

  const loadMetric = useCallback(async () => {
    if (!field) {
      widgetApi.setDisplayState('incompleteDataMapping');
      setState({ loading: false, error: null, rawValue: null });
      return;
    }

    widgetApi.setDisplayState('loading', { prominent: !hasLoadedRef.current });
    setState((prev) => ({ ...prev, loading: !hasLoadedRef.current, error: null }));

    try {
      const response = await widgetApi.getData({ fields: [field] }, { queryId: 'value' });
      const rawValue = response?.results?.rows?.at(0)?.[field.key];
      hasLoadedRef.current = true;
      setState({ loading: false, error: null, rawValue });
      widgetApi.setDisplayState('displayed', {
        healthContext: {
          type: 'value',
          value: rawValue,
          hasFormatter: Boolean(field.format),
        },
      });
    } catch (err) {
      hasLoadedRef.current = true;
      setState({
        loading: false,
        error: err instanceof Error ? err.message : 'Unable to compute metric',
        rawValue: null,
      });
      widgetApi.setDisplayState('displayed');
    }
  }, [field, widgetApi]);

  useEffect(() => {
    let cancelled = false;
    // Re-query whenever widget params change (Studio reload/edit) or snapshot timestamp advances.
    if (params && dataVersion !== undefined) {
      void (async () => {
        if (!cancelled) await loadMetric();
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [loadMetric, params, dataVersion]);

  if (!field) {
    return null;
  }

  if (state.loading) {
    return (
      <div
        data-kpi-accent="neutral"
        className="flex h-full flex-col justify-between gap-2 px-4 py-3"
        aria-busy="true"
      >
        <div className="h-10 w-28 animate-pulse rounded-[8px] bg-canvas-soft" />
        <div className="h-5 w-24 animate-pulse rounded-full bg-canvas-soft" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div
        data-kpi-accent="warning"
        className="flex h-full flex-col justify-center gap-1 px-4 py-3 text-xs text-warning-content"
      >
        <p className="font-semibold">Metric unavailable</p>
        <p className="truncate text-mute">{state.error}</p>
      </div>
    );
  }

  const fieldId = field.fieldId;
  const isMoneyAtRisk = widgetId === 'kpi-money-at-risk' || fieldId === 'moneyAtRisk';
  const isOpenDrift = widgetId === 'kpi-open-drift' || fieldId === 'openDriftCount';
  const isVerificationRate =
    widgetId === 'kpi-verification-rate' || fieldId === 'verificationRate';
  const isAvgTimeToFix =
    widgetId === 'kpi-avg-seconds-to-fixed' || fieldId === 'avgSecondsToFixed';

  // Derive fallback values cleanly if an aggregate over an empty table returns null/undefined
  let effectiveValue = state.rawValue;
  if (isMoneyAtRisk && (effectiveValue == null || Number.isNaN(Number(effectiveValue)))) {
    effectiveValue =
      tetherData?.drift?.reduce((sum, item) => sum + Number(item.amount || 0), 0) ?? 0;
  } else if (isOpenDrift && (effectiveValue == null || Number.isNaN(Number(effectiveValue)))) {
    effectiveValue = tetherData?.drift?.length ?? 0;
  }

  const numericVal =
    effectiveValue != null && effectiveValue !== '' && Number.isFinite(Number(effectiveValue))
      ? Number(effectiveValue)
      : null;

  let displayText: string;
  if (isMoneyAtRisk) {
    displayText = usdDecimals.format(numericVal ?? 0);
  } else if (isAvgTimeToFix) {
    displayText = numericVal == null ? '—' : `${numericVal.toFixed(2)}s`;
  } else if (effectiveValue == null) {
    displayText = '—';
  } else {
    displayText = widgetApi.formatFieldValue(field, effectiveValue) || '—';
  }

  let accent: KpiAccent = 'positive';
  let statusNote = 'Healthy';

  if (isMoneyAtRisk) {
    if ((numericVal ?? 0) > 0) {
      accent = 'negative';
      statusNote = 'At risk · Needs heal';
    } else {
      accent = 'positive';
      statusNote = 'Healthy · $0 at risk';
    }
  } else if (isOpenDrift) {
    if ((numericVal ?? 0) > 0) {
      accent = 'negative';
      statusNote = `${numericVal} unreconciled`;
    } else {
      accent = 'positive';
      statusNote = 'In sync';
    }
  } else if (isVerificationRate) {
    if (numericVal != null && numericVal < 1) {
      accent = 'negative';
      statusNote = 'Signature check warning';
    } else {
      accent = 'positive';
      statusNote = numericVal == null ? 'Awaiting events' : 'All verified';
    }
  } else if (isAvgTimeToFix) {
    accent = 'positive';
    statusNote = numericVal == null ? 'No heals yet' : 'Auto-verified heal';
  }

  const isHero = isMoneyAtRisk;
  const pillClass =
    accent === 'negative'
      ? 'border border-negative/25 bg-negative/10 text-negative-deep'
      : 'bg-positive-bg text-positive-deep';
  const dotClass = accent === 'negative' ? 'bg-negative' : 'bg-positive';

  const titleText = format?.title?.text || field.name;

  return (
    <div
      data-kpi-accent={accent}
      data-testid={widgetId}
      className="flex h-full flex-col justify-between gap-2 px-4 pb-3 pt-1"
    >
      <p
        className={`font-display font-extrabold tracking-tight tabular-nums whitespace-nowrap ${
          isHero
            ? 'text-[40px] leading-[44px]'
            : 'text-[32px] leading-[38px] 2xl:text-[40px] 2xl:leading-[44px]'
        } ${accent === 'negative' ? 'text-negative' : 'text-ink'}`}
        title={`${titleText}: ${displayText}`}
      >
        {displayText}
      </p>

      <div className="flex items-center">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-4 ${pillClass}`}
        >
          <span className={`size-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden />
          <span className="whitespace-nowrap">{statusNote}</span>
        </span>
      </div>
    </div>
  );
}

const localOrdersGridTheme = themeQuartz.withParams({
  browserColorScheme: 'dark',
  accentColor: 'var(--accent)',
  backgroundColor: 'var(--bg-surface)',
  foregroundColor: 'var(--text-1)',
  cellTextColor: 'var(--text-1)',
  borderColor: 'var(--border)',
  rowBorder: { color: 'var(--border)', width: 1 },
  columnBorder: false,
  headerColumnBorder: false,
  headerRowBorder: { color: 'var(--border)', width: 1 },
  wrapperBorder: false,
  headerBackgroundColor: 'var(--bg-sunken)',
  headerTextColor: 'var(--text-2)',
  headerFontFamily: 'var(--font-ui-stack)',
  headerFontSize: 12,
  headerFontWeight: 600,
  iconColor: 'var(--text-2)',
  fontFamily: 'var(--font-ui-stack)',
  fontSize: 14,
  rowHeight: 48,
  cellHorizontalPaddingScale: 0.75,
  rowHoverColor: 'var(--bg-raised)',
  selectedRowBackgroundColor: 'var(--ai-soft)',
  valueChangeValueHighlightBackgroundColor: 'var(--sync-soft)',
});

function OrderIdCellRenderer({ value }: CustomCellRendererProps) {
  const [copied, setCopied] = useState(false);
  const text = value != null ? String(value) : '';

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable in restricted context; text stays selectable via select-all
    }
  };

  if (!text) return <span className="text-mute">—</span>;

  return (
    <div className="group flex h-full w-full items-center justify-between gap-2">
      <span className="font-mono text-sm font-medium text-ink select-all whitespace-nowrap">
        {text}
      </span>
      <button
        type="button"
        onClick={(e) => void handleCopy(e)}
        aria-label={`Copy order ID ${text}`}
        title={copied ? 'Copied order ID' : 'Copy order ID'}
        className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[8px] border px-2 py-0.5 text-xs font-semibold leading-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-active ${
          copied
            ? 'border-positive/40 bg-positive-bg text-positive-deep'
            : 'border-canvas-soft bg-canvas text-mute hover:border-primary/40 hover:bg-primary-pale hover:text-primary-active'
        }`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function LocalStatusCellRenderer({ value }: CustomCellRendererProps) {
  const status = String(value ?? '');
  const isPaid = status === 'PAID';

  return (
    <div className="flex h-full items-center">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold leading-4 ${
          isPaid
            ? 'bg-positive-bg text-positive-deep'
            : 'bg-canvas-soft text-body'
        }`}
      >
        <span
          className={`size-1.5 shrink-0 rounded-full ${isPaid ? 'bg-positive' : 'bg-mute'}`}
          aria-hidden
        />
        {status || '—'}
      </span>
    </div>
  );
}

function DriftStatusCellRenderer({ value }: CustomCellRendererProps) {
  const isDrifting = Boolean(value);

  return (
    <div className="flex h-full items-center">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold leading-4 ${
          isDrifting
            ? 'border border-negative/30 bg-negative/10 text-negative-deep'
            : 'bg-positive-bg text-positive-deep'
        }`}
      >
        <span
          className={`size-1.5 shrink-0 rounded-full ${isDrifting ? 'bg-negative' : 'bg-positive'}`}
          aria-hidden
        />
        {isDrifting ? 'Drift' : 'In sync'}
      </span>
    </div>
  );
}

function TetherLocalOrdersGrid(params: AgGridWidgetProps) {
  const { dataMapping, sort, widgetApi } = params;
  const tetherData = useTetherStudioData();
  const fields = useMemo(() => dataMapping.cols ?? [], [dataMapping.cols]);
  const prefersReducedMotion = usePrefersReducedMotion();
  const dataVersion = tetherData?.asOf ?? '';

  const hasLoadedRef = useRef(false);

  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    rows: Record<string, unknown>[];
  }>({
    loading: true,
    error: null,
    rows: [],
  });

  const fieldById = useMemo(() => {
    const map = new Map<string, AgWidgetField>();
    for (const f of fields) {
      map.set(f.fieldId, f);
    }
    return map;
  }, [fields]);

  const orderIdKey = fieldById.get('local_orders.order_id')?.key ?? 'local_orders.order_id';
  const driftingKey = fieldById.get('local_orders.is_drifting')?.key ?? 'local_orders.is_drifting';

  const loadRows = useCallback(async () => {
    if (fields.length === 0) {
      widgetApi.setDisplayState('incompleteDataMapping');
      setState({ loading: false, error: null, rows: [] });
      return;
    }

    widgetApi.setDisplayState('loading', { prominent: !hasLoadedRef.current });
    setState((prev) => ({ ...prev, loading: !hasLoadedRef.current, error: null }));

    try {
      const response = await widgetApi.getData({ fields, sort }, { queryId: 'rows' });
      const fetched = response?.results?.rows ?? [];
      const cloned = fetched.map((row) => ({ ...row }));
      hasLoadedRef.current = true;
      setState({ loading: false, error: null, rows: cloned });
      widgetApi.setDisplayState('displayed');
    } catch (err) {
      hasLoadedRef.current = true;
      setState((prev) => ({
        loading: false,
        error: err instanceof Error ? err.message : 'Unable to load local orders',
        rows: prev.rows,
      }));
      widgetApi.setDisplayState('displayed');
    }
  }, [fields, sort, widgetApi]);

  useEffect(() => {
    let cancelled = false;
    // Re-query whenever widget params change (Studio reload/edit) or snapshot timestamp advances.
    if (params && dataVersion !== undefined) {
      void (async () => {
        if (!cancelled) await loadRows();
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [loadRows, params, dataVersion]);

  useEffect(() => {
    widgetApi.addEventListener('toolbarAction', (event) => {
      if (event.id === 'export') {
        void event.startTransition(() =>
          widgetApi.exportCsv({ requests: [{ fields, sort }] }),
        );
      }
    });
    return () => {
      widgetApi.removeEventListener('toolbarAction');
    };
  }, [fields, sort, widgetApi]);

  const columnDefs = useMemo<ColDef<Record<string, unknown>>[]>(() => {
    return fields.map((field): ColDef<Record<string, unknown>> => {
      const id = field.fieldId;
      const base: ColDef<Record<string, unknown>> = {
        colId: field.key,
        field: field.key,
        headerName: widgetApi.getFieldName(field),
        sortable: true,
        suppressMovable: true,
      };

      if (id === 'local_orders.order_id') {
        return {
          ...base,
          headerName: 'Order ID',
          minWidth: 205,
          flex: 1.35,
          cellRenderer: OrderIdCellRenderer,
        };
      }

      if (id === 'local_orders.local_status') {
        return {
          ...base,
          headerName: 'Local Status',
          minWidth: 112,
          flex: 0.85,
          enableCellChangeFlash: true,
          cellRenderer: LocalStatusCellRenderer,
        };
      }

      if (id === 'local_orders.amount') {
        return {
          ...base,
          headerName: 'Amount',
          minWidth: 80,
          flex: 0.58,
          type: 'numericColumn',
          valueFormatter: (p: ValueFormatterParams) =>
            p.value == null || !Number.isFinite(Number(p.value))
              ? '—'
              : usdDecimals.format(Number(p.value)),
        };
      }

      if (id === 'local_orders.currency') {
        return {
          ...base,
          hide: true,
        };
      }

      if (id === 'local_orders.is_drifting') {
        return {
          ...base,
          headerName: 'Has Open Drift',
          minWidth: 170,
          flex: 1.28,
          sort: 'desc',
          sortIndex: 0,
          enableCellChangeFlash: true,
          comparator: (a, b) => Number(Boolean(a)) - Number(Boolean(b)),
          cellRenderer: DriftStatusCellRenderer,
        };
      }

      if (id === 'local_orders.created_at') {
        return {
          ...base,
          headerName: 'Created At',
          minWidth: 138,
          flex: 1.05,
          sort: 'desc',
          sortIndex: 1,
          comparator: (a, b) =>
            Date.parse(String(a ?? '')) - Date.parse(String(b ?? '')),
          valueFormatter: (p: ValueFormatterParams) => formatOrderDate(p.value),
        };
      }

      if (id === 'local_orders.updated_at') {
        return {
          ...base,
          headerName: 'Updated At',
          minWidth: 118,
          flex: 0.88,
          comparator: (a, b) =>
            Date.parse(String(a ?? '')) - Date.parse(String(b ?? '')),
          valueFormatter: (p: ValueFormatterParams) => formatOrderDate(p.value),
        };
      }

      return {
        ...base,
        minWidth: 120,
        flex: 1,
        valueFormatter: (p: ValueFormatterParams) =>
          widgetApi.formatFieldValue(field, p.value),
      };
    });
  }, [fields, widgetApi]);

  const getRowId = useCallback(
    (p: { data: Record<string, unknown> }) => String(p.data[orderIdKey] ?? ''),
    [orderIdKey],
  );

  const rowClassRules = useMemo(
    () => ({
      'tether-drifting-row': (p: RowClassParams<Record<string, unknown>>) =>
        Boolean(p.data?.[driftingKey]),
    }),
    [driftingKey],
  );

  if (fields.length === 0) {
    return null;
  }

  if (state.loading && !hasLoadedRef.current) {
    return (
      <div className="flex h-full min-h-[320px] flex-col gap-3 p-4" aria-busy="true">
        <div className="h-9 w-full animate-pulse rounded-[8px] bg-canvas-soft" />
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="h-12 w-full animate-pulse rounded-[8px] bg-canvas-soft/60" />
        ))}
      </div>
    );
  }

  if (state.error && state.rows.length === 0) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-base font-semibold text-ink">Unable to load local orders</p>
        <p className="max-w-md text-sm text-body">{state.error}</p>
        <button
          type="button"
          onClick={() => void loadRows()}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-active"
        >
          Retry
        </button>
      </div>
    );
  }

  if (state.rows.length === 0) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-base font-semibold text-ink">No local orders yet</p>
        <p className="max-w-md text-sm text-body">
          Open Demo controls above to create a PayPal sandbox order and monitor its status transitions here.
        </p>
      </div>
    );
  }

  return (
    <div className="ag-studio-grid-widget tether-local-orders-grid h-full w-full">
      <AgGridReact
        modules={[AllCommunityModule]}
        theme={localOrdersGridTheme}
        rowData={state.rows}
        columnDefs={columnDefs}
        getRowId={getRowId}
        rowClassRules={rowClassRules}
        suppressFieldDotNotation={true}
        suppressCellFocus={false}
        suppressDragLeaveHidesColumns={true}
        headerHeight={40}
        rowHeight={48}
        animateRows={!prefersReducedMotion}
        cellFlashDuration={prefersReducedMotion ? 0 : 900}
        cellFadeDuration={prefersReducedMotion ? 0 : 1200}
        defaultColDef={{
          suppressMovable: true,
          resizable: true,
          sortable: true,
        }}
      />
    </div>
  );
}

function TetherGridWidget(params: AgGridWidgetProps) {
  if (params.widgetId === 'local-orders-grid') {
    return <TetherLocalOrdersGrid {...params} />;
  }
  return <GridWidget {...params} />;
}

export function createTetherWidgets() {
  const base = createWidgets({});
  return {
    ...base,
    widgets: base.widgets.map((widget) => {
      if (widget.id === 'value') {
        return { ...widget, comp: TetherValueWidget };
      }
      if (widget.id === 'grid') {
        return { ...widget, comp: TetherGridWidget };
      }
      return widget;
    }),
  };
}
