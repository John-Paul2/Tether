'use client';

import type { SavedReport } from '../reports-store';
import { Button, Dialog } from './ui/ui';

export type DashboardDialog =
  | { kind: 'unsaved'; then: () => void }
  | { kind: 'create' }
  | { kind: 'rename-report'; report: SavedReport }
  | { kind: 'rename-page'; pageId: string; title: string }
  | { kind: 'delete'; report: SavedReport }
  | { kind: 'reset' }
  | null;

export function UnsavedChangesDialog({
  open,
  reportName,
  onCancel,
  onDiscard,
  onSave,
}: {
  open: boolean;
  reportName: string;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog
      open={open}
      title={`Save changes to “${reportName}”?`}
      onClose={onCancel}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="secondary" size="sm" onClick={onDiscard}>
            Discard changes
          </Button>
          <Button variant="primary" size="sm" onClick={onSave}>
            Save
          </Button>
        </>
      }
    >
      Your changes to this report haven&apos;t been saved yet.
    </Dialog>
  );
}

export function CreateReportDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const formId = 'create-report';
  return (
    <Dialog
      open={open}
      title="New report"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" form={formId}>
            Create report
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
          onCreate(name || 'Untitled report');
        }}
      >
        <p>Start from a blank page and build it with the widgets in Compose.</p>
        <label className="mt-4 block text-sm font-semibold text-fg" htmlFor="report-name">
          Report name
        </label>
        <input
          id="report-name"
          name="name"
          autoFocus
          defaultValue="Untitled report"
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1.5 h-10 w-full rounded-[var(--radius-input)] border border-line-strong bg-sunken/70 px-3.5 text-sm text-fg focus:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        />
      </form>
    </Dialog>
  );
}

export function RenameDialog({
  open,
  title,
  label,
  initialValue,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  label: string;
  initialValue: string;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const formId = 'rename-item';
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" form={formId}>
            Save
          </Button>
        </>
      }
    >
      <form
        id={formId}
        key={initialValue}
        onSubmit={(e) => {
          e.preventDefault();
          const next = String(new FormData(e.currentTarget).get('title') ?? '').trim();
          if (next) onSave(next);
          else onClose();
        }}
      >
        <label className="block text-sm font-semibold text-fg" htmlFor="rename-input">
          {label}
        </label>
        <input
          id="rename-input"
          name="title"
          autoFocus
          defaultValue={initialValue}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1.5 h-10 w-full rounded-[var(--radius-input)] border border-line-strong bg-sunken/70 px-3.5 text-sm text-fg focus:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        />
      </form>
    </Dialog>
  );
}

export function DeleteReportDialog({
  report,
  onCancel,
  onConfirm,
}: {
  report: SavedReport | null;
  onCancel: () => void;
  onConfirm: (report: SavedReport) => void;
}) {
  return (
    <Dialog
      open={report !== null}
      title={report?.builtIn ? 'Reset to default?' : 'Delete report?'}
      onClose={onCancel}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={() => report && onConfirm(report)}>
            {report?.builtIn ? 'Reset' : 'Delete'}
          </Button>
        </>
      }
    >
      {report &&
        (report.builtIn
          ? `“${report.name}” will go back to the report shipped with Tether. Your saved changes to it will be lost.`
          : `“${report.name}” will be removed from this browser. This can't be undone.`)}
    </Dialog>
  );
}

export function ResetDemoDialog({
  open,
  builtInName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  builtInName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      title="Reset report?"
      onClose={onCancel}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            Reset report
          </Button>
        </>
      }
    >
      All custom reports in this browser will be deleted and “{builtInName}” will return to its default
      Health and Incidents pages.
    </Dialog>
  );
}
