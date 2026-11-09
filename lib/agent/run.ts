import {
  AGENT_TOOL_DECLARATIONS,
  executeAgentTool,
  propose_heal,
} from '@/lib/agent/tools';
import { insertAgentRun } from '@/lib/db';
import {
  generateGeminiTurn,
  type GeminiContent,
  type GeminiPart,
} from '@/lib/gemini';

export const VALID_ROOT_CAUSES = [
  'WEBHOOK_DROPPED_BY_LISTENER',
  'WEBHOOK_URL_OR_EVENT_MISMATCH',
  'SIGNATURE_VERIFICATION_FAILING',
  'NO_DRIFT',
  'UNKNOWN',
] as const;

export type RootCause = (typeof VALID_ROOT_CAUSES)[number];

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type AgentEvidenceItem = {
  claim: string;
  tool_call_id: string;
};

export type AgentFinalResult = {
  root_cause: RootCause;
  summary: string;
  evidence: AgentEvidenceItem[];
  confidence: ConfidenceLevel;
  recommended_action: string;
  safe_to_heal: boolean;
};

export type AgentTraceStep = {
  step: number;
  tool_call_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  result_summary: string;
  duration_ms: number;
  model_used: string;
};

export type AgentRunOutput = {
  run_id: number;
  order_id: string | null;
  model_used: string;
  trace: AgentTraceStep[];
  result: AgentFinalResult;
};

const MAX_STEPS = 8;

const SYSTEM_PROMPT = `You are the Tether Doctor Agent, a diagnostic investigator for PayPal webhook and order state drift.

STRICT RULES:
1. Only state facts found in tool results; never claim a fix happened unless a tool result confirms it; say "unknown" when evidence is missing.
2. You are a diagnostic agent ONLY. Never claim to have healed or modified an order yourself.
3. Gather evidence using the provided tools before concluding:
   - Always call check_webhook_registration() and check_fault_switch().
   - Call get_drift() to see if any unpaid local orders are COMPLETED in PayPal.
   - When investigating a specific orderId (either provided by the user or discovered via get_drift()), call get_paypal_order(orderId), get_receipt_log(orderId), get_paypal_event_log(orderId), and propose_heal(orderId).
4. Classification rules for root_cause:
   - "WEBHOOK_URL_OR_EVENT_MISMATCH": check_webhook_registration() shows matching_webhook_found is false (the registered PayPal webhook URL does not match expected_webhook_url / PUBLIC_BASE_URL, or does not subscribe to PAYMENT.CAPTURE.COMPLETED).
   - "SIGNATURE_VERIFICATION_FAILING": get_receipt_log(orderId) shows webhook events received for the order with verification_status === "FAILURE".
   - "WEBHOOK_DROPPED_BY_LISTENER": check_webhook_registration() shows matching_webhook_found is true, PayPal order status is COMPLETED, PAYMENT.CAPTURE.COMPLETED exists in get_paypal_event_log(orderId), but no verified PAYMENT.CAPTURE.COMPLETED exists in local get_receipt_log(orderId) (for example because drop_webhooks is or was "true").
   - "NO_DRIFT": check_webhook_registration() shows matching_webhook_found is true, and there is no COMPLETED-vs-unpaid drift for the target order (or no drifted orders exist).
   - "UNKNOWN": evidence is missing or does not fit any of the above.
5. When you are ready to give your final answer, respond with ONLY a raw JSON object matching this exact schema (no markdown fences, no extra prose):
{
  "root_cause": "WEBHOOK_DROPPED_BY_LISTENER" | "WEBHOOK_URL_OR_EVENT_MISMATCH" | "SIGNATURE_VERIFICATION_FAILING" | "NO_DRIFT" | "UNKNOWN",
  "summary": "Factual summary based strictly on tool outputs",
  "evidence": [
    { "claim": "Specific factual observation", "tool_call_id": "exact tool_call_id from the tool response" }
  ],
  "confidence": "high" | "medium" | "low",
  "recommended_action": "Clear next step for the operator",
  "safe_to_heal": boolean
}
Every item in "evidence" MUST reference an exact "tool_call_id" field returned in the tool results.`;

