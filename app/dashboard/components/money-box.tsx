'use client';

import type { TetherDriftRow, TetherLocalOrderRow } from '@/lib/tether-data';
import { StatusPill } from './ui/status-pill';

const usdDecimals = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatHeadlineAmount(amount: number): string {
  if (Number.isInteger(amount)) {
    return `$${amount.toLocaleString('en-US')}`;
  }
  return usdDecimals.format(amount);
}

function formatShortOrderId(orderId: string): string {
  if (orderId.length <= 12) return orderId;
  return `${orderId.slice(0, 6)}…${orderId.slice(-4)}`;
}

export function MoneyBox({
  drift,
  selectedOrder,
  totalOrders,
  recentlyHealedOrderId,
}: {
  drift: TetherDriftRow[];
  selectedOrder: TetherLocalOrderRow | null;
  totalOrders: number;
  recentlyHealedOrderId: string | null;
}) {
  const openDriftAmount = drift.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const hasOpenDrift = drift.length > 0 && openDriftAmount > 0;
  const selectedIsHealed = Boolean(
    selectedOrder && recentlyHealedOrderId && selectedOrder.order_id === recentlyHealedOrderId,
  );
  const selectedIsDrifting = Boolean(selectedOrder?.is_drifting) && !selectedIsHealed;

  return (
    <section
      aria-label="Open drift exposure"
      data-testid="money-box"
      data-drift-state={hasOpenDrift ? 'drifting' : 'in-sync'}
      className={`flex flex-col justify-between gap-3 rounded-[var(--radius-card)] border bg-surface p-5 ${
        hasOpenDrift ? 'border-drift/40' : 'border-line'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-fg-2">
          {hasOpenDrift ? 'Open drift' : 'Ledger status'}
        </span>
        {hasOpenDrift ? (
          <StatusPill
            variant="Drift"
            label={`${drift.length} open ${drift.length === 1 ? 'drift' : 'drifts'}`}
          />
        ) : (
          <StatusPill variant="In sync" />
        )}
      </div>

      <div className="min-w-0">
        {hasOpenDrift ? (
          <p className="flex flex-wrap items-baseline gap-x-2 text-drift">
            <span className="type-display text-drift tabular-nums">
              {formatHeadlineAmount(openDriftAmount)}
            </span>
            <span className="font-display text-xl font-semibold leading-tight text-drift">
              at risk
            </span>
          </p>
        ) : (
          <p className="type-display text-sync">In sync</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-fg-2">
        {selectedOrder ? (
          <>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="text-fg-3">Selected</span>
              <code
                className="font-mono text-fg tabular-nums"
                title={selectedOrder.order_id}
              >
                {formatShortOrderId(selectedOrder.order_id)}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-fg-2 tabular-nums">
                {usdDecimals.format(selectedOrder.amount)}
              </span>
              {selectedIsDrifting ? (
                <StatusPill variant="Drift" />
              ) : (
                <StatusPill variant={selectedIsHealed || selectedOrder.local_status === 'PAID' ? 'PAID' : 'CREATED'} />
              )}
            </div>
          </>
        ) : (
          <span className="text-fg-3">
            {totalOrders === 0 ? 'No local orders recorded yet' : 'Select an order row to inspect'}
          </span>
        )}
      </div>
    </section>
  );
}
