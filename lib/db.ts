import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type VerificationStatus = 'SUCCESS' | 'FAILURE';

export type LocalOrderStatus = 'CREATED' | 'PAID';

export type WebhookEventRow = {
  id: string;
  event_type: string;
  resource_id: string | null;
  order_id: string | null;
  raw_body: string;
  headers_json: string;
  verification_status: VerificationStatus;
  received_at: string;
};

export type LocalOrderRow = {
  order_id: string;
  amount: string;
  currency: string;
  local_status: LocalOrderStatus;
  created_at: string;
  updated_at: string;
};

export type SettingRow = {
  key: string;
  value: string;
};

export type HealLogRow = {
  id: number;
  order_id: string;
  event_id: string | null;
  action: string;
  result: string;
  reason: string;
  started_at: string;
  finished_at: string;
};

export type AgentRunRow = {
  id: number;
  order_id: string | null;
  model_used: string;
  trace_json: string;
  result_json: string;
  created_at: string;
};

export type SeedOrderItem = {
  order_id: string;
  amount: string;
  currency: string;
  created_at: string;
};

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH?.trim();
  if (!configured) {
    return path.resolve(process.cwd(), 'data', 'tether.db');
  }
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured);
}

const SEED_PATH = path.resolve(process.cwd(), 'seed', 'demo-seed.json');

export function readDemoSeedOrders(): SeedOrderItem[] {
  try {
    if (!fs.existsSync(SEED_PATH)) return [];
    const raw = fs.readFileSync(SEED_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SeedOrderItem =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as SeedOrderItem).order_id === 'string' &&
          typeof (item as SeedOrderItem).amount === 'string' &&
          typeof (item as SeedOrderItem).currency === 'string' &&
          typeof (item as SeedOrderItem).created_at === 'string',
      )
      .map((item) => ({
        order_id: item.order_id.trim(),
        amount: item.amount.trim(),
        currency: item.currency.trim() || 'USD',
        created_at: item.created_at.trim(),
      }));
  } catch {
    return [];
  }
}

function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      resource_id TEXT,
      order_id TEXT,
      raw_body TEXT NOT NULL,
      headers_json TEXT NOT NULL,
      verification_status TEXT NOT NULL,
      received_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_orders (
      order_id TEXT PRIMARY KEY,
      amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      local_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS heal_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      event_id TEXT,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      reason TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT,
      model_used TEXT NOT NULL,
      trace_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('drop_webhooks', 'false');
  `);
}

function seedIfEmpty(db: Database.Database): void {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM local_orders').get() as
    | { cnt: number }
    | undefined;
  if ((row?.cnt ?? 0) > 0) {
    return;
  }

  const seedOrders = readDemoSeedOrders();
  if (seedOrders.length === 0) {
    return;
  }

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO local_orders (
      order_id,
      amount,
      currency,
      local_status,
      created_at,
      updated_at
    ) VALUES (
      @order_id,
      @amount,
      @currency,
      'PAID',
      @created_at,
      @updated_at
    )
  `);

  const runSeed = db.transaction((items: SeedOrderItem[]) => {
    for (const item of items) {
      insertStmt.run({
        order_id: item.order_id,
        amount: item.amount,
        currency: item.currency,
        created_at: item.created_at,
        updated_at: item.created_at,
      });
    }
  });

  runSeed(seedOrders);
}

let dbInstance: Database.Database | undefined;
let dbInstancePath: string | undefined;

export function getDb(): Database.Database {
  const targetPath = resolveDbPath();
  if (
    dbInstance &&
    dbInstancePath === targetPath &&
    fs.existsSync(/*turbopackIgnore: true*/ targetPath)
  ) {
    ensureSchema(dbInstance);
    seedIfEmpty(dbInstance);
    return dbInstance;
  }

  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore close errors when switching/recreating DB file
    }
    dbInstance = undefined;
    dbInstancePath = undefined;
  }

  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(targetPath), { recursive: true });
  const db = new Database(targetPath);
  db.pragma('journal_mode = WAL');

  ensureSchema(db);
  seedIfEmpty(db);

  dbInstance = db;
  dbInstancePath = targetPath;
  return db;
}

