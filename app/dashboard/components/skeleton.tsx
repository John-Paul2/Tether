import { AppShell } from './app-shell';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[16px] bg-canvas-soft ${className}`} />;
}

export function SidebarSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-9 rounded-full" />
      {['w-24', 'w-28'].map((width) => (
        <Skeleton key={width} className={`ml-6 h-7 rounded-full ${width}`} />
      ))}
    </div>
  );
}

export function ContentSkeleton() {
  return (
    <>
      <div className="border-b border-canvas-soft bg-canvas px-6 py-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-7 w-40" />
        <Skeleton className="mt-2 h-3 w-52" />
      </div>
      <div className="mx-4 mt-4 rounded-[16px] bg-canvas p-4 shadow-[var(--card-shadow)]" aria-hidden>
        <div className="space-y-2">
          <Skeleton className="h-9 w-full max-w-xl rounded-full" />
          <Skeleton className="h-9 w-full max-w-xl rounded-full" />
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:grid-rows-[136px_420px]" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[16px] bg-canvas p-4 shadow-[var(--card-shadow)]">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-10 w-24" />
          </div>
        ))}
        <div className="col-span-2 rounded-[16px] bg-canvas p-4 shadow-[var(--card-shadow)] sm:col-span-4">
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
    <AppShell sidebar={<SidebarSkeleton />}>
      <ContentSkeleton />
    </AppShell>
  );
}
