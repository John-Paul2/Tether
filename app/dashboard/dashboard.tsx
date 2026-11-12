'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type CSSProperties,
} from 'react';
import { useRouter } from 'next/navigation';
import { MotionConfig } from 'motion/react';
import { X } from 'lucide-react';
import {
  AgStudioAiModule,
  enableStudioDevValidations,
  type AgReportState,
  type AgStudioApi,
  type AgStudioMode,
} from 'ag-studio';
import { AgStudio, AgStudioProvider } from 'ag-studio-react';
import type { TetherData } from '@/lib/tether-data';
import { AppShell } from './components/app-shell';
import {
  CreateReportDialog,
  DeleteReportDialog,
  RenameDialog,
  ResetDemoDialog,
  UnsavedChangesDialog,
  type DashboardDialog,
} from './components/dialogs';
import { DoctorPanel } from './components/doctor-panel';
import { EmptyData } from './components/empty-data';
import { MoneyBox } from './components/money-box';
import { ReconciliationStrip } from './components/reconciliation-strip';
import {
  blankReport,
  copyOf,
  defaultReport,
  findReport,
  initialReports,
  newId,
  remove,
  upsert,
  type SavedReport,
} from './reports-store';
import { pagesFor, pageTitlesFor } from './page-titles';
import { ContentSkeleton } from './components/skeleton';
import { TopBar } from './components/top-bar';
import { Badge } from './components/ui/ui';
import * as reportState from './report-state';
import { buildAi } from './studio/ai';
import { buildStudioData, hasData } from './studio/data';
import { agStudioTetherTheme } from './studio/theme';
import { createTetherWidgets, TetherStudioContext } from './studio/widgets';
import { useReports } from './use-reports';

if (process.env.NODE_ENV !== 'production') {
  enableStudioDevValidations();
}

type DashboardProps = {
  data: TetherData;
  licenseKey?: string;
  aiModels?: string[];
};

type StudioHistory = { canUndo: boolean; canRedo: boolean };

const NO_HISTORY: StudioHistory = { canUndo: false, canRedo: false };

const noSubscription = () => () => {};

const STUDIO_AI_MODULES = [AgStudioAiModule];

const STUDIO_LOCALE_TEXT: ComponentProps<typeof AgStudio>['localeText'] = {
  widgetOverlayNoData: 'Not enough data yet.',
  widgetOverlayLoading: 'Loading report data…',
};

const STUDIO_LAYOUT: ComponentProps<typeof AgStudio>['layout'] = {
  widgetBorderEnabled: true,
  minWidth: 320,
};

const STUDIO_PANELS: ComponentProps<typeof AgStudio>['panels'] = {
  view: { left: [], right: [] },
  edit: { left: ['ai'], right: ['filters', 'edit', 'data'] },
};

const STUDIO_VIEW_STYLE: CSSProperties = { width: '100%' };
const STUDIO_EDIT_STYLE: CSSProperties = { height: '100%', width: '100%' };

function isElementScrollableInDirection(
  el: HTMLElement,
  dx: number,
  dy: number,
  verticalDominant: boolean,
): boolean {
  const style = window.getComputedStyle(el);
  if (verticalDominant && dy !== 0) {
    if (
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0;
    }
  } else if (!verticalDominant && dx !== 0) {
    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth + 1
    ) {
      return dx > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0;
    }
  }
  return false;
}

function isHoveredWidgetScrollable(
  widget: HTMLElement,
  target: EventTarget | null,
  dx: number,
  dy: number,
): boolean {
  const verticalDominant = Math.abs(dy) >= Math.abs(dx);
  const seen = new Set<HTMLElement>();
  const candidates: HTMLElement[] = [];

  if (target instanceof Element) {
    let cur: Element | null = target;
    while (cur && cur !== widget) {
      if (cur instanceof HTMLElement && !seen.has(cur)) {
        seen.add(cur);
        candidates.push(cur);
      }
      cur = cur.parentElement;
    }
  }

  for (const el of widget.querySelectorAll<HTMLElement>(
    '.ag-body-viewport, .ag-center-cols-viewport, .ag-body-horizontal-scroll-viewport, .ag-studio-layout-widget-content',
  )) {
    if (!seen.has(el)) {
      seen.add(el);
      candidates.push(el);
    }
  }

  for (const el of candidates) {
    if (isElementScrollableInDirection(el, dx, dy, verticalDominant)) {
      return true;
    }
  }

  return false;
}

