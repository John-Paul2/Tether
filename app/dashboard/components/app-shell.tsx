'use client';

import type { ReactNode } from 'react';

// Tether Noir app frame:
// - TopBar spans the full viewport width.
// - Plain dark page surface (--bg-page) with content cards (--bg-surface) on top.
// - Left column = Doctor panel, Right / main column = workspace (MoneyBox + Strip, graphs, grid).
// - Stacks cleanly below xl (becomes a slide-over drawer in Phase 4).

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
      <div
        className={`grid flex-1 grid-cols-1 ${
          doctorPanel
            ? 'xl:grid-cols-[minmax(360px,410px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(400px,456px)_minmax(0,1fr)]'
            : ''
        }`}
      >
        {doctorPanel && (
          <aside
            aria-label="Doctor panel"
            className="order-2 flex min-h-0 flex-col border-t border-line bg-page p-4 xl:order-1 xl:border-r xl:border-t-0"
          >
            {doctorPanel}
          </aside>
        )}

        <main className="order-1 flex min-h-0 min-w-0 flex-col xl:order-2">
          {children}
        </main>
      </div>
    </div>
  );
}
