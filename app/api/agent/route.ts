import { runDoctorAgent, type AgentTraceStep } from '@/lib/agent/run';
import { getRecentAgentRuns } from '@/lib/db';

export const dynamic = 'force-dynamic';

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

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      try {
        const output = await runDoctorAgent({
          orderId,
          onStep: (step: AgentTraceStep) => {
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
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
