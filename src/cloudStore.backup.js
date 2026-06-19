const CANDLE_KEEP_LIMIT = Number(process.env.CANDLE_KEEP_LIMIT || 110);
const TICK_KEEP_MINUTES = Number(process.env.TICK_KEEP_MINUTES || 30);
const CLEANUP_INTERVAL_MS = Number(process.env.MARKET_CLEANUP_INTERVAL_MS || 5000);

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function cleanSymbol(value) {
  return String(value || "").trim();
}

function isRetryablePgError(err) {
  return err && (err.code === "40P01" || err.code === "40001");
}

class CloudStore {
  constructor() {
    this.mode = String(process.env.STORAGE_MODE || "file").toLowerCase();
    this.databaseUrl = process.env.DATABASE_URL || "";

    this.enabled = this.mode === "postgres" && !!this.databaseUrl;

    this.pool = null;
    this.pgMissing = false;
    this.lastError = null;

    this.startedAt = nowIso();

    this.lastCleanupAt = 0;
    this.lastCleanupResult = null;
    this.cleanupRunning = false;
  }

  async queryWithRetry(sql, params = [], options = {}) {
    const retries = Number(options.retries ?? 2);
    const baseDelayMs = Number(options.baseDelayMs ?? 120);

    let lastErr = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await this.pool.query(sql, params);
      } catch (err) {
        lastErr = err;

        if (!isRetryablePgError(err) || attempt >= retries) {
          throw err;
        }

        await sleep(baseDelayMs * (attempt + 1));
      }
    }

    throw lastErr;
  }

  async init() {
    if (!this.enabled) {
      return this.status();
    }

    let pg;

    try {
      pg = require("pg");
    } catch (err) {
      this.pgMissing = true;
      this.lastError = "pg package is not installed. Run npm install pg in server folder.";
      console.warn("[cloudStore]", this.lastError);
      return this.status();
    }

    const sslEnabled = String(process.env.PGSSL || "true").toLowerCase() !== "false";

    this.pool = new pg.Pool({
      connectionString: this.databaseUrl,
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    try {
      await this.ensureSchema();
      console.log("[cloudStore] PostgreSQL storage connected");
    } catch (err) {
      this.lastError = err.message || String(err);
      console.error("[cloudStore] init error:", this.lastError);
      this.pool = null;
    }

    return this.status();
  }

  async ensureSchema() {
    if (!this.pool) return;

    await this.pool.query(`
      create table if not exists market_ticks (
        id bigserial primary key,
        symbol text not null,
        wire_symbol text,
        price double precision not null,
        server_time double precision,
        source text,
        received_at timestamptz not null default now()
      );
    `);

    await this.pool.query(`
      alter table market_ticks
        add column if not exists wire_symbol text,
        add column if not exists source text,
        add column if not exists received_at timestamptz not null default now();
    `);

    await this.pool.query(`
      create index if not exists idx_market_ticks_symbol_time
      on market_ticks(symbol, server_time desc);
    `);

    await this.pool.query(`
      create index if not exists idx_market_ticks_received_at
      on market_ticks(received_at desc);
    `);

    await this.pool.query(`
      delete from market_ticks mt
      using (
        select ctid
        from (
          select
            ctid,
            row_number() over (
              partition by symbol, server_time, price
              order by received_at desc, id desc
            ) as rn
          from market_ticks
        ) ranked
        where ranked.rn > 1
      ) duplicate_rows
      where mt.ctid = duplicate_rows.ctid;
    `);

    await this.pool.query(`
      create unique index if not exists market_ticks_symbol_server_time_price_key
      on market_ticks(symbol, server_time, price);
    `);

    await this.pool.query(`
      create table if not exists market_candles (
        symbol text not null,
        timeframe text not null,
        open_time double precision not null,
        close_time double precision not null,
        open double precision not null,
        high double precision not null,
        low double precision not null,
        close double precision not null,
        ticks integer not null default 0,
        is_closed boolean not null default false,
        first_server_time double precision,
        last_server_time double precision,
        updated_at timestamptz not null default now()
      );
    `);

    await this.pool.query(`
      alter table market_candles
        add column if not exists close_time double precision,
        add column if not exists ticks integer not null default 0,
        add column if not exists is_closed boolean not null default false,
        add column if not exists first_server_time double precision,
        add column if not exists last_server_time double precision,
        add column if not exists updated_at timestamptz not null default now();
    `);

    await this.pool.query(`
      delete from market_candles mc
      using (
        select ctid
        from (
          select
            ctid,
            row_number() over (
              partition by symbol, timeframe, open_time
              order by updated_at desc, last_server_time desc nulls last
            ) as rn
          from market_candles
        ) ranked
        where ranked.rn > 1
      ) duplicate_rows
      where mc.ctid = duplicate_rows.ctid;
    `);

    await this.pool.query(`
      create unique index if not exists idx_market_candles_key
      on market_candles(symbol, timeframe, open_time);
    `);

    await this.pool.query(`
      create index if not exists idx_market_candles_symbol_tf_time
      on market_candles(symbol, timeframe, open_time desc);
    `);

    await this.pool.query(`
      create index if not exists idx_market_candles_updated_at
      on market_candles(updated_at desc);
    `);

    await this.pool.query(`
      drop trigger if exists trg_market_candles_keep_limit_insert on market_candles;
    `);

    await this.pool.query(`
      drop trigger if exists trg_market_candles_keep_limit_update on market_candles;
    `);

    await this.pool.query(`
      drop function if exists public.enforce_market_candles_keep_limit();
    `);

    await this.pool.query(`
      create or replace function public.cleanup_market_candles_keep_limit(p_limit integer default 110)
      returns integer
      language plpgsql
      as $$
      declare
        deleted_count integer;
      begin
        delete from market_candles mc
        using (
          select ctid
          from (
            select
              ctid,
              row_number() over (
                partition by symbol, timeframe
                order by open_time desc
              ) as rn
            from market_candles
          ) ranked
          where ranked.rn > p_limit
        ) old_rows
        where mc.ctid = old_rows.ctid;

        get diagnostics deleted_count = row_count;
        return deleted_count;
      end;
      $$;
    `);

    await this.pool.query(`
      create table if not exists users (
        id text primary key,
        email text,
        status text not null default 'active',
        created_at timestamptz not null default now()
      );
    `);

    await this.pool.query(`
      create table if not exists user_strategy_settings (
        id bigserial primary key,
        user_id text not null,
        name text not null,
        settings jsonb not null,
        is_active boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);

    await this.pool.query(`
      create table if not exists trade_results (
        id bigserial primary key,
        user_id text,
        client_id text,
        task_id text,
        symbol text,
        action text,
        amount double precision,
        expiry integer,
        result text,
        profit double precision,
        metadata jsonb,
        created_at timestamptz not null default now()
      );
    `);

    await this.cleanupMarketStorage({ force: true });
  }

  normalizeTick(tick) {
    if (!tick) return null;

    const symbol = cleanSymbol(tick.symbol || tick.asset || tick.name);
    const wire_symbol = cleanSymbol(
      tick.wire_symbol ||
        tick.wireSymbol ||
        tick.rawSymbol ||
        tick.raw_symbol ||
        symbol
    );

    const price = toNum(tick.price ?? tick.value ?? tick.bid ?? tick.ask, NaN);

    if (!symbol || !Number.isFinite(price)) {
      return null;
    }

    return {
      symbol,
      wire_symbol,
      price,
      server_time: toNum(
        tick.server_time ??
          tick.serverTime ??
          tick.time ??
          tick.ts ??
          Date.now() / 1000,
        Date.now() / 1000
      ),
      source: cleanSymbol(tick.source || "PO_UPDATE_STREAM"),
    };
  }

  normalizeCandle(candle) {
    if (!candle) return null;

    const symbol = cleanSymbol(candle.symbol || candle.asset || candle.name);
    const timeframe = cleanSymbol(candle.timeframe || candle.tf || candle.period || "M1");

    const rawOpenTime =
      candle.open_time ??
      candle.openTime ??
      candle.start_time ??
      candle.startTime ??
      candle.time ??
      candle.ts ??
      candle.server_time;

    let open_time = Number(rawOpenTime);

    if (!Number.isFinite(open_time)) {
      const parsed = Date.parse(rawOpenTime);
      if (Number.isFinite(parsed)) {
        open_time = Math.floor(parsed / 1000);
      }
    }

    if (!symbol || !timeframe || !Number.isFinite(open_time)) {
      return null;
    }

    const open = toNum(candle.open, NaN);
    const high = toNum(candle.high, NaN);
    const low = toNum(candle.low, NaN);
    const close = toNum(candle.close, NaN);

    if (
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      return null;
    }

    const close_time = toNum(
      candle.close_time ??
        candle.closeTime ??
        candle.end_time ??
        candle.endTime ??
        open_time,
      open_time
    );

    const first_server_time = toNum(
      candle.first_server_time ??
        candle.firstServerTime ??
        candle.first_tick_time ??
        open_time,
      open_time
    );

    const last_server_time = toNum(
      candle.last_server_time ??
        candle.lastServerTime ??
        candle.last_tick_time ??
        candle.server_time ??
        close_time,
      close_time
    );

    return {
      symbol,
      timeframe,
      open_time,
      close_time,
      open,
      high,
      low,
      close,
      ticks: Math.max(0, toInt(candle.ticks ?? candle.tick_count ?? candle.volume, 0)),
      is_closed: Boolean(candle.is_closed ?? candle.isClosed ?? false),
      first_server_time,
      last_server_time,
    };
  }

  dedupeTicks(ticks) {
    const unique = new Map();

    for (const tick of ticks) {
      const row = this.normalizeTick(tick);
      if (!row) continue;

      const key = `${row.symbol}|${row.server_time}|${row.price}`;
      unique.set(key, row);
    }

    return Array.from(unique.values());
  }

  dedupeCandles(candles) {
    const unique = new Map();

    for (const candle of candles) {
      const row = this.normalizeCandle(candle);
      if (!row) continue;

      const key = `${row.symbol}|${row.timeframe}|${row.open_time}`;
      const prev = unique.get(key);

      if (!prev) {
        unique.set(key, row);
        continue;
      }

      unique.set(key, {
        ...prev,
        close_time: Math.max(prev.close_time, row.close_time),
        open: prev.open,
        high: Math.max(prev.high, row.high),
        low: Math.min(prev.low, row.low),
        close: row.close,
        ticks: Math.max(prev.ticks, row.ticks),
        is_closed: prev.is_closed || row.is_closed,
        first_server_time: Math.min(prev.first_server_time, row.first_server_time),
        last_server_time: Math.max(prev.last_server_time, row.last_server_time),
      });
    }

    const grouped = new Map();

    for (const row of unique.values()) {
      const groupKey = `${row.symbol}|${row.timeframe}`;

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
      }

      grouped.get(groupKey).push(row);
    }

    const clean = [];

    for (const rows of grouped.values()) {
      rows.sort((a, b) => b.open_time - a.open_time);
      clean.push(...rows.slice(0, CANDLE_KEEP_LIMIT));
    }

    return clean;
  }

  async saveTicks(ticks) {
    if (!this.pool || !Array.isArray(ticks) || !ticks.length) {
      return { ok: true, skipped: true };
    }

    const clean = this.dedupeTicks(ticks);

    if (!clean.length) {
      return { ok: true, skipped: true };
    }

    const chunkSize = 1000;
    let saved = 0;

    for (let i = 0; i < clean.length; i += chunkSize) {
      const chunk = clean.slice(i, i + chunkSize);
      const values = [];

      const placeholders = chunk
        .map((row, index) => {
          const base = index * 5;

          values.push(
            row.symbol,
            row.wire_symbol,
            row.price,
            row.server_time,
            row.source
          );

          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
        })
        .join(",");

      const result = await this.queryWithRetry(
        `
        insert into market_ticks
          (symbol, wire_symbol, price, server_time, source)
        values
          ${placeholders}
        on conflict do nothing
        `,
        values
      );

      saved += result.rowCount || 0;
    }

    await this.maybeCleanupMarketStorage();

    return {
      ok: true,
      received: ticks.length,
      prepared: clean.length,
      saved,
      skipped: ticks.length - saved,
    };
  }

  async saveCandles(candles) {
    if (!this.pool || !Array.isArray(candles) || !candles.length) {
      return { ok: true, skipped: true };
    }

    const clean = this.dedupeCandles(candles);

    if (!clean.length) {
      return { ok: true, skipped: true };
    }

    const cols = [
      "symbol",
      "timeframe",
      "open_time",
      "close_time",
      "open",
      "high",
      "low",
      "close",
      "ticks",
      "is_closed",
      "first_server_time",
      "last_server_time",
    ];

    const chunkSize = 500;
    let saved = 0;

    for (let i = 0; i < clean.length; i += chunkSize) {
      const chunk = clean.slice(i, i + chunkSize);
      const values = [];

      const placeholders = chunk
        .map((row, index) => {
          const base = index * cols.length;

          for (const col of cols) {
            values.push(row[col]);
          }

          return `(${cols.map((_, j) => `$${base + j + 1}`).join(",")})`;
        })
        .join(",");

      const result = await this.queryWithRetry(
        `
        insert into market_candles
          (${cols.join(",")})
        values
          ${placeholders}
        on conflict (symbol, timeframe, open_time)
        do update set
          close_time = greatest(market_candles.close_time, excluded.close_time),
          open = market_candles.open,
          high = greatest(market_candles.high, excluded.high),
          low = least(market_candles.low, excluded.low),
          close = excluded.close,
          ticks = greatest(market_candles.ticks, excluded.ticks),
          is_closed = market_candles.is_closed OR excluded.is_closed,
          first_server_time = least(market_candles.first_server_time, excluded.first_server_time),
          last_server_time = greatest(market_candles.last_server_time, excluded.last_server_time),
          updated_at = now()
        `,
        values
      );

      saved += result.rowCount || 0;
    }

    await this.maybeCleanupMarketStorage();

    return {
      ok: true,
      received: candles.length,
      prepared: clean.length,
      saved,
      deduped: candles.length - clean.length,
      candleKeepLimit: CANDLE_KEEP_LIMIT,
    };
  }

  async saveTradeResult(row) {
    if (!this.pool || !row) {
      return { ok: true, skipped: true };
    }

    await this.queryWithRetry(
      `
      insert into trade_results
        (
          user_id,
          client_id,
          task_id,
          symbol,
          action,
          amount,
          expiry,
          result,
          profit,
          metadata
        )
      values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        row.user_id || row.userId || null,
        row.client_id || row.clientId || null,
        row.task_id || row.taskId || null,
        row.symbol || null,
        row.action || row.direction || null,
        row.amount == null ? null : Number(row.amount),
        row.expiry == null ? null : Number(row.expiry),
        row.result || null,
        row.profit == null ? null : Number(row.profit),
        row.metadata ? JSON.stringify(row.metadata) : JSON.stringify(row),
      ]
    );

    return { ok: true };
  }

  async maybeCleanupMarketStorage() {
    const now = Date.now();

    if (this.cleanupRunning) {
      return {
        ok: true,
        skipped: true,
        reason: "cleanup-running",
      };
    }

    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) {
      return {
        ok: true,
        skipped: true,
        reason: "cleanup-throttled",
      };
    }

    this.lastCleanupAt = now;
    this.cleanupRunning = true;

    try {
      this.lastCleanupResult = await this.cleanupMarketStorage();
      return this.lastCleanupResult;
    } catch (err) {
      this.lastError = err.message || String(err);
      console.warn("[cloudStore] cleanup:", this.lastError);

      return {
        ok: false,
        error: this.lastError,
      };
    } finally {
      this.cleanupRunning = false;
    }
  }

  async cleanupMarketStorage() {
    if (!this.pool) {
      return { ok: true, skipped: true };
    }

    const lockResult = await this.pool.query(
      `select pg_try_advisory_lock(78345110) as locked`
    );

    const locked = Boolean(lockResult.rows?.[0]?.locked);

    if (!locked) {
      return {
        ok: true,
        skipped: true,
        reason: "cleanup-advisory-lock-busy",
      };
    }

    try {
      const candlesResult = await this.queryWithRetry(
        `select public.cleanup_market_candles_keep_limit($1) as deleted_candles`,
        [CANDLE_KEEP_LIMIT],
        { retries: 2, baseDelayMs: 150 }
      );

      const deletedCandles = Number(candlesResult.rows?.[0]?.deleted_candles || 0);

      const ticksResult = await this.queryWithRetry(
        `
        delete from market_ticks
        where received_at < now() - ($1::text || ' minutes')::interval
        `,
        [TICK_KEEP_MINUTES],
        { retries: 2, baseDelayMs: 150 }
      );

      return {
        ok: true,
        candleKeepLimit: CANDLE_KEEP_LIMIT,
        tickKeepMinutes: TICK_KEEP_MINUTES,
        deletedCandles,
        deletedTicks: ticksResult.rowCount || 0,
        cleanedAt: nowIso(),
      };
    } finally {
      await this.pool.query(`select pg_advisory_unlock(78345110)`);
    }
  }

  async getCounts() {
    if (!this.pool) {
      return {
        ticks: 0,
        candles: 0,
      };
    }

    const result = await this.queryWithRetry(`
      select 'market_ticks' as table_name, count(*)::bigint as rows_count
      from market_ticks
      union all
      select 'market_candles' as table_name, count(*)::bigint as rows_count
      from market_candles
    `);

    const out = {
      ticks: 0,
      candles: 0,
    };

    for (const row of result.rows) {
      if (row.table_name === "market_ticks") out.ticks = Number(row.rows_count || 0);
      if (row.table_name === "market_candles") out.candles = Number(row.rows_count || 0);
    }

    return out;
  }

  status() {
    return {
      ok: true,
      mode: this.enabled && this.pool ? "postgres" : "file-memory",
      desiredMode: this.mode,
      postgresConfigured: !!this.databaseUrl,
      postgresConnected: !!this.pool,
      pgMissing: !!this.pgMissing,
      lastError: this.lastError,
      startedAt: this.startedAt,
      retention: {
        candleKeepLimit: CANDLE_KEEP_LIMIT,
        tickKeepMinutes: TICK_KEEP_MINUTES,
        cleanupIntervalMs: CLEANUP_INTERVAL_MS,
      },
      cleanupRunning: this.cleanupRunning,
      lastCleanup: this.lastCleanupResult,
      note:
        this.enabled && this.pool
          ? "Market data is mirrored to PostgreSQL."
          : "Running with file/memory fallback. Set STORAGE_MODE=postgres and DATABASE_URL for serious shared storage.",
    };
  }
}

module.exports = new CloudStore();
