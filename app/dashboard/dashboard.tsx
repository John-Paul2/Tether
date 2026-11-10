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
import { DemoControlsPanel } from './components/demo-controls';
import {
  CreateReportDialog,
  DeleteReportDialog,
  ResetDemoDialog,
  UnsavedChangesDialog,
  type DashboardDialog,
} from './components/dialogs';
import { DoctorPanel } from './components/doctor-panel';
import { EmptyData } from './components/empty-data';
import { ReportHeader } from './components/report-header';
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
import { ReportsSidebar } from './components/sidebar';
import { ContentSkeleton, SidebarSkeleton } from './components/skeleton';
import * as reportState from './report-state';
import { buildAi } from './studio/ai';
import { buildStudioData, hasData } from './studio/data';
import { agStudioTetherTheme } from './studio/theme';
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
  return inBrowser ? (
    <ReportsDashboard {...props} />
  ) : (
    <AppShell
      sidebar={<SidebarSkeleton />}
      doctorPanel={
        <DoctorPanel
          initialDrift={props.data.drift}
          dropWebhooks={props.data.dropWebhooks}
          onHealedOrUpdated={() => {}}
        />
      }
    >
      <DemoControlsPanel
        dropWebhooks={props.data.dropWebhooks}
        localOrders={props.data.local_orders}
        onFaultChanged={() => {}}
        onOrderMutated={() => {}}
      />
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

  const [dropOverride, setDropOverride] = useState<{
    asOf: string;
    value: boolean;
  } | null>(null);

  const dropWebhooks =
    dropOverride && dropOverride.asOf === data.asOf
      ? dropOverride.value
      : data.dropWebhooks;

  const { reports } = store;
  const saved = findReport(reports, store.activeId) ?? reports[0];
  const [initialState] = useState(() => reportState.withFiltersPanelFor('view', saved.state));
  const state = studioState ?? initialState;
  const studioData = useMemo(() => buildStudioData(data), [data]);
  const ai = useMemo(() => (aiModels?.length ? buildAi(aiModels) : undefined), [aiModels]);

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
  const studioMinHeight = Math.max(640, maxTrack * 18 + 48);

  return (
    <AppShell
      sidebar={
        <ReportsSidebar
          reports={reports}
          activeId={saved.id}
          activePages={pages}
          selectedPageId={state.selectedPageId}
          editing={editing}
          ready={studioState !== null}
          onSelectReport={openReport}
          onSelectPage={selectPage}
          onAddPage={() => (apiRef.current ? addPage() : undefined)}
          onRemovePage={removePage}
          onRenamePage={renamePage}
          onRenameReport={renameReport}
          onCreate={() => guard(() => setDialog({ kind: 'create' }))}
          onDuplicate={duplicateReport}
          onDelete={(id) => {
            const report = findReport(reports, id);
            if (report) setDialog({ kind: 'delete', report });
          }}
          onReset={() => setDialog({ kind: 'reset' })}
        />
      }
      doctorPanel={
        <DoctorPanel
          initialDrift={data.drift}
          dropWebhooks={dropWebhooks}
          onHealedOrUpdated={() => {
            router.refresh();
          }}
        />
      }
    >
      <ReportHeader
        reportName={saved.name}
        pageTitle={pages.find((p) => p.id === state.selectedPageId)?.title}
        asOf={data.asOf}
        paypalSlow={data.paypalStatus.slow}
        paypalError={data.paypalStatus.error}
        editing={editing}
        pageIsEmpty={studioState !== null && !reportState.pageHasWidgets(state)}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={() => apiRef.current?.undo()}
        onRedo={() => apiRef.current?.redo()}
        onSave={save}
        onDiscard={discard}
        onEditingChange={(next) =>
          next ? changeMode('edit') : guard(() => changeMode('view'))
        }
      />

      <DemoControlsPanel
        dropWebhooks={dropWebhooks}
        localOrders={data.local_orders}
        onFaultChanged={(drop) => {
          setDropOverride({ asOf: data.asOf, value: drop });
          router.refresh();
        }}
        onOrderMutated={refreshAllData}
      />

      <div
        className="ag-studio-host flex-1 min-w-0"
        style={{ '--studio-min-h': `${studioMinHeight}px` } as CSSProperties}
      >
        {hasData(data) ? (
          <AgStudioProvider licenseKey={licenseKey} modules={ai ? [AgStudioAiModule] : undefined}>
            <AgStudio
              style={{ height: '100%', width: '100%' }}
              theme={agStudioTetherTheme}
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
