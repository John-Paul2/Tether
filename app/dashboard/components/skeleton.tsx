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
      {/* Money box + Reconciliation strip row */}
      <div
        className="grid grid-cols-1 gap-4 px-4 pt-4 lg:grid-cols-[minmax(240px,288px)_minmax(0,1fr)]"
        aria-hidden
      >
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-11 w-32" />
          <Skeleton className="mt-4 h-4 w-44" />
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <div className="flex justify-between gap-2 border-b border-line pb-3">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-5 w-44 rounded-full" />
          </div>
          <div className="mt-3 space-y-2.5">
            <Skeleton className="h-8 w-full max-w-xl" />
            <Skeleton className="h-8 w-full max-w-xl" />
          </div>
        </div>
      </div>

      {/* Two side-by-side graphs + full-width orders table */}
      <div
        className="grid flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-2 md:grid-rows-[270px_380px]"
        aria-hidden
      >
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="mt-4 h-48 w-full" />
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-4 h-48 w-full" />
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 md:col-span-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-4 h-[310px] w-full" />
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