export function initDatabaseOnBoot(): void {
  getDb();
}

export function insertWebhookEvent(event: WebhookEventRow): { inserted: boolean } {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO webhook_events (
      id,
      event_type,
      resource_id,
      order_id,
      raw_body,
      headers_json,
      verification_status,
      received_at
    ) VALUES (
      @id,
      @event_type,
      @resource_id,
      @order_id,
      @raw_body,
      @headers_json,
      @verification_status,
      @received_at
    )
  `);

  const result = stmt.run(event);
  return { inserted: result.changes > 0 };
}

export function getLatestWebhookEvents(limit = 100): WebhookEventRow[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      id,
      event_type,
      resource_id,
      order_id,
      raw_body,
      headers_json,
      verification_status,
      received_at
    FROM webhook_events
    ORDER BY received_at DESC, rowid DESC
    LIMIT ?
  `);

  return stmt.all(limit) as WebhookEventRow[];
}

export function insertLocalOrder(input: {
  order_id: string;
  amount: string;
  currency: string;
  local_status?: LocalOrderStatus;
  created_at?: string;
  updated_at?: string;
}): LocalOrderRow {
  const db = getDb();
  const now = new Date().toISOString();
  const row: LocalOrderRow = {
    order_id: input.order_id,
    amount: input.amount,
    currency: input.currency,
    local_status: input.local_status ?? 'CREATED',
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
  };

  const stmt = db.prepare(`
    INSERT INTO local_orders (
      order_id,
      amount,
      currency,
      local_status,
      created_at,
      updated_at
    ) VALUES (
      @order_id,
      @amount,
      @currency,
      @local_status,
      @created_at,
      @updated_at
    )
    ON CONFLICT(order_id) DO UPDATE SET
      amount = excluded.amount,
      currency = excluded.currency,
      local_status = excluded.local_status,
      updated_at = excluded.updated_at
  `);

  stmt.run(row);
  return row;
}

export function markLocalOrderPaid(orderId: string): { updated: boolean } {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE local_orders
    SET local_status = 'PAID',
        updated_at = @updated_at
    WHERE order_id = @order_id
  `);

  const result = stmt.run({
    order_id: orderId,
    updated_at: new Date().toISOString(),
  });
  return { updated: result.changes > 0 };
}

export function getUnpaidLocalOrders(): LocalOrderRow[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      order_id,
      amount,
      currency,
      local_status,
      created_at,
      updated_at
    FROM local_orders
    WHERE local_status != 'PAID'
    ORDER BY created_at DESC, rowid DESC
  `);

  return stmt.all() as LocalOrderRow[];
}

export function getSetting(key: string, defaultValue = ''): string {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT value
    FROM settings
    WHERE key = ?
  `);

  const row = stmt.get(key) as { value: string } | undefined;
  return row ? row.value : defaultValue;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  stmt.run({ key, value });
}

export function hasCompletedCaptureWebhookForOrder(orderId: string): boolean {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 1
    FROM webhook_events
    WHERE event_type = 'PAYMENT.CAPTURE.COMPLETED'
      AND order_id = ?
    LIMIT 1
  `);

  const row = stmt.get(orderId);
  return Boolean(row);
}

export function getLocalOrder(orderId: string): LocalOrderRow | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      order_id,
      amount,
      currency,
      local_status,
      created_at,
      updated_at
    FROM local_orders
    WHERE order_id = ?
  `);

  const row = stmt.get(orderId) as LocalOrderRow | undefined;
  return row ?? null;
}

export function insertHealLog(input: {
  order_id: string;
  event_id?: string | null;
  action: string;
  result: string;
  reason: string;
  started_at: string;
  finished_at: string;
}): HealLogRow {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO heal_log (
      order_id,
      event_id,
      action,
      result,
      reason,
      started_at,
      finished_at
    ) VALUES (
      @order_id,
      @event_id,
      @action,
      @result,
      @reason,
      @started_at,
      @finished_at
    )
  `);

  const info = stmt.run({
    order_id: input.order_id,
    event_id: input.event_id ?? null,
    action: input.action,
    result: input.result,
    reason: input.reason,
    started_at: input.started_at,
    finished_at: input.finished_at,
  });

  return {
    id: Number(info.lastInsertRowid),
    order_id: input.order_id,
    event_id: input.event_id ?? null,
    action: input.action,
    result: input.result,
    reason: input.reason,
    started_at: input.started_at,
    finished_at: input.finished_at,
  };
}

