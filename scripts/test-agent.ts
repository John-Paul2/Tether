import fs from 'node:fs';
import module from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Register a lightweight Node.js module resolution hook so `@/*` path aliases
// and extensionless `.ts` imports resolve when running `node scripts/test-agent.ts`.
const projectRoot = process.cwd();
type ResolveContext = { parentURL?: string };
type NextResolve = (specifier: string, context: ResolveContext) => unknown;
const moduleWithHooks = module as typeof module & {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: ResolveContext, nextResolve: NextResolve) => unknown;
  }) => void;
};
moduleWithHooks.registerHooks?.({
  resolve(specifier: string, context: ResolveContext, nextResolve: NextResolve) {
    let target = specifier;
    if (target.startsWith('@/')) {
      const resolvedPath = path.resolve(projectRoot, target.slice(2));
      const finalPath =
        !path.extname(resolvedPath) && fs.existsSync(`${resolvedPath}.ts`)
          ? `${resolvedPath}.ts`
          : resolvedPath;
      target = pathToFileURL(finalPath).href;
    } else if (
      (target.startsWith('./') || target.startsWith('../')) &&
      context.parentURL &&
      !path.extname(target)
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const candidateTs = path.resolve(parentDir, `${target}.ts`);
      if (fs.existsSync(candidateTs)) {
        target = pathToFileURL(candidateTs).href;
      }
    }
    return nextResolve(target, context);
  },
});

