'use client';

import { useEffect } from 'react';
import { AlertIcon } from './components/ui/icons';
import { AppShell } from './components/app-shell';
import { SidebarSkeleton } from './components/skeleton';
import { Button } from './components/ui/ui';

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AppShell sidebar={<SidebarSkeleton />}>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-lg rounded-[24px] bg-canvas p-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-negative-bg text-on-primary">
            <AlertIcon className="size-7" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">
            We couldn&apos;t load Tether dashboard data
          </h1>
          <p className="mt-2 text-base text-body">
            The local database or PayPal sandbox didn&apos;t respond as expected. Check the credentials in{' '}
            <code className="rounded bg-canvas-soft px-1.5 py-0.5 text-sm">.env.local</code> and click Try again.
          </p>
          {error.message && (
            <p className="mt-4 break-words rounded-[16px] bg-canvas-soft px-4 py-3 text-left font-mono text-xs text-body">
              {error.message}
              {error.digest && <span className="block pt-1">Reference: {error.digest}</span>}
            </p>
          )}
          <Button variant="primary" className="mt-6" onClick={retry}>
            Try again
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
