'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import { GripHorizontal } from 'lucide-react';
import type { TetherDriftRow, TetherLocalOrderRow } from '@/lib/tether-data';
import {
  AlertIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  CloseIcon,
  RefreshIcon,
  StethoscopeIcon,
} from './ui/icons';
import { StatusPill } from './ui/status-pill';
import { Badge, type BadgeTone, Button, IconButton } from './ui/ui';

type DriftApiItem = {
  order_id: string;
  paypal_status: string;
  local_status: 'CREATED' | 'PAID';
  amount: string | number;
  capture_id: string | null;
  has_webhook_in_log: boolean;
};

type ProposeHealCondition = {
  name?: string;
  label?: string;
  passed?: boolean;
  ok?: boolean;
  reason?: string;
};

type AgentTraceStep = {
  step: number;
  tool_call_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  result_summary: string;
  duration_ms: number;
  model_used: string;
  conditions?: ProposeHealCondition[];
  checks?: ProposeHealCondition[];
};

type AgentEvidenceItem = {
  claim: string;
  tool_call_id: string;
};

type AgentResultPayload = {
  run_id: number;
  order_id: string | null;
  model_used: string;
  root_cause: string;
  summary: string;
  evidence: AgentEvidenceItem[];
  confidence: 'high' | 'medium' | 'low';
  recommended_action: string;
  safe_to_heal: boolean;
  trace: AgentTraceStep[];
};

type HealOutcome = {
  healed: boolean;
  order_id: string;
  event_id: string | null;
  action: string;
  result: string;
  reason: string;
  seconds_to_fixed: number | null;
  before_status: string;
  after_status: string;
  log_id: number;
};

function rootCauseTone(rootCause: string): BadgeTone {
  switch (rootCause) {
    case 'NO_DRIFT':
      return 'positive';
    case 'WEBHOOK_DROPPED_BY_LISTENER':
    case 'SIGNATURE_VERIFICATION_FAILING':
      return 'negative';
    case 'WEBHOOK_URL_OR_EVENT_MISMATCH':
    case 'UNKNOWN':
    default:
      return 'warning';
  }
}

function formatRootCause(rootCause: string): string {
  switch (rootCause) {
    case 'WEBHOOK_DROPPED_BY_LISTENER':
      return 'Webhook dropped by listener';
    case 'WEBHOOK_URL_OR_EVENT_MISMATCH':
      return 'Webhook URL or event mismatch';
    case 'SIGNATURE_VERIFICATION_FAILING':
      return 'Signature verification failing';
    case 'NO_DRIFT':
      return 'No drift';
    default:
      return 'Unknown root cause';
  }
}

function confidenceTone(confidence: string): BadgeTone {
  if (confidence === 'high') return 'positive';
  if (confidence === 'medium') return 'info';
  return 'warning';
}

