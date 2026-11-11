'use client';

import type { ReactNode } from 'react';

// Tether Noir app frame:
// - TopBar spans the full viewport width (replacing the legacy TetherHeader + left Reports rail).
// - Plain dark page surface (--bg-page) with content cards (--bg-surface) on top.
// - Responsive: Doctor panel sits beside the workspace on desktop and stacks on smaller widths
//   (moves to the left column + slide-over drawer in Phase 3/4).

export function AppShell({
  topBar,
  doctorPanel,
  children,
}: {
  topBar?: ReactNode;
  doctorPanel?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-page font-sans text-fg">
      {topBar}
      <div className="flex flex-1 flex-col xl:flex-row">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {children}
        </main>

        {doctorPanel && (
          <aside
            aria-label="Doctor panel"
            className="flex w-full shrink-0 flex-col border-t border-line bg-page p-4 xl:w-[40%] xl:min-w-[460px] xl:max-w-[780px] xl:self-start xl:border-l xl:border-t-0 xl:p-6"
          >
            {doctorPanel}
          </aside>
        )}
      </div>
    </div>
  );
}
