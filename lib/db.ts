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

const DB_PATH = path.resolve(process.cwd(), 'data', 'tether.db');

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

let dbInstance: Database.Database | undefined;

export function getDb(): Database.Database {
  if (dbInstance) {
    ensureSchema(dbInstance);
    return dbInstance;
  }

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  ensureSchema(db);

  dbInstance = db;
  return db;
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



