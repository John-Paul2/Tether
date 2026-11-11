import { InboxIcon } from './ui/icons';

export function EmptyData() {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-full border border-accent/30 bg-ai-soft text-accent">
        <InboxIcon className="size-7" />
      </span>
      <h2 className="mt-4 type-h1 text-fg">
        No payment events recorded yet
      </h2>
      <p className="mt-2 max-w-md type-body text-fg-2">
        Everything is in sync. Load a drifting order from DEMO in the top bar to see Tether work.
      </p>
    </div>
  );
}
