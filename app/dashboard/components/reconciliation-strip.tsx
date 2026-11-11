'use client';

import type {
  TetherData,
  TetherDriftRow,
  TetherLocalOrderRow,
  TetherWebhookEventRow,
} from '@/lib/tether-data';
import { CheckCircleIcon } from './ui/icons';

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

function formatRiskHeadlineAmount(amount: number): string {
  if (Number.isInteger(amount)) {
    return `$${amount.toLocaleString('en-US')}`;
  }
  return usdDecimals.format(amount);
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
    ? 'transition-all duration-[600ms] ease-out motion-reduce:transition-none'
    : '';

  if (status === 'complete') {
    return (
      <div
        data-node-state="complete"
        className={`inline-flex shrink-0 items-center gap-2 rounded-full border-2 border-solid border-positive bg-positive-bg px-3 py-1 text-xs font-semibold tracking-wide text-positive-deep ${transitionClass}`}
      >
        <span
          className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-positive text-on-primary ${transitionClass}`}
          aria-hidden
        >
          <svg viewBox="0 0 12 12" className="size-2.5 fill-none stroke-current" strokeWidth="2">
            <path d="M2.5 6.2 4.9 8.6 9.5 3.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="whitespace-nowrap">{label}</span>
      </div>
    );
  }

  if (status === 'missing') {
    return (
      <div
        data-node-state="missing"
        className={`inline-flex shrink-0 items-center gap-2 rounded-full border-2 border-dashed border-negative bg-negative/5 px-3 py-1 text-xs font-semibold tracking-wide text-negative-deep ${transitionClass}`}
      >
        <span
          className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-negative bg-canvas ${transitionClass}`}
          aria-hidden
        />
        <span className="whitespace-nowrap">{label}</span>
      </div>
    );
  }

  return (
    <div
      data-node-state="pending"
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border border-canvas-soft bg-canvas-soft/60 px-3 py-1 text-xs font-semibold tracking-wide text-mute ${transitionClass}`}
    >
      <span className="size-2.5 shrink-0 rounded-full bg-mute/50" aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );
}

function LaneConnector({
  complete,
  missing,
  animateTransition = false,
}: {
  complete: boolean;
  missing: boolean;
  animateTransition?: boolean;
}) {
  return (
    <div className="relative mx-2 hidden h-0.5 min-w-[28px] flex-1 overflow-hidden rounded-full sm:block" aria-hidden>
      {/* Underlying track: dashed red if missing, neutral grey otherwise */}
      <div
        className={`absolute inset-0 border-t-2 ${
          missing ? 'border-dashed border-negative/60' : 'border-solid border-canvas-soft'
        }`}
      />
      {/* Solid green fill bar that animates across 600ms on heal */}
      <div
        data-line-complete={complete ? 'true' : 'false'}
        className={`absolute inset-0 origin-left bg-positive ${
          animateTransition
            ? 'transition-transform duration-[600ms] ease-out motion-reduce:transition-none'
            : ''
        } ${complete ? 'scale-x-100' : 'scale-x-0'}`}
      />
    </div>
  );
}

export function ReconciliationStripSkeleton() {
  return (
    <section
      aria-label="Reconciliation strip loading"
      className="mx-4 mt-4 rounded-[16px] border border-canvas-soft bg-canvas p-4 shadow-[var(--card-shadow)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex-1 space-y-2">
          <div className="h-9 w-full max-w-xl animate-pulse rounded-full bg-canvas-soft/70" />
          <div className="h-9 w-full max-w-xl animate-pulse rounded-full bg-canvas-soft/70" />
        </div>
        <div className="space-y-2 lg:w-56">
          <div className="h-4 w-32 animate-pulse rounded bg-canvas-soft lg:ml-auto" />
          <div className="h-7 w-40 animate-pulse rounded bg-canvas-soft lg:ml-auto" />
        </div>
      </div>
    </section>
  );
}

export function ReconciliationStrip({
  drift,
  localOrders,
  webhookEvents,
  paypalStatus,
  recentlyHealedOrderId,
  isLoading = false,
}: {
  drift: TetherDriftRow[];
  localOrders: TetherLocalOrderRow[];
  webhookEvents: TetherWebhookEventRow[];
  paypalStatus: TetherData['paypalStatus'];
  recentlyHealedOrderId: string | null;
  isLoading?: boolean;
}) {
  if (isLoading && localOrders.length === 0 && drift.length === 0) {
    return <ReconciliationStripSkeleton />;
  }

  const openDrift = drift[0] ?? null;

  // Prefer pinned recently healed order during the 600ms transition window so the DOM stays
  // mounted on the same order node while Local nodes + connecting line fill in smoothly.
  const pinnedOrder = recentlyHealedOrderId
    ? (localOrders.find((o) => o.order_id === recentlyHealedOrderId) ?? null)
    : null;

  const targetOrderId = openDrift?.order_id ?? pinnedOrder?.order_id ?? localOrders[0]?.order_id ?? null;
  const matchingLocalOrder = targetOrderId
    ? (localOrders.find((o) => o.order_id === targetOrderId) ?? null)
    : null;
  const matchingDrift = targetOrderId
    ? (drift.find((d) => d.order_id === targetOrderId) ?? null)
    : null;

  if (!targetOrderId) {
    return (
      <section
        aria-label="Order reconciliation strip"
        data-testid="reconciliation-strip"
        className="mx-4 mt-4 rounded-[16px] border border-canvas-soft bg-canvas p-4 shadow-[var(--card-shadow)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-ink">No orders to reconcile yet</p>
            <p className="mt-1 text-sm text-body">
              Create a PayPal sandbox order in Demo controls above to watch webhook reconciliation live.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-bg px-3 py-1 text-xs font-semibold text-positive-deep">
            <CheckCircleIcon className="size-3.5" />
            In sync
          </span>
        </div>
      </section>
    );
  }

  const amount = Number(matchingDrift?.amount ?? matchingLocalOrder?.amount ?? 0);
  const justHealed = Boolean(recentlyHealedOrderId && targetOrderId === recentlyHealedOrderId);
  const isDrifting = Boolean(matchingDrift) && !justHealed;

  const orderWebhooks = webhookEvents.filter((w) => w.order_id === targetOrderId && w.verified);
  const hasApprovedWebhook = orderWebhooks.some((w) => w.event_type === 'CHECKOUT.ORDER.APPROVED');
  const hasCaptureWebhook = orderWebhooks.some((w) => w.event_type === 'PAYMENT.CAPTURE.COMPLETED');

  const isLocalPaid = matchingLocalOrder?.local_status === 'PAID' || justHealed;
  const isPayPalCompleted =
    matchingDrift?.paypal_status === 'COMPLETED' || isLocalPaid || hasCaptureWebhook;

  // Derive PayPal lane states
  const paypalApproved: NodeStatus = isPayPalCompleted || hasApprovedWebhook ? 'complete' : 'pending';
  const paypalCapture: NodeStatus = isPayPalCompleted ? 'complete' : 'pending';

  // Derive Local lane states from drift, local_status, has_webhook_in_log & receipt log
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

  const shortOrderId = formatShortOrderId(targetOrderId);

  return (
    <section
      aria-label="Order reconciliation strip"
      data-testid="reconciliation-strip"
      data-order-id={targetOrderId}
      data-drift-state={isDrifting ? 'drifting' : 'in-sync'}
      className="mx-4 mt-4 rounded-[16px] border border-canvas-soft bg-canvas p-4 shadow-[var(--card-shadow)]"
    >
      {paypalStatus.error && (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-warning-bg px-3 py-1.5 text-xs font-medium text-warning-content"
        >
          <span>
            Live PayPal sandbox check unavailable ({paypalStatus.error}). Showing local receipt log state.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        {/* Two horizontal lanes: PayPal and Local */}
        <div className="min-w-0 flex-1 space-y-2.5 sm:space-y-2">
          {/* PayPal lane */}
          <div className="flex flex-wrap items-center gap-2 py-0.5 sm:flex-nowrap">
            <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wider text-mute sm:w-16">
              PayPal
            </span>
            <EventNode
              label="ORDER APPROVED"
              status={paypalApproved}
              animateTransition={justHealed}
            />
            <LaneConnector
              complete={paypalCapture === 'complete'}
              missing={false}
              animateTransition={justHealed}
            />
            <EventNode
              label="CAPTURE COMPLETED"
              status={paypalCapture}
              animateTransition={justHealed}
            />
          </div>

          {/* Local lane */}
          <div className="flex flex-wrap items-center gap-2 py-0.5 sm:flex-nowrap">
            <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wider text-mute sm:w-16">
              Local
            </span>
            <EventNode
              label="ORDER APPROVED"
              status={localApproved}
              animateTransition={justHealed || Boolean(matchingDrift)}
            />
            <LaneConnector
              complete={localCapture === 'complete'}
              missing={localCapture === 'missing'}
              animateTransition={true}
            />
            <EventNode
              label="CAPTURE COMPLETED"
              status={localCapture}
              animateTransition={true}
            />
          </div>
        </div>

        {/* Right summary block */}
        <div className="flex shrink-0 flex-row items-center justify-between gap-4 border-t border-canvas-soft pt-3 lg:flex-col lg:items-end lg:justify-center lg:gap-1 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="flex items-center gap-2 text-xs text-mute">
            <span className="font-semibold text-ink">Order</span>
            <code
              className="whitespace-nowrap rounded-[8px] bg-canvas-soft px-2 py-0.5 font-mono text-xs font-semibold text-ink select-all"
              title={targetOrderId}
            >
              {shortOrderId}
            </code>
            <span aria-hidden>·</span>
            <span className="text-sm font-semibold text-ink tabular-nums">
              {usdDecimals.format(amount)}
            </span>
          </div>

          {isDrifting ? (
            <div className="text-right">
              <p className="font-display text-2xl font-extrabold leading-7 tracking-tight text-negative tabular-nums">
                {formatRiskHeadlineAmount(amount)} at risk
              </p>
              <p className="text-xs font-semibold text-negative-deep">
                Missing local capture webhook
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2 lg:flex-col lg:items-end lg:gap-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-bg px-3 py-1 text-xs font-semibold text-positive-deep">
                <span className="size-2 rounded-full bg-positive" aria-hidden />
                In sync
              </span>
              <p className="text-sm font-semibold text-positive-deep">
                All orders reconciled
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