function summarizeToolResult(toolName: string, output: unknown): string {
  try {
    if (!output || typeof output !== 'object') {
      return String(output);
    }
    const obj = output as Record<string, unknown>;
    switch (toolName) {
      case 'get_drift': {
        const count = obj.drift_count ?? 0;
        const orders = Array.isArray(obj.drifted_orders)
          ? obj.drifted_orders.map((o: { order_id?: string }) => o.order_id).join(', ')
          : '';
        return `drift_count=${count}${orders ? ` (${orders})` : ''}`;
      }
      case 'get_paypal_order': {
        const localStatus =
          obj.local_order && typeof obj.local_order === 'object'
            ? (obj.local_order as { local_status?: string }).local_status
            : 'NONE';
        return `order=${obj.order_id} paypal_status=${obj.paypal_status ?? 'NOT_FOUND'} local_status=${localStatus}`;
      }
      case 'get_receipt_log': {
        const events = Array.isArray(obj.events)
          ? obj.events
              .map(
                (e: { event_type?: string; verification_status?: string }) =>
                  `${e.event_type}:${e.verification_status}`,
              )
              .join(', ')
          : '';
        return `event_count=${obj.event_count ?? 0}${events ? ` [${events}]` : ''}`;
      }
      case 'get_paypal_event_log': {
        const events = Array.isArray(obj.events)
          ? obj.events
              .map((e: { id?: string; event_type?: string }) => `${e.event_type}(${e.id})`)
              .join(', ')
          : '';
        return `event_count=${obj.event_count ?? 0}${events ? ` [${events}]` : ''}`;
      }
      case 'check_webhook_registration': {
        return `matching_webhook_found=${obj.matching_webhook_found} expected_url=${obj.expected_webhook_url ?? 'null'}`;
      }
      case 'check_fault_switch': {
        return `drop_webhooks=${obj.drop_webhooks}`;
      }
      case 'propose_heal': {
        return `safe_to_heal=${obj.safe_to_heal} event_id=${obj.event_id ?? 'null'}`;
      }
      default:
        return JSON.stringify(output).slice(0, 200);
    }
  } catch {
    return 'Tool executed';
  }
}

function extractJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Response is not valid JSON');
  }
}

function validateAgentFinalResult(
  raw: unknown,
  validToolCallIds: Set<string>,
): { valid: true; value: AgentFinalResult } | { valid: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Final answer must be a JSON object' };
  }

  const obj = raw as Record<string, unknown>;

  if (
    typeof obj.root_cause !== 'string' ||
    !VALID_ROOT_CAUSES.includes(obj.root_cause as RootCause)
  ) {
    return {
      valid: false,
      error: `Invalid root_cause "${String(obj.root_cause)}". Must be one of ${VALID_ROOT_CAUSES.join(', ')}`,
    };
  }

  if (typeof obj.summary !== 'string' || obj.summary.trim() === '') {
    return { valid: false, error: 'summary must be a non-empty string' };
  }

  if (
    obj.confidence !== 'high' &&
    obj.confidence !== 'medium' &&
    obj.confidence !== 'low'
  ) {
    return {
      valid: false,
      error: 'confidence must be one of "high", "medium", or "low"',
    };
  }

  if (typeof obj.recommended_action !== 'string' || obj.recommended_action.trim() === '') {
    return { valid: false, error: 'recommended_action must be a non-empty string' };
  }

  if (!Array.isArray(obj.evidence)) {
    return { valid: false, error: 'evidence must be an array of {claim, tool_call_id}' };
  }

  if (validToolCallIds.size > 0 && obj.evidence.length === 0) {
    return {
      valid: false,
      error: 'evidence array cannot be empty when tool calls were executed',
    };
  }

  const validatedEvidence: AgentEvidenceItem[] = [];
  for (let i = 0; i < obj.evidence.length; i++) {
    const item = obj.evidence[i] as Record<string, unknown> | undefined;
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `evidence[${i}] must be an object` };
    }
    const claim = typeof item.claim === 'string' ? item.claim.trim() : '';
    const toolCallId = typeof item.tool_call_id === 'string' ? item.tool_call_id.trim() : '';
    if (!claim) {
      return { valid: false, error: `evidence[${i}].claim must be a non-empty string` };
    }
    if (!toolCallId || !validToolCallIds.has(toolCallId)) {
      return {
        valid: false,
        error: `evidence[${i}].tool_call_id "${toolCallId}" does not match any real tool_call_id from the trace (${Array.from(validToolCallIds).join(', ')})`,
      };
    }
    validatedEvidence.push({ claim, tool_call_id: toolCallId });
  }

  return {
    valid: true,
    value: {
      root_cause: obj.root_cause as RootCause,
      summary: obj.summary.trim(),
      evidence: validatedEvidence,
      confidence: obj.confidence,
      recommended_action: obj.recommended_action.trim(),
      safe_to_heal: Boolean(obj.safe_to_heal),
    },
  };
}