function hasScrollableChildBefore(
  stopEl: HTMLElement,
  target: EventTarget | null,
  dx: number,
  dy: number,
): boolean {
  if (!(target instanceof Element)) return false;
  const verticalDominant = Math.abs(dy) >= Math.abs(dx);
  let cur: Element | null = target;
  while (cur && cur !== stopEl) {
    if (cur instanceof HTMLElement && isElementScrollableInDirection(cur, dx, dy, verticalDominant)) {
      return true;
    }
    cur = cur.parentElement;
  }
  return false;
}

type SmoothScrollState = {
  targetTop: number;
  targetLeft: number;
  lastTop: number;
  lastLeft: number;
  rafId: number | null;
  lastTime: number;
};

const smoothScrollStates = new WeakMap<Element, SmoothScrollState>();
const SMOOTH_SCROLL_DECAY = 18;

function resolvePageScroller(mainEl: HTMLElement): HTMLElement {
  if (window.getComputedStyle(mainEl).overflowY !== 'visible') {
    return mainEl;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

function stopSmoothScroll(el: Element | null | undefined) {
  if (!el) return;
  const state = smoothScrollStates.get(el);
  if (!state) return;
  if (state.rafId != null) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  state.targetTop = el.scrollTop;
  state.targetLeft = el.scrollLeft;
  state.lastTop = el.scrollTop;
  state.lastLeft = el.scrollLeft;
}

function enqueueSmoothScroll(el: Element, dx: number, dy: number) {
  const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
  const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);

  let state = smoothScrollStates.get(el);
  if (!state) {
    state = {
      targetTop: el.scrollTop,
      targetLeft: el.scrollLeft,
      lastTop: el.scrollTop,
      lastLeft: el.scrollLeft,
      rafId: null,
      lastTime: performance.now(),
    };
    smoothScrollStates.set(el, state);
  }

  // Re-sync if user scrolled via scrollbar thumb, keyboard, or programmatic jump
  if (Math.abs(el.scrollTop - state.lastTop) > 2) {
    state.targetTop = el.scrollTop;
    state.lastTop = el.scrollTop;
  }
  if (Math.abs(el.scrollLeft - state.lastLeft) > 2) {
    state.targetLeft = el.scrollLeft;
    state.lastLeft = el.scrollLeft;
  }

  state.targetTop = Math.max(0, Math.min(maxTop, state.targetTop + dy));
  state.targetLeft = Math.max(0, Math.min(maxLeft, state.targetLeft + dx));

  if (state.rafId != null) return;

  state.lastTime = performance.now();
  const step = (now: number) => {
    if (!state) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - state.lastTime) / 1000));
    state.lastTime = now;

    if (Math.abs(el.scrollTop - state.lastTop) > 2) {
      state.targetTop = el.scrollTop;
    }
    if (Math.abs(el.scrollLeft - state.lastLeft) > 2) {
      state.targetLeft = el.scrollLeft;
    }

    const diffY = state.targetTop - el.scrollTop;
    const diffX = state.targetLeft - el.scrollLeft;

    if (Math.abs(diffY) < 0.5 && Math.abs(diffX) < 0.5) {
      el.scrollTop = state.targetTop;
      el.scrollLeft = state.targetLeft;
      state.lastTop = el.scrollTop;
      state.lastLeft = el.scrollLeft;
      state.rafId = null;
      return;
    }

    const alpha = 1 - Math.exp(-SMOOTH_SCROLL_DECAY * dt);
    if (Math.abs(diffY) >= 0.5) {
      el.scrollTop += diffY * alpha;
    } else {
      el.scrollTop = state.targetTop;
    }
    if (Math.abs(diffX) >= 0.5) {
      el.scrollLeft += diffX * alpha;
    } else {
      el.scrollLeft = state.targetLeft;
    }

    state.lastTop = el.scrollTop;
    state.lastLeft = el.scrollLeft;
    state.rafId = requestAnimationFrame(step);
  };

  state.rafId = requestAnimationFrame(step);
}

