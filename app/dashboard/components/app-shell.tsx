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
    <header className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-canvas-soft bg-canvas px-6 py-3 text-sm font-semibold text-ink">
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
    <div className="flex min-h-dvh flex-col bg-canvas-soft font-sans text-ink">
      <TetherHeader />
      <div className="flex flex-1 flex-col xl:flex-row">
        <nav
          className="shrink-0 border-b border-canvas-soft bg-canvas xl:w-52 xl:border-b-0 xl:border-r 2xl:w-56"
          aria-label="Reports and pages"
        >
          <div className="flex flex-col xl:sticky xl:top-[61px] xl:max-h-[calc(100dvh-61px)]">
            {sidebar}
          </div>
        </nav>

        <main className="flex min-h-[680px] min-w-0 flex-1 flex-col">
          {children}
        </main>

        {doctorPanel && (
          <aside
            aria-label="Doctor panel"
            className="flex w-full shrink-0 flex-col border-t border-primary-neutral/60 bg-primary-pale/55 p-5 xl:w-[40%] xl:min-w-[460px] xl:max-w-[780px] xl:border-l xl:border-t-0 xl:p-6"
          >
            {doctorPanel}
          </aside>
        )}
      </div>
    </div>
  );
}
