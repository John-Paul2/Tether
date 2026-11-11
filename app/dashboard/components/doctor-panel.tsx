'use client';

import { useCallback, useState } from 'react';
import type { TetherDriftRow, TetherLocalOrderRow } from '@/lib/tether-data';
import {
  AlertIcon,
  ArrowRightIcon,
  CheckCircleIcon,
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
}: {
  initialDrift: TetherDriftRow[];
  dropWebhooks: boolean;
  selectedOrder?: TetherLocalOrderRow | null;
  isSelectedDrifting?: boolean;
  onHealedOrUpdated: () => void;
  onHealSucceeded?: (outcome: { order_id: string; event_id: string | null }) => void;
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
    setAgentError(null);
    setModelSlowNotice(null);
    setSteps([]);
    setDiagnosis(null);
    setHealOutcome(null);
    setHealError(null);
    setHighlightedToolCallId(null);

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

  // Explain why Approve fix is disabled when safe_to_heal is false (DESIGN.md requirement)
  const disabledFixReason = (() => {
    if (!diagnosis) return null;
    if (healOutcome?.healed) {
      return `Order ${healOutcome.order_id} has already been healed and verified as PAID.`;
    }
    if (diagnosis.safe_to_heal) return null;
    if (dropWebhooks) {
      return 'Disabled because "Simulate dropped webhooks" is currently ON in Demo controls. Turn it OFF and click Investigate again so the resent webhook will not be dropped.';
    }
    if (diagnosis.root_cause === 'NO_DRIFT') {
      return 'Disabled because this order has no state drift — local status already matches PayPal.';
    }
    if (diagnosis.root_cause === 'WEBHOOK_URL_OR_EVENT_MISMATCH') {
      return 'Disabled because the PayPal webhook registration URL does not match PUBLIC_BASE_URL. Fix the webhook URL before resending.';
    }
    return 'Disabled because server-side heal preconditions (propose_heal) returned safe_to_heal = false.';
  })();

  const diagnosisSteps = diagnosis?.trace?.length ? diagnosis.trace : steps;
  const proposeStep = diagnosisSteps.find((s) => s.tool_name === 'propose_heal');
  const proposeConditions = extractProposeHealConditions(proposeStep);
  const resendEventId = diagnosis ? extractResendEventId(diagnosis, diagnosisSteps) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Doctor panel header & drifting orders card */}
      <div className="rounded-[16px] bg-canvas p-6 text-ink shadow-[var(--card-shadow)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-pale text-primary">
              <StethoscopeIcon className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-2xl font-extrabold leading-8 tracking-tight text-ink">
                Doctor panel
              </h2>
              <p className="text-xs text-mute">
                Live PayPal vs. SQLite drift detection &amp; guarded repair
              </p>
            </div>
          </div>

          <IconButton
            label="Refresh drift check"
            disabled={loadingDrift}
            onClick={() => void fetchDrift()}
          >
            <RefreshIcon className={`size-4 ${loadingDrift ? 'animate-spin' : ''}`} />
          </IconButton>
        </div>

        {selectedOrder && (
          <div
            data-testid="doctor-selected-order"
            data-order-id={selectedOrder.order_id}
            className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-input)] border border-line bg-sunken px-3 py-2 text-xs"
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
                  className="cursor-pointer rounded-full border border-accent/45 bg-ai-soft px-2.5 py-0.5 text-xs font-medium text-accent transition-colors hover:border-accent hover:bg-ai-soft/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isInvestigating && investigatingOrderId === selectedOrder.order_id
                    ? 'Investigating…'
                    : 'Investigate'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Refreshing state banner */}
        {loadingDrift && !paypalSlowNotice && (
          <div
            role="status"
            className="mt-4 rounded-[12px] bg-primary-pale/70 px-3.5 py-2 text-xs font-semibold text-primary-active"
          >
            Checking live PayPal sandbox order status…
          </div>
        )}

        {/* PayPal slow or error state */}
        {paypalSlowNotice && (
          <div className="mt-4 rounded-[16px] bg-warning-bg px-4 py-3 text-sm text-warning-content">
            {paypalSlowNotice}
          </div>
        )}

        {driftError && (
          <div className="mt-4 rounded-[16px] bg-warning-bg p-4 text-sm text-warning-content">
            <p className="font-semibold">PayPal sandbox drift check couldn&apos;t complete</p>
            <p className="mt-1 text-xs">{driftError}</p>
            <Button
              variant="tertiary"
              size="sm"
              className="mt-3"
              onClick={() => void fetchDrift()}
            >
              Retry drift check
            </Button>
          </div>
        )}

        {/* Drifting orders list or calm empty state */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">
              Drifting orders ({driftItems.length})
            </span>
            {driftItems.length > 0 ? (
              <Badge tone="negative">{driftItems.length} unresolved</Badge>
            ) : (
              <Badge tone="positive">In sync</Badge>
            )}
          </div>

          {driftItems.length === 0 ? (
            <div className="mt-3 rounded-[16px] border border-canvas-soft bg-canvas-soft/45 p-4">
              <div className="flex items-start gap-3">
                <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-positive" />
                <div>
                  <p className="text-base font-semibold leading-6 text-ink">
                    Everything is in sync
                  </p>
                  <p className="mt-1 text-sm text-body">
                    All completed PayPal orders match local status with verified capture webhooks.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-4"
                    disabled={isInvestigating}
                    onClick={() => void handleInvestigate()}
                  >
                    {isInvestigating && investigatingOrderId === 'system'
                      ? 'Investigating…'
                      : 'Investigate system health'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-canvas-soft rounded-[16px] border border-canvas-soft">
              {driftItems.map((item) => {
                const active = isInvestigating && investigatingOrderId === item.order_id;
                return (
                  <li
                    key={item.order_id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-ink">
                          {item.order_id}
                        </span>
                        <span className="text-sm font-semibold text-body tabular-nums">
                          ${Number(item.amount).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge tone="info">Local: {item.local_status}</Badge>
                        <Badge tone="negative">PayPal: {item.paypal_status}</Badge>
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isInvestigating}
                      onClick={() => void handleInvestigate(item.order_id)}
                    >
                      {active ? 'Investigating…' : 'Investigate'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Live SSE trace step cards */}
      {(isInvestigating || steps.length > 0 || agentError) && (
        <div className="rounded-[16px] bg-canvas p-6 text-ink shadow-[var(--card-shadow)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-ink">
                Live agent trace
                {investigatingOrderId && investigatingOrderId !== 'system'
                  ? ` · ${investigatingOrderId}`
                  : ''}
              </h3>
              <p className="text-xs text-mute">
                Server-sent tool calls as the Doctor agent inspects PayPal and SQLite
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isInvestigating ? (
                <Badge tone="info">Streaming…</Badge>
              ) : steps.length > 0 ? (
                <Badge tone="info">{steps.length} steps</Badge>
              ) : null}
            </div>
          </div>

          {modelSlowNotice && (
            <div className="mt-3 rounded-[16px] bg-warning-bg px-4 py-3 text-xs font-semibold text-warning-content">
              {modelSlowNotice}
            </div>
          )}

          {agentError && (
            <div className="mt-3 rounded-[16px] bg-warning-bg p-4 text-sm text-warning-content">
              <div className="flex items-start gap-2">
                <AlertIcon className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-semibold">Diagnostic model timed out or returned an error</p>
                  <p className="mt-1 text-xs">{agentError}</p>
                  <Button
                    variant="tertiary"
                    size="sm"
                    className="mt-3"
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
            <div className="mt-4 rounded-[16px] border border-canvas-soft bg-canvas-soft/40 px-4 py-3 text-xs text-mute">
              Connecting to Doctor agent trace stream and inspecting PayPal sandbox &amp; SQLite…
            </div>
          )}

          <ol className="mt-4 space-y-2.5">
            {steps.map((step, index) => {
              const isNewest = index === steps.length - 1;
              const isHighlighted = highlightedToolCallId === step.tool_call_id;
              return (
                <li
                  key={step.tool_call_id}
                  id={`trace-step-${step.tool_call_id}`}
                  className={`rounded-[16px] border border-canvas-soft bg-canvas px-4 py-3 transition-colors ${
                    isNewest || isHighlighted ? 'border-l-4 border-l-primary' : ''
                  } ${isHighlighted ? 'bg-primary-pale/40' : ''}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary-pale text-xs font-semibold text-primary-active tabular-nums">
                        {step.step}
                      </span>
                      <span className="font-mono text-sm font-semibold text-ink">
                        {step.tool_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-mute tabular-nums">
                      <span>{step.duration_ms} ms</span>
                      <span aria-hidden>·</span>
                      <span className="font-mono">{step.model_used}</span>
                    </div>
                  </div>
                  <p className="mt-1.5 break-words font-mono text-xs text-body">
                    {step.result_summary}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Diagnosis card */}
      {diagnosis && (
        <div className="rounded-[16px] bg-canvas p-6 text-ink shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-2xl font-extrabold leading-8 tracking-tight text-ink">
              Diagnosis
            </h3>
            <Badge tone={rootCauseTone(diagnosis.root_cause)}>
              {formatRootCause(diagnosis.root_cause)}
            </Badge>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={confidenceTone(diagnosis.confidence)}>
              Confidence: {diagnosis.confidence}
            </Badge>
            <span className="font-mono text-xs text-mute">{diagnosis.model_used}</span>
          </div>

          <p className="mt-4 text-sm leading-6 text-body">{diagnosis.summary}</p>

          {diagnosis.recommended_action && (
            <div className="mt-4 rounded-[16px] bg-canvas-soft px-4 py-3 text-sm text-ink">
              <span className="font-semibold">Recommended action: </span>
              {diagnosis.recommended_action}
            </div>
          )}

          {/* Evidence list linked to trace steps */}
          <div className="mt-4">
            <h4 className="text-xs font-semibold text-mute">
              Evidence ({diagnosis.evidence.length})
            </h4>
            <ul className="mt-2 space-y-2">
              {diagnosis.evidence.map((ev, idx) => {
                const matchedStep = steps.find((s) => s.tool_call_id === ev.tool_call_id);
                return (
                  <li
                    key={`${ev.tool_call_id}-${idx}`}
                    className="rounded-[12px] border border-canvas-soft px-3.5 py-2.5 text-xs text-body"
                  >
                    <p>{ev.claim}</p>
                    <a
                      href={`#trace-step-${ev.tool_call_id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToStep(ev.tool_call_id);
                      }}
                      className="mt-1 inline-flex items-center gap-1 rounded font-semibold text-primary hover:text-primary-active hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-active"
                    >
                      {matchedStep
                        ? `→ Step ${matchedStep.step}: ${matchedStep.tool_name}`
                        : `→ Trace step (${ev.tool_call_id})`}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Heal pre-conditions between Evidence list and Approve fix */}
          <div className="mt-4 rounded-[16px] border border-canvas-soft bg-canvas-soft/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-mute">Heal pre-conditions</h4>
              <Badge tone={diagnosis.safe_to_heal ? 'positive' : 'warning'}>
                {diagnosis.safe_to_heal ? (
                  <>
                    <CheckCircleIcon className="size-3.5" />
                    safe_to_heal: true (server-verified)
                  </>
                ) : (
                  <>
                    <AlertIcon className="size-3.5" />
                    safe_to_heal: false (server-verified)
                  </>
                )}
              </Badge>
            </div>

            {proposeConditions ? (
              <ul className="mt-3 space-y-2">
                {proposeConditions.map((cond, index) => {
                  const passed = Boolean(cond.passed ?? cond.ok);
                  const label = cond.label || cond.name || `Pre-condition ${index + 1}`;
                  return (
                    <li
                      key={`${label}-${index}`}
                      className="flex items-start gap-2 text-xs text-body"
                    >
                      <span
                        className={`mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full font-bold ${
                          passed
                            ? 'bg-positive-bg text-positive-deep'
                            : 'bg-negative/15 text-negative-deep'
                        }`}
                        aria-label={passed ? 'Passed' : 'Failed'}
                      >
                        {passed ? '✓' : '✕'}
                      </span>
                      <div>
                        <span className="font-semibold text-ink">{label}</span>
                        {!passed && cond.reason && (
                          <p className="mt-0.5 text-negative-deep">{cond.reason}</p>
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
               * per-condition booleans/reasons from `checkHealPreconditions`. Show those 5
               * green-tick / red-cross rows here once exposed by `/api/agent`.
               */
              null
            )}
          </div>

          {/* Prominent primary action at the bottom of Diagnosis: Approve fix */}
          <div className="mt-4 border-t border-canvas-soft pt-4">
            {diagnosis.order_id && resendEventId && (
              <p className="mb-3 rounded-[12px] bg-canvas-soft px-3.5 py-2.5 text-sm text-body">
                Will resend webhook event{' '}
                <code className="font-mono text-xs font-semibold text-ink">{resendEventId}</code>{' '}
                for order{' '}
                <code className="font-mono text-xs font-semibold text-ink">
                  {diagnosis.order_id}
                </code>
                . No PayPal state is changed.
              </p>
            )}
            <Button
              variant="primary"
              className="w-full py-3 text-base font-semibold"
              disabled={!diagnosis.safe_to_heal || isHealing || Boolean(healOutcome?.healed)}
              onClick={() => void handleApproveFix()}
            >
              <span>
                {isHealing
                  ? 'Resending webhook & verifying…'
                  : healOutcome?.healed
                    ? 'Fix approved & verified'
                    : 'Approve fix'}
              </span>
              {!isHealing && !healOutcome?.healed && <ArrowRightIcon className="size-4" />}
            </Button>

            {disabledFixReason && (
              <p className="mt-2.5 rounded-[12px] bg-canvas-soft px-3.5 py-2.5 text-xs text-body">
                {disabledFixReason}
              </p>
            )}

            {healSlowNotice && (
              <p className="mt-3 rounded-[12px] bg-primary-pale px-3.5 py-2.5 text-xs font-semibold text-primary-active">
                {healSlowNotice}
              </p>
            )}

            {healError && (
              <div className="mt-3 rounded-[16px] bg-warning-bg p-3.5 text-xs text-warning-content">
                <p className="font-semibold">Heal could not complete</p>
                <p className="mt-1">{healError}</p>
              </div>
            )}

            {/* Clear Before / After state and seconds-to-fixed after Approve fix */}
            {healOutcome && (
              <div
                aria-label="Heal before and after summary"
                className="mt-4 rounded-[16px] bg-positive-bg p-4 text-positive-deep"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-positive-deep">
                      Verified webhook received &amp; order healed
                    </p>
                    <p className="font-mono text-xs text-positive-deep/80">
                      Order {healOutcome.order_id}
                    </p>
                  </div>
                  <Badge tone="positive">Healed</Badge>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <div
                    aria-label="Before fix state"
                    className="rounded-[16px] border border-canvas-soft bg-canvas p-3.5 text-ink"
                  >
                    <p className="text-xs font-semibold text-mute">Before</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge tone="info">{healOutcome.before_status}</Badge>
                    </div>
                    <p className="mt-1.5 text-xs text-body">Drifting local order</p>
                  </div>

                  <div className="flex items-center justify-center text-positive-deep" aria-hidden>
                    <ArrowRightIcon className="size-5 rotate-90 sm:rotate-0" />
                  </div>

                  <div
                    aria-label="After fix state"
                    className="rounded-[16px] border border-positive/40 bg-canvas p-3.5 text-ink"
                  >
                    <p className="text-xs font-semibold text-positive-deep">After</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge tone="positive">{healOutcome.after_status}</Badge>
                    </div>
                    <p className="mt-1.5 text-xs text-body">Verified webhook synced</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-canvas px-4 py-3 text-ink">
                  <div>
                    <p className="text-xs font-semibold text-mute">Seconds to fixed</p>
                    <p className="text-xs text-body">
                      PayPal resend → verified webhook receipt
                    </p>
                  </div>
                  <p className="font-display text-[32px] font-extrabold leading-[36px] text-ink tabular-nums">
                    {healOutcome.seconds_to_fixed !== null
                      ? `${healOutcome.seconds_to_fixed}s`
                      : '—'}
                  </p>
                </div>

                {healOutcome.event_id && (
                  <p className="mt-3 font-mono text-xs text-positive-deep">
                    Resent event: {healOutcome.event_id} · Audit log #{healOutcome.log_id}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