export function Dashboard(props: DashboardProps) {
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (inBrowser) {
    return (
      <MotionConfig reducedMotion="user">
        <ReportsDashboard {...props} />
      </MotionConfig>
    );
  }

  const fallbackReport = defaultReport();
  const fallbackPages = pagesFor(fallbackReport);

  return (
    <MotionConfig reducedMotion="user">
      <AppShell
        topBar={
          <TopBar
            reports={[fallbackReport]}
            activeReport={fallbackReport}
            pages={fallbackPages}
            selectedPageId={fallbackReport.state.selectedPageId}
            asOf={props.data.asOf}
            paypalSlow={props.data.paypalStatus.slow}
            paypalError={props.data.paypalStatus.error}
            dropWebhooks={props.data.dropWebhooks}
            localOrders={props.data.local_orders}
            editing={false}
            ready={false}
            pageIsEmpty={false}
            canUndo={false}
            canRedo={false}
            onSelectPage={() => {}}
            onSelectReport={() => {}}
            onAddPage={() => {}}
            onNewReport={() => {}}
            onEditingChange={() => {}}
            onResetReport={() => {}}
            onRenameReport={() => {}}
            onDuplicateReport={() => {}}
            onDeleteReport={() => {}}
            onRenamePage={() => {}}
            onRemovePage={() => {}}
            onUndo={() => {}}
            onRedo={() => {}}
            onDiscard={() => {}}
            onSave={() => {}}
            onFaultChanged={() => {}}
            onOrderMutated={() => {}}
            openDriftCount={props.data.drift.length}
            doctorDrawerOpen={false}
            onToggleDoctorDrawer={() => {}}
          />
        }
      >
        <ContentSkeleton />
      </AppShell>
    </MotionConfig>
  );
}