// Load .env.local if present without printing any values
const envLocalPath = path.resolve(projectRoot, '.env.local');
if (fs.existsSync(envLocalPath)) {
  const lines = fs.readFileSync(envLocalPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

async function main() {
  const { getDb, setSetting, getSetting } = await import('@/lib/db');
  const { runDoctorAgent } = await import('@/lib/agent/run');

  const db = getDb();
  const originalPublicBaseUrl = process.env.PUBLIC_BASE_URL;
  const originalDropWebhooks = getSetting('drop_webhooks', 'false');

  // Snapshot existing local_orders and webhook_events for 2JJ686322T369532X so we restore cleanly
  const DROPPED_ORDER_ID = '2JJ686322T369532X';
  const NO_DRIFT_ORDER_ID = '8N99210137712282F';

  const savedOrderRow = db
    .prepare('SELECT * FROM local_orders WHERE order_id = ?')
    .get(DROPPED_ORDER_ID) as Record<string, unknown> | undefined;
  const savedEventRows = db
    .prepare(
      "SELECT * FROM webhook_events WHERE order_id = ? AND event_type = 'PAYMENT.CAPTURE.COMPLETED'",
    )
    .all(DROPPED_ORDER_ID) as Record<string, unknown>[];

  let allPassed = true;

  try {
    // =========================================================================
    // Scenario (a): Dropped webhook (real sandbox order 2JJ686322T369532X)
    // =========================================================================
    console.log('\n--- Scenario (a): Dropped webhook ---');
    setSetting('drop_webhooks', 'false');
    if (originalPublicBaseUrl) {
      process.env.PUBLIC_BASE_URL = originalPublicBaseUrl;
    }

    // Set 2JJ686322T369532X as unpaid locally and remove its local capture webhook row
    // while keeping its real PAYMENT.CAPTURE.COMPLETED event in PayPal sandbox
    db.prepare(
      `INSERT INTO local_orders (order_id, amount, currency, local_status, created_at, updated_at)
       VALUES (?, '450.00', 'USD', 'CREATED', '2026-11-09T11:29:41.000Z', '2026-11-09T11:29:41.000Z')
       ON CONFLICT(order_id) DO UPDATE SET local_status = 'CREATED'`,
    ).run(DROPPED_ORDER_ID);
    db.prepare(
      "DELETE FROM webhook_events WHERE order_id = ? AND event_type = 'PAYMENT.CAPTURE.COMPLETED'",
    ).run(DROPPED_ORDER_ID);

    const runA = await runDoctorAgent({
      orderId: DROPPED_ORDER_ID,
      onStep: (s) =>
        console.log(
          `  [step ${s.step}] ${s.tool_name}(${JSON.stringify(s.arguments)}) -> ${s.result_summary} (${s.duration_ms}ms, ${s.model_used})`,
        ),
    });

    const traceIdsA = new Set(runA.trace.map((t) => t.tool_call_id));
    const validEvidenceA =
      runA.result.evidence.length > 0 &&
      runA.result.evidence.every((e) => traceIdsA.has(e.tool_call_id));
    const passA =
      runA.result.root_cause === 'WEBHOOK_DROPPED_BY_LISTENER' &&
      runA.result.safe_to_heal === true &&
      validEvidenceA;

    console.log(
      `Scenario (a) result: root_cause=${runA.result.root_cause}, safe_to_heal=${runA.result.safe_to_heal}, evidence_valid=${validEvidenceA}, model=${runA.model_used}`,
    );
    console.log(`Scenario (a): ${passA ? 'PASS' : 'FAIL'}`);
    if (!passA) allPassed = false;

    // Restore 2JJ686322T369532X before running Scenario (b) so there is zero drift in the DB
    if (savedOrderRow) {
      db.prepare(
        `INSERT OR REPLACE INTO local_orders (order_id, amount, currency, local_status, created_at, updated_at)
         VALUES (@order_id, @amount, @currency, @local_status, @created_at, @updated_at)`,
      ).run(savedOrderRow);
    } else {
      db.prepare('DELETE FROM local_orders WHERE order_id = ?').run(DROPPED_ORDER_ID);
    }
    for (const ev of savedEventRows) {
      db.prepare(
        `INSERT OR IGNORE INTO webhook_events (id, event_type, resource_id, order_id, raw_body, headers_json, verification_status, received_at)
         VALUES (@id, @event_type, @resource_id, @order_id, @raw_body, @headers_json, @verification_status, @received_at)`,
      ).run(ev);
    }

    // =========================================================================
    // Scenario (b): No drift (real sandbox order 8N99210137712282F, already PAID)
    // =========================================================================
    await new Promise((r) => setTimeout(r, 12_000));
    console.log('\n--- Scenario (b): No drift ---');
    setSetting('drop_webhooks', 'false');
    if (originalPublicBaseUrl) {
      process.env.PUBLIC_BASE_URL = originalPublicBaseUrl;
    }

    const runB = await runDoctorAgent({
      orderId: NO_DRIFT_ORDER_ID,
      onStep: (s) =>
        console.log(
          `  [step ${s.step}] ${s.tool_name}(${JSON.stringify(s.arguments)}) -> ${s.result_summary} (${s.duration_ms}ms, ${s.model_used})`,
        ),
    });

    const traceIdsB = new Set(runB.trace.map((t) => t.tool_call_id));
    const validEvidenceB =
      runB.result.evidence.length > 0 &&
      runB.result.evidence.every((e) => traceIdsB.has(e.tool_call_id));
    const passB =
      runB.result.root_cause === 'NO_DRIFT' &&
      runB.result.safe_to_heal === false &&
      validEvidenceB;

    console.log(
      `Scenario (b) result: root_cause=${runB.result.root_cause}, safe_to_heal=${runB.result.safe_to_heal}, evidence_valid=${validEvidenceB}, model=${runB.model_used}`,
    );
    console.log(`Scenario (b): ${passB ? 'PASS' : 'FAIL'}`);
    if (!passB) allPassed = false;

    // =========================================================================
    // Scenario (c): Webhook URL mismatch (temporarily set PUBLIC_BASE_URL to wrong value)
    // =========================================================================
    await new Promise((r) => setTimeout(r, 15_000));
    console.log('\n--- Scenario (c): Webhook URL mismatch ---');
    process.env.PUBLIC_BASE_URL = 'https://mismatch-webhook-host.example.com';

    const runC = await runDoctorAgent({
      orderId: NO_DRIFT_ORDER_ID,
      onStep: (s) =>
        console.log(
          `  [step ${s.step}] ${s.tool_name}(${JSON.stringify(s.arguments)}) -> ${s.result_summary} (${s.duration_ms}ms, ${s.model_used})`,
        ),
    });

    const traceIdsC = new Set(runC.trace.map((t) => t.tool_call_id));
    const validEvidenceC =
      runC.result.evidence.length > 0 &&
      runC.result.evidence.every((e) => traceIdsC.has(e.tool_call_id));
    const passC =
      runC.result.root_cause === 'WEBHOOK_URL_OR_EVENT_MISMATCH' &&
      runC.result.safe_to_heal === false &&
      validEvidenceC;

    console.log(
      `Scenario (c) result: root_cause=${runC.result.root_cause}, safe_to_heal=${runC.result.safe_to_heal}, evidence_valid=${validEvidenceC}, model=${runC.model_used}`,
    );
    console.log(`Scenario (c): ${passC ? 'PASS' : 'FAIL'}`);
    if (!passC) allPassed = false;
  } finally {
    // Ensure DB and env are restored
    if (savedOrderRow) {
      db.prepare(
        `INSERT OR REPLACE INTO local_orders (order_id, amount, currency, local_status, created_at, updated_at)
         VALUES (@order_id, @amount, @currency, @local_status, @created_at, @updated_at)`,
      ).run(savedOrderRow);
    } else {
      db.prepare('DELETE FROM local_orders WHERE order_id = ?').run(DROPPED_ORDER_ID);
    }
    for (const ev of savedEventRows) {
      db.prepare(
        `INSERT OR IGNORE INTO webhook_events (id, event_type, resource_id, order_id, raw_body, headers_json, verification_status, received_at)
         VALUES (@id, @event_type, @resource_id, @order_id, @raw_body, @headers_json, @verification_status, @received_at)`,
      ).run(ev);
    }
    setSetting('drop_webhooks', originalDropWebhooks);
    if (originalPublicBaseUrl !== undefined) {
      process.env.PUBLIC_BASE_URL = originalPublicBaseUrl;
    } else {
      delete process.env.PUBLIC_BASE_URL;
    }
  }

  console.log(`\nOverall Agent Test Suite: ${allPassed ? 'PASS' : 'FAIL'}`);
  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test script failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
