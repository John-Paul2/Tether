'use client';

import { useEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';

// Tether Noir app frame:
// - TopBar spans the full viewport width.
// - Plain dark page surface (--bg-page) with content cards (--bg-surface) on top.
// - CSS Grid with explicit min widths: at xl (1280px+, covering 1366x768@100% and 1920x1080),
//   Doctor panel sits in the sticky left column. Below xl (including 1366@125% = 1093px and narrow viewports),
//   Doctor panel transitions cleanly into a slide-over drawer without unmounting state.

function subscribeDesktopQuery(listener: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(min-width: 1280px)');
  mq.addEventListener('change', listener);
  return () => mq.removeEventListener('change', listener);
}

function getIsDesktop() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(min-width: 1280px)').matches;
}

export function AppShell({
  topBar,
  doctorPanel,
  doctorDrawerOpen = false,
  onCloseDoctorDrawer,
  doctorTriggerRef,
  children,
}: {
  topBar?: ReactNode;
  doctorPanel?: ReactNode;
  doctorDrawerOpen?: boolean;
  onCloseDoctorDrawer?: () => void;
  doctorTriggerRef?: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const isDesktop = useSyncExternalStore(subscribeDesktopQuery, getIsDesktop, () => true);
  const asideRef = useRef<HTMLElement>(null);
  const isDrawerModal = Boolean(doctorPanel && !isDesktop && doctorDrawerOpen);

  useEffect(() => {
    if (!isDrawerModal) return;

    const raf = requestAnimationFrame(() => {
      const firstFocusable = asideRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseDoctorDrawer?.();
        doctorTriggerRef?.current?.focus();
        return;
      }
      if (event.key === 'Tab' && asideRef.current) {
        const focusables = Array.from(
          asideRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isDrawerModal, onCloseDoctorDrawer, doctorTriggerRef]);

  return (
    <div className="flex min-h-dvh flex-col bg-page font-sans text-fg">
      {topBar}
      <div
        className={`grid flex-1 grid-cols-1 ${
          doctorPanel
            ? 'xl:grid-cols-[minmax(360px,396px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(400px,456px)_minmax(0,1fr)]'
            : ''
        }`}
      >
        {doctorPanel && isDrawerModal && (
          <div
            aria-hidden
            onClick={() => {
              onCloseDoctorDrawer?.();
              doctorTriggerRef?.current?.focus();
            }}
            className="fixed inset-0 z-40 bg-[var(--scrim)] xl:hidden"
          />
        )}

        {doctorPanel && (
          <aside
            ref={asideRef}
            id="doctor-drawer-aside"
            aria-label="Doctor panel"
            role={!isDesktop ? 'dialog' : undefined}
            aria-modal={!isDesktop && doctorDrawerOpen ? true : undefined}
            inert={!isDesktop && !doctorDrawerOpen}
            className={`fixed inset-y-0 left-0 z-50 flex w-[min(420px,calc(100vw-24px))] flex-col bg-page p-3 shadow-[var(--shadow-popover)] transition-transform duration-[var(--dur-medium)] ease-[var(--ease)] motion-reduce:transition-none xl:static xl:z-auto xl:w-auto xl:translate-x-0 xl:border-r xl:border-line xl:p-4 xl:shadow-none ${
              doctorDrawerOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            {doctorPanel}
          </aside>
        )}

        <main className="flex min-h-0 min-w-0 flex-col">{children}</main>
      </div>
    </div>
  );
}