export async function runDoctorAgent(options?: {
  orderId?: string;
  onStep?: (step: AgentTraceStep) => void;
}): Promise<AgentRunOutput> {
  const initialOrderId = options?.orderId?.trim() || null;
  let discoveredOrderId: string | null = initialOrderId;

  const trace: AgentTraceStep[] = [];
  const validToolCallIds = new Set<string>();
  const modelsUsed = new Set<string>();

  const userPrompt = initialOrderId
    ? `Investigate PayPal webhook and order state for orderId "${initialOrderId}". Use the tools to check webhook registration, fault switch, drift, PayPal order status, local receipt log, PayPal event log, and propose_heal("${initialOrderId}"). Then return the final JSON diagnosis.`
    : `Investigate our PayPal webhook integration and order drift across the system. Check webhook registration, fault switch, and drift. If any drifted order is found, inspect its PayPal order status, local receipt log, PayPal event log, and propose_heal for that orderId. Then return the final JSON diagnosis.`;

  const contents: GeminiContent[] = [
    {
      role: 'user',
      parts: [{ text: userPrompt }],
    },
  ];

  let finalModelText = '';

  while (trace.length < MAX_STEPS) {
    const turn = await generateGeminiTurn({
      systemInstruction: SYSTEM_PROMPT,
      contents,
      functionDeclarations: AGENT_TOOL_DECLARATIONS,
    });

    modelsUsed.add(turn.modelUsed);
    contents.push(turn.content);

    if (turn.functionCalls.length === 0) {
      finalModelText = turn.text;
      break;
    }

    const responseParts: GeminiPart[] = [];

    for (const call of turn.functionCalls) {
      if (trace.length >= MAX_STEPS) {
        break;
      }

      const stepNumber = trace.length + 1;
      const toolCallId = call.id || `step_${stepNumber}_${call.name}`;
      const toolStartMs = Date.now();

      let toolOutput: unknown;
      try {
        toolOutput = await executeAgentTool(call.name, call.args);
      } catch (err) {
        toolOutput = {
          error: err instanceof Error ? err.message : String(err),
        };
      }

      const toolDurationMs = Date.now() - toolStartMs;

      if (
        !discoveredOrderId &&
        typeof call.args.orderId === 'string' &&
        call.args.orderId.trim() !== ''
      ) {
        discoveredOrderId = call.args.orderId.trim();
      } else if (
        !discoveredOrderId &&
        call.name === 'get_drift' &&
        toolOutput &&
        typeof toolOutput === 'object'
      ) {
        const drifted = (toolOutput as { drifted_orders?: { order_id?: string }[] })
          .drifted_orders;
        if (Array.isArray(drifted) && drifted.length > 0 && drifted[0]?.order_id) {
          discoveredOrderId = drifted[0].order_id;
        }
      }

      const stepRecord: AgentTraceStep = {
        step: stepNumber,
        tool_call_id: toolCallId,
        tool_name: call.name,
        arguments: call.args,
        result_summary: summarizeToolResult(call.name, toolOutput),
        duration_ms: toolDurationMs,
        model_used: turn.modelUsed,
      };

      trace.push(stepRecord);
      validToolCallIds.add(toolCallId);
      options?.onStep?.(stepRecord);

      responseParts.push({
        functionResponse: {
          id: toolCallId,
          name: call.name,
          response: {
            tool_call_id: toolCallId,
            result: toolOutput,
          },
        },
      });
    }

    if (responseParts.length > 0) {
      contents.push({
        role: 'user',
        parts: responseParts,
      });
    }
  }

  // If we hit MAX_STEPS without a final text response, ask for the final JSON without tools
  if (!finalModelText) {
    contents.push({
      role: 'user',
      parts: [
        {
          text: `Maximum tool steps reached. Based strictly on the tool results above, output ONLY the final JSON object now. Valid tool_call_ids are: ${Array.from(validToolCallIds).join(', ')}`,
        },
      ],
    });
    const finalTurn = await generateGeminiTurn({
      systemInstruction: SYSTEM_PROMPT,
      contents,
      responseMimeType: 'application/json',
    });
    modelsUsed.add(finalTurn.modelUsed);
    contents.push(finalTurn.content);
    finalModelText = finalTurn.text;
  }

  // Validate final JSON and retry once if invalid
  let validatedResult: AgentFinalResult | null = null;
  let validationError = '';

  try {
    const parsed = extractJsonObject(finalModelText);
    const check = validateAgentFinalResult(parsed, validToolCallIds);
    if (check.valid) {
      validatedResult = check.value;
    } else {
      validationError = check.error;
    }
  } catch (err) {
    validationError = err instanceof Error ? err.message : 'Failed to parse JSON';
  }

  if (!validatedResult) {
    // Reject and retry once
    contents.push({
      role: 'user',
      parts: [
        {
          text: `Your response failed validation: ${validationError}. Every evidence item MUST reference a real tool_call_id from this list: [${Array.from(validToolCallIds).join(', ')}]. Output ONLY the valid JSON object matching the required schema.`,
        },
      ],
    });

    const retryTurn = await generateGeminiTurn({
      systemInstruction: SYSTEM_PROMPT,
      contents,
      responseMimeType: 'application/json',
    });
    modelsUsed.add(retryTurn.modelUsed);

    const parsedRetry = extractJsonObject(retryTurn.text);
    const retryCheck = validateAgentFinalResult(parsedRetry, validToolCallIds);
    if (!retryCheck.valid) {
      throw new Error(`Agent output validation failed after retry: ${retryCheck.error}`);
    }
    validatedResult = retryCheck.value;
  }

  // Never trust the model's safe_to_heal; recompute it from propose_heal.
  if (discoveredOrderId) {
    const healPreconditions = await propose_heal(discoveredOrderId);
    validatedResult.safe_to_heal = healPreconditions.safe_to_heal;
  } else {
    validatedResult.safe_to_heal = false;
  }

  const modelUsedSummary = Array.from(modelsUsed).join(', ') || 'unknown';
  const savedRun = insertAgentRun({
    order_id: discoveredOrderId,
    model_used: modelUsedSummary,
    trace_json: JSON.stringify(trace),
    result_json: JSON.stringify(validatedResult),
  });

  return {
    run_id: savedRun.id,
    order_id: discoveredOrderId,
    model_used: modelUsedSummary,
    trace,
    result: validatedResult,
  };
}
