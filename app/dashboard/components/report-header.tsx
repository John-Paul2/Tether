'use client';

import { useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EditIcon, EyeIcon, RedoIcon, RefreshIcon, UndoIcon } from './ui/icons';
import { Badge, Button, IconButton } from './ui/ui';

export function ReportHeader({
  reportName,
  pageTitle,
  asOf,
  paypalSlow,
  paypalError,
  editing,
  pageIsEmpty,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onDiscard,
  onEditingChange,
  onRefreshStudio,
}: {
  reportName: string;
  pageTitle?: string;
  asOf: string;
  paypalSlow?: boolean;
  paypalError?: string | null;
  editing: boolean;
  pageIsEmpty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onEditingChange: (editing: boolean) => void;
  onRefreshStudio?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-canvas-soft bg-canvas px-6 py-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-mute">{reportName}</p>
        <h1 className="truncate font-display text-[28px] font-extrabold leading-[34px] text-ink">
          {pageTitle}
        </h1>
        <DataFreshness
          asOf={asOf}
          paypalSlow={paypalSlow}
          paypalError={paypalError}
          onRefreshStudio={onRefreshStudio}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {editing && pageIsEmpty && (
          <p className="mr-2 text-sm text-mute">
            Drag a widget from <span className="font-semibold text-ink">Compose</span> to get started.
          </p>
        )}
        {editing && (
          <>
            <IconButton label="Undo" disabled={!canUndo} onClick={onUndo}>
              <UndoIcon />
            </IconButton>
            <IconButton label="Redo" disabled={!canRedo} onClick={onRedo}>
              <RedoIcon />
            </IconButton>
            <span className="mx-1 h-6 w-px bg-canvas-soft" aria-hidden />
            <Button variant="secondary" size="sm" onClick={onDiscard}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={onSave}>
              Save
            </Button>
          </>
        )}
        {editing ? (
          <Button variant="ghost" size="sm" onClick={() => onEditingChange(false)}>
            <EyeIcon className="size-4" /> View
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => onEditingChange(true)}>
            <EditIcon className="size-4" /> Edit report
          </Button>
        )}
      </div>
    </div>
  );
}

const MINUTE_MS = 60_000;
let now = 0;
const subscribeNow = (listener: () => void) => {
  now = Date.now();
  const id = setInterval(() => {
    now = Date.now();
    listener();
  }, 30_000);
  return () => clearInterval(id);
};

function relativeTime(iso: string, at: number) {
  const minutes = Math.floor((at - Date.parse(iso)) / MINUTE_MS);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleDateString('en-GB');
}

function DataFreshness({
  asOf,
  paypalSlow,
  paypalError,
  onRefreshStudio,
}: {
  asOf: string;
  paypalSlow?: boolean;
  paypalError?: string | null;
  onRefreshStudio?: () => void;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const at = useSyncExternalStore(subscribeNow, () => now, () => 0);

  const handleRefresh = () => {
    startRefresh(() => {
      router.refresh();
      onRefreshStudio?.();
    });
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-mute">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`size-2 rounded-full ${
            paypalError ? 'bg-negative' : paypalSlow ? 'bg-warning-deep' : 'bg-positive'
          }`}
          aria-hidden
        />
        PayPal sandbox &amp; local SQLite
      </span>
      <span aria-hidden>·</span>
      <span className="tabular-nums" title={new Date(asOf).toLocaleString('en-GB')}>
        {refreshing
          ? 'Refreshing…'
          : `Updated ${at ? relativeTime(asOf, at) : new Date(asOf).toLocaleTimeString('en-GB')}`}
      </span>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        aria-label="Refresh data"
        title="Refresh data"
        className="inline-flex size-7 items-center justify-center rounded-full text-primary hover:bg-primary-pale disabled:text-mute"
      >
        <RefreshIcon className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
      </button>
      {paypalError ? (
        <Badge tone="warning">
          PayPal sandbox slow or unreachable ({paypalError}). Local SQLite tables loaded; click refresh to retry.
        </Badge>
      ) : paypalSlow ? (
        <Badge tone="warning">
          PayPal sandbox responded slowly (&gt;4s). Live data loaded.
        </Badge>
      ) : null}
    </div>
  );
}
