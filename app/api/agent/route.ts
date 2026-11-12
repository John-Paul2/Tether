import { runDoctorAgent, type AgentTraceStep } from '@/lib/agent/run';
import { getRecentAgentRuns } from '@/lib/db';
import { checkAgentRateLimit, recordRealGeminiAgentRun } from '@/lib/protection';

export const dynamic = 'force-dynamic';

const KEEP_ALIVE_INTERVAL_MS = 15_000;

export async function GET() {
  const runs = getRecentAgentRuns(50);
  return Response.json(runs, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  let orderId: string | undefined;

  try {
    const rawText = await request.text();
    if (rawText.trim() !== '') {
      const body = JSON.parse(rawText) as { orderId?: unknown };
      if (typeof body?.orderId === 'string' && body.orderId.trim() !== '') {
        orderId = body.orderId.trim();
      }
    }
  } catch {
    return Response.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const { ip, blockedResponse } = checkAgentRateLimit(request);
  if (blockedResponse) {
    return blockedResponse;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let countedRealGeminiRun = false;

      const enqueueRaw = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const sendEvent = (event: string, data: unknown) => {
        enqueueRaw(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Flush an initial SSE comment immediately so proxies start streaming right away
      enqueueRaw(': stream-open\n\n');

      const keepAliveTimer = setInterval(() => {
        enqueueRaw(': keep-alive\n\n');
      }, KEEP_ALIVE_INTERVAL_MS);

      try {
        if (process.env.GEMINI_API_KEY?.trim()) {
          countedRealGeminiRun = true;
          recordRealGeminiAgentRun(ip);
        }

        const output = await runDoctorAgent({
          orderId,
          onStep: (step: AgentTraceStep) => {
            if (!countedRealGeminiRun) {
              countedRealGeminiRun = true;
              recordRealGeminiAgentRun(ip);
            }
            sendEvent('step', step);
          },
        });

        sendEvent('result', {
          ...output.result,
          run_id: output.run_id,
          order_id: output.order_id,
          model_used: output.model_used,
          trace: output.trace,
        });
      } catch (err) {
        sendEvent('error', {
          error: err instanceof Error ? err.message : 'Agent investigation failed',
        });
      } finally {
        clearInterval(keepAliveTimer);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Ignore already-closed stream
          }
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