export function getRecentHealLogs(limit = 50): HealLogRow[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      id,
      order_id,
      event_id,
      action,
      result,
      reason,
      started_at,
      finished_at
    FROM heal_log
    ORDER BY id DESC
    LIMIT ?
  `);

  return stmt.all(limit) as HealLogRow[];
}

export function getLastResendAttemptForEvent(eventId: string): HealLogRow | null {
  const db = getDb();
  const demoResetAt = getSetting('demo_reset_at', '').trim();
  if (demoResetAt) {
    const stmt = db.prepare(`
      SELECT
        id,
        order_id,
        event_id,
        action,
        result,
        reason,
        started_at,
        finished_at
      FROM heal_log
      WHERE event_id = @eventId
        AND action = 'RESEND_WEBHOOK'
        AND started_at >= @demoResetAt
      ORDER BY id DESC
      LIMIT 1
    `);
    const row = stmt.get({ eventId, demoResetAt }) as HealLogRow | undefined;
    return row ?? null;
  }

  const stmt = db.prepare(`
    SELECT
      id,
      order_id,
      event_id,
      action,
      result,
      reason,
      started_at,
      finished_at
    FROM heal_log
    WHERE event_id = ?
      AND action = 'RESEND_WEBHOOK'
    ORDER BY id DESC
    LIMIT 1
  `);

  const row = stmt.get(eventId) as HealLogRow | undefined;
  return row ?? null;
}

export function getWebhookEventsForOrder(orderId: string): WebhookEventRow[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      id,
      event_type,
      resource_id,
      order_id,
      raw_body,
      headers_json,
      verification_status,
      received_at
    FROM webhook_events
    WHERE order_id = @orderId OR resource_id = @orderId
    ORDER BY received_at DESC, rowid DESC
  `);

  return stmt.all({ orderId }) as WebhookEventRow[];
}

export function insertAgentRun(input: {
  order_id: string | null;
  model_used: string;
  trace_json: string;
  result_json: string;
  created_at?: string;
}): AgentRunRow {
  const db = getDb();
  const createdAt = input.created_at ?? new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO agent_runs (
      order_id,
      model_used,
      trace_json,
      result_json,
      created_at
    ) VALUES (
      @order_id,
      @model_used,
      @trace_json,
      @result_json,
      @created_at
    )
  `);

  const info = stmt.run({
    order_id: input.order_id,
    model_used: input.model_used,
    trace_json: input.trace_json,
    result_json: input.result_json,
    created_at: createdAt,
  });

  return {
    id: Number(info.lastInsertRowid),
    order_id: input.order_id,
    model_used: input.model_used,
    trace_json: input.trace_json,
    result_json: input.result_json,
    created_at: createdAt,
  };
}

export function getRecentAgentRuns(limit = 50): AgentRunRow[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      id,
      order_id,
      model_used,
      trace_json,
      result_json,
      created_at
    FROM agent_runs
    ORDER BY id DESC
    LIMIT ?
  `);

  return stmt.all(limit) as AgentRunRow[];
}

