import crypto from 'node:crypto';
import { countAgentRunsSince } from '@/lib/db';

const AGENT_IP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const AGENT_IP_MAX_RUNS = 6;
const DEFAULT_AGENT_DAILY_CAP = 300;

const ipRunTimestamps = new Map<string, number[]>();
let dailyCounter = {
  utcDate: new Date().toISOString().slice(0, 10),
  runs: 0,
};

export function isDemoTokenRequired(): boolean {
  return Boolean(process.env.DEMO_TOKEN && process.env.DEMO_TOKEN.trim() !== '');
}

export function verifyDemoToken(request: Request): Response | null {
  const expected = process.env.DEMO_TOKEN?.trim() ?? '';
  if (!expected) {
    return null;
  }

  const provided = request.headers.get('x-demo-token')?.trim() ?? '';
  if (!provided) {
    return Response.json(
      {
        error:
          'Demo token required. Open DEMO controls and enter the x-demo-token to run staging actions.',
      },
      { status: 401 },
    );
  }

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  const matches =
    expectedBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!matches) {
    return Response.json(
      {
        error: 'Invalid demo token (x-demo-token). Check your token in DEMO controls and try again.',
      },
      { status: 401 },
    );
  }

  return null;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return '127.0.0.1';
}

function getDailyCap(): number {
  const raw = Number(process.env.AGENT_DAILY_CAP);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return DEFAULT_AGENT_DAILY_CAP;
}

function getCurrentUtcDateAndCount(): { utcDate: string; count: number } {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCounter.utcDate !== today) {
    dailyCounter = { utcDate: today, runs: 0 };
  }
  const dbCount = countAgentRunsSince(`${today}T00:00:00.000Z`);
  const effectiveCount = Math.max(dailyCounter.runs, dbCount);
  dailyCounter.runs = effectiveCount;
  return { utcDate: today, count: effectiveCount };
}

export function checkAgentRateLimit(request: Request): {
  blockedResponse: Response | null;
  ip: string;
} {
  const ip = getClientIp(request);
  const now = Date.now();
  const cutoff = now - AGENT_IP_WINDOW_MS;

  const history = (ipRunTimestamps.get(ip) ?? []).filter((ts) => ts > cutoff);
  if (history.length > 0) {
    ipRunTimestamps.set(ip, history);
  } else {
    ipRunTimestamps.delete(ip);
  }

  if (history.length >= AGENT_IP_MAX_RUNS) {
    const oldestInWindow = history[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldestInWindow + AGENT_IP_WINDOW_MS - now) / 1000));
    return {
      ip,
      blockedResponse: Response.json(
        {
          error: `Rate limit reached (${AGENT_IP_MAX_RUNS} investigations per 10 minutes). Please wait ~${Math.ceil(retryAfterSec / 60)} min before running another diagnostic.`,
          retry_after_seconds: retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSec) },
        },
      ),
    };
  }

  const dailyCap = getDailyCap();
  const { count } = getCurrentUtcDateAndCount();
  if (count >= dailyCap) {
    return {
      ip,
      blockedResponse: Response.json(
        {
          error: `Daily diagnostic limit reached (${dailyCap} Gemini runs/day on this demo instance). You can still explore existing orders, logs, and reports, or try again tomorrow.`,
        },
        { status: 429 },
      ),
    };
  }

  return { ip, blockedResponse: null };
}

export function recordRealGeminiAgentRun(ip: string): void {
  const now = Date.now();
  const cutoff = now - AGENT_IP_WINDOW_MS;
  const history = (ipRunTimestamps.get(ip) ?? []).filter((ts) => ts > cutoff);
  history.push(now);
  ipRunTimestamps.set(ip, history);

  const today = new Date().toISOString().slice(0, 10);
  if (dailyCounter.utcDate !== today) {
    dailyCounter = { utcDate: today, runs: 0 };
  }
  const dbCount = countAgentRunsSince(`${today}T00:00:00.000Z`);
  dailyCounter.runs = Math.max(dailyCounter.runs + 1, dbCount);
}
