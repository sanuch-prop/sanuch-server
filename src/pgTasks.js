// SQL-backed task store. Used when STORAGE_MODE=postgres.
// Replaces tasks.json KV blob with a proper indexed table.
// The poll() operation uses FOR UPDATE SKIP LOCKED for atomic multi-user delivery.

class PgTasks {
  constructor(pool) {
    this.pool = pool;
  }

  async ensureTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'OPEN_TRADE',
        user_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        account_mode TEXT NOT NULL,
        is_demo BOOLEAN NOT NULL,
        symbol TEXT NOT NULL,
        action TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        expiry_sec INTEGER NOT NULL,
        option_type INTEGER,
        request_id TEXT,
        source TEXT,
        signal_id TEXT,
        signal_price NUMERIC,
        reason TEXT,
        meta JSONB DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'CREATED',
        idem_key TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_at_ms BIGINT,
        expires_at_ms BIGINT,
        delivered_at TIMESTAMPTZ,
        delivered_to TEXT,
        acked_at TIMESTAMPTZ,
        ack JSONB
      );
      CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);
      CREATE INDEX IF NOT EXISTS tasks_client_id_idx ON tasks(client_id);
      CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON tasks(user_id);
      CREATE INDEX IF NOT EXISTS tasks_expires_at_ms_idx ON tasks(expires_at_ms);
    `);
  }

  // Load active tasks for in-memory warm-up on boot.
  async loadActive() {
    const now = Date.now();
    const { rows } = await this.pool.query(
      `SELECT * FROM tasks
       WHERE status IN ('CREATED', 'DELIVERED')
         AND expires_at_ms > $1
       ORDER BY created_at_ms ASC`,
      [now]
    );
    return rows.map(rowToTask);
  }

  // Load seen idem keys (last 24h) to populate the dedup set.
  async loadIdemKeys() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const { rows } = await this.pool.query(
      `SELECT idem_key FROM tasks WHERE created_at_ms > $1 AND idem_key IS NOT NULL`,
      [cutoff]
    );
    return rows.map(r => r.idem_key);
  }

  async insert(task) {
    const t = task;
    await this.pool.query(
      `INSERT INTO tasks (
        id, type, user_id, client_id, account_mode, is_demo,
        symbol, action, amount, expiry_sec, option_type, request_id,
        source, signal_id, signal_price, reason, meta,
        status, idem_key, created_at_ms, expires_at_ms
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17::jsonb,$18,$19,$20,$21
      ) ON CONFLICT (id) DO NOTHING`,
      [
        t.id, t.type || "OPEN_TRADE",
        t.userId, t.clientId, t.accountMode, t.isDemo ?? false,
        t.symbol, t.action,
        t.amount, t.expirySec, t.optionType || null,
        t.requestId || null, t.source || null,
        t.signalId || null,
        t.signalPrice != null ? t.signalPrice : null,
        t.reason || null,
        JSON.stringify(t.meta || {}),
        t.status || "CREATED",
        t.idemKey || null,
        t.createdAtMs || null,
        t.expiresAtMs || null
      ]
    );
  }

  // Atomic poll: SELECT + UPDATE in one statement using FOR UPDATE SKIP LOCKED.
  // This prevents two concurrent clients from receiving the same task.
  async poll(clientId, limit = 5, accountMode = null) {
    const now = Date.now();
    const acctFilter = accountMode ? `AND account_mode = $5` : "";
    const acctParam = accountMode ? [clientId, limit, now, "all", accountMode] : [clientId, limit, now, "all"];

    const { rows } = await this.pool.query(
      `WITH to_deliver AS (
        SELECT id FROM tasks
        WHERE status = 'CREATED'
          AND expires_at_ms > $3
          AND (client_id = $4 OR client_id = $1)
          ${acctFilter}
        ORDER BY created_at_ms ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE tasks SET
        status = 'DELIVERED',
        delivered_at = NOW(),
        delivered_to = $1
      FROM to_deliver
      WHERE tasks.id = to_deliver.id
      RETURNING tasks.*`,
      acctParam
    );

    // Also return already-delivered tasks for this client (retry safety)
    const { rows: delivered } = await this.pool.query(
      `SELECT * FROM tasks
       WHERE status = 'DELIVERED'
         AND delivered_to = $1
         AND expires_at_ms > $2
       ORDER BY created_at_ms ASC
       LIMIT $3`,
      [clientId, now, limit]
    );

    const all = [...rows, ...delivered];
    const seen = new Set();
    return all.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
              .map(rowToTask);
  }

  async ack(taskId, ackData) {
    const { rows } = await this.pool.query(
      `UPDATE tasks SET
        status = $2,
        acked_at = NOW(),
        ack = $3::jsonb
       WHERE id = $1
       RETURNING *`,
      [taskId, ackData.status || "ACKED", JSON.stringify(ackData)]
    );
    return rows[0] ? rowToTask(rows[0]) : null;
  }

  async cancelByClient(clientId) {
    const { rowCount } = await this.pool.query(
      `UPDATE tasks SET status = 'CANCELLED'
       WHERE status IN ('CREATED', 'DELIVERED')
         AND (client_id = $1 OR client_id = 'all')`,
      [clientId]
    );
    return rowCount || 0;
  }

  async pruneExpired() {
    const cutoff = Date.now();
    await this.pool.query(
      `UPDATE tasks SET status = 'EXPIRED'
       WHERE status IN ('CREATED', 'DELIVERED')
         AND expires_at_ms <= $1`,
      [cutoff]
    );
    // Hard-delete tasks older than 24h to keep the table lean
    await this.pool.query(
      `DELETE FROM tasks WHERE created_at_ms < $1`,
      [cutoff - 24 * 60 * 60 * 1000]
    );
  }

  async checkIdemKey(idemKey) {
    const { rows } = await this.pool.query(
      `SELECT id FROM tasks WHERE idem_key = $1 LIMIT 1`,
      [idemKey]
    );
    return rows.length > 0;
  }

  async list({ limit = 100 } = {}) {
    const { rows } = await this.pool.query(
      `SELECT * FROM tasks ORDER BY created_at_ms DESC LIMIT $1`,
      [limit]
    );
    return rows.map(rowToTask);
  }

  async state() {
    const { rows } = await this.pool.query(
      `SELECT status, COUNT(*) AS cnt FROM tasks GROUP BY status`
    );
    const byStatus = {};
    for (const r of rows) byStatus[r.status] = Number(r.cnt);
    return { byStatus };
  }
}

function rowToTask(r) {
  return {
    id: r.id,
    type: r.type,
    userId: r.user_id,
    clientId: r.client_id,
    accountMode: r.account_mode,
    isDemo: r.is_demo,
    symbol: r.symbol,
    action: r.action,
    amount: r.amount != null ? Number(r.amount) : null,
    expirySec: r.expiry_sec,
    optionType: r.option_type,
    requestId: r.request_id,
    source: r.source,
    signalId: r.signal_id,
    signalPrice: r.signal_price != null ? Number(r.signal_price) : null,
    reason: r.reason,
    meta: r.meta || {},
    status: r.status,
    idemKey: r.idem_key,
    createdAt: r.created_at,
    createdAtMs: r.created_at_ms != null ? Number(r.created_at_ms) : null,
    expiresAtMs: r.expires_at_ms != null ? Number(r.expires_at_ms) : null,
    deliveredAt: r.delivered_at,
    deliveredTo: r.delivered_to,
    ackedAt: r.acked_at,
    ack: r.ack
  };
}

module.exports = PgTasks;