export function countAgentRunsSince(isoTimestamp: string): number {
  const db = getDb();
  const row = db
    .prepare('SELECT COUNT(*) AS cnt FROM agent_runs WHERE created_at >= ?')
    .get(isoTimestamp) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export function loadDriftingDemoOrder(preferredOrderId?: string): {
  order: LocalOrderRow;
  demo_reset_at: string;
} {
  const db = getDb();
  const seedOrders = readDemoSeedOrders();
  const fallbackOrder: SeedOrderItem = seedOrders[0] ?? {
    order_id: '9S418248XP100792M',
    amount: '450.00',
    currency: 'USD',
    created_at: '2026-11-11T19:16:22.982Z',
  };

  let targetSeed: SeedOrderItem | undefined;
  if (preferredOrderId && preferredOrderId.trim() !== '') {
    const trimmed = preferredOrderId.trim();
    targetSeed = seedOrders.find((s) => s.order_id === trimmed);
    if (!targetSeed) {
      const existing = getLocalOrder(trimmed);
      if (existing) {
        targetSeed = {
          order_id: existing.order_id,
          amount: existing.amount,
          currency: existing.currency,
          created_at: existing.created_at,
        };
      }
    }
  }

  if (!targetSeed) {
    // Pick the first seeded order that is currently PAID locally, or fallback to the first seed order
    for (const candidate of seedOrders) {
      const existing = getLocalOrder(candidate.order_id);
      if (!existing || existing.local_status === 'PAID') {
        targetSeed = candidate;
        break;
      }
    }
  }

  const chosen = targetSeed ?? fallbackOrder;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    for (const item of seedOrders) {
      db.prepare(`
        INSERT OR IGNORE INTO local_orders (
          order_id,
          amount,
          currency,
          local_status,
          created_at,
          updated_at
        ) VALUES (
          @order_id,
          @amount,
          @currency,
          'PAID',
          @created_at,
          @updated_at
        )
      `).run({
        order_id: item.order_id,
        amount: item.amount,
        currency: item.currency,
        created_at: item.created_at,
        updated_at: item.created_at,
      });
    }

    db.prepare(`
      INSERT INTO local_orders (
        order_id,
        amount,
        currency,
        local_status,
        created_at,
        updated_at
      ) VALUES (
        @order_id,
        @amount,
        @currency,
        'CREATED',
        @created_at,
        @updated_at
      )
      ON CONFLICT(order_id) DO UPDATE SET
        local_status = 'CREATED',
        updated_at = excluded.updated_at
    `).run({
      order_id: chosen.order_id,
      amount: chosen.amount,
      currency: chosen.currency,
      created_at: chosen.created_at,
      updated_at: now,
    });

    db.prepare(`
      DELETE FROM webhook_events
      WHERE order_id = @order_id
        AND event_type = 'PAYMENT.CAPTURE.COMPLETED'
    `).run({ order_id: chosen.order_id });

    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('drop_webhooks', 'false')
      ON CONFLICT(key) DO UPDATE SET value = 'false'
    `).run();

    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('demo_reset_at', @now)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run({ now });
  });

  tx();

  const updated = getLocalOrder(chosen.order_id) ?? {
    order_id: chosen.order_id,
    amount: chosen.amount,
    currency: chosen.currency,
    local_status: 'CREATED',
    created_at: chosen.created_at,
    updated_at: now,
  };

  return {
    order: updated,
    demo_reset_at: now,
  };
}

export function resetDemoDatabase(): {
  seeded_count: number;
  demo_reset_at: string;
} {
  const db = getDb();
  const seedOrders = readDemoSeedOrders();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.exec(`
      DELETE FROM webhook_events;
      DELETE FROM heal_log;
      DELETE FROM agent_runs;
      DELETE FROM local_orders;
    `);

    for (const item of seedOrders) {
      db.prepare(`
        INSERT INTO local_orders (
          order_id,
          amount,
          currency,
          local_status,
          created_at,
          updated_at
        ) VALUES (
          @order_id,
          @amount,
          @currency,
          'PAID',
          @created_at,
          @updated_at
        )
      `).run({
        order_id: item.order_id,
        amount: item.amount,
        currency: item.currency,
        created_at: item.created_at,
        updated_at: item.created_at,
      });
    }

    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('drop_webhooks', 'false')
      ON CONFLICT(key) DO UPDATE SET value = 'false'
    `).run();

    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('demo_reset_at', @now)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run({ now });
  });

  tx();

  return {
    seeded_count: seedOrders.length,
    demo_reset_at: now,
  };
}




