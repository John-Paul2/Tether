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
      <div className="border-b border-canvas-soft bg-canvas px-6 py-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-8 w-48" />
        <Skeleton className="mt-3 h-4 w-56" />
      </div>
      <div className="grid flex-1 grid-cols-4 grid-rows-[112px_1fr_1fr] gap-4 p-4" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[24px] bg-canvas p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-9 w-20" />
          </div>
        ))}
        <div className="col-span-4 rounded-[24px] bg-canvas p-6">
          <Skeleton className="h-full" />
        </div>
        <div className="col-span-4 rounded-[24px] bg-canvas p-6">
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
