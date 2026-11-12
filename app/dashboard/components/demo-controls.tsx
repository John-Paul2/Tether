'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, FlaskConical, X } from 'lucide-react';
import type { TetherLocalOrderRow } from '@/lib/tether-data';
import { Badge, Button } from './ui/ui';

type CreatedOrderInfo = {
  order_id: string;
  status: string;
  local_status: string;
  amount: string;
  currency: string;
  approve_link: string | null;
};

const GLASS_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 32,
  mass: 0.85,
};

export function DemoControlsPanel({
  dropWebhooks,
  localOrders,
  onFaultChanged,
  onOrderMutated,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
}: {
  dropWebhooks: boolean;
  localOrders: TetherLocalOrderRow[];
  onFaultChanged: (drop: boolean) => void;
  onOrderMutated: () => void;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChangeRef.current?.(next);
    },
    [controlledOpen],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const faultSwitchRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const prevOpenRef = useRef(open);

  const [togglingFault, setTogglingFault] = useState(false);

  const [amount, setAmount] = useState('450.00');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrderInfo | null>(null);

  const unpaidOrders = localOrders.filter((o) => o.local_status !== 'PAID');
  const [captureOrderId, setCaptureOrderId] = useState<string>(
    unpaidOrders[0]?.order_id ?? '',
  );
  const [capturing, setCapturing] = useState(false);

  const [slowNotice, setSlowNotice] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    tone: 'positive' | 'warning' | 'negative' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (wasOpen && !open && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      faultSwitchRef.current?.focus();
    });
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        restoreFocusRef.current = false;
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        restoreFocusRef.current = true;
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, setOpen]);

  const handleToggleFault = async () => {
    const nextDrop = !dropWebhooks;
    setTogglingFault(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/demo/fault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drop: nextDrop }),
      });
      const data = (await res.json()) as { drop?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to toggle webhook fault switch');
      }
      const updated = Boolean(data.drop);
      onFaultChanged(updated);
      setStatusMessage({
        tone: updated ? 'warning' : 'positive',
        text: updated
          ? 'Fault injection enabled: incoming PayPal webhooks will be acknowledged (HTTP 200) and dropped before updating local_orders.'
          : 'Fault injection disabled: incoming verified PayPal webhooks will update local_orders normally.',
      });
    } catch (err) {
      setStatusMessage({
        tone: 'negative',
        text:
          err instanceof Error
            ? `${err.message}. Try toggling again.`
            : 'Could not update fault switch. Check server status and try again.',
      });
    } finally {
      setTogglingFault(false);
    }
  };

  const handleCreateOrder = async () => {
    setCreatingOrder(true);
    setStatusMessage(null);
    setSlowNotice(null);

    const slowTimer = setTimeout(() => {
      setSlowNotice(
        'PayPal sandbox is responding slowly while creating the order. Hang tight…',
      );
    }, 3500);

    try {
      const res = await fetch('/api/demo/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const data = (await res.json()) as CreatedOrderInfo & { error?: string };
      if (!res.ok || !data.order_id) {
        throw new Error(data.error ?? `PayPal returned status ${res.status}`);
      }
      setCreatedOrder(data);
      setCaptureOrderId(data.order_id);
      setStatusMessage({
        tone: 'info',
        text: `Created sandbox order ${data.order_id} ($${data.amount} ${data.currency}) with local_status CREATED. Next: open the approve link below to approve as buyer, then click Capture order.`,
      });
      onOrderMutated();
    } catch (err) {
      setStatusMessage({
        tone: 'negative',
        text:
          err instanceof Error
            ? `Order creation failed: ${err.message}. Check your PayPal sandbox credentials and try again.`
            : 'Order creation timed out or failed. Try again in a moment.',
      });
    } finally {
      clearTimeout(slowTimer);
      setSlowNotice(null);
      setCreatingOrder(false);
    }
  };

  const handleCaptureOrder = async () => {
    const targetId = captureOrderId.trim();
    if (!targetId) {
      setStatusMessage({
        tone: 'warning',
        text: 'Enter or select a sandbox Order ID before clicking Capture order.',
      });
      return;
    }

    setCapturing(true);
    setStatusMessage(null);
    setSlowNotice(null);

    const slowTimer = setTimeout(() => {
      setSlowNotice(
        'PayPal sandbox is taking longer than usual to capture the order…',
      );
    }, 3500);

    try {
      const res = await fetch(`/api/demo/orders/${encodeURIComponent(targetId)}/capture`, {
        method: 'POST',
      });
      const data = (await res.json()) as {
        id?: string;
        status?: string;
        name?: string;
        message?: string;
        details?: { issue?: string; description?: string }[];
        error?: string;
      };

      if (!res.ok) {
        const issue = data.details?.[0]?.issue ?? data.name ?? '';
        const desc = data.details?.[0]?.description ?? data.message ?? data.error ?? '';
        if (issue === 'ORDER_NOT_APPROVED' || res.status === 422) {
          setStatusMessage({
            tone: 'warning',
            text: `Order ${targetId} has not been approved by the sandbox buyer yet (${issue || 'UNPROCESSABLE_ENTITY'}). Open the PayPal approve link, complete buyer sign-in, and click Capture order again.`,
          });
        } else {
          setStatusMessage({
            tone: 'negative',
            text: `Capture failed for ${targetId}: ${desc || `HTTP ${res.status}`}. Verify the order ID and try again.`,
          });
        }
        return;
      }

      setStatusMessage({
        tone: dropWebhooks ? 'warning' : 'positive',
        text: dropWebhooks
          ? `Order ${targetId} captured in PayPal (${data.status ?? 'COMPLETED'}) while "Simulate dropped webhooks" is ON. Local status remains CREATED — check the Doctor panel to investigate the drift!`
          : `Order ${targetId} captured in PayPal (${data.status ?? 'COMPLETED'}). Waiting for PayPal webhook delivery to update local_status to PAID.`,
      });
      onOrderMutated();
    } catch (err) {
      setStatusMessage({
        tone: 'negative',
        text:
          err instanceof Error
            ? `PayPal capture request failed: ${err.message}. Try again.`
            : 'PayPal sandbox did not respond in time. Try capturing again.',
      });
    } finally {
      clearTimeout(slowTimer);
      setSlowNotice(null);
      setCapturing(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {!open ? (
        <motion.button
          layoutId="tether-demo-surface"
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-expanded={false}
          aria-controls="demo-controls-popover"
          aria-haspopup="dialog"
          aria-label={
            dropWebhooks
              ? 'DEMO controls (fault injection active: dropping webhooks)'
              : 'DEMO controls'
          }
          title="DEMO staging controls"
          style={{ borderRadius: 999 }}
          transition={GLASS_SPRING}
          onClick={() => setOpen(true)}
          className="tether-glass-pill inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-warn/50 px-3.5 text-xs font-semibold tracking-wide text-warn-ink hover:border-warn hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FlaskConical className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          <span>DEMO</span>
          {dropWebhooks && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-drift-solid"
              title="Dropping incoming webhooks"
              aria-hidden
            />
          )}
        </motion.button>
      ) : (
        /* Invisible spacer keeps center pill nav centered with zero layout shift while menu floats on top */
        <span
          aria-hidden
          className="pointer-events-none invisible inline-flex h-9 shrink-0 select-none items-center gap-1.5 px-3.5 text-xs font-semibold tracking-wide"
        >
          <FlaskConical className="size-3.5 shrink-0" strokeWidth={1.5} />
          <span>DEMO</span>
          {dropWebhooks && <span className="size-1.5 shrink-0" />}
        </span>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id="demo-controls-popover"
            role="dialog"
            aria-label="Demo controls"
            layoutId="tether-demo-surface"
            style={{ borderRadius: 16 }}
            transition={GLASS_SPRING}
            className="tether-glass-menu tether-doctor-scroll fixed right-3 top-5 z-50 max-h-[calc(100dvh-32px)] w-[min(480px,calc(100vw-24px))] overflow-y-auto p-4 text-fg sm:right-6 sm:top-6"
          >
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, delay: 0.04 }}
            >
              {/* Popover header */}
              <div className="flex items-start justify-between gap-3 border-b border-[var(--glass-border)] pb-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/45 bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn-ink">
                      <FlaskConical className="size-3.5" strokeWidth={1.5} aria-hidden />
                      DEMO
                    </span>
                    <span className="text-xs font-medium text-fg-2">
                      Fault injection · PayPal sandbox
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-fg-3">
                    Staging controls only. Dropping webhooks makes{' '}
                    <code className="font-mono text-fg-2">/api/webhook</code> return HTTP 200 without
                    updating <code className="font-mono text-fg-2">local_orders</code>.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close Demo controls"
                  onClick={() => {
                    restoreFocusRef.current = true;
                    setOpen(false);
                  }}
                  className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-raised/80 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                >
                  <X className="size-4" strokeWidth={1.5} aria-hidden />
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {/* TODO(demo-controls): Make "Load a drifting order" the first item here once implemented; do not build it yet. */}

                {/* Fault injection toggle */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--glass-border)] bg-[var(--glass-inner-bg)] p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg">Simulate dropped webhooks</p>
                    <p className="text-xs text-fg-2">
                      {dropWebhooks
                        ? 'Active: dropping incoming webhooks'
                        : 'Off: normal webhook handling'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Badge tone={dropWebhooks ? 'negative' : 'positive'}>
                      <span
                        className={`size-1.5 rounded-full ${
                          dropWebhooks ? 'bg-drift-solid' : 'bg-sync-solid'
                        }`}
                        aria-hidden
                      />
                      {dropWebhooks ? 'Dropping' : 'Normal'}
                    </Badge>
                    <button
                      ref={faultSwitchRef}
                      type="button"
                      role="switch"
                      aria-checked={dropWebhooks}
                      aria-label="Simulate dropped webhooks"
                      disabled={togglingFault}
                      onClick={handleToggleFault}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border px-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed disabled:opacity-60 ${
                        dropWebhooks
                          ? 'border-drift-solid bg-drift-solid'
                          : 'border-line-strong bg-[var(--glass-input-bg)]'
                      }`}
                    >
                      <span
                        className={`inline-block size-4 rounded-full bg-surface shadow-xs ring-1 ring-line transition-transform ${
                          dropWebhooks ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Step 1: Create sandbox order */}
                <div className="space-y-2 rounded-[var(--radius-card)] border border-[var(--glass-border)] bg-[var(--glass-inner-bg)] p-3">
                  <p className="text-xs font-semibold text-fg-2">1. Create sandbox order</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="demo-order-amount" className="text-xs font-medium text-fg-2">
                      USD
                    </label>
                    <input
                      id="demo-order-amount"
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="h-9 w-24 rounded-[var(--radius-input)] border border-line-strong bg-[var(--glass-input-bg)] px-3 font-mono text-sm text-fg tabular-nums focus:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                    />
                    <Button
                      variant="tertiary"
                      size="sm"
                      disabled={creatingOrder}
                      onClick={handleCreateOrder}
                    >
                      {creatingOrder ? 'Creating order…' : 'Create sandbox order'}
                    </Button>
                  </div>

                  {createdOrder && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-input)] border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-3 py-2 text-xs">
                      <span className="font-medium text-fg tabular-nums">
                        Order <code className="font-mono text-paypal">{createdOrder.order_id}</code> ($
                        {createdOrder.amount})
                      </span>
                      {createdOrder.approve_link ? (
                        <a
                          href={createdOrder.approve_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-ai hover:text-fg hover:underline"
                        >
                          Approve in PayPal sandbox
                          <ExternalLink className="size-3.5" strokeWidth={1.5} aria-hidden />
                        </a>
                      ) : (
                        <span className="text-fg-3">No approve link returned</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Step 2: Capture sandbox order */}
                <div className="space-y-2 rounded-[var(--radius-card)] border border-[var(--glass-border)] bg-[var(--glass-inner-bg)] p-3">
                  <p className="text-xs font-semibold text-fg-2">2. Capture sandbox order</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="demo-capture-order-id" className="sr-only">
                      Order ID
                    </label>
                    <input
                      id="demo-capture-order-id"
                      type="text"
                      list="unpaid-local-orders"
                      placeholder="e.g. 12N95587M6071792S"
                      value={captureOrderId}
                      onChange={(e) => setCaptureOrderId(e.target.value)}
                      className="h-9 min-w-[170px] flex-1 rounded-[var(--radius-input)] border border-line-strong bg-[var(--glass-input-bg)] px-3 font-mono text-sm text-fg focus:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                    />
                    <datalist id="unpaid-local-orders">
                      {unpaidOrders.map((o) => (
                        <option key={o.order_id} value={o.order_id}>
                          {o.order_id} (${o.amount.toFixed(2)} · {o.local_status})
                        </option>
                      ))}
                    </datalist>
                    <Button
                      variant="tertiary"
                      size="sm"
                      disabled={capturing || !captureOrderId.trim()}
                      onClick={handleCaptureOrder}
                    >
                      {capturing ? 'Capturing…' : 'Capture order'}
                    </Button>
                  </div>
                </div>

                {slowNotice && (
                  <p className="rounded-[var(--radius-input)] border border-warn/45 bg-warn-soft px-3 py-2 text-xs font-medium text-warn-ink">
                    {slowNotice}
                  </p>
                )}

                {statusMessage && (
                  <div
                    className={`space-y-1.5 rounded-[var(--radius-input)] border px-3 py-2.5 text-xs ${
                      statusMessage.tone === 'negative'
                        ? 'tether-error-shake border-drift/45 bg-drift-soft'
                        : 'border-[var(--glass-border)] bg-[var(--glass-inner-bg)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusMessage.tone}>
                        {statusMessage.tone === 'positive'
                          ? 'Ready'
                          : statusMessage.tone === 'warning'
                            ? 'Note'
                            : statusMessage.tone === 'negative'
                              ? 'Error'
                              : 'Created'}
                      </Badge>
                      <span className="leading-relaxed text-fg-2">{statusMessage.text}</span>
                    </div>
                    {createdOrder?.approve_link && (
                      <a
                        href={createdOrder.approve_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-ai hover:text-fg hover:underline"
                      >
                        {createdOrder.approve_link}
                        <ExternalLink className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
