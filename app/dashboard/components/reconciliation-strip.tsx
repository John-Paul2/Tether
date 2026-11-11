'use client';

import { useState } from 'react';
import type {
  TetherData,
  TetherDriftRow,
  TetherLocalOrderRow,
  TetherWebhookEventRow,
} from '@/lib/tether-data';
import { CheckIcon, CopyIcon } from './ui/icons';
import { StatusPill } from './ui/status-pill';

type NodeStatus = 'complete' | 'missing' | 'pending';

const usdDecimals = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatShortOrderId(orderId: string): string {
  if (orderId.length <= 12) return orderId;
  return `${orderId.slice(0, 6)}…${orderId.slice(-4)}`;
}

function EventNode({
  label,
  status,
  animateTransition = false,
}: {
  label: string;
  status: NodeStatus;
  animateTransition?: boolean;
}) {
  const transitionClass = animateTransition
    ? 'transition-all duration-[var(--dur-heal)] ease-[var(--ease)] motion-reduce:transition-none'
    : '';

  if (status === 'complete') {
    return (
      <div
        data-node-state="complete"
        className={`inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-input)] border border-sync/45 bg-sync-soft px-3 py-1.5 text-xs font-medium text-fg ${transitionClass}`}
      >
        <span
          className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-sync text-on-accent ${transitionClass}`}
          aria-hidden
        >
          <CheckIcon className="size-2.5" strokeWidth={2.2} />
        </span>
        <span className="whitespace-nowrap">{label}</span>
      </div>
    );
  }

  if (status === 'missing') {
    return (
      <div
        data-node-state="missing"
        className={`inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-input)] border border-dashed border-drift bg-drift-soft px-3 py-1.5 text-xs font-medium text-drift ${transitionClass}`}
      >
        <span
          className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-dashed border-drift bg-sunken ${transitionClass}`}
          aria-hidden
        />
        <span className="whitespace-nowrap">{label}</span>
      </div>
    );
  }

  return (
    <div
      data-node-state="pending"
      className={`inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-input)] border border-line bg-sunken px-3 py-1.5 text-xs font-medium text-fg-2 ${transitionClass}`}
    >
      <span className="size-2 shrink-0 rounded-full bg-fg-3" aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );
}

function FilamentConnector({
  status,
  animateTransition = false,
}: {
  status: 'complete' | 'missing' | 'pending';
  animateTransition?: boolean;
}) {
  if (status === 'missing') {
    return (
      <div
        className="relative mx-2 hidden min-w-[28px] flex-1 items-center gap-1.5 sm:flex"
        data-line-complete="false"
        aria-hidden
      >
        <div className="h-[1.5px] flex-[3] rounded-full bg-drift/75" />
        <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-dashed border-drift bg-drift-soft font-mono text-[10px] font-semibold leading-none text-drift">
          !
        </span>
        <div className="h-[1.5px] flex-1 border-t border-dashed border-drift/55" />
      </div>
    );
  }

  const transitionClass = animateTransition
    ? 'transition-all duration-[var(--dur-heal)] ease-[var(--ease)] motion-reduce:transition-none'
    : '';

  return (
    <div
      className="relative mx-2 hidden h-[1.5px] min-w-[28px] flex-1 overflow-hidden rounded-full bg-line sm:block"
      data-line-complete={status === 'complete' ? 'true' : 'false'}
      aria-hidden
    >
      <div
        className={`absolute inset-0 origin-left ${transitionClass} ${
          status === 'complete' ? 'scale-x-100' : 'scale-x-0'
        }`}
        style={{ backgroundImage: 'var(--filament-gradient)' }}
      />
    </div>
  );
}

export function ReconciliationStripSkeleton() {
  return (
    <section
      aria-label="Reconciliation strip loading"
      className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="h-4 w-48 animate-pulse rounded-[var(--radius-input)] bg-raised" />
        <div className="h-6 w-52 animate-pulse rounded-full bg-raised" />
      </div>
      <div className="mt-3 space-y-2.5">
        <div className="h-8 w-full animate-pulse rounded-[var(--radius-input)] bg-raised" />
        <div className="h-8 w-full animate-pulse rounded-[var(--radius-input)] bg-raised" />
      </div>
    </section>
  );
}