function extractResendEventId(
  diagnosis: AgentResultPayload,
  steps: AgentTraceStep[],
): string | null {
  const allSteps = diagnosis.trace?.length ? diagnosis.trace : steps;
  const proposeStep = allSteps.find((s) => s.tool_name === 'propose_heal');
  const proposeMatch = proposeStep?.result_summary?.match(/\bevent_id=(WH-[A-Za-z0-9-]+)\b/);
  if (proposeMatch?.[1]) return proposeMatch[1];

  const eventLogStep = allSteps.find((s) => s.tool_name === 'get_paypal_event_log');
  const captureLogMatch = eventLogStep?.result_summary?.match(
    /PAYMENT\.CAPTURE\.COMPLETED\((WH-[A-Za-z0-9-]+)\)/,
  );
  if (captureLogMatch?.[1]) return captureLogMatch[1];

  const proseSources = [
    diagnosis.recommended_action,
    diagnosis.summary,
    ...diagnosis.evidence.map((e) => e.claim),
  ];
  for (const text of proseSources) {
    const match = text?.match(/\b(WH-[A-Za-z0-9-]+)\b/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractProposeHealConditions(
  proposeStep: AgentTraceStep | undefined,
): ProposeHealCondition[] | null {
  if (!proposeStep) return null;
  const rawList = proposeStep.conditions ?? proposeStep.checks;
  if (Array.isArray(rawList) && rawList.length > 0) {
    return rawList;
  }
  return null;
}

function formatShortOrderId(orderId: string): string {
  if (orderId.length <= 12) return orderId;
  return `${orderId.slice(0, 6)}…${orderId.slice(-4)}`;
}

export function DoctorPanel({
  initialDrift,
  dropWebhooks,
  selectedOrder,
  isSelectedDrifting = false,
  onHealedOrUpdated,
  onHealSucceeded,
  onInvestigatingChange,
  onCloseDrawer,
}: {
  initialDrift: TetherDriftRow[];
  dropWebhooks: boolean;
  selectedOrder?: TetherLocalOrderRow | null;
  isSelectedDrifting?: boolean;
  onHealedOrUpdated: () => void;
  onHealSucceeded?: (outcome: { order_id: string; event_id: string | null }) => void;
  onInvestigatingChange?: (running: boolean) => void;
  onCloseDrawer?: () => void;
}) {
  const [manualDrift, setManualDrift] = useState<{
    source: TetherDriftRow[];
    items: DriftApiItem[];
  } | null>(null);

  const driftItems: DriftApiItem[] =
    manualDrift && manualDrift.source === initialDrift
      ? manualDrift.items
      : initialDrift.map((d) => ({
          order_id: d.order_id,
          paypal_status: d.paypal_status,
          local_status: d.local_status,
          amount: d.amount.toFixed(2),
          capture_id: d.capture_id,
          has_webhook_in_log: d.has_webhook_in_log,
        }));

  const [loadingDrift, setLoadingDrift] = useState(false);
  const [paypalSlowNotice, setPaypalSlowNotice] = useState<string | null>(null);
  const [driftError, setDriftError] = useState<string | null>(null);

  const [investigatingOrderId, setInvestigatingOrderId] = useState<string | null>(null);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [modelSlowNotice, setModelSlowNotice] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);

  const [steps, setSteps] = useState<AgentTraceStep[]>([]);
  const [highlightedToolCallId, setHighlightedToolCallId] = useState<string | null>(null);
  const [hoveredToolCallId, setHoveredToolCallId] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<AgentResultPayload | null>(null);

  const [isHealing, setIsHealing] = useState(false);
  const [healSlowNotice, setHealSlowNotice] = useState<string | null>(null);
  const [healError, setHealError] = useState<string | null>(null);
  const [healOutcome, setHealOutcome] = useState<HealOutcome | null>(null);

  const fetchDrift = useCallback(async () => {
    setLoadingDrift(true);
    setDriftError(null);
    setPaypalSlowNotice(null);

    const slowTimer = setTimeout(() => {
      setPaypalSlowNotice(
        'PayPal sandbox is responding slowly while checking live order statuses. Still waiting…',
      );
    }, 3500);

    try {
      const res = await fetch('/api/drift', { cache: 'no-store' });
      const data = (await res.json()) as DriftApiItem[] | { error?: string };
      if (!res.ok || !Array.isArray(data)) {
        const errMsg =
          !Array.isArray(data) && data?.error
            ? data.error
            : `PayPal drift check failed with status ${res.status}`;
        throw new Error(errMsg);
      }
      setManualDrift({ source: initialDrift, items: data });
    } catch (err) {
      setDriftError(
        err instanceof Error
          ? `Could not verify live order status with PayPal: ${err.message}. Check your connection or sandbox credentials and click Retry.`
          : 'PayPal sandbox timed out while checking for drift. Click Retry to check again.',
      );
    } finally {
      clearTimeout(slowTimer);
      setPaypalSlowNotice(null);
      setLoadingDrift(false);
    }
  }, [initialDrift]);

  const handleInvestigate = async (orderId?: string) => {
    const targetOrder = orderId?.trim() || undefined;
    setInvestigatingOrderId(targetOrder ?? 'system');
    setIsInvestigating(true);
    onInvestigatingChange?.(true);
    setAgentError(null);
    setModelSlowNotice(null);
    setSteps([]);
    setDiagnosis(null);
    setHealOutcome(null);
    setHealError(null);
    setHighlightedToolCallId(null);
    setHoveredToolCallId(null);

    const slowTimer = setTimeout(() => {
      setModelSlowNotice(
        'The diagnostic model is taking longer than usual to finish reasoning over PayPal and SQLite tool results…',
      );
    }, 8000);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 75000);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetOrder ? { orderId: targetOrder } : {}),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Doctor agent endpoint returned HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const lines = frame.split('\n');
          let eventName = 'message';
          const dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trim());
            }
          }

          const rawData = dataLines.join('\n');
          if (!rawData) continue;

          if (eventName === 'step') {
            const step = JSON.parse(rawData) as AgentTraceStep;
            setSteps((prev) => [...prev, step]);
          } else if (eventName === 'result') {
            const result = JSON.parse(rawData) as AgentResultPayload;
            setDiagnosis(result);
            if (Array.isArray(result.trace) && result.trace.length > 0) {
              setSteps(result.trace);
            }
            onHealedOrUpdated();
          } else if (eventName === 'error') {
            const errObj = JSON.parse(rawData) as { error?: string };
            throw new Error(errObj.error ?? 'Doctor agent failed during investigation');
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setAgentError(
          'The diagnostic model timed out after 75 seconds. Wait a moment and click Investigate to try again.',
        );
      } else {
        setAgentError(
          err instanceof Error
            ? `Investigation interrupted: ${err.message}. Click Investigate to run a fresh check.`
            : 'The model timed out or returned an unexpected error. Click Investigate to retry.',
        );
      }
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(timeoutId);
      setModelSlowNotice(null);
      setIsInvestigating(false);
      onInvestigatingChange?.(false);
    }
  };

  const handleApproveFix = async () => {
    const orderId = diagnosis?.order_id || investigatingOrderId;
    if (!orderId || orderId === 'system' || !diagnosis?.safe_to_heal) {
      return;
    }

    const matchingDrift = driftItems.find((d) => d.order_id === orderId);
    const beforeStatus = matchingDrift?.local_status ?? 'CREATED';

    setIsHealing(true);
    setHealError(null);
    setHealSlowNotice(null);

    const slowTimer = setTimeout(() => {
      setHealSlowNotice(
        'Resent webhook requested from PayPal sandbox — polling local_orders every 1s for verified webhook receipt…',
      );
    }, 2500);

    try {
      const res = await fetch('/api/agent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      const data = (await res.json()) as {
        healed?: boolean;
        order_id?: string;
        event_id?: string | null;
        action?: string;
        result?: string;
        reason?: string;
        seconds_to_fixed?: number | null;
        log_id?: number;
      };

      if (!res.ok || !data.healed) {
        setHealError(
          data.reason ??
            `Heal did not complete (status ${res.status}: ${data.result ?? 'refused'}). Make sure "Simulate dropped webhooks" is turned OFF and try again.`,
        );
        onHealedOrUpdated();
        return;
      }

      const outcomeOrderId = data.order_id ?? orderId;
      const outcomeEventId = data.event_id ?? null;

      setHealOutcome({
        healed: true,
        order_id: outcomeOrderId,
        event_id: outcomeEventId,
        action: data.action ?? 'RESEND_WEBHOOK',
        result: data.result ?? 'healed',
        reason: data.reason ?? '',
        seconds_to_fixed: data.seconds_to_fixed ?? null,
        before_status: beforeStatus,
        after_status: 'PAID',
        log_id: data.log_id ?? 0,
      });

      onHealSucceeded?.({
        order_id: outcomeOrderId,
        event_id: outcomeEventId,
      });

      // Refresh both the drift list in Doctor panel and the AG Studio dashboard data
      await fetchDrift();
      onHealedOrUpdated();
    } catch (err) {
      setHealError(
        err instanceof Error
          ? `Approve fix request failed: ${err.message}. Check server connection and retry.`
          : 'PayPal sandbox timed out while resending the webhook. Try again in a moment.',
      );
    } finally {
      clearTimeout(slowTimer);
      setHealSlowNotice(null);
      setIsHealing(false);
    }
  };

  const scrollToStep = (toolCallId: string) => {
    setHighlightedToolCallId(toolCallId);
    const el = document.getElementById(`trace-step-${toolCallId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const disabledFixReason = (() => {
    if (!diagnosis) return null;
    if (healOutcome?.healed) {
      return `Order ${healOutcome.order_id} has already been healed and verified as PAID.`;
    }
    if (diagnosis.safe_to_heal) return null;
    if (dropWebhooks) {
      return 'Disabled because "Simulate dropped webhooks" is ON in DEMO. Turn it OFF and run Investigate again.';
    }
    if (diagnosis.root_cause === 'NO_DRIFT') {
      return 'Disabled because this order has no state drift — local status already matches PayPal.';
    }
    if (diagnosis.root_cause === 'WEBHOOK_URL_OR_EVENT_MISMATCH') {
      return 'Disabled because the PayPal webhook URL does not match PUBLIC_BASE_URL. Update registration before resending.';
    }
    return 'Disabled because server-side preconditions (propose_heal) returned safe_to_heal = false.';
  })();

  const diagnosisSteps = diagnosis?.trace?.length ? diagnosis.trace : steps;
  const proposeStep = diagnosisSteps.find((s) => s.tool_name === 'propose_heal');
  const proposeConditions = extractProposeHealConditions(proposeStep);
  const resendEventId = diagnosis ? extractResendEventId(diagnosis, diagnosisSteps) : null;
  const canApproveFix = Boolean(diagnosis?.safe_to_heal && !isHealing && !healOutcome?.healed);
  const approveTitle =
    disabledFixReason ??
    (!diagnosis ? 'Run Investigate on a drifting order before approving replay.' : undefined);

  return (
    <div
      data-testid="doctor-panel"
      style={{ '--stagger-index': 0 } as CSSProperties}
      className="tether-glass-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] text-fg"
    >
      {/* Sticky Header (also acts as drag bar to float/dock the Doctor tile): Grip, Stethoscope, Title, Refresh, Close, and Selected Order */}
      <header
        data-doctor-drag-header="true"
        title="Drag to float or snap to left/right edge"
        className="shrink-0 border-b border-[var(--glass-border)] bg-[var(--glass-panel-tint)] p-4 select-none lg:cursor-grab [[data-doctor-dragging='true']_&]:cursor-grabbing"
      >
        <div
          className="-mt-1.5 mb-1.5 hidden items-center justify-center text-fg-3/70 lg:flex"
          aria-hidden
        >
          <GripHorizontal className="size-4" strokeWidth={1.75} />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-input)] border border-ai/20 bg-ai-soft text-ai">
              <StethoscopeIcon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-extrabold leading-tight tracking-tight text-fg">
                Doctor panel
              </h2>
              <p className="mt-0.5 truncate text-xs text-fg-2">
                PayPal vs. SQLite drift &amp; replay
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              label="Refresh drift check"
              disabled={loadingDrift}
              onClick={() => void fetchDrift()}
            >
              <RefreshIcon className={`size-4 ${loadingDrift ? 'animate-spin' : ''}`} />
            </IconButton>
            {onCloseDrawer && (
              <IconButton label="Close Doctor panel" onClick={onCloseDrawer}>
                <CloseIcon className="size-4" />
              </IconButton>
            )}
          </div>
        </div>

        {selectedOrder && (
          <div
            data-testid="doctor-selected-order"
            data-order-id={selectedOrder.order_id}
            className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-input)] border border-[var(--glass-border)] bg-[var(--glass-inner-bg)] px-3 py-2 text-xs"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-fg-3">Selected</span>
              <code
                className="font-mono font-medium text-fg tabular-nums"
                title={selectedOrder.order_id}
              >
                {formatShortOrderId(selectedOrder.order_id)}
              </code>
              <span className="font-mono text-fg-2 tabular-nums">
                ${Number(selectedOrder.amount).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <StatusPill
                variant={
                  isSelectedDrifting
                    ? 'Drift'
                    : selectedOrder.local_status === 'PAID'
                      ? 'PAID'
                      : 'CREATED'
                }
              />
              {isSelectedDrifting && (
                <button
                  type="button"
                  disabled={isInvestigating}
                  onClick={() => void handleInvestigate(selectedOrder.order_id)}
                  className="cursor-pointer rounded-full border border-ai/30 bg-ai-soft px-2.5 py-0.5 text-xs font-semibold text-ai transition-colors hover:border-accent hover:bg-accent hover:text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isInvestigating && investigatingOrderId === selectedOrder.order_id
                    ? 'Investigating…'
                    : 'Investigate'}
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Scrollable Middle: Drift list, SSE Trace steps, Diagnosis, Safety checks, Evidence, Result */}
      <div className="tether-doctor-scroll flex-1 min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4">
        {loadingDrift && !paypalSlowNotice && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-[var(--radius-input)] border border-ai/25 bg-ai-soft px-3 py-2 text-xs font-medium text-ai"
          >
            <span
              className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-ai/25 border-t-ai"
              aria-hidden
            />
            <span>Checking live PayPal sandbox order status…</span>
          </div>
        )}

        {paypalSlowNotice && (
          <div className="rounded-[var(--radius-input)] border border-warn/45 bg-warn-soft px-3.5 py-2.5 text-xs font-medium text-warn-ink">
            {paypalSlowNotice}
          </div>
        )}

        {driftError && (
          <div className="tether-error-shake rounded-[var(--radius-card)] border border-drift/40 bg-drift-soft p-3.5 text-xs text-drift">
            <p className="font-semibold">PayPal sandbox drift check didn&apos;t finish</p>
            <p className="mt-1 text-fg-2">{driftError}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void fetchDrift()}
            >
              Retry drift check
            </Button>
          </div>
        )}

        {/* Drifting orders list or calm empty state */}
        <section aria-label="Drifting orders">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-2">
              Drifting orders ({driftItems.length})
            </span>
            <StatusPill
              variant={driftItems.length > 0 ? 'Drift' : 'In sync'}
              label={driftItems.length > 0 ? `${driftItems.length} open` : 'In sync'}
            />
          </div>

          {driftItems.length === 0 ? (
            <div className="mt-2.5 rounded-[var(--radius-card)] border border-[var(--glass-border)] bg-[var(--glass-inner-bg)] p-3.5">
              <div className="flex items-start gap-2.5">
                <CheckCircleIcon className="mt-0.5 size-4.5 shrink-0 text-sync" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg">Everything is in sync</p>
                  <p className="mt-1 text-xs leading-relaxed text-fg-2">
                    PayPal capture records match local orders. Load a drifting order from DEMO or run
                    a live diagnostic check.
                  </p>
                  <button
                    type="button"
                    disabled={isInvestigating}
                    onClick={() => void handleInvestigate()}
                    className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-ai/35 bg-ai-soft px-3.5 py-1.5 text-xs font-semibold text-ai transition-colors hover:border-accent hover:bg-accent hover:text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isInvestigating && investigatingOrderId === 'system' ? (
                      <>
                        <span
                          className="size-3 animate-spin rounded-full border-[1.5px] border-ai/30 border-t-ai"
                          aria-hidden
                        />
                        <span>Investigating…</span>
                      </>
                    ) : (
                      <span>Investigate system health</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <ul className="mt-2.5 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-drift/35 bg-drift-soft/45">
              {driftItems.map((item) => {
                const active = isInvestigating && investigatingOrderId === item.order_id;
                return (
                  <li
                    key={item.order_id}
                    className="flex flex-col gap-2.5 p-3.5 sm:flex-row sm:items-center sm:justify-between xl:flex-col xl:items-stretch 2xl:flex-row 2xl:items-center"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="font-mono text-xs font-semibold text-fg"
                          title={item.order_id}
                        >
                          {formatShortOrderId(item.order_id)}
                        </span>
                        <span className="font-mono text-xs font-semibold text-fg-2 tabular-nums">
                          ${Number(item.amount).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill variant="CREATED" label={`Local: ${item.local_status}`} />
                        <StatusPill variant="Drift" label={`PayPal: ${item.paypal_status}`} />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isInvestigating}
                      onClick={() => void handleInvestigate(item.order_id)}
                      className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-ai/35 bg-ai-soft px-3.5 py-1.5 text-xs font-semibold text-ai transition-colors hover:border-accent hover:bg-accent hover:text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {active ? (
                        <>
                          <span
                            className="size-3 animate-spin rounded-full border-[1.5px] border-ai/30 border-t-ai"
                            aria-hidden
                          />
                          <span>Investigating…</span>
                        </>
                      ) : (
                        <span>Investigate</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Live SSE trace step cards (--ai-soft) */}
        {(isInvestigating || steps.length > 0 || agentError) && (
          <section
            aria-label="Live agent trace"
            className="rounded-[var(--radius-card)] border border-[var(--glass-border)] bg-[var(--glass-inner-bg)] p-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-2">
                  Agent trace
                  {investigatingOrderId && investigatingOrderId !== 'system'
                    ? ` · ${formatShortOrderId(investigatingOrderId)}`
                    : ''}
                </h3>
              </div>
              {isInvestigating ? (
                <Badge tone="info">
                  <span
                    className="size-2.5 animate-spin rounded-full border-[1.5px] border-ai/30 border-t-ai"
                    aria-hidden
                  />
                  Streaming…
                </Badge>
              ) : steps.length > 0 ? (
                <Badge tone="info">{steps.length} steps</Badge>
              ) : null}
            </div>

            {modelSlowNotice && (
              <div className="mt-2.5 rounded-[var(--radius-input)] border border-warn/45 bg-warn-soft px-3 py-2 text-xs font-medium text-warn-ink">
                {modelSlowNotice}
              </div>
            )}

            {agentError && (
              <div className="tether-error-shake mt-2.5 rounded-[var(--radius-input)] border border-drift/40 bg-drift-soft p-3 text-xs text-drift">
                <div className="flex items-start gap-2">
                  <AlertIcon className="mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold">Investigation could not finish</p>
                    <p className="mt-1 text-fg-2">{agentError}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2.5"
                      onClick={() =>
                        void handleInvestigate(
                          investigatingOrderId === 'system'
                            ? undefined
                            : (investigatingOrderId ?? undefined),
                        )
                      }
                    >
                      Retry investigation
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {isInvestigating && steps.length === 0 && !agentError && (
              <div className="mt-2.5 flex items-center gap-2 rounded-[var(--radius-input)] border border-ai/25 bg-ai-soft px-3 py-2.5 text-xs font-medium text-ai">
                <span
                  className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-ai/30 border-t-ai"
                  aria-hidden
                />
                <span>Inspecting PayPal sandbox &amp; local SQLite…</span>
              </div>
            )}

            <ol className="mt-2.5">
              {steps.map((step, index) => {
                const isOutlined =
                  hoveredToolCallId === step.tool_call_id ||
                  highlightedToolCallId === step.tool_call_id;
                const isLatestRunning = isInvestigating && index === steps.length - 1;
                return (
                  <li key={step.tool_call_id} id={`trace-step-${step.tool_call_id}`}>
                    {index > 0 && (
                      <div
                        aria-hidden
                        className="tether-stepper-connector ml-5 h-2.5 w-[1.5px] opacity-80"
                        style={{ backgroundImage: 'var(--filament-gradient)' }}
                      />
                    )}
                    <div
                      className={`tether-step-enter rounded-[var(--radius-input)] border px-3 py-2.5 transition-[border-color,box-shadow,background-color] duration-[var(--dur-fast)] ease-[var(--ease)] ${
                        isOutlined
                          ? 'border-ai bg-ai-soft ring-1 ring-ai'
                          : 'border-ai/20 bg-ai-soft'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-ai/25 bg-surface font-mono text-[11px] font-semibold text-ai tabular-nums">
                            {step.step}
                          </span>
                          <span className="truncate font-mono text-xs font-semibold text-fg">
                            {step.tool_name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-fg-2 tabular-nums">
                            {step.duration_ms} ms
                          </span>
                          <span className="rounded-full border border-ai/20 bg-surface px-2 py-0.5 font-mono text-[11px] text-ai">
                            {step.model_used}
                          </span>
                          {isLatestRunning ? (
                            <span
                              className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-ai/30 border-t-ai"
                              title="Step running"
                              aria-hidden
                            />
                          ) : (
                            <CheckIcon
                              className="tether-tick-draw size-3.5 shrink-0 text-sync"
                              strokeWidth={2}
                              aria-hidden
                            />
                          )}
                        </div>
                      </div>

                      <p className="mt-1.5 break-words font-mono text-[11px] leading-relaxed text-fg-2">
                        {step.result_summary}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* Diagnosis card */}
        {diagnosis && (
          <section
            aria-label="Diagnosis"
            className="tether-diagnosis-enter space-y-3.5 rounded-[var(--radius-card)] border border-[var(--glass-border-strong)] bg-[var(--glass-inner-bg)] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-extrabold text-fg">Diagnosis</h3>
              <Badge tone={rootCauseTone(diagnosis.root_cause)} className="tether-badge-pop">
                {formatRootCause(diagnosis.root_cause)}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={confidenceTone(diagnosis.confidence)}>
                Confidence: {diagnosis.confidence}
              </Badge>
              <span className="rounded-full border border-ai/20 bg-ai-soft px-2 py-0.5 font-mono text-[11px] text-ai">
                {diagnosis.model_used}
              </span>
            </div>

            <p className="text-xs leading-relaxed text-fg-2">{diagnosis.summary}</p>

            {diagnosis.recommended_action && (
              <div className="rounded-[var(--radius-input)] border border-line bg-sunken/80 px-3 py-2.5 text-xs text-fg">
                <span className="font-semibold text-fg">Recommended action: </span>
                <span className="text-fg-2">{diagnosis.recommended_action}</span>
              </div>
            )}

            {/* Five safety checks / heal preconditions */}
            <div className="rounded-[var(--radius-input)] border border-line bg-sunken/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-2">
                  Safety checks
                </h4>
                <Badge tone={diagnosis.safe_to_heal ? 'positive' : 'warning'}>
                  {diagnosis.safe_to_heal ? (
                    <>
                      <CheckCircleIcon className="size-3.5" />
                      safe_to_heal: true
                    </>
                  ) : (
                    <>
                      <AlertIcon className="size-3.5" />
                      safe_to_heal: false
                    </>
                  )}
                </Badge>
              </div>

              {proposeConditions ? (
                <ul className="mt-2.5 space-y-2">
                  {proposeConditions.map((cond, index) => {
                    const passed = Boolean(cond.passed ?? cond.ok);
                    const label = cond.label || cond.name || `Pre-condition ${index + 1}`;
                    return (
                      <li
                        key={`${label}-${index}`}
                        style={{ '--check-index': index } as CSSProperties}
                        className="tether-check-stagger flex items-start gap-2 text-xs"
                      >
                        <span
                          className={`mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full ${
                            passed ? 'bg-sync-soft text-sync' : 'bg-drift-soft text-drift'
                          }`}
                          aria-label={passed ? 'Passed' : 'Failed'}
                        >
                          {passed ? (
                            <CheckIcon className="tether-tick-draw size-2.5" strokeWidth={2.2} />
                          ) : (
                            <CloseIcon className="size-2.5" strokeWidth={2.2} />
                          )}
                        </span>
                        <div className="min-w-0">
                          <span className="font-medium text-fg">{label}</span>
                          {!passed && cond.reason && (
                            <p className="mt-0.5 text-drift">{cond.reason}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                /*
                 * TODO(doctor-panel): `propose_heal` in `AgentTraceStep.result_summary` currently
                 * emits only `safe_to_heal=<bool> event_id=<id>` and does not expose the 5
                 * per-condition booleans/reasons from `checkHealPreconditions`. Render those 5
                 * checklist rows here once exposed by `/api/agent`.
                 */
                <p className="mt-2 text-xs leading-relaxed text-fg-3">
                  5 server preconditions gated via <code className="font-mono text-fg-2">propose_heal</code>
                  ; per-check breakdown awaits structured precondition output in the agent stream.
                </p>
              )}
            </div>

            {/* Evidence list linked to step cards; hover/focus outlines matching step card with --ai */}
            {diagnosis.evidence.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-2">
                  Evidence ({diagnosis.evidence.length})
                </h4>
                <ul className="mt-2 space-y-1.5">
                  {diagnosis.evidence.map((ev, idx) => {
                    const matchedStep = steps.find((s) => s.tool_call_id === ev.tool_call_id);
                    const isActiveEvidence =
                      hoveredToolCallId === ev.tool_call_id ||
                      highlightedToolCallId === ev.tool_call_id;
                    return (
                      <li
                        key={`${ev.tool_call_id}-${idx}`}
                        onMouseEnter={() => setHoveredToolCallId(ev.tool_call_id)}
                        onMouseLeave={() =>
                          setHoveredToolCallId((prev) => (prev === ev.tool_call_id ? null : prev))
                        }
                        className={`rounded-[var(--radius-input)] border px-3 py-2 text-xs transition-colors ${
                          isActiveEvidence
                            ? 'border-ai/60 bg-ai-soft/75 text-fg'
                            : 'border-line bg-sunken/55 text-fg-2'
                        }`}
                      >
                        <p className="leading-relaxed">{ev.claim}</p>
                        <a
                          href={`#trace-step-${ev.tool_call_id}`}
                          onFocus={() => setHoveredToolCallId(ev.tool_call_id)}
                          onBlur={() =>
                            setHoveredToolCallId((prev) =>
                              prev === ev.tool_call_id ? null : prev,
                            )
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            scrollToStep(ev.tool_call_id);
                          }}
                          className="mt-1 inline-flex items-center gap-1 rounded font-mono text-[11px] font-semibold text-ai hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                        >
                          {matchedStep
                            ? `Step ${matchedStep.step}: ${matchedStep.tool_name}`
                            : `Step (${ev.tool_call_id})`}
                          <ArrowRightIcon className="size-3" />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Heal progress & outcome */}
        {healSlowNotice && (
          <div className="rounded-[var(--radius-input)] border border-ai/25 bg-ai-soft px-3.5 py-2.5 text-xs font-medium text-ai">
            {healSlowNotice}
          </div>
        )}

        {healError && (
          <div className="tether-error-shake rounded-[var(--radius-card)] border border-drift/45 bg-drift-soft p-3.5 text-xs text-drift">
            <p className="font-semibold">Heal could not complete</p>
            <p className="mt-1 text-fg-2">{healError}</p>
          </div>
        )}

        {healOutcome && (
          <section
            aria-label="Heal before and after summary"
            className="tether-diagnosis-enter space-y-3 rounded-[var(--radius-card)] border border-sync/45 bg-sync-soft p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-sync">
                  Verified webhook received &amp; order healed
                </p>
                <p className="font-mono text-xs text-fg-2">Order {healOutcome.order_id}</p>
              </div>
              <StatusPill variant="In sync" label="Healed" className="tether-pill-morph" />
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div
                aria-label="Before fix state"
                className="rounded-[var(--radius-input)] border border-line bg-surface p-2.5"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-3">
                  Before
                </p>
                <div className="mt-1.5">
                  <StatusPill variant={healOutcome.before_status === 'PAID' ? 'PAID' : 'CREATED'} />
                </div>
              </div>

              <div className="flex items-center justify-center text-sync" aria-hidden>
                <ArrowRightIcon className="size-4" />
              </div>

              <div
                aria-label="After fix state"
                className="rounded-[var(--radius-input)] border border-sync/45 bg-surface p-2.5"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-sync">
                  After
                </p>
                <div className="mt-1.5">
                  <StatusPill
                    variant="PAID"
                    label={healOutcome.after_status}
                    className="tether-pill-morph"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-input)] border border-line bg-surface px-3.5 py-2.5">
              <div>
                <p className="text-xs font-semibold text-fg">Seconds to fixed</p>
                <p className="text-[11px] text-fg-3">PayPal resend → verified webhook receipt</p>
              </div>
              <p className="font-display text-[28px] font-extrabold leading-none text-sync tabular-nums">
                {healOutcome.seconds_to_fixed !== null ? `${healOutcome.seconds_to_fixed}s` : '—'}
              </p>
            </div>

            {healOutcome.event_id && (
              <p className="break-all font-mono text-xs text-fg">
                Resent event: {healOutcome.event_id} · Audit log #{healOutcome.log_id}
              </p>
            )}
          </section>
        )}
      </div>

      {/* Sticky Footer: Preview line + Single filled Approve fix button */}
      <footer className="shrink-0 border-t border-[var(--glass-border)] bg-[var(--glass-panel-tint)] p-4">
        {diagnosis?.order_id && resendEventId ? (
          <p className="mb-2.5 rounded-[var(--radius-input)] border border-[var(--glass-border)] bg-[var(--glass-inner-bg)] px-3 py-2 text-xs leading-relaxed text-fg-2">
            Will resend webhook event{' '}
            <code className="font-mono font-semibold text-fg">{resendEventId}</code> for order{' '}
            <code className="font-mono font-semibold text-fg">{diagnosis.order_id}</code>. No
            PayPal state is changed.
          </p>
        ) : disabledFixReason ? (
          <p className="mb-2.5 rounded-[var(--radius-input)] border border-[var(--glass-border)] bg-[var(--glass-inner-bg)] px-3 py-2 text-xs leading-relaxed text-fg-2">
            {disabledFixReason}
          </p>
        ) : (
          <p className="mb-2 text-xs text-fg-2">
            Investigate a drifting order to prepare guarded webhook replay.
          </p>
        )}

        <div title={!canApproveFix ? approveTitle : undefined}>
          <Button
            variant="primary"
            className={`w-full py-2.5 text-sm font-semibold ${isHealing ? 'tether-approve-progress' : ''}`}
            disabled={!canApproveFix}
            title={approveTitle}
            onClick={() => void handleApproveFix()}
          >
            {isHealing && (
              <span
                className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-on-accent/40 border-t-on-accent"
                aria-hidden
              />
            )}
            <span>
              {isHealing
                ? 'Resending event…'
                : healOutcome?.healed
                  ? 'Fix approved & verified'
                  : 'Approve fix'}
            </span>
            {!isHealing && !healOutcome?.healed && <ArrowRightIcon className="size-4" />}
          </Button>
        </div>
      </footer>
    </div>
  );
}
