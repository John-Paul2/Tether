import { AppShell } from './app-shell';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[var(--radius-card)] bg-raised ${className}`} />;
}

export function TopBarSkeleton() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30" aria-hidden>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-5 sm:px-6 sm:pt-6 md:grid md:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-2.5 md:justify-self-start">
          <Skeleton className="size-8 rounded-[var(--radius-input)]" />
          <Skeleton className="h-5 w-16 rounded-[var(--radius-input)]" />
        </div>
        <div className="order-3 flex w-full flex-wrap items-center justify-center gap-2.5 md:order-2 md:w-auto md:justify-self-center">
          <div className="tether-glass-nav inline-flex items-center gap-1 rounded-full px-2 py-1.5">
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <div className="order-2 flex items-center gap-2 md:order-3 md:justify-self-end">
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-11 rounded-full" />
        </div>
      </div>
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
