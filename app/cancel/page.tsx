import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Checkout Cancelled',
};

export default function CancelPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-page p-6 text-fg">
      <div className="tether-glass-panel w-full max-w-md space-y-4 rounded-[var(--radius-card)] border border-[var(--glass-border)] bg-surface p-6 text-center">
        <span className="inline-flex rounded-full border border-warn/45 bg-warn-soft px-3 py-1 text-xs font-semibold text-warn-ink">
          PayPal Sandbox
        </span>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">
          Buyer approval cancelled
        </h1>
        <p className="text-sm leading-relaxed text-fg-2">
          The PayPal sandbox approval step was cancelled before completion. You can return to the
          Tether dashboard to try again or load a pre-captured drifting order from DEMO.
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
