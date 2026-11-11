'use client';

import { useEffect } from 'react';
import { AlertIcon } from './components/ui/icons';
import { AppShell } from './components/app-shell';
import { TopBarSkeleton } from './components/skeleton';
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
    <AppShell topBar={<TopBarSkeleton />}>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-drift-soft text-drift">
            <AlertIcon className="size-7" />
          </span>
          <h1 className="type-h1 mt-4 text-fg">
            We couldn&apos;t load Tether dashboard data
          </h1>
          <p className="mt-2 text-base text-fg-2">
            The local database or PayPal sandbox didn&apos;t respond as expected. Check the credentials in{' '}
            <code className="rounded-[var(--radius-input)] border border-line bg-sunken px-1.5 py-0.5 font-mono text-sm text-fg">
              .env.local
            </code>{' '}
            and click Try again.
          </p>
          {error.message && (
            <p className="mt-4 break-words rounded-[var(--radius-input)] border border-line bg-sunken px-4 py-3 text-left font-mono text-xs text-fg-2">
              {error.message}
              {error.digest && <span className="block pt-1 text-fg-3">Reference: {error.digest}</span>}
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
