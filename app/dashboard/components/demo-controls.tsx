'use client';

import { useState } from 'react';
import type { TetherLocalOrderRow } from '@/lib/tether-data';
import { AlertIcon, ExternalLinkIcon } from './ui/icons';
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
}: {
  dropWebhooks: boolean;
  localOrders: TetherLocalOrderRow[];
  onFaultChanged: (drop: boolean) => void;
  onOrderMutated: () => void;
}) {
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
    <section
      aria-label="Demo controls"
      className="mx-4 mt-4 rounded-[24px] bg-warning-bg px-6 py-4 text-warning-content"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning px-3 py-1 text-sm font-semibold text-warning-content">
              <AlertIcon className="size-4" />
              Demo controls
            </span>
            <span className="text-sm font-semibold text-warning-content">
              Labelled fault injection for the PayPal sandbox demo
            </span>
          </div>
          <p className="max-w-3xl text-sm text-warning-content">
            Toggling <strong>Simulate dropped webhooks</strong> is a labelled fault injection for
            the demo: <code className="rounded bg-canvas/70 px-1.5 py-0.5 text-xs">/api/webhook</code>{' '}
            acknowledges PayPal with HTTP 200 without recording the event or updating{' '}
            <code className="rounded bg-canvas/70 px-1.5 py-0.5 text-xs">local_orders</code>, so
            you can create real sandbox state drift and watch Tether diagnose and heal it.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-[16px] bg-canvas px-4 py-2.5 text-ink">
          <div className="text-left">
            <p className="text-sm font-semibold text-ink">Simulate dropped webhooks</p>
            <p className="text-xs text-mute">
              {dropWebhooks ? 'Active: dropping incoming webhooks' : 'Off: normal webhook handling'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={dropWebhooks}
            aria-label="Simulate dropped webhooks"
            disabled={togglingFault}
            onClick={handleToggleFault}
            className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer items-center rounded-full px-1 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              dropWebhooks ? 'bg-negative' : 'bg-canvas-soft'
            }`}
          >
            <span
              className={`inline-block size-5 rounded-full bg-canvas transition-transform ${
                dropWebhooks ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
          <Badge tone={dropWebhooks ? 'negative' : 'positive'}>
            {dropWebhooks ? 'Dropping' : 'Normal'}
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-warning-deep/20 pt-3 lg:grid-cols-2">
        {/* Step 1: Create sandbox order */}
        <div className="flex flex-wrap items-center gap-2 rounded-[16px] bg-canvas p-3 text-ink">
          <label htmlFor="demo-order-amount" className="text-xs font-semibold text-mute">
            USD amount
          </label>
          <input
            id="demo-order-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-24 rounded-[12px] border border-ink bg-canvas px-3 py-1.5 text-sm font-semibold text-ink tabular-nums"
          />
          <Button
            variant="tertiary"
            size="sm"
            disabled={creatingOrder}
            onClick={handleCreateOrder}
          >
            {creatingOrder ? 'Creating order…' : 'Create sandbox order'}
          </Button>

          {createdOrder && (
            <div className="mt-1 flex w-full flex-wrap items-center justify-between gap-2 rounded-[12px] bg-canvas-soft px-3 py-2 text-xs">
              <span className="font-semibold text-ink tabular-nums">
                Order <code className="font-mono">{createdOrder.order_id}</code> ($
                {createdOrder.amount})
              </span>
              {createdOrder.approve_link ? (
                <a
                  href={createdOrder.approve_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-active hover:underline"
                >
                  Approve in PayPal sandbox
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              ) : (
                <span className="text-mute">No approve link returned</span>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Capture sandbox order */}
        <div className="flex flex-wrap items-center gap-2 rounded-[16px] bg-canvas p-3 text-ink">
          <label htmlFor="demo-capture-order-id" className="text-xs font-semibold text-mute">
            Order ID
          </label>
          <input
            id="demo-capture-order-id"
            type="text"
            list="unpaid-local-orders"
            placeholder="e.g. 12N95587M6071792S"
            value={captureOrderId}
            onChange={(e) => setCaptureOrderId(e.target.value)}
            className="min-w-[170px] flex-1 rounded-[12px] border border-ink bg-canvas px-3 py-1.5 font-mono text-sm text-ink"
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
        <p className="mt-3 rounded-[12px] bg-canvas px-4 py-2 text-xs font-semibold text-warning-content">
          {slowNotice}
        </p>
      )}

      {statusMessage && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-canvas px-4 py-2.5 text-sm text-ink">
          <div className="flex items-center gap-2">
            <Badge tone={statusMessage.tone}>
              {statusMessage.tone === 'positive'
                ? 'Ready'
                : statusMessage.tone === 'warning'
                  ? 'Note'
                  : statusMessage.tone === 'negative'
                    ? 'Error'
                    : 'Created'}
            </Badge>
            <span className="text-sm text-body">{statusMessage.text}</span>
          </div>
          {createdOrder?.approve_link && (
            <a
              href={createdOrder.approve_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              {createdOrder.approve_link}
              <ExternalLinkIcon className="size-3.5" />
            </a>
          )}
        </div>
      )}
    </section>
  );
}