function ReportsDashboard({ data, licenseKey, aiModels }: DashboardProps) {
  const router = useRouter();
  const { store, latest, update, editReport } = useReports();
  const apiRef = useRef<AgStudioApi | null>(null);

  const [studioState, setStudioState] = useState<AgReportState | null>(null);
  const [history, setHistory] = useState<StudioHistory>(NO_HISTORY);
  const [mode, setMode] = useState<AgStudioMode>('view');
  const [dialog, setDialog] = useState<DashboardDialog>(null);
  const [doctorDrawerOpen, setDoctorDrawerOpen] = useState(false);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const doctorTriggerRef = useRef<HTMLButtonElement>(null);
  const [manualSelectedOrderId, setManualSelectedOrderId] = useState<string | null>(null);
  const [recentlyHealedOrderId, setRecentlyHealedOrderId] = useState<string | null>(null);
  const [dismissedNoticeAsOf, setDismissedNoticeAsOf] = useState<string | null>(null);
  const healResetTimerRef = useRef<number | null>(null);
  const studioHostRef = useRef<HTMLDivElement>(null);

  const [dropOverride, setDropOverride] = useState<{
    asOf: string;
    value: boolean;
  } | null>(null);

  const dropWebhooks =
    dropOverride && dropOverride.asOf === data.asOf
      ? dropOverride.value
      : data.dropWebhooks;

  const selectedOrderId = useMemo(() => {
    if (
      manualSelectedOrderId &&
      (data.local_orders.some((o) => o.order_id === manualSelectedOrderId) ||
        data.drift.some((d) => d.order_id === manualSelectedOrderId))
    ) {
      return manualSelectedOrderId;
    }
    return data.local_orders[0]?.order_id ?? data.drift[0]?.order_id ?? null;
  }, [manualSelectedOrderId, data.local_orders, data.drift]);

  const selectedOrder = useMemo(
    () =>
      selectedOrderId
        ? (data.local_orders.find((o) => o.order_id === selectedOrderId) ?? null)
        : null,
    [data.local_orders, selectedOrderId],
  );

  const isSelectedDrifting = Boolean(
    selectedOrderId &&
      data.drift.some((d) => d.order_id === selectedOrderId) &&
      recentlyHealedOrderId !== selectedOrderId,
  );

  const { reports } = store;
  const saved = findReport(reports, store.activeId) ?? reports[0];
  const [initialState] = useState(() => reportState.withFiltersPanelFor('view', saved.state));
  const state = studioState ?? initialState;
  const studioData = useMemo(() => buildStudioData(data), [data]);
  const ai = useMemo(() => (aiModels?.length ? buildAi(aiModels) : undefined), [aiModels]);
  const tetherWidgets = useMemo(() => createTetherWidgets(), []);
  const studioContextValue = useMemo(
    () => ({
      data,
      selectedOrderId,
      recentlyHealedOrderId,
      onSelectOrder: setManualSelectedOrderId,
    }),
    [data, recentlyHealedOrderId, selectedOrderId],
  );

  useEffect(() => {
    return () => {
      if (healResetTimerRef.current != null) {
        window.clearTimeout(healResetTimerRef.current);
      }
    };
  }, []);

  const handleHealSucceeded = useCallback((outcome: { order_id: string }) => {
    setRecentlyHealedOrderId(outcome.order_id);
    if (healResetTimerRef.current != null) {
      window.clearTimeout(healResetTimerRef.current);
    }
    healResetTimerRef.current = window.setTimeout(() => {
      setRecentlyHealedOrderId(null);
      healResetTimerRef.current = null;
    }, 2400);
  }, []);

  // Whenever server data refreshes, update AG Studio's synchronous data sources and reload queries.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.setProperty('data', studioData);
    api.reload();
  }, [studioData]);

  const refreshAllData = useCallback(() => {
    router.refresh();
  }, [router]);

  // --- Driving Studio ---------------------------------------------------------------
  const load = (
    report: SavedReport,
    selectedPageId = report.state.selectedPageId,
    nextMode = mode,
  ) => {
    const api = apiRef.current;
    if (!api) return;
    api.setState(
      reportState.withFiltersPanelFor(nextMode, {
        ...report.state,
        selectedPageId,
      }),
    );
    api.clearHistory();
    setStudioState(api.getState());
    setHistory(NO_HISTORY);
    setMode(nextMode);
    update((current) => ({ ...current, activeId: report.id }));
  };
  const updateState = (next: (current: AgReportState) => AgReportState) => {
    const api = apiRef.current;
    if (api) api.setState(next(api.getState()));
  };
  const changeMode = (next: AgStudioMode) => {
    updateState((s) => reportState.withFiltersPanelFor(next, s));
    setMode(next);
  };

  // --- Saving -----------------------------------------------------------------------
  const save = () => {
    const api = apiRef.current;
    if (!api) return;
    const current = api.getState();
    editReport(saved.id, (report) => ({
      ...report,
      pageTitles: pageTitlesFor({ pageTitles: report.pageTitles, state: current }),
      state: current,
      updatedAt: new Date().toISOString(),
    }));
  };
  const discard = () =>
    load(saved, reportState.pageToSelect(saved.state, state.selectedPageId));
  const guard = (then: () => void) => {
    const api = apiRef.current;
    if (api && reportState.hasChanges(api.getState(), saved.state)) {
      setDialog({ kind: 'unsaved', then });
    } else then();
  };

  // --- Reports ----------------------------------------------------------------------
  const openReport = (id: string) => {
    const report = findReport(reports, id);
    if (report && id !== saved.id) guard(() => load(report));
  };
  const createReport = (name: string) => {
    const report = blankReport(name);
    update((current) => upsert(current, report));
    load(report, report.state.selectedPageId, 'edit');
  };
  const duplicateReport = (id: string) =>
    guard(() => {
      const source = findReport(reports, id);
      if (!source) return;
      const copy = copyOf(source);
      update((current) => upsert(current, copy));
      load(copy);
    });
  const resetDemo = () => {
    update(initialReports);
    load(defaultReport(), undefined, 'view');
  };
  const deleteReport = (report: SavedReport) => {
    update((current) => remove(current, report.id));
    if (report.id !== saved.id) return;
    const { reports: next, activeId } = latest();
    load(findReport(next, activeId) ?? next[0]);
  };
  const renameReport = (id: string, name: string) =>
    editReport(id, (report) => ({ ...report, name }));

  // --- Pages ------------------------------------------------------------------------
  const selectPage = (id: string, pageId: string) => {
    if (id === saved.id) updateState((s) => reportState.selectPage(s, pageId));
    else {
      const report = findReport(reports, id);
      if (report) guard(() => load(report, pageId));
    }
  };
  const addPage = () => {
    const id = newId('page');
    updateState((s) => reportState.addPage(s, id));
    if (mode !== 'edit') changeMode('edit');
    return id;
  };
  const removePage = (id: string) =>
    updateState((s) => reportState.removePage(s, id));
  const renamePage = (id: string, title: string) =>
    editReport(saved.id, (report) => ({
      ...report,
      pageTitles: { ...report.pageTitles, [id]: title },
    }));

  const editing = mode === 'edit';
  const pages = pagesFor({ pageTitles: saved.pageTitles, state });
  const activePage = state.pages.find((p) => p.id === state.selectedPageId);

  // Smooth inertial page wheel scrolling across the whole page, while letting hovered
  // overflowing grids (Local orders, Agent runs) scroll natively without requiring a click.
  useEffect(() => {
    const host = studioHostRef.current;
    const mainScroller = host?.closest<HTMLElement>('[data-main-scroll="true"]') ?? null;
    if (!mainScroller || editing) return;

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;

      const scroller = resolvePageScroller(mainScroller);
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 18
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? scroller.clientHeight * 0.85
            : 1;
      const dx = event.deltaX * unit;
      const dy = event.deltaY * unit;
      if (dx === 0 && dy === 0) return;

      const target = event.target as Element | null;
      const widget = target?.closest<HTMLElement>('.ag-studio-layout-widget') ?? null;

      if (widget && host?.contains(widget)) {
        if (isHoveredWidgetScrollable(widget, target, dx, dy)) {
          // Hovered table still has scroll room in this direction: scroll natively on hover
          return;
        }
      } else if (hasScrollableChildBefore(mainScroller, target, dx, dy)) {
        return;
      }

      const verticalDominant = Math.abs(dy) >= Math.abs(dx);
      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);

      // Preserve horizontal browser swipe gestures when page has no horizontal overflow
      if (!verticalDominant && maxLeft <= 0 && !widget) return;
      if (verticalDominant && maxTop <= 0 && !widget) return;

      event.preventDefault();
      if (widget) {
        event.stopPropagation();
      }

      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) {
        scroller.scrollBy({ top: dy, left: dx, behavior: 'auto' });
        return;
      }

      enqueueSmoothScroll(scroller, dx, dy);
    };

    mainScroller.addEventListener('wheel', onWheel, { capture: true, passive: false });

    return () => {
      mainScroller.removeEventListener('wheel', onWheel, true);
      stopSmoothScroll(mainScroller);
      stopSmoothScroll(document.scrollingElement);
    };
  }, [editing, state.selectedPageId]);

  useEffect(() => {
    const mainScroller = studioHostRef.current?.closest<HTMLElement>('[data-main-scroll="true"]');
    if (!mainScroller) return;
    stopSmoothScroll(mainScroller);
    stopSmoothScroll(document.scrollingElement);
    if (mainScroller.scrollTop > 0) {
      mainScroller.scrollTo({ top: 0 });
    }
  }, [state.selectedPageId]);

  const handleApiReady = useCallback((event: { api: AgStudioApi }) => {
    apiRef.current = event.api;
  }, []);

  const handleStudioReady = useCallback((event: { api: AgStudioApi }) => {
    const current = event.api.getState();
    setStudioState(current);
  }, []);

  const handleStateUpdated = useCallback(
    (event: { api: AgStudioApi; state: AgReportState }) => {
      const { undo, redo } = event.api.getHistory();
      setStudioState(event.state);
      setHistory({ canUndo: undo.length > 0, canRedo: redo.length > 0 });
    },
    [],
  );

  const maxTrack = Object.values(activePage?.widgetLayout ?? {}).reduce(
    (max, widgetPos) => (widgetPos ? Math.max(max, widgetPos.yTrack + widgetPos.ySpan) : max),
    0,
  );
  const studioMinHeight = Math.max(540, maxTrack * 18 + 40);
  const showReconciliationStrip = state.selectedPageId === 'health';
  const showPaypalNotice =
    Boolean(data.paypalStatus.error || data.paypalStatus.slow) &&
    dismissedNoticeAsOf !== data.asOf;

  return (
    <AppShell
      doctorDrawerOpen={doctorDrawerOpen}
      onCloseDoctorDrawer={() => setDoctorDrawerOpen(false)}
      doctorTriggerRef={doctorTriggerRef}
      topBar={
        <TopBar
          reports={reports}
          activeReport={saved}
          pages={pages}
          selectedPageId={state.selectedPageId}
          asOf={data.asOf}
          paypalSlow={data.paypalStatus.slow}
          paypalError={data.paypalStatus.error}
          dropWebhooks={dropWebhooks}
          localOrders={data.local_orders}
          editing={editing}
          ready={studioState !== null}
          pageIsEmpty={studioState !== null && !reportState.pageHasWidgets(state)}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onSelectPage={selectPage}
          onSelectReport={openReport}
          onAddPage={() => {
            if (apiRef.current) addPage();
          }}
          onNewReport={() => guard(() => setDialog({ kind: 'create' }))}
          onEditingChange={(next) =>
            next ? changeMode('edit') : guard(() => changeMode('view'))
          }
          onResetReport={() => setDialog({ kind: 'reset' })}
          onRenameReport={() => setDialog({ kind: 'rename-report', report: saved })}
          onDuplicateReport={() => duplicateReport(saved.id)}
          onDeleteReport={() => setDialog({ kind: 'delete', report: saved })}
          onRenamePage={(pageId, title) => {
            const targetId = pageId ?? state.selectedPageId;
            const targetTitle =
              title ?? pages.find((p) => p.id === targetId)?.title ?? 'Page';
            setDialog({ kind: 'rename-page', pageId: targetId, title: targetTitle });
          }}
          onRemovePage={() => removePage(state.selectedPageId)}
          onUndo={() => apiRef.current?.undo()}
          onRedo={() => apiRef.current?.redo()}
          onDiscard={discard}
          onSave={save}
          onFaultChanged={(drop) => {
            setDropOverride({ asOf: data.asOf, value: drop });
            router.refresh();
          }}
          onOrderMutated={refreshAllData}
          onRefreshStudio={() => apiRef.current?.reload()}
          openDriftCount={data.drift.length}
          doctorDrawerOpen={doctorDrawerOpen}
          onToggleDoctorDrawer={() => setDoctorDrawerOpen((open) => !open)}
          doctorTriggerRef={doctorTriggerRef}
        />
      }
      doctorPanel={
        <DoctorPanel
          initialDrift={data.drift}
          dropWebhooks={dropWebhooks}
          selectedOrder={selectedOrder}
          isSelectedDrifting={isSelectedDrifting}
          onHealSucceeded={handleHealSucceeded}
          onInvestigatingChange={setIsInvestigating}
          onHealedOrUpdated={refreshAllData}
          onCloseDrawer={() => {
            setDoctorDrawerOpen(false);
            requestAnimationFrame(() => doctorTriggerRef.current?.focus());
          }}
        />
      }
    >
      {showPaypalNotice && (
        <div className="flex items-center justify-between gap-2 px-4 pt-1 pb-2">
          <Badge tone="warning">
            {data.paypalStatus.error
              ? `PayPal sandbox slow or unreachable (${data.paypalStatus.error}). Local SQLite loaded; click refresh to retry.`
              : 'PayPal sandbox responded slowly (>4s). Live data loaded.'}
          </Badge>
          <button
            type="button"
            aria-label="Dismiss sandbox status notice"
            onClick={() => setDismissedNoticeAsOf(data.asOf)}
            className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            <X className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      )}

      {showReconciliationStrip && (
        <div className="grid grid-cols-1 gap-4 px-4 pt-0 lg:grid-cols-[minmax(240px,288px)_minmax(0,1fr)]">
          <MoneyBox
            drift={data.drift}
            selectedOrder={selectedOrder}
            totalOrders={data.local_orders.length}
            recentlyHealedOrderId={recentlyHealedOrderId}
          />
          <ReconciliationStrip
            drift={data.drift}
            localOrders={data.local_orders}
            webhookEvents={data.webhook_events}
            paypalStatus={data.paypalStatus}
            selectedOrderId={selectedOrderId}
            recentlyHealedOrderId={recentlyHealedOrderId}
            isChecking={isInvestigating}
          />
        </div>
      )}

      <div
        ref={studioHostRef}
        className={`ag-studio-host min-w-0 ${
          editing
            ? 'flex-1'
            : `shrink-0 pb-4 ${!showReconciliationStrip && !showPaypalNotice ? 'sm:-mt-4' : ''}`
        }`}
        style={{ '--studio-min-h': `${studioMinHeight}px` } as CSSProperties}
      >
        {hasData(data) ? (
          <TetherStudioContext.Provider value={studioContextValue}>
            <AgStudioProvider
              licenseKey={licenseKey}
              modules={ai ? STUDIO_AI_MODULES : undefined}
            >
              <AgStudio
                style={editing ? STUDIO_EDIT_STYLE : STUDIO_VIEW_STYLE}
                theme={agStudioTetherTheme}
                widgets={tetherWidgets}
                localeText={STUDIO_LOCALE_TEXT}
                layout={STUDIO_LAYOUT}
                panels={STUDIO_PANELS}
                data={studioData}
                ai={ai}
                initialState={initialState}
                mode={mode}
                onApiReady={handleApiReady}
                onStudioReady={handleStudioReady}
                onStateUpdated={handleStateUpdated}
              />
            </AgStudioProvider>
          </TetherStudioContext.Provider>
        ) : (
          <EmptyData />
        )}
      </div>

      <UnsavedChangesDialog
        open={dialog?.kind === 'unsaved'}
        reportName={saved.name}
        onCancel={() => setDialog(null)}
        onDiscard={() => {
          discard();
          if (dialog?.kind === 'unsaved') dialog.then();
          setDialog(null);
        }}
        onSave={() => {
          save();
          if (dialog?.kind === 'unsaved') dialog.then();
          setDialog(null);
        }}
      />
      <CreateReportDialog
        open={dialog?.kind === 'create'}
        onClose={() => setDialog(null)}
        onCreate={(name) => {
          setDialog(null);
          createReport(name);
        }}
      />
      <RenameDialog
        open={dialog?.kind === 'rename-report' || dialog?.kind === 'rename-page'}
        title={dialog?.kind === 'rename-page' ? 'Rename page' : 'Rename report'}
        label={dialog?.kind === 'rename-page' ? 'Page name' : 'Report name'}
        initialValue={
          dialog?.kind === 'rename-report'
            ? dialog.report.name
            : dialog?.kind === 'rename-page'
              ? dialog.title
              : ''
        }
        onClose={() => setDialog(null)}
        onSave={(value) => {
          if (dialog?.kind === 'rename-report') {
            renameReport(dialog.report.id, value);
          } else if (dialog?.kind === 'rename-page') {
            renamePage(dialog.pageId, value);
          }
          setDialog(null);
        }}
      />
      <DeleteReportDialog
        report={dialog?.kind === 'delete' ? dialog.report : null}
        onCancel={() => setDialog(null)}
        onConfirm={(report) => {
          deleteReport(report);
          setDialog(null);
        }}
      />
      <ResetDemoDialog
        open={dialog?.kind === 'reset'}
        builtInName={defaultReport().name}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          resetDemo();
          setDialog(null);
        }}
      />
    </AppShell>
  );
}
