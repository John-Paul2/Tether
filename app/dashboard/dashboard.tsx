'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
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

export function Dashboard(props: DashboardProps) {
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (inBrowser) {
    return <ReportsDashboard {...props} />;
  }

  const fallbackReport = defaultReport();
  const fallbackPages = pagesFor(fallbackReport);
  const initialSelectedOrder = props.data.local_orders[0] ?? null;
  const initialSelectedDrifting = Boolean(
    initialSelectedOrder && props.data.drift.some((d) => d.order_id === initialSelectedOrder.order_id),
  );

  return (
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
        />
      }
      doctorPanel={
        <DoctorPanel
          initialDrift={props.data.drift}
          dropWebhooks={props.data.dropWebhooks}
          selectedOrder={initialSelectedOrder}
          isSelectedDrifting={initialSelectedDrifting}
          onHealedOrUpdated={() => {}}
        />
      }
    >
      <ContentSkeleton />
    </AppShell>
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
  const [manualSelectedOrderId, setManualSelectedOrderId] = useState<string | null>(null);
  const [recentlyHealedOrderId, setRecentlyHealedOrderId] = useState<string | null>(null);
  const healResetTimerRef = useRef<number | null>(null);

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
      onSelectOrder: setManualSelectedOrderId,
    }),
    [data, selectedOrderId],
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
  const maxTrack = Object.values(activePage?.widgetLayout ?? {}).reduce(
    (max, widgetPos) => (widgetPos ? Math.max(max, widgetPos.yTrack + widgetPos.ySpan) : max),
    0,
  );
  const studioMinHeight = Math.max(540, maxTrack * 18 + 32);
  const showReconciliationStrip = state.selectedPageId === 'health';

  return (
    <AppShell
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
        />
      }
      doctorPanel={
        <DoctorPanel
          initialDrift={data.drift}
          dropWebhooks={dropWebhooks}
          selectedOrder={selectedOrder}
          isSelectedDrifting={isSelectedDrifting}
          onHealSucceeded={handleHealSucceeded}
          onHealedOrUpdated={() => {
            router.refresh();
          }}
        />
      }
    >
      {showReconciliationStrip && (
        <div className="grid grid-cols-1 gap-4 px-4 pt-4 lg:grid-cols-[minmax(240px,288px)_minmax(0,1fr)]">
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
          />
        </div>
      )}

      <div
        className="ag-studio-host flex-1 min-w-0"
        style={{ '--studio-min-h': `${studioMinHeight}px` } as CSSProperties}
      >
        {hasData(data) ? (
          <TetherStudioContext.Provider value={studioContextValue}>
            <AgStudioProvider licenseKey={licenseKey} modules={ai ? [AgStudioAiModule] : undefined}>
              <AgStudio
                style={{ height: '100%', width: '100%' }}
                theme={agStudioTetherTheme}
                widgets={tetherWidgets}
                localeText={{ widgetOverlayNoData: 'Not enough data yet.' }}
                layout={{ widgetBorderEnabled: true, minWidth: 320 }}
                panels={{
                  view: { left: [], right: [] },
                  edit: { left: ['ai'], right: ['filters', 'edit', 'data'] },
                }}
                data={studioData}
                ai={ai}
                initialState={initialState}
                mode={mode}
                onApiReady={(event) => {
                  apiRef.current = event.api;
                }}
                onStudioReady={(event) => {
                  const current = event.api.getState();
                  setStudioState(current);
                }}
                onStateUpdated={(event) => {
                  const { undo, redo } = event.api.getHistory();
                  setStudioState(event.state);
                  setHistory({ canUndo: undo.length > 0, canRedo: redo.length > 0 });
                }}
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
