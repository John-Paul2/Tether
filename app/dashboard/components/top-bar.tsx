'use client';

import { useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import type { TetherLocalOrderRow } from '@/lib/tether-data';
import type { ReportPage } from '../page-titles';
import type { SavedReport } from '../reports-store';
import { DemoControlsPanel } from './demo-controls';
import {
  AnchorIcon,
  CheckIcon,
  EyeIcon,
  RedoIcon,
  RefreshIcon,
  SettingsIcon,
  StethoscopeIcon,
  UndoIcon,
} from './ui/icons';
import { Badge, Button, IconButton, Menu, MenuDivider, MenuItem } from './ui/ui';

const MINUTE_MS = 60_000;
let currentNow = 0;
const subscribeNow = (listener: () => void) => {
  currentNow = Date.now();
  const id = setInterval(() => {
    currentNow = Date.now();
    listener();
  }, 30_000);
  return () => clearInterval(id);
};

function relativeTime(iso: string, at: number) {
  const minutes = Math.floor((at - Date.parse(iso)) / MINUTE_MS);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : new Date(iso).toLocaleDateString('en-GB');
}

export type TopBarProps = {
  reports: SavedReport[];
  activeReport: SavedReport;
  pages: ReportPage[];
  selectedPageId: string;
  asOf: string;
  paypalSlow?: boolean;
  paypalError?: string | null;
  dropWebhooks: boolean;
  localOrders: TetherLocalOrderRow[];
  editing: boolean;
  ready: boolean;
  pageIsEmpty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSelectPage: (reportId: string, pageId: string) => void;
  onSelectReport: (id: string) => void;
  onAddPage: () => void;
  onNewReport: () => void;
  onEditingChange: (editing: boolean) => void;
  onResetReport: () => void;
  onRenameReport: () => void;
  onDuplicateReport: () => void;
  onDeleteReport: () => void;
  onRenamePage: (pageId?: string, title?: string) => void;
  onRemovePage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onFaultChanged: (drop: boolean) => void;
  onOrderMutated: () => void;
  onRefreshStudio?: () => void;
  openDriftCount?: number;
  doctorDrawerOpen?: boolean;
  onToggleDoctorDrawer?: () => void;
  doctorTriggerRef?: RefObject<HTMLButtonElement | null>;
};

export function TopBar({
  reports,
  activeReport,
  pages,
  selectedPageId,
  asOf,
  paypalSlow,
  paypalError,
  dropWebhooks,
  localOrders,
  editing,
  ready,
  pageIsEmpty,
  canUndo,
  canRedo,
  onSelectPage,
  onSelectReport,
  onAddPage,
  onNewReport,
  onEditingChange,
  onResetReport,
  onRenameReport,
  onDuplicateReport,
  onDeleteReport,
  onRenamePage,
  onRemovePage,
  onUndo,
  onRedo,
  onDiscard,
  onSave,
  onFaultChanged,
  onOrderMutated,
  onRefreshStudio,
  openDriftCount = 0,
  doctorDrawerOpen = false,
  onToggleDoctorDrawer,
  doctorTriggerRef,
}: TopBarProps) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const at = useSyncExternalStore(subscribeNow, () => currentNow, () => 0);

  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const reportTriggerRef = useRef<HTMLButtonElement>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const multipleReports = reports.length > 1;
  const activePageTitle = pages.find((p) => p.id === selectedPageId)?.title;

  const handleRefresh = () => {
    startRefresh(() => {
      router.refresh();
      onRefreshStudio?.();
    });
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (pages.length <= 1) return;
    let nextIndex = -1;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % pages.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + pages.length) % pages.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = pages.length - 1;

    if (nextIndex >= 0) {
      event.preventDefault();
      const nextPage = pages[nextIndex];
      onSelectPage(activeReport.id, nextPage.id);
      tabRefs.current[nextPage.id]?.focus();
    }
  };

  return (
    <div className="shrink-0 bg-surface">
      <header className="relative flex min-h-[var(--topbar-height)] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        {/* Left cluster: Logo & name | Page tabs | Report name */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          {/* Logo and name */}
          <div className="flex shrink-0 items-center gap-2.5">
            <span
              className="inline-flex size-8 items-center justify-center rounded-[var(--radius-input)] border border-line-strong bg-raised text-accent"
              aria-hidden
            >
              <AnchorIcon className="size-4" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-fg">
              Tether
            </span>
          </div>

          <span className="hidden h-5 w-px bg-line sm:inline-block" aria-hidden />

          {/* Dynamic page tabs from report in page order */}
          <nav aria-label="Report pages" className="min-w-0">
            <div
              role="tablist"
              aria-label="Pages"
              className="flex items-center gap-1 border-b border-transparent"
            >
              {pages.map((page, index) => {
                const selected = page.id === selectedPageId;
                return (
                  <button
                    key={page.id}
                    ref={(el) => {
                      tabRefs.current[page.id] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    disabled={!ready}
                    onClick={() => onSelectPage(activeReport.id, page.id)}
                    onDoubleClick={() => {
                      if (editing) onRenamePage(page.id, page.title);
                    }}
                    title={editing ? 'Double-click to rename' : undefined}
                    onKeyDown={(e) => handleTabKeyDown(e, index)}
                    className={`relative cursor-pointer whitespace-nowrap px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected
                        ? 'text-fg'
                        : 'text-fg-2 hover:text-fg'
                    }`}
                  >
                    {page.title}
                    {selected && (
                      <span
                        aria-hidden
                        className="absolute inset-x-2 -bottom-0.5 h-[2px] rounded-full bg-accent"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          <span className="hidden h-5 w-px bg-line md:inline-block" aria-hidden />

          {/* Report name: plain text; if more than one report exists, clicking switches report */}
          <div className="relative min-w-0">
            {multipleReports ? (
              <>
                <button
                  ref={reportTriggerRef}
                  type="button"
                  disabled={!ready}
                  aria-haspopup="menu"
                  aria-expanded={reportMenuOpen}
                  title="Switch report"
                  onClick={() => setReportMenuOpen((v) => !v)}
                  className="cursor-pointer truncate rounded-[var(--radius-input)] px-1.5 py-1 text-sm font-normal text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {activeReport.name}
                </button>
                <Menu
                  open={reportMenuOpen}
                  onClose={() => setReportMenuOpen(false)}
                  triggerRef={reportTriggerRef}
                  align="left"
                  label="Switch report"
                >
                  {reports.map((report) => {
                    const isCurrent = report.id === activeReport.id;
                    return (
                      <MenuItem
                        key={report.id}
                        aria-checked={isCurrent}
                        onClick={() => {
                          setReportMenuOpen(false);
                          onSelectReport(report.id);
                        }}
                      >
                        <span className="truncate">{report.name}</span>
                        {isCurrent && <CheckIcon className="size-4 shrink-0 text-accent" />}
                      </MenuItem>
                    );
                  })}
                </Menu>
              </>
            ) : (
              <span className="block truncate px-1 text-sm font-normal text-fg-2">
                {activeReport.name}
              </span>
            )}
          </div>
        </div>

        {/* Right cluster: Freshness & refresh | DEMO popover button | Settings menu */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 text-xs text-fg-3 lg:flex">
            <span
              className={`size-2 rounded-full ${
                paypalError ? 'bg-drift' : paypalSlow ? 'bg-warn' : 'bg-sync'
              }`}
              title={
                paypalError
                  ? `PayPal sandbox unreachable: ${paypalError}`
                  : paypalSlow
                    ? 'PayPal sandbox slow'
                    : 'PayPal sandbox & local SQLite connected'
              }
              aria-hidden
            />
            <span
              className="tabular-nums"
              suppressHydrationWarning
              title={`PayPal sandbox & local SQLite · ${new Date(asOf).toLocaleString('en-GB')}`}
            >
              {refreshing
                ? 'Refreshing…'
                : at
                  ? relativeTime(asOf, at)
                  : new Date(asOf).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
            </span>
          </div>

          <IconButton
            label="Refresh data"
            disabled={refreshing || !ready}
            onClick={handleRefresh}
          >
            <RefreshIcon className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
          </IconButton>

          {onToggleDoctorDrawer && (
            <button
              ref={doctorTriggerRef}
              type="button"
              aria-expanded={doctorDrawerOpen}
              aria-controls="doctor-drawer-aside"
              aria-haspopup="dialog"
              aria-label={
                openDriftCount > 0
                  ? `Open Doctor panel (${openDriftCount} open drift)`
                  : 'Open Doctor panel'
              }
              onClick={onToggleDoctorDrawer}
              className={`xl:hidden inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                doctorDrawerOpen
                  ? 'border-accent bg-ai-soft text-accent'
                  : 'border-accent/55 bg-ai-soft/70 text-accent hover:border-accent hover:bg-ai-soft'
              }`}
            >
              <StethoscopeIcon className="size-3.5 shrink-0" />
              <span>Doctor</span>
              {openDriftCount > 0 && (
                <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-drift-soft px-1.5 font-mono text-[11px] font-semibold text-drift tabular-nums">
                  {openDriftCount}
                </span>
              )}
            </button>
          )}

          <DemoControlsPanel
            dropWebhooks={dropWebhooks}
            localOrders={localOrders}
            onFaultChanged={onFaultChanged}
            onOrderMutated={onOrderMutated}
            disabled={!ready}
          />

          <div className="relative">
            <IconButton
              ref={settingsTriggerRef}
              label="Report settings"
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
              disabled={!ready}
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <SettingsIcon className="size-4" />
            </IconButton>
            <Menu
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              triggerRef={settingsTriggerRef}
              align="right"
              label="Report settings"
            >
              <MenuItem
                onClick={() => {
                  setSettingsOpen(false);
                  onAddPage();
                }}
              >
                Add page
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setSettingsOpen(false);
                  onNewReport();
                }}
              >
                New report
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setSettingsOpen(false);
                  onEditingChange(!editing);
                }}
              >
                {editing ? 'View report' : 'Edit report'}
              </MenuItem>
              <MenuItem
                danger
                onClick={() => {
                  setSettingsOpen(false);
                  onResetReport();
                }}
              >
                Reset report
              </MenuItem>

              <MenuDivider />

              <MenuItem
                onClick={() => {
                  setSettingsOpen(false);
                  onRenameReport();
                }}
              >
                Rename report
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setSettingsOpen(false);
                  onDuplicateReport();
                }}
              >
                Duplicate report
              </MenuItem>
              {!activeReport.builtIn && (
                <MenuItem
                  danger
                  onClick={() => {
                    setSettingsOpen(false);
                    onDeleteReport();
                  }}
                >
                  Delete report
                </MenuItem>
              )}

              {editing && (
                <>
                  <MenuDivider />
                  <MenuItem
                    onClick={() => {
                      setSettingsOpen(false);
                      onRenamePage();
                    }}
                  >
                    Rename page
                  </MenuItem>
                  <MenuItem
                    danger
                    disabled={pages.length <= 1}
                    onClick={() => {
                      setSettingsOpen(false);
                      onRemovePage();
                    }}
                  >
                    Remove page
                  </MenuItem>
                </>
              )}
            </Menu>
          </div>
        </div>
      </header>

      {/* 1.5px filament divider under header (design spec section 1) */}
      <div
        aria-hidden
        className="h-[1.5px] w-full opacity-60"
        style={{ backgroundImage: 'var(--filament-gradient)' }}
      />

      {/* PayPal slow/error notice when triggered */}
      {(paypalError || paypalSlow) && (
        <div className="flex items-center justify-between gap-2 border-b border-line bg-sunken px-4 py-1.5 sm:px-6">
          <Badge tone="warning">
            {paypalError
              ? `PayPal sandbox slow or unreachable (${paypalError}). Local SQLite loaded; click refresh to retry.`
              : 'PayPal sandbox responded slowly (>4s). Live data loaded.'}
          </Badge>
        </div>
      )}

      {/* Contextual edit toolbar: shown only while editing a report */}
      {editing && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-sunken px-4 py-2 text-xs sm:px-6">
          <div className="flex flex-wrap items-center gap-2 text-fg-2">
            <Badge tone="info">Editing</Badge>
            <span className="font-medium text-fg">
              {activeReport.name}
              {activePageTitle ? ` · ${activePageTitle}` : ''}
            </span>
            {pageIsEmpty && (
              <span className="text-fg-3">
                Drag a widget from <strong className="text-fg-2">Compose</strong> to get started.
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <IconButton label="Undo" disabled={!canUndo} onClick={onUndo}>
              <UndoIcon className="size-4" />
            </IconButton>
            <IconButton label="Redo" disabled={!canRedo} onClick={onRedo}>
              <RedoIcon className="size-4" />
            </IconButton>
            <span className="mx-1 h-4 w-px bg-line" aria-hidden />
            <Button variant="secondary" size="sm" onClick={onDiscard}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={onSave}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEditingChange(false)}>
              <EyeIcon className="size-4" />
              View
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
