import { AppShell } from './app-shell';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[var(--radius-card)] bg-raised ${className}`} />;
}

export function TopBarSkeleton() {
  return (
    <div className="shrink-0 bg-surface" aria-hidden>
      <div className="flex min-h-[var(--topbar-height)] items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-8 rounded-[var(--radius-input)]" />
            <Skeleton className="h-5 w-16 rounded-[var(--radius-input)]" />
          </div>
          <Skeleton className="h-5 w-14 rounded-[var(--radius-input)]" />
          <Skeleton className="h-5 w-16 rounded-[var(--radius-input)]" />
          <Skeleton className="hidden h-4 w-24 rounded-[var(--radius-input)] sm:block" />
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="size-8 rounded-full" />
        </div>
      </div>
      <div
        className="h-[1.5px] w-full opacity-40"
        style={{ backgroundImage: 'var(--filament-gradient)' }}
      />
    </div>
  );
}

export function ContentSkeleton() {
  return (
    <>
      <div
        className="mx-4 mt-4 rounded-[var(--radius-card)] border border-line bg-surface p-4"
        aria-hidden
      >
        <div className="space-y-2">
          <Skeleton className="h-9 w-full max-w-xl rounded-full" />
          <Skeleton className="h-9 w-full max-w-xl rounded-full" />
        </div>
      </div>
      <div
        className="grid flex-1 grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:grid-rows-[136px_420px]"
        aria-hidden
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-10 w-24" />
          </div>
        ))}
        <div className="col-span-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:col-span-4">
          <Skeleton className="h-full" />
        </div>
      </div>
      <p className="sr-only" role="status">
        Loading Tether payment-event doctor…
      </p>
    </>
  );
}

export function DashboardSkeleton() {
  return (
    <AppShell topBar={<TopBarSkeleton />}>
      <ContentSkeleton />
    </AppShell>
  );
}