export function ReconciliationStrip({
  drift,
  localOrders,
  webhookEvents,
  paypalStatus,
  selectedOrderId,
  recentlyHealedOrderId,
  isLoading = false,
}: {
  drift: TetherDriftRow[];
  localOrders: TetherLocalOrderRow[];
  webhookEvents: TetherWebhookEventRow[];
  paypalStatus: TetherData['paypalStatus'];
  selectedOrderId?: string | null;
  recentlyHealedOrderId: string | null;
  isLoading?: boolean;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (isLoading && localOrders.length === 0 && drift.length === 0) {
    return <ReconciliationStripSkeleton />;
  }

  const targetOrderId =
    selectedOrderId ?? recentlyHealedOrderId ?? localOrders[0]?.order_id ?? drift[0]?.order_id ?? null;

  const matchingLocalOrder = targetOrderId
    ? (localOrders.find((o) => o.order_id === targetOrderId) ?? null)
    : null;
  const matchingDrift = targetOrderId
    ? (drift.find((d) => d.order_id === targetOrderId) ?? null)
    : null;

  const handleCopy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // Clipboard API unavailable in restricted context
    }
  };

  if (!targetOrderId) {
    return (
      <section
        aria-label="Order reconciliation strip"
        data-testid="reconciliation-strip"
        className="flex min-w-0 flex-col justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="type-h3 text-fg">No orders recorded yet</p>
            <p className="mt-1 text-sm text-fg-2">
              Everything is in sync. Load a drifting order from DEMO to see Tether work.
            </p>
          </div>
          <StatusPill variant="In sync" />
        </div>
      </section>
    );
  }

  const amount = Number(matchingDrift?.amount ?? matchingLocalOrder?.amount ?? 0);
  const justHealed = Boolean(recentlyHealedOrderId && targetOrderId === recentlyHealedOrderId);
  const isDrifting = Boolean(matchingDrift) && !justHealed;
  const copied = copiedId === targetOrderId;

  const orderWebhooks = webhookEvents.filter((w) => w.order_id === targetOrderId && w.verified);
  const hasApprovedWebhook = orderWebhooks.some((w) => w.event_type === 'CHECKOUT.ORDER.APPROVED');
  const hasCaptureWebhook = orderWebhooks.some((w) => w.event_type === 'PAYMENT.CAPTURE.COMPLETED');

  const isLocalPaid = matchingLocalOrder?.local_status === 'PAID' || justHealed;
  const isPayPalCompleted =
    matchingDrift?.paypal_status === 'COMPLETED' || isLocalPaid || hasCaptureWebhook;

  const paypalApproved: NodeStatus = isPayPalCompleted || hasApprovedWebhook ? 'complete' : 'pending';
  const paypalCapture: NodeStatus = isPayPalCompleted ? 'complete' : 'pending';

  const localCaptureExists =
    justHealed ||
    (isLocalPaid && (!matchingDrift || matchingDrift.has_webhook_in_log));

  const localApproved: NodeStatus =
    hasApprovedWebhook || localCaptureExists
      ? 'complete'
      : isPayPalCompleted
        ? 'missing'
        : 'pending';

  const localCapture: NodeStatus = localCaptureExists
    ? 'complete'
    : isDrifting
      ? 'missing'
      : 'pending';

  const localConnectorStatus: 'complete' | 'missing' | 'pending' =
    localCapture === 'complete'
      ? 'complete'
      : localCapture === 'missing'
        ? 'missing'
        : 'pending';

  const paypalConnectorStatus: 'complete' | 'missing' | 'pending' =
    paypalCapture === 'complete' ? 'complete' : 'pending';

  const shortOrderId = formatShortOrderId(targetOrderId);

  return (
    <section
      aria-label="Order reconciliation strip"
      data-testid="reconciliation-strip"
      data-order-id={targetOrderId}
      data-drift-state={isDrifting ? 'drifting' : 'in-sync'}
      className="flex min-w-0 flex-col justify-between gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5"
    >
      {paypalStatus.error && (
        <div
          role="status"
          className="rounded-[var(--radius-input)] border border-warn/30 bg-warn-soft px-3 py-1.5 text-xs font-medium text-warn"
        >
          Live PayPal sandbox check unavailable ({paypalStatus.error}). Showing local receipt log.
        </div>
      )}

      {/* Selected order header row: calm status explanation + ID (copyable), amount, status pills */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-fg-2">
            {isDrifting
              ? 'PayPal says paid. Your database says not.'
              : isLocalPaid
                ? 'PayPal capture and local database match.'
                : 'Order created in sandbox; awaiting buyer approval and capture.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="inline-flex items-center gap-1 rounded-[var(--radius-input)] border border-line bg-sunken pl-2.5 pr-1 py-0.5">
            <span className="text-fg-3">Order</span>
            <code
              className="font-mono font-medium text-fg select-all"
              title={targetOrderId}
            >
              {shortOrderId}
            </code>
            <button
              type="button"
              onClick={() => void handleCopy(targetOrderId)}
              aria-label={`Copy order ID ${targetOrderId}`}
              title={copied ? 'Copied' : 'Copy order ID'}
              className={`inline-flex size-6 cursor-pointer items-center justify-center rounded-[var(--radius-input)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                copied
                  ? 'text-sync'
                  : 'text-fg-2 hover:bg-raised hover:text-fg'
              }`}
            >
              {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            </button>
          </div>

          <span className="font-mono text-sm font-medium text-fg tabular-nums">
            {usdDecimals.format(amount)}
          </span>

          <StatusPill variant={isLocalPaid ? 'PAID' : 'CREATED'} />
          {isDrifting && <StatusPill variant="Drift" />}
        </div>
      </div>

      {/* Aligned PayPal and Local lanes connected by the 1.5px filament */}
      <div className="min-w-0 space-y-2.5">
        {/* PayPal lane */}
        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[72px_minmax(0,1fr)]">
          <span className="inline-flex w-fit items-center justify-center rounded-[var(--radius-input)] bg-paypal-soft px-2 py-1 font-mono text-xs font-medium tracking-wider text-paypal">
            PAYPAL
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-0">
            <EventNode
              label="Order approved"
              status={paypalApproved}
              animateTransition={justHealed}
            />
            <FilamentConnector
              status={paypalConnectorStatus}
              animateTransition={justHealed}
            />
            <EventNode
              label="Capture completed"
              status={paypalCapture}
              animateTransition={justHealed}
            />
          </div>
        </div>

        {/* Local lane */}
        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[72px_minmax(0,1fr)]">
          <span className="inline-flex w-fit items-center justify-center rounded-[var(--radius-input)] bg-sync-soft px-2 py-1 font-mono text-xs font-medium tracking-wider text-sync">
            LOCAL
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-0">
            <EventNode
              label="Order approved"
              status={localApproved}
              animateTransition={justHealed || Boolean(matchingDrift)}
            />
            <FilamentConnector
              status={localConnectorStatus}
              animateTransition={true}
            />
            <EventNode
              label="Capture completed"
              status={localCapture}
              animateTransition={true}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
