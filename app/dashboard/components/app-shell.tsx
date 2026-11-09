'use client';

import type { ReactNode } from 'react';
import { AnchorIcon, LinkChainIcon } from './ui/icons';

// The Tether app frame (DESIGN.md):
// - White nav-bar (--canvas) with Tether name + small anchor/link icon and NO logos.
// - Plain-text note: "Uses PayPal sandbox APIs".
// - Cool-tinted page surface (--canvas-soft) with white cards (--canvas) on top.
// - Responsive down to 375px width; Doctor panel sits beside the Studio canvas on desktop
//   and stacks below the dashboard on mobile.

function TetherHeader() {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-canvas-soft bg-canvas px-6 py-3 text-sm font-semibold text-ink">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex size-9 items-center justify-center rounded-full bg-primary-pale text-primary"
          aria-hidden
        >
          <AnchorIcon className="size-5" />
        </span>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Tether
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-normal text-mute">
            <LinkChainIcon className="size-3.5 text-primary" />
            Payment-event doctor · Uses PayPal sandbox APIs
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs font-normal text-mute">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas-soft px-3 py-1 font-semibold text-ink">
          <span className="size-2 rounded-full bg-positive" aria-hidden />
          Verified-webhook state guard
        </span>
      </div>
    </header>
  );
}

export function AppShell({
  sidebar,
  doctorPanel,
  children,
}: {
  sidebar: ReactNode;
  doctorPanel?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas-soft font-sans text-ink xl:h-dvh xl:overflow-hidden">
      <TetherHeader />
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <nav
          className="flex shrink-0 flex-col border-b border-canvas-soft bg-canvas xl:w-60 xl:border-b-0 xl:border-r"
          aria-label="Reports and pages"
        >
          {sidebar}
        </nav>

        <main className="flex min-h-[680px] min-w-0 flex-1 flex-col xl:min-h-0">
          {children}
        </main>

        {doctorPanel && (
          <aside
            aria-label="Doctor panel"
            className="flex w-full shrink-0 flex-col border-t border-canvas-soft bg-canvas-soft p-4 xl:w-[430px] xl:overflow-y-auto xl:border-l xl:border-t-0"
          >
            {doctorPanel}
          </aside>
        )}
      </div>
    </div>
  );
}
