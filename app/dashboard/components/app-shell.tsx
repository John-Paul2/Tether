'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';

export type DoctorDockMode = 'right' | 'left' | 'floating';

type ResizeEdge = 'left' | 'right' | 'bottom' | 'bottom-left' | 'bottom-right';
type Rect = { x: number; y: number; width: number; height: number };

const DEFAULT_DOCK_WIDTH = 396;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 360;
const HEADER_CLEARANCE_TOP = 82;
const VIEWPORT_MARGIN = 16;
const EDGE_SNAP_PX = 76;
const DOCK_OUTER_PADDING = 16;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function subscribeDockCapable(listener: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(min-width: 1024px)');
  mq.addEventListener('change', listener);
  return () => mq.removeEventListener('change', listener);
}

function getIsDockCapable() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(min-width: 1024px)').matches;
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
  const isDockCapable = useSyncExternalStore(subscribeDockCapable, getIsDockCapable, () => true);
  const asideRef = useRef<HTMLElement>(null);
  const panelFrameRef = useRef<HTMLDivElement>(null);
  const doctorOpenRef = useRef(doctorDrawerOpen);
  useEffect(() => {
    doctorOpenRef.current = doctorDrawerOpen;
  }, [doctorDrawerOpen]);

  const [dockMode, setDockMode] = useState<DoctorDockMode>('left');
  const [dockWidth, setDockWidth] = useState<number>(DEFAULT_DOCK_WIDTH);
  const [floatRect, setFloatRect] = useState<Rect>({
    x: 24,
    y: HEADER_CLEARANCE_TOP,
    width: DEFAULT_DOCK_WIDTH,
    height: 620,
  });
  const [dragEdgePreview, setDragEdgePreview] = useState<'left' | 'right' | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  const hasDoctor = Boolean(doctorPanel);
  const isNarrowModal = Boolean(hasDoctor && !isDockCapable && doctorDrawerOpen);
  const isFloatingDesktop = isDockCapable && dockMode === 'floating';

  // Keep Escape handling crisp for narrow overlay drawer & Escape inside floating/docked Doctor tile.
  useEffect(() => {
    if (!doctorDrawerOpen || !hasDoctor) return;

    if (isNarrowModal) {
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
    }

    const onDesktopKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        asideRef.current &&
        asideRef.current.contains(document.activeElement)
      ) {
        event.preventDefault();
        onCloseDoctorDrawer?.();
        doctorTriggerRef?.current?.focus();
      }
    };
    document.addEventListener('keydown', onDesktopKeyDown);
    return () => document.removeEventListener('keydown', onDesktopKeyDown);
  }, [doctorDrawerOpen, doctorTriggerRef, hasDoctor, isNarrowModal, onCloseDoctorDrawer]);

  // Drag-to-undock / drag-to-move / edge-snap handler
  const handleHeaderPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const frameEl = panelFrameRef.current ?? asideRef.current;
      if (!isDockCapable || event.button !== 0 || !frameEl) return;

      const elRect = frameEl.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startMode = dockMode;
      let activeFloating = startMode === 'floating';
      let snapArmed = activeFloating;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const initialWidth = clamp(
        elRect.width,
        MIN_WIDTH,
        Math.min(680, vw - VIEWPORT_MARGIN * 2),
      );
      const initialHeight = clamp(
        elRect.height,
        MIN_HEIGHT,
        Math.max(MIN_HEIGHT, vh - VIEWPORT_MARGIN * 2),
      );
      const originX = elRect.left;
      const originY = elRect.top;
      let latestEdge: 'left' | 'right' | null = null;
      let latestFloatWidth = initialWidth;

      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      setIsInteracting(true);

      const onPointerMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const curVw = window.innerWidth;
        const curVh = window.innerHeight;

        if (!activeFloating) {
          const movedEnough = Math.hypot(dx, dy) > 10;
          if (!movedEnough) return;

          activeFloating = true;
          setDockMode('floating');
        }

        if (!snapArmed) {
          if (startMode === 'right' && moveEvent.clientX < curVw - EDGE_SNAP_PX - 24) {
            snapArmed = true;
          } else if (startMode === 'left' && moveEvent.clientX > EDGE_SNAP_PX + 24) {
            snapArmed = true;
          } else if (Math.abs(dy) > 48 && Math.abs(dx) > 24) {
            snapArmed = true;
          }
        }

        const nextX = clamp(
          originX + dx,
          12,
          Math.max(12, curVw - initialWidth - 12),
        );
        const nextY = clamp(
          originY + dy,
          12,
          Math.max(12, curVh - initialHeight - 12),
        );

        latestFloatWidth = initialWidth;
        setFloatRect({
          x: nextX,
          y: nextY,
          width: initialWidth,
          height: initialHeight,
        });

        let edge: 'left' | 'right' | null = null;
        if (snapArmed) {
          if (moveEvent.clientX <= EDGE_SNAP_PX || nextX <= 24) {
            edge = 'left';
          } else if (
            moveEvent.clientX >= curVw - EDGE_SNAP_PX ||
            nextX + initialWidth >= curVw - 24
          ) {
            edge = 'right';
          }
        }
        latestEdge = edge;
        setDragEdgePreview(edge);
      };

      const finish = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        document.body.style.userSelect = prevUserSelect;
        setIsInteracting(false);
        setDragEdgePreview(null);

        if (activeFloating && latestEdge) {
          const maxDock = Math.min(640, Math.floor(window.innerWidth * 0.48));
          setDockWidth(
            clamp(latestFloatWidth + DOCK_OUTER_PADDING, MIN_WIDTH, Math.max(MIN_WIDTH, maxDock)),
          );
          setDockMode(latestEdge);
        }
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [dockMode, isDockCapable],
  );

  // Resize handler for docked inner edge & floating edges/corners
  const handleResizePointerDown = useCallback(
    (edge: ResizeEdge, event: ReactPointerEvent<HTMLDivElement>) => {
      const targetRectEl = dockMode === 'floating' ? panelFrameRef.current : asideRef.current;
      if (!isDockCapable || event.button !== 0 || !targetRectEl) return;
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startY = event.clientY;
      const startRect = targetRectEl.getBoundingClientRect();
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      setIsInteracting(true);

      const onPointerMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        if (dockMode === 'right') {
          const maxDock = Math.min(640, Math.floor(vw * 0.48));
          setDockWidth(clamp(startRect.width - dx, MIN_WIDTH, Math.max(MIN_WIDTH, maxDock)));
          return;
        }

        if (dockMode === 'left') {
          const maxDock = Math.min(640, Math.floor(vw * 0.48));
          setDockWidth(clamp(startRect.width + dx, MIN_WIDTH, Math.max(MIN_WIDTH, maxDock)));
          return;
        }

        // Floating resize
        const maxFloatW = Math.min(720, vw - 24);
        const maxFloatH = vh - 24;
        let nextX = startRect.left;
        let nextW = startRect.width;
        let nextH = startRect.height;

        if (edge === 'left' || edge === 'bottom-left') {
          const rightEdge = startRect.right;
          const clampedW = clamp(startRect.width - dx, MIN_WIDTH, Math.min(maxFloatW, rightEdge - 12));
          nextW = clampedW;
          nextX = rightEdge - clampedW;
        }
        if (edge === 'right' || edge === 'bottom-right') {
          const availableRight = vw - 12 - startRect.left;
          nextW = clamp(startRect.width + dx, MIN_WIDTH, Math.min(maxFloatW, availableRight));
        }
        if (edge === 'bottom' || edge === 'bottom-left' || edge === 'bottom-right') {
          const availableBottom = vh - 12 - startRect.top;
          nextH = clamp(startRect.height + dy, MIN_HEIGHT, Math.min(maxFloatH, availableBottom));
        }

        setFloatRect({
          x: nextX,
          y: clamp(startRect.top, 12, Math.max(12, vh - nextH - 12)),
          width: nextW,
          height: nextH,
        });
      };

      const finish = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        document.body.style.userSelect = prevUserSelect;
        setIsInteracting(false);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [dockMode, isDockCapable],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-page font-sans text-fg lg:h-dvh lg:overflow-hidden">
      {topBar}

      <div className="relative flex min-h-0 flex-1 overflow-x-clip lg:h-full">
        {/* Center-aligned main dashboard pane (keeps React identity across dock/float transitions) */}
        <main
          data-main-scroll="true"
          className="order-2 flex min-h-0 min-w-0 flex-1 flex-col pt-[124px] md:pt-[82px] lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:pb-6"
        >
          <div className="mx-auto flex w-full max-w-[1200px] min-w-0 flex-col">
            {children}
          </div>
        </main>

        {/* Backdrop scrim ONLY on narrow viewports (< 1024px) */}
        {hasDoctor && isNarrowModal && (
          <div
            aria-hidden
            onClick={() => {
              onCloseDoctorDrawer?.();
              doctorTriggerRef?.current?.focus();
            }}
            className="fixed inset-0 z-40 bg-[var(--scrim)] lg:hidden"
          />
        )}

        {/* Snap-to-edge translucent landing preview while dragging Doctor tile to far left/right */}
        <AnimatePresence>
          {isDockCapable && doctorDrawerOpen && dragEdgePreview && (
            <motion.div
              key={`snap-preview-${dragEdgePreview}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              aria-hidden
              style={{ width: clamp(floatRect.width, MIN_WIDTH, 520) }}
              className={`tether-glass-snap pointer-events-none fixed bottom-4 top-[82px] z-35 rounded-[var(--radius-card)] ${
                dragEdgePreview === 'left' ? 'left-4' : 'right-4'
              }`}
            />
          )}
        </AnimatePresence>

        {/* Single persistent Doctor tile slot: dynamically fits docked-left / docked-right OR floats freely */}
        <AnimatePresence
          onExitComplete={() => {
            if (!doctorOpenRef.current) {
              setDockMode('left');
              setDragEdgePreview(null);
            }
          }}
        >
          {hasDoctor && doctorDrawerOpen && (
            <aside
              ref={asideRef}
              id="doctor-drawer-aside"
              aria-label="Doctor panel"
              role={!isDockCapable ? 'dialog' : 'complementary'}
              aria-modal={!isDockCapable ? true : undefined}
              data-doctor-dragging={isFloatingDesktop && isInteracting ? 'true' : undefined}
              style={
                !isDockCapable
                  ? undefined
                  : isFloatingDesktop
                    ? {
                        left: floatRect.x,
                        top: floatRect.y,
                        width: floatRect.width,
                        height: floatRect.height,
                      }
                    : { width: dockWidth }
              }
              className={
                !isDockCapable
                  ? 'fixed bottom-3 left-3 top-[82px] z-50 flex w-[min(396px,calc(100vw-24px))] flex-col'
                  : isFloatingDesktop
                    ? 'fixed z-40 flex flex-col'
                    : `relative flex h-full min-h-0 shrink-0 flex-col pt-[82px] pb-4 ${
                        dockMode === 'left' ? 'order-1 pl-4' : 'order-3 pr-4'
                      } ${isInteracting ? '' : 'transition-[width] duration-[var(--dur-base)] ease-[var(--ease)]'}`
              }
            >
              <motion.div
                ref={panelFrameRef}
                onPointerDown={(event) => {
                  if (!isDockCapable) return;
                  const target = event.target as HTMLElement | null;
                  if (!target?.closest('[data-doctor-drag-header="true"]')) return;
                  if (target.closest('button, a, input, select, textarea, [role="button"]')) return;
                  handleHeaderPointerDown(event);
                }}
                initial={
                  isFloatingDesktop
                    ? { opacity: 0, scale: 0.97 }
                    : { opacity: 0, x: !isDockCapable || dockMode === 'left' ? -18 : 18 }
                }
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={
                  isFloatingDesktop
                    ? { opacity: 0, scale: 0.97 }
                    : { opacity: 0, x: !isDockCapable || dockMode === 'left' ? -18 : 18 }
                }
                transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                className="relative flex h-full min-h-0 w-full flex-col"
              >
                {doctorPanel}

                {/* Resize handles on desktop */}
                {isDockCapable && dockMode === 'right' && (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize Doctor panel"
                    title="Drag to resize"
                    onPointerDown={(e) => handleResizePointerDown('left', e)}
                    className="group absolute inset-y-4 -left-1.5 z-10 flex w-3 cursor-ew-resize items-center justify-center"
                  >
                    <span className="h-12 w-1 rounded-full bg-[var(--glass-border)] transition-colors group-hover:bg-accent" />
                  </div>
                )}

                {isDockCapable && dockMode === 'left' && (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize Doctor panel"
                    title="Drag to resize"
                    onPointerDown={(e) => handleResizePointerDown('right', e)}
                    className="group absolute inset-y-4 -right-1.5 z-10 flex w-3 cursor-ew-resize items-center justify-center"
                  >
                    <span className="h-12 w-1 rounded-full bg-[var(--glass-border)] transition-colors group-hover:bg-accent" />
                  </div>
                )}

                {isDockCapable && isFloatingDesktop && (
                  <>
                    <div
                      aria-hidden
                      onPointerDown={(e) => handleResizePointerDown('left', e)}
                      className="absolute inset-y-3 -left-1 w-2.5 cursor-ew-resize"
                    />
                    <div
                      aria-hidden
                      onPointerDown={(e) => handleResizePointerDown('right', e)}
                      className="absolute inset-y-3 -right-1 w-2.5 cursor-ew-resize"
                    />
                    <div
                      aria-hidden
                      onPointerDown={(e) => handleResizePointerDown('bottom', e)}
                      className="absolute inset-x-3 -bottom-1 h-2.5 cursor-ns-resize"
                    />
                    <div
                      aria-hidden
                      onPointerDown={(e) => handleResizePointerDown('bottom-left', e)}
                      className="absolute -bottom-1 -left-1 size-4 cursor-nesw-resize"
                    />
                    <div
                      role="separator"
                      aria-label="Resize floating Doctor panel"
                      title="Drag corner to resize"
                      onPointerDown={(e) => handleResizePointerDown('bottom-right', e)}
                      className="group absolute -bottom-1 -right-1 z-20 flex size-5 cursor-nwse-resize items-end justify-end p-1"
                    >
                      <span className="size-2 rounded-br-[3px] border-b-2 border-r-2 border-fg-3/60 transition-colors group-hover:border-accent" />
                    </div>
                  </>
                )}
              </motion.div>
            </aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
