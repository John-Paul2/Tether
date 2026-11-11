'use client';

import { useEffect, useRef, useState } from 'react';
import type { TetherLocalOrderRow } from '@/lib/tether-data';
import { AlertIcon, ChevronDownIcon, CloseIcon, ExternalLinkIcon } from './ui/icons';
import { Badge, Button } from './ui/ui';

type CreatedOrderInfo = {
  order_id: string;
  status: string;
  local_status: string;
  amount: string;
  currency: string;
  approve_link: string | null;
};

export function DemoControlsPanel({
  dropWebhooks,
  localOrders,
  onFaultChanged,
  onOrderMutated,
  disabled = false,
}: {
  dropWebhooks: boolean;
  localOrders: TetherLocalOrderRow[];
  onFaultChanged: (drop: boolean) => void;
  onOrderMutated: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

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
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls="demo-controls-popover"
        aria-haspopup="dialog"
        aria-label={
          dropWebhooks
            ? 'DEMO controls (fault injection active: dropping webhooks)'
            : 'DEMO controls'
        }
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? 'border-warn bg-warn-soft text-warn'
            : 'border-warn/80 bg-transparent text-warn hover:border-warn hover:bg-warn-soft'
        }`}
      >
        <AlertIcon className="size-3.5 shrink-0" />
        <span>DEMO</span>
        {dropWebhooks && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-drift"
            title="Dropping incoming webhooks"
            aria-hidden
          />
        )}
        <ChevronDownIcon
          className={`size-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id="demo-controls-popover"
          role="dialog"
          aria-label="Demo controls"
          className="fixed right-3 top-[64px] z-40 max-h-[calc(100dvh-80px)] w-[min(480px,calc(100vw-24px))] overflow-y-auto rounded-[var(--radius-card)] border border-line-strong bg-raised p-4 text-fg shadow-[var(--shadow-popover)] sm:absolute sm:right-0 sm:top-full sm:mt-2"
        >
          {/* Popover header */}
          <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">
                  <AlertIcon className="size-3.5" />
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
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {/* TODO(demo-controls): Make "Load a drifting order" the first item here once implemented; do not build it yet. */}

            {/* Fault injection toggle */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">Simulate dropped webhooks</p>
                <p className="text-xs text-fg-3">
                  {dropWebhooks
                    ? 'Active: dropping incoming webhooks'
                    : 'Off: normal webhook handling'}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <Badge tone={dropWebhooks ? 'negative' : 'positive'}>
                  <span
                    className={`size-1.5 rounded-full ${
                      dropWebhooks ? 'bg-drift' : 'bg-sync'
                    }`}
                    aria-hidden
                  />
                  {dropWebhooks ? 'Dropping' : 'Normal'}
                </Badge>
                <button
                  type="button"
                  role="switch"
                  aria-checked={dropWebhooks}
                  aria-label="Simulate dropped webhooks"
                  disabled={togglingFault}
                  onClick={handleToggleFault}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border px-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${
                    dropWebhooks
                      ? 'border-drift bg-drift'
                      : 'border-line-strong bg-sunken'
                  }`}
                >
                  <span
                    className={`inline-block size-4 rounded-full bg-fg transition-transform ${
                      dropWebhooks ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Step 1: Create sandbox order */}
            <div className="space-y-2 rounded-[var(--radius-card)] border border-line bg-surface p-3">
              <p className="text-xs font-semibold text-fg-2">1. Create sandbox order</p>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="demo-order-amount" className="text-xs font-medium text-fg-3">
                  USD
                </label>
                <input
                  id="demo-order-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-9 w-24 rounded-[var(--radius-input)] border border-line-strong bg-sunken px-3 font-mono text-sm text-fg tabular-nums outline-none focus:border-accent"
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
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-input)] border border-line bg-sunken px-3 py-2 text-xs">
                  <span className="font-medium text-fg tabular-nums">
                    Order <code className="font-mono text-paypal">{createdOrder.order_id}</code> ($
                    {createdOrder.amount})
                  </span>
                  {createdOrder.approve_link ? (
                    <a
                      href={createdOrder.approve_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-accent hover:text-accent-strong hover:underline"
                    >
                      Approve in PayPal sandbox
                      <ExternalLinkIcon className="size-3.5" />
                    </a>
                  ) : (
                    <span className="text-fg-3">No approve link returned</span>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Capture sandbox order */}
            <div className="space-y-2 rounded-[var(--radius-card)] border border-line bg-surface p-3">
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
                  className="h-9 min-w-[170px] flex-1 rounded-[var(--radius-input)] border border-line-strong bg-sunken px-3 font-mono text-sm text-fg outline-none focus:border-accent"
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
              <p className="rounded-[var(--radius-input)] border border-warn/30 bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
                {slowNotice}
              </p>
            )}

            {statusMessage && (
              <div
                className={`space-y-1.5 rounded-[var(--radius-input)] border px-3 py-2.5 text-xs ${
                  statusMessage.tone === 'negative'
                    ? 'tether-error-shake border-drift/45 bg-drift-soft'
                    : 'border-line bg-surface'
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
                    className="inline-flex items-center gap-1 font-mono text-xs font-medium text-accent hover:text-accent-strong hover:underline"
                  >
                    {createdOrder.approve_link}
                    <ExternalLinkIcon className="size-3.5 shrink-0" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
