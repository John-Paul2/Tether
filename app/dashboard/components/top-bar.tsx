'use client';

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  Anchor,
  Check,
  Eye,
  Redo2,
  RefreshCw,
  Settings,
  Undo2,
  X,
} from 'lucide-react';
import type { TetherLocalOrderRow } from '@/lib/tether-data';
import type { ReportPage } from '../page-titles';
import type { SavedReport } from '../reports-store';
import { DemoControlsPanel } from './demo-controls';
import { Badge, Button, IconButton, MenuDivider, MenuItem } from './ui/ui';

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

const GLASS_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 32,
  mass: 0.85,
};

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

  const [demoOpen, setDemoOpen] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const settingsRestoreFocusRef = useRef(false);
  const prevSettingsOpenRef = useRef(false);

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const multipleReports = reports.length > 1;
  const activePageTitle = pages.find((p) => p.id === selectedPageId)?.title;
  const hasDrift = openDriftCount > 0;

  const handleRefresh = () => {
    startRefresh(() => {
      router.refresh();
      onRefreshStudio?.();
    });
  };

  // Return keyboard focus cleanly once the Settings pill trigger re-mounts after exit
  useEffect(() => {
    const wasOpen = prevSettingsOpenRef.current;
    prevSettingsOpenRef.current = settingsOpen;
    if (wasOpen && !settingsOpen && settingsRestoreFocusRef.current) {
      settingsRestoreFocusRef.current = false;
      requestAnimationFrame(() => settingsTriggerRef.current?.focus());
    }
  }, [settingsOpen]);

  // Settings menu keyboard navigation (ArrowDown/ArrowUp/Home/End/Escape) & outside dismiss
  useEffect(() => {
    if (!settingsOpen) return;

    const getItems = () =>
      Array.from(
        settingsMenuRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]:not([disabled])',
        ) ?? [],
      );

    const raf = requestAnimationFrame(() => {
      getItems()[0]?.focus();
    });

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !settingsMenuRef.current?.contains(target) &&
        !settingsTriggerRef.current?.contains(target)
      ) {
        settingsRestoreFocusRef.current = false;
        setSettingsOpen(false);
      }
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        settingsRestoreFocusRef.current = true;
        setSettingsOpen(false);
        return;
      }
      const list = getItems();
      if (list.length === 0) return;
      const idx = list.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        list[(idx + 1) % list.length]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        list[(idx - 1 + list.length) % list.length]?.focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        list[0]?.focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        list[list.length - 1]?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [settingsOpen]);

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

  const closeSettingsMenu = (restoreFocus: boolean) => {
    settingsRestoreFocusRef.current = restoreFocus;
    setSettingsOpen(false);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30">
      <header className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-5 sm:px-6 sm:pt-6 md:grid md:grid-cols-[1fr_auto_1fr]">
        {/* Left side: Fixed floating Tether logo + wordmark */}
        <div className="pointer-events-auto flex w-fit shrink-0 items-center gap-2.5 md:justify-self-start">
          <span
            className="tether-glass-pill inline-flex size-8 items-center justify-center rounded-[var(--radius-input)] text-accent"
            aria-hidden
          >
            <Anchor className="size-4" strokeWidth={1.5} />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-fg">
            Tether
          </span>
        </div>

        {/* Center: Floating frosted glass pill navbar (Health & Incidents only) + clickable Doctor status pill */}
        <div className="order-3 flex w-full flex-wrap items-center justify-center gap-2.5 md:order-2 md:w-auto md:justify-self-center">
          <nav
            aria-label="Report navigation"
            className="tether-glass-nav pointer-events-auto inline-flex max-w-full items-center rounded-full px-1.5 py-1"
          >
            <div
              role="tablist"
              aria-label="Pages"
              className="flex items-center gap-0.5"
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
                    className={`relative cursor-pointer rounded-full px-3.5 py-1 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected ? 'text-fg' : 'text-fg-2 hover:text-fg'
                    }`}
                  >
                    {selected && (
                      <motion.span
                        layoutId="tether-nav-active-pill"
                        aria-hidden
                        transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                        className="absolute inset-0 rounded-full border border-accent/40 bg-[var(--glass-pill-active)]"
                      />
                    )}
                    <span className="relative z-10">{page.title}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {onToggleDoctorDrawer && (
            <button
              ref={doctorTriggerRef}
              type="button"
              data-testid="doctor-status-toggle"
              aria-expanded={doctorDrawerOpen}
              aria-controls="doctor-drawer-aside"
              aria-haspopup="dialog"
              title={doctorDrawerOpen ? 'Hide Doctor panel' : 'Open Doctor panel'}
              aria-label={
                hasDrift
                  ? `Toggle Doctor panel (${openDriftCount} open drift)`
                  : 'Toggle Doctor panel (In sync)'
              }
              onClick={onToggleDoctorDrawer}
              className={`tether-glass-pill pointer-events-auto inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-2 rounded-full px-3.5 text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                hasDrift
                  ? doctorDrawerOpen
                    ? 'border-drift bg-drift-soft text-drift'
                    : 'border-drift/55 bg-drift-soft/70 text-drift hover:border-drift'
                  : doctorDrawerOpen
                    ? 'border-sync/70 bg-sync-soft text-sync'
                    : 'text-sync hover:border-sync/55 hover:bg-sync-soft/60'
              }`}
            >
              <span
                className={`size-2 shrink-0 rounded-full ${
                  hasDrift ? 'bg-drift tether-drift-glow' : 'bg-sync'
                }`}
                aria-hidden
              />
              <span className="whitespace-nowrap">
                {hasDrift ? `${openDriftCount} open` : 'In sync'}
              </span>
            </button>
          )}
        </div>

        {/* Right side: standalone DEMO pill icon button, standalone Settings pill icon button */}
        <div className="pointer-events-auto order-2 flex shrink-0 items-center gap-2 md:order-3 md:justify-self-end">
          {/* Standalone DEMO pill button -> morphs cleanly into top frosted DEMO menu */}
          <DemoControlsPanel
            dropWebhooks={dropWebhooks}
            localOrders={localOrders}
            onFaultChanged={onFaultChanged}
            onOrderMutated={onOrderMutated}
            disabled={!ready}
            open={demoOpen}
            onOpenChange={(next) => {
              if (next) {
                setSettingsOpen(false);
              }
              setDemoOpen(next);
            }}
          />

          {/* Standalone Settings pill icon button -> morphs cleanly into top frosted Settings menu */}
          <div className="relative">
            {!settingsOpen ? (
              <motion.button
                layoutId="tether-settings-surface"
                ref={settingsTriggerRef}
                type="button"
                aria-label="Report settings"
                title="Report settings"
                aria-haspopup="menu"
                aria-expanded={false}
                disabled={!ready}
                style={{ borderRadius: 999 }}
                transition={GLASS_SPRING}
                onClick={() => {
                  setDemoOpen(false);
                  setSettingsOpen(true);
                }}
                className="tether-glass-pill inline-flex h-9 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Settings className="size-4" strokeWidth={1.5} aria-hidden />
              </motion.button>
            ) : (
              /* Invisible spacer prevents any layout jump while Settings menu floats on top */
              <span
                aria-hidden
                className="pointer-events-none invisible inline-flex h-9 w-11 shrink-0 select-none"
              />
            )}

            <AnimatePresence>
              {settingsOpen && (
                <motion.div
                  ref={settingsMenuRef}
                  role="menu"
                  aria-label="Report settings"
                  layoutId="tether-settings-surface"
                  style={{ borderRadius: 16 }}
                  transition={GLASS_SPRING}
                  className="tether-glass-menu fixed right-3 top-5 z-50 w-64 overflow-hidden text-fg sm:right-6 sm:top-6"
                >
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16, delay: 0.04 }}
                  >
                    {/* Header bar inside frosted Settings overlay */}
                    <div className="flex items-center justify-between gap-2 border-b border-[var(--glass-border)] px-3.5 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`size-2 shrink-0 rounded-full ${
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
                        <span className="truncate text-xs font-semibold text-fg">Settings</span>
                        <span
                          className="truncate text-[11px] text-fg-3 tabular-nums"
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
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Refresh data"
                          title="Refresh data"
                          disabled={refreshing || !ready}
                          onClick={handleRefresh}
                          className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-raised/70 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45"
                        >
                          <RefreshCw
                            className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`}
                            strokeWidth={1.5}
                            aria-hidden
                          />
                        </button>
                        <button
                          type="button"
                          aria-label="Close settings menu"
                          onClick={() => closeSettingsMenu(true)}
                          className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-raised/70 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          <X className="size-3.5" strokeWidth={1.5} aria-hidden />
                        </button>
                      </div>
                    </div>

                    <div className="py-1.5">
                      <MenuItem
                        onClick={() => {
                          closeSettingsMenu(false);
                          onAddPage();
                        }}
                      >
                        Add page
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          closeSettingsMenu(false);
                          onNewReport();
                        }}
                      >
                        New report
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          closeSettingsMenu(false);
                          onEditingChange(!editing);
                        }}
                      >
                        {editing ? 'View report' : 'Edit report'}
                      </MenuItem>
                      <MenuItem
                        danger
                        onClick={() => {
                          closeSettingsMenu(false);
                          onResetReport();
                        }}
                      >
                        Reset report
                      </MenuItem>

                      {multipleReports && (
                        <>
                          <MenuDivider />
                          <div className="px-3.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-3">
                            Reports
                          </div>
                          {reports.map((report) => {
                            const isCurrent = report.id === activeReport.id;
                            return (
                              <MenuItem
                                key={report.id}
                                aria-checked={isCurrent}
                                onClick={() => {
                                  closeSettingsMenu(false);
                                  onSelectReport(report.id);
                                }}
                              >
                                <span className="truncate">{report.name}</span>
                                {isCurrent && (
                                  <Check className="size-4 shrink-0 text-accent" strokeWidth={1.5} />
                                )}
                              </MenuItem>
                            );
                          })}
                        </>
                      )}

                      <MenuDivider />

                      <MenuItem
                        onClick={() => {
                          closeSettingsMenu(false);
                          onRenameReport();
                        }}
                      >
                        Rename report
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          closeSettingsMenu(false);
                          onDuplicateReport();
                        }}
                      >
                        Duplicate report
                      </MenuItem>
                      {!activeReport.builtIn && (
                        <MenuItem
                          danger
                          onClick={() => {
                            closeSettingsMenu(false);
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
                              closeSettingsMenu(false);
                              onRenamePage();
                            }}
                          >
                            Rename page
                          </MenuItem>
                          <MenuItem
                            danger
                            disabled={pages.length <= 1}
                            onClick={() => {
                              closeSettingsMenu(false);
                              onRemovePage();
                            }}
                          >
                            Remove page
                          </MenuItem>
                        </>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Floating contextual edit pill bar: shown only while editing a report */}
      {editing && (
        <div className="pointer-events-auto mx-auto mt-2 flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center justify-between gap-3 rounded-full px-4 py-1.5 text-xs tether-glass-menu">
          <div className="flex flex-wrap items-center gap-2 text-fg-2">
            <Badge tone="info">Editing</Badge>
            <span className="font-medium text-fg">
              {activeReport.name}
              {activePageTitle ? ` · ${activePageTitle}` : ''}
            </span>
            {pageIsEmpty && (
              <span className="hidden text-fg-3 sm:inline">
                Drag a widget from <strong className="text-fg-2">Compose</strong> to get started.
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <IconButton label="Undo" disabled={!canUndo} onClick={onUndo}>
              <Undo2 className="size-4" strokeWidth={1.5} />
            </IconButton>
            <IconButton label="Redo" disabled={!canRedo} onClick={onRedo}>
              <Redo2 className="size-4" strokeWidth={1.5} />
            </IconButton>
            <span className="mx-1 h-4 w-px bg-line" aria-hidden />
            <Button variant="secondary" size="sm" onClick={onDiscard}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={onSave}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEditingChange(false)}>
              <Eye className="size-4" strokeWidth={1.5} />
              View
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}