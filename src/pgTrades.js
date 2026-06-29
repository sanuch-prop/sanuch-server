// SQL-backed trades storage. Used when STORAGE_MODE=postgres.
// Replaces the trades.json KV blob with a proper indexed table.

class PgTrades {
  constructor(pool) {
    this.pool = pool;
  }

  async ensureTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        user_id TEXT NOT NULL,
        client_id TEXT,
        account_mode TEXT,
        is_demo BOOLEAN,
        symbol TEXT,
        action TEXT,
        amount NUMERIC,
        expiry_sec INTEGER,
        option_type INTEGER,
        request_id TEXT,
        source TEXT,
        signal_id TEXT,
        signal_price NUMERIC,
        reason TEXT,
        meta JSONB DEFAULT '{}',
        payout_percent NUMERIC,
        status TEXT NOT NULL DEFAULT 'OPEN',
        opened_at TIMESTAMPTZ,
        opened_at_ms BIGINT,
        expiry_at TIMESTAMPTZ,
        expiry_at_ms BIGINT,
        entry_price NUMERIC,
        entry_price_source TEXT,
        entry_price_time TEXT,
        exit_price NUMERIC,
        exit_price_source TEXT,
        result TEXT,
        result_source TEXT,
        pnl NUMERIC,
        pnl_source TEXT,
        raw_move NUMERIC,
        direction_move NUMERIC,
        close_reason TEXT,
        closed_at TIMESTAMPTZ,
        closed_at_ms BIGINT,
        external_id TEXT
      );
      CREATE INDEX IF NOT EXISTS trades_user_id_idx ON trades(user_id);
      CREATE INDEX IF NOT EXISTS trades_status_idx ON trades(status);
      CREATE INDEX IF NOT EXISTS trades_opened_at_ms_idx ON trades(opened_at_ms DESC);
      CREATE INDEX IF NOT EXISTS trades_user_status_idx ON trades(user_id, status);
    `);
  }

  // Load all OPEN trades + recently closed (for applyExternalResult matching).
  async loadActive(recentClosedMs = 30 * 60 * 1000) {
    const cutoff = Date.now() - recentClosedMs;
    const { rows } = await this.pool.query(
      `SELECT * FROM trades
       WHERE status = 'OPEN'
          OR (status = 'CLOSED' AND closed_at_ms > $1)
       ORDER BY opened_at_ms ASC`,
      [cutoff]
    );
    return rows.map(rowToTrade);
  }

  async insert(trade) {
    const t = trade;
    await this.pool.query(
      `INSERT INTO trades (
        id, task_id, user_id, client_id, account_mode, is_demo,
        symbol, action, amount, expiry_sec, option_type, request_id,
        source, signal_id, signal_price, reason, meta, payout_percent,
        status, opened_at, opened_at_ms, expiry_at, expiry_at_ms,
        entry_price, entry_price_source, entry_price_time,
        exit_price, exit_price_source, result, result_source,
        pnl, pnl_source, raw_move, direction_move,
        close_reason, closed_at, closed_at_ms, external_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
        $17::jsonb,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
        $29,$30,$31,$32,$33,$34,$35,$36,$37,$38
      ) ON CONFLICT (id) DO NOTHING`,
      [
        t.id, t.taskId || null, t.userId, t.clientId || null,
        t.accountMode || null, t.isDemo ?? null,
        t.symbol || null, t.action || null,
        t.amount != null ? t.amount : null,
        t.expirySec || null, t.optionType || null, t.requestId || null,
        t.source || null, t.signalId || null,
        t.signalPrice != null ? t.signalPrice : null,
        t.reason || null,
        JSON.stringify(t.meta || {}),
        t.payoutPercent != null ? t.payoutPercent : null,
        t.status || "OPEN",
        t.openedAt || null, t.openedAtMs || null,
        t.expiryAt || null, t.expiryAtMs || null,
        t.entryPrice != null ? t.entryPrice : null,
        t.entryPriceSource || null, t.entryPriceTime || null,
        t.exitPrice != null ? t.exitPrice : null,
        t.exitPriceSource || null,
        t.result || null, t.resultSource || null,
        t.pnl != null ? t.pnl : null, t.pnlSource || null,
        t.rawMove != null ? t.rawMove : null,
        t.directionMove != null ? t.directionMove : null,
        t.closeReason || null, t.closedAt || null, t.closedAtMs || null,
        t.externalId || null
      ]
    );
  }

  async updateStatus(tradeId, trade) {
    const t = trade;
    await this.pool.query(
      `UPDATE trades SET
        status=$2, result=$3, result_source=$4,
        pnl=$5, pnl_source=$6, raw_move=$7, direction_move=$8,
        exit_price=$9, exit_price_source=$10,
        entry_price=$11, entry_price_source=$12,
        close_reason=$13, closed_at=$14, closed_at_ms=$15,
        payout_percent=$16
       WHERE id=$1`,
      [
        tradeId,
        t.status || null, t.result || null, t.resultSource || null,
        t.pnl != null ? t.pnl : null, t.pnlSource || null,
        t.rawMove != null ? t.rawMove : null,
        t.directionMove != null ? t.directionMove : null,
        t.exitPrice != null ? t.exitPrice : null, t.exitPriceSource || null,
        t.entryPrice != null ? t.entryPrice : null, t.entryPriceSource || null,
        t.closeReason || null, t.closedAt || null, t.closedAtMs || null,
        t.payoutPercent != null ? t.payoutPercent : null
      ]
    );
  }

  async list({ userId, limit = 100 } = {}) {
    if (userId) {
      const { rows } = await this.pool.query(
        `SELECT * FROM trades WHERE user_id=$1 ORDER BY opened_at_ms DESC LIMIT $2`,
        [userId, limit]
      );
      return rows.map(rowToTrade);
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM trades ORDER BY opened_at_ms DESC LIMIT $1`,
      [limit]
    );
    return rows.map(rowToTrade);
  }

  async stats(userId) {
    const filter = userId ? `WHERE user_id = $1` : "";
    const params = userId ? [userId] : [];
    const { rows } = await this.pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status='OPEN') AS open,
        COUNT(*) FILTER (WHERE status='CLOSED') AS closed,
        COUNT(*) FILTER (WHERE status='CLOSED' AND result='WIN') AS wins,
        COUNT(*) FILTER (WHERE status='CLOSED' AND result='LOSS') AS losses,
        COUNT(*) FILTER (WHERE status='CLOSED' AND result='DRAW') AS draws,
        COUNT(*) FILTER (WHERE status='CLOSED' AND result='NO_PRICE') AS no_price,
        COALESCE(SUM(pnl) FILTER (WHERE status='CLOSED'), 0) AS profit
       FROM trades ${filter}`,
      params
    );
    const r = rows[0];
    const wins = Number(r.wins);
    const losses = Number(r.losses);
    const decisive = wins + losses;
    return {
      open: Number(r.open),
      closed: Number(r.closed),
      wins,
      losses,
      draws: Number(r.draws),
      noPrice: Number(r.no_price),
      winRate: decisive ? Number(((wins / decisive) * 100).toFixed(2)) : 0,
      profit: Number(r.profit) || 0
    };
  }
}

// Convert snake_case DB row back to camelCase trade object.
function rowToTrade(r) {
  return {
    id: r.id,
    taskId: r.task_id,
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
    payoutPercent: r.payout_percent != null ? Number(r.payout_percent) : null,
    status: r.status,
    openedAt: r.opened_at,
    openedAtMs: r.opened_at_ms != null ? Number(r.opened_at_ms) : null,
    expiryAt: r.expiry_at,
    expiryAtMs: r.expiry_at_ms != null ? Number(r.expiry_at_ms) : null,
    entryPrice: r.entry_price != null ? Number(r.entry_price) : null,
    entryPriceSource: r.entry_price_source,
    entryPriceTime: r.entry_price_time,
    exitPrice: r.exit_price != null ? Number(r.exit_price) : null,
    exitPriceSource: r.exit_price_source,
    result: r.result,
    resultSource: r.result_source,
    pnl: r.pnl != null ? Number(r.pnl) : null,
    pnlSource: r.pnl_source,
    rawMove: r.raw_move != null ? Number(r.raw_move) : null,
    directionMove: r.direction_move != null ? Number(r.direction_move) : null,
    closeReason: r.close_reason,
    closedAt: r.closed_at,
    closedAtMs: r.closed_at_ms != null ? Number(r.closed_at_ms) : null,
    externalId: r.external_id
  };
}

module.exports = PgTrades;
