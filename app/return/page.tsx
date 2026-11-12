import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Order Approved',
};

export default function ReturnPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-page p-6 text-fg">
      <div className="tether-glass-panel w-full max-w-md space-y-4 rounded-[var(--radius-card)] border border-[var(--glass-border)] bg-surface p-6 text-center">
        <span className="inline-flex rounded-full border border-sync/45 bg-sync-soft px-3 py-1 text-xs font-semibold text-sync">
          PayPal Sandbox
        </span>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">
          Buyer approval complete
        </h1>
        <p className="text-sm leading-relaxed text-fg-2">
          Your PayPal sandbox order has been approved. Return to the Tether dashboard and click{' '}
          <strong className="font-semibold text-fg">Capture order</strong> in the DEMO panel to
          complete the payment flow.
        </p>
        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
