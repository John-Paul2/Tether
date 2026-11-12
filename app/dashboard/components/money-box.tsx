'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
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

  // Section 7 heal sequence: count down drift exposure $X -> $0 over 600ms via rAF
  const [countdown, setCountdown] = useState<{ to: number; value: number } | null>(null);
  const prevAmountRef = useRef<number>(openDriftAmount);

  useEffect(() => {
    const from = prevAmountRef.current;
    const to = openDriftAmount;
    prevAmountRef.current = to;

    if (from <= to || !recentlyHealedOrderId) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const duration = 600;
    let rafId = 0;
    const start = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = from + (to - from) * eased;
      setCountdown({ to, value });
      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        setCountdown(null);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [openDriftAmount, recentlyHealedOrderId]);

  const activeCountdownValue =
    countdown && countdown.to === openDriftAmount && recentlyHealedOrderId
      ? Math.max(0, countdown.value)
      : null;

  return (
    <section
      aria-label="Open drift exposure"
      data-testid="money-box"
      data-drift-state={hasOpenDrift ? 'drifting' : 'in-sync'}
      style={{ '--stagger-index': 1 } as CSSProperties}
      className={`tether-card-enter flex flex-col justify-between gap-3 rounded-[var(--radius-card)] border bg-surface p-5 transition-colors duration-[var(--dur-slow)] ease-[var(--ease)] ${
        hasOpenDrift ? 'border-drift/40' : 'border-line'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-fg-2">
          {hasOpenDrift ? 'Open drift' : activeCountdownValue !== null ? 'Reconciling' : 'Ledger status'}
        </span>
        {hasOpenDrift ? (
          <StatusPill
            variant="Drift"
            label={`${drift.length} open ${drift.length === 1 ? 'drift' : 'drifts'}`}
          />
        ) : (
          <StatusPill
            variant="In sync"
            className={recentlyHealedOrderId ? 'tether-pill-morph' : ''}
          />
        )}
      </div>

      <div className="min-w-0">
        {activeCountdownValue !== null && !hasOpenDrift ? (
          <p className="flex flex-wrap items-baseline gap-x-2 text-sync">
            <span className="type-display text-sync tabular-nums">
              {formatHeadlineAmount(Math.round(activeCountdownValue))}
            </span>
            <span className="font-display text-xl font-extrabold leading-tight text-sync">
              healed
            </span>
          </p>
        ) : hasOpenDrift ? (
          <p className="tether-drift-glow flex flex-wrap items-baseline gap-x-2 text-drift">
            <span className="type-display text-drift tabular-nums">
              {formatHeadlineAmount(openDriftAmount)}
            </span>
            <span className="font-display text-xl font-extrabold leading-tight text-drift">
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
                <StatusPill
                  variant={selectedIsHealed || selectedOrder.local_status === 'PAID' ? 'PAID' : 'CREATED'}
                  className={selectedIsHealed ? 'tether-pill-morph' : ''}
                />
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
