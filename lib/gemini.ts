// Server-only Gemini REST API client for generateContent with function calling.
// Uses GEMINI_API_KEY, GEMINI_MODEL, and GEMINI_FALLBACK_MODEL from environment.
// Does NOT set "minimal" thinking level (unsupported on gemini-3.8-flash).

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const CALL_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);

export type GeminiFunctionDeclaration = {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type GeminiFunctionCall = {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
};

export type GeminiFunctionResponse = {
  id?: string;
  name: string;
  response: Record<string, unknown>;
};

export type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
};

export type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

export type GeminiGenerateRequest = {
  systemInstruction?: string;
  contents: GeminiContent[];
  functionDeclarations?: GeminiFunctionDeclaration[];
  responseMimeType?: string;
};

export type GeminiNormalizedFunctionCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type GeminiGenerateResult = {
  modelUsed: string;
  usedFallback: boolean;
  durationMs: number;
  content: GeminiContent;
  functionCalls: GeminiNormalizedFunctionCall[];
  text: string;
};

type RawGeminiResponse = {
  candidates?: {
    content?: GeminiContent;
    finishReason?: string;
  }[];
  modelVersion?: string;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

class GeminiCallError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    message: string,
    retryable: boolean,
    status?: number,
  ) {
    super(message);
    this.name = 'GeminiCallError';
    this.retryable = retryable;
    this.status = status;
  }
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'TimeoutError' ||
    err.name === 'AbortError' ||
    err.message.toLowerCase().includes('timeout') ||
    err.message.toLowerCase().includes('aborted')
  );
}

async function callSingleModel(
  model: string,
  apiKey: string,
  request: GeminiGenerateRequest,
): Promise<{ content: GeminiContent; modelUsed: string; durationMs: number }> {
  const startMs = Date.now();
  const normalizedModel = model.replace(/^models\//, '').trim();
  const url = `${GEMINI_API_BASE_URL}/${encodeURIComponent(normalizedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body: Record<string, unknown> = {
    contents: request.contents,
  };

  if (request.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: request.systemInstruction }],
    };
  }

  if (request.functionDeclarations && request.functionDeclarations.length > 0) {
    body.tools = [
      {
        functionDeclarations: request.functionDeclarations,
      },
    ];
  }

  if (request.responseMimeType) {
    body.generationConfig = {
      responseMimeType: request.responseMimeType,
    };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new GeminiCallError(
        `Gemini call to ${normalizedModel} timed out after ${CALL_TIMEOUT_MS}ms`,
        true,
      );
    }
    throw new GeminiCallError(
      `Gemini network error on ${normalizedModel}: ${err instanceof Error ? err.message : String(err)}`,
      false,
    );
  }

  const rawText = await response.text();
  let parsed: RawGeminiResponse | undefined;
  try {
    parsed = JSON.parse(rawText) as RawGeminiResponse;
  } catch {
    parsed = undefined;
  }

  if (!response.ok) {
    const retryable = RETRYABLE_STATUS_CODES.has(response.status);
    const errMessage = parsed?.error?.message ?? rawText.slice(0, 300);
    throw new GeminiCallError(
      `Gemini ${normalizedModel} returned HTTP ${response.status}: ${errMessage}`,
      retryable,
      response.status,
    );
  }

  const content = parsed?.candidates?.[0]?.content;
  if (!content || !Array.isArray(content.parts)) {
    throw new GeminiCallError(
      `Gemini ${normalizedModel} returned an empty candidate content`,
      false,
      response.status,
    );
  }

  return {
    content: {
      role: content.role ?? 'model',
      parts: content.parts,
    },
    modelUsed: normalizedModel,
    durationMs: Date.now() - startMs,
  };
}

export async function generateGeminiTurn(
  request: GeminiGenerateRequest,
): Promise<GeminiGenerateResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable');
  }

  const primaryModel = (process.env.GEMINI_MODEL || 'gemini-3.6-flash').trim();
  const fallbackModel = (process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash').trim();

  let rawResult: { content: GeminiContent; modelUsed: string; durationMs: number };
  let usedFallback = false;

  try {
    rawResult = await callSingleModel(primaryModel, apiKey, request);
  } catch (err) {
    const canRetry =
      err instanceof GeminiCallError &&
      err.retryable &&
      Boolean(fallbackModel) &&
      fallbackModel !== primaryModel;

    if (!canRetry) {
      throw err;
    }

    usedFallback = true;
    rawResult = await callSingleModel(fallbackModel, apiKey, request);
  }

  const functionCalls: GeminiNormalizedFunctionCall[] = [];
  const textParts: string[] = [];

  rawResult.content.parts.forEach((part, idx) => {
    if (part.functionCall && typeof part.functionCall.name === 'string') {
      const callId =
        typeof part.functionCall.id === 'string' && part.functionCall.id.trim() !== ''
          ? part.functionCall.id
          : `call_${Date.now()}_${idx}`;
      const args =
        part.functionCall.args && typeof part.functionCall.args === 'object'
          ? part.functionCall.args
          : {};
      // Ensure the part in content also retains the id so functionResponse matches it
      part.functionCall.id = callId;
      functionCalls.push({
        id: callId,
        name: part.functionCall.name,
        args,
      });
    } else if (typeof part.text === 'string' && !part.thought) {
      textParts.push(part.text);
    }
  });

  return {
    modelUsed: rawResult.modelUsed,
    usedFallback,
    durationMs: rawResult.durationMs,
    content: rawResult.content,
    functionCalls,
    text: textParts.join('\n').trim(),
  };
}
