const storage = require("./storage");
const { makeId, nowIso, round } = require("./utils");

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

class TradeTracker {
  constructor(tickStore, candleBuilder, pgTrades = null) {
    this.tickStore = tickStore;
    this.candleBuilder = candleBuilder || null;
    this.pgTrades = pgTrades;
    this.trades = pgTrades ? [] : storage.readJson("trades.json", []);
  }

  // Called from boot() after PostgreSQL is ready.
  async init(pgTrades) {
    if (pgTrades) this.pgTrades = pgTrades;
    if (!this.pgTrades) return;
    try {
      await this.pgTrades.ensureTable();
      this.trades = await this.pgTrades.loadActive();
      console.log(`[tradeTracker] Loaded ${this.trades.length} active trades from PostgreSQL`);
    } catch (err) {
      console.error("[tradeTracker] init error:", err.message);
      this.trades = storage.readJson("trades.json", []);
    }
  }

  getLastKnownPrice(symbol) {
    const latestTick = this.tickStore.getLatest(symbol);
    if (latestTick && finiteOrNull(latestTick.price) !== null) {
      return {
        price: finiteOrNull(latestTick.price),
        source: "LATEST_TICK",
        time: latestTick.serverTime || null,
        raw: latestTick
      };
    }

    if (this.candleBuilder) {
      const priority = ["S5", "S10", "S15", "S30", "M1", "M2", "M3", "M5", "M10", "M15"];
      for (const tf of priority) {
        const candles = this.candleBuilder.getCandles(symbol, tf, 1, false);
        const candle = candles[candles.length - 1];
        if (candle && finiteOrNull(candle.close) !== null) {
          return {
            price: finiteOrNull(candle.close),
            source: `LAST_CANDLE_${tf}_CLOSE`,
            time: candle.lastServerTime || candle.closeTime || null,
            raw: candle
          };
        }
      }
    }

    return {
      price: null,
      source: "NO_PRICE",
      time: null,
      raw: null
    };
  }

  openFromTask(task) {
    const existing = this.trades.find(t => t.taskId === task.id);
    if (existing) return { ok: true, trade: existing, duplicate: true };

    const priceInfo = this.getLastKnownPrice(task.symbol);
    const signalPrice = finiteOrNull(task.signalPrice);

    const entryPrice = priceInfo.price !== null ? priceInfo.price : signalPrice;
    const entrySource = priceInfo.price !== null ? priceInfo.source : (signalPrice !== null ? "SIGNAL_PRICE" : "NO_ENTRY_PRICE");

    const openedAtMs = Date.now();

    const trade = {
      id: makeId("trade"),
      taskId: task.id,
      userId: task.userId,
      clientId: task.deliveredTo || task.clientId,

      accountMode: task.accountMode,
      isDemo: task.isDemo,

      symbol: task.symbol,
      action: task.action,
      amount: task.amount,
      expirySec: task.expirySec,
      optionType: task.optionType,
      requestId: task.requestId,

      source: task.source,
      signalId: task.signalId,
      signalPrice: task.signalPrice,
      reason: task.reason || "",
      meta: task.meta || {},
      payoutPercent: task.meta?.payout?.payoutPercent ?? task.meta?.payoutPercent ?? null,

      status: "OPEN",
      openedAt: nowIso(),
      openedAtMs,
      expiryAt: new Date(openedAtMs + task.expirySec * 1000).toISOString(),
      expiryAtMs: openedAtMs + task.expirySec * 1000,

      entryPrice,
      entryPriceSource: entrySource,
      entryPriceTime: priceInfo.time,
      entryPriceRaw: priceInfo.raw,

      exitPrice: null,
      exitPriceSource: null,
      exitPriceTime: null,
      exitPriceRaw: null,

      result: null,
      pnl: null,
      pnlSource: null,
      rawMove: null,
      directionMove: null,
      closedAt: null,
      closedAtMs: null,
      closeReason: null
    };

    this.trades.push(trade);
    if (this.pgTrades) {
      this.pgTrades.insert(trade).catch(err =>
        console.warn("[tradeTracker] SQL insert error:", err.message)
      );
    }
    return { ok: true, trade };
  }

  closeTrade(trade, exitPriceInput, reason = "TIMER", exitInfoInput = null) {
    if (!trade || trade.status !== "OPEN") return null;

    const exitInfo = exitInfoInput || this.getLastKnownPrice(trade.symbol);
    const entry = finiteOrNull(trade.entryPrice);
    // exitPriceInput === null means caller explicitly says "no valid price" (stale tick)
    // exitPriceInput === undefined means "use exitInfo.price as fallback"
    const exit = exitPriceInput === null
      ? null
      : finiteOrNull(exitPriceInput !== undefined ? exitPriceInput : exitInfo.price);

    let result = "DRAW";

    if (entry === null || exit === null) {
      result = "NO_PRICE";
      trade.rawMove = null;
      trade.directionMove = null;
    } else {
      const rawMove = exit - entry;
      const directionMove = trade.action === "call" ? rawMove : -rawMove;

      if (directionMove > 0) result = "WIN";
      else if (directionMove < 0) result = "LOSS";
      else result = "DRAW";

      trade.rawMove = round(rawMove);
      trade.directionMove = round(directionMove);
    }

    trade.status = "CLOSED";
    trade.exitPrice = exit;
    trade.exitPriceSource = exitInfo.source || "MANUAL_EXIT";
    trade.exitPriceTime = exitInfo.time || null;
    trade.exitPriceRaw = exitInfo.raw || null;

    trade.result = result;
    trade.resultSource = reason || "EXPIRY_TIMER";
    const amount = finiteOrNull(trade.amount) || 0;
    const payoutPercent = finiteOrNull(trade.payoutPercent);
    if (result === "WIN") {
      trade.pnl = round(amount * ((payoutPercent !== null ? payoutPercent : 82) / 100));
      trade.pnlSource = payoutPercent !== null ? "PAYOUT_PERCENT" : "DEFAULT_82_PERCENT";
    } else if (result === "LOSS") {
      trade.pnl = round(-amount);
      trade.pnlSource = "AMOUNT_LOSS";
    } else {
      trade.pnl = 0;
      trade.pnlSource = result;
    }
    trade.closeReason = reason;
    trade.closedAt = nowIso();
    trade.closedAtMs = Date.now();

    if (this.pgTrades) {
      this.pgTrades.updateStatus(trade.id, trade).catch(err =>
        console.warn("[tradeTracker] SQL closeTrade error:", err.message)
      );
    }

    return trade;
  }

  scanAndCloseExpired() {
    const closed = [];
    const now = Date.now();

    for (const trade of this.trades) {
      if (trade.status !== "OPEN") continue;
      if (trade.expiryAtMs > now) continue;

      const exitInfo = this.getLastKnownPrice(trade.symbol);

      // If exit tick serverTime <= entry tick serverTime, no new tick came during the trade.
      // Passing null forces NO_PRICE rather than a false DRAW.
      // applyExternalResult() will correct it when PocketOption sends the close event.
      const entryTickTime = Number(trade.entryPriceTime || 0);
      const exitTickTime = Number(exitInfo.time || 0);
      const hasNewTick = exitInfo.price !== null && exitTickTime > entryTickTime;
      const exitPrice = hasNewTick ? exitInfo.price : null;

      const closedTrade = this.closeTrade(trade, exitPrice, "EXPIRY_TIMER", exitInfo);
      if (closedTrade) closed.push(closedTrade);
    }

    return closed;
  }

  // Waits gracePeriodMs after expiry before closing, giving PO time to send the close event.
  // If PO sends the close event first, applyExternalResult() will handle it and the trade
  // will already be CLOSED here — the fallback scan simply skips it.
  scanAndCloseExpiredWithFallback(gracePeriodMs = 10000) {
    const closed = [];
    const now = Date.now();

    for (const trade of this.trades) {
      if (trade.status !== "OPEN") continue;
      // Wait gracePeriodMs after expiry before forcing a timer close
      if (trade.expiryAtMs + gracePeriodMs > now) continue;

      const exitInfo = this.getLastKnownPrice(trade.symbol);
      const entryTickTime = Number(trade.entryPriceTime || 0);
      const exitTickTime = Number(exitInfo.time || 0);
      const hasNewTick = exitInfo.price !== null && exitTickTime > entryTickTime;
      const exitPrice = hasNewTick ? exitInfo.price : null;

      const closedTrade = this.closeTrade(trade, exitPrice, "EXPIRY_TIMER_FALLBACK", exitInfo);
      if (closedTrade) closed.push(closedTrade);
    }

    return closed;
  }

  applyExternalResult(eventName, data) {
    if (!data || typeof data !== "object") return;

    const externalId  = String(data.id || data.deal_id || data.requestId || "");
    const profit      = finiteOrNull(data.profit ?? data.win ?? data.pnl);
    const extAmount   = finiteOrNull(data.amount ?? data.puddle ?? data.stake);
    // profit=0 → LOSS (broker paid nothing); profit=extAmount → DRAW (refund); profit>extAmount → WIN
    // Only DRAW if broker explicitly says so, or profit exactly equals stake (refund)
    let result = data.result ?? null;
    if (!result && profit !== null) {
      if (profit > 0 && extAmount !== null && Math.abs(profit - extAmount) < 0.001) result = "DRAW";
      else if (profit > 0) result = "WIN";
      else result = "LOSS";
    }
    const payoutPct   = finiteOrNull(data.profit_income ?? data.profit_percent ?? data.profitPercent);
    const closePrice  = finiteOrNull(data.close_price ?? data.closePrice ?? data.exit_price);
    const openPrice   = finiteOrNull(data.open_price  ?? data.openPrice  ?? data.entry_price);
    const dataSymbol  = String(data.asset || data.symbol || data.pair || "").toUpperCase().replace(/\//g, "");

    const sameSymbol  = (t) => dataSymbol
      ? (t.symbol || "").toUpperCase().replace(/_OTC/i, "") === dataSymbol.replace(/_OTC/i, "")
      : true;

    let trade = null;

    // 1. Closed trade by externalId
    if (externalId) {
      trade = this.trades.find(t => t.externalId === externalId && t.status === "CLOSED");
    }

    // 2. Closed trade: recent within 3 min, symbol must match when known.
    // Skip trades that already have a confirmed externalId result — they are finalized.
    if (!trade) {
      const cutoff = Date.now() - 3 * 60 * 1000;
      const candidates = this.trades
        .filter(t => t.status === "CLOSED" && (t.closedAtMs || 0) > cutoff && !t._resultFinal)
        .sort((a, b) => (b.closedAtMs || 0) - (a.closedAtMs || 0));
      // Never fall back to candidates[0] when symbol is known — prevents wrong-symbol matches
      trade = (dataSymbol ? candidates.find(sameSymbol) : candidates[0]) || null;
    }

    // 3. OPEN trade by externalId — PO result arrived before our expiry timer
    if (!trade && externalId) {
      trade = this.trades.find(t => t.externalId === externalId && t.status === "OPEN");
    }

    // 4. OPEN trade by symbol + opened within last 10 minutes (timer hasn't fired yet)
    if (!trade && dataSymbol) {
      const cutoff = Date.now() - 10 * 60 * 1000;
      trade = this.trades
        .filter(t => t.status === "OPEN" && (t.openedAtMs || 0) > cutoff && sameSymbol(t))
        .sort((a, b) => (a.expiryAtMs || 0) - (b.expiryAtMs || 0))[0] || null;
    }

    if (!trade) {
      console.warn(`[tradeTracker] applyExternalResult: no matching trade found for ${dataSymbol || "unknown"} (${eventName})`);
    }

    if (!trade || !result || !["WIN", "LOSS", "DRAW"].includes(result)) return;

    // If the trade is still OPEN, close it properly before updating the result
    if (trade.status === "OPEN") {
      trade.status      = "CLOSED";
      trade.closedAt    = nowIso();
      trade.closedAtMs  = Date.now();
      trade.closeReason = "PO_EXTERNAL_" + eventName.toUpperCase();
      if (closePrice !== null) {
        trade.exitPrice       = closePrice;
        trade.exitPriceSource = "PO_EXTERNAL";
      }
    }

    // Overwrite entry/exit prices with authoritative PO values
    if (openPrice !== null) {
      trade.entryPrice       = openPrice;
      trade.entryPriceSource = "PO_EXTERNAL";
    }
    if (closePrice !== null) {
      trade.exitPrice        = closePrice;
      trade.exitPriceSource  = "PO_EXTERNAL";
    }

    // Recalculate move with real PO prices
    const entry = finiteOrNull(trade.entryPrice);
    const exit  = finiteOrNull(trade.exitPrice);
    if (entry !== null && exit !== null) {
      const rawMove = exit - entry;
      trade.rawMove       = round(rawMove);
      trade.directionMove = round(trade.action === "call" ? rawMove : -rawMove);
    }

    // Overwrite result with authoritative PO value.
    // Mark as final when we matched by externalId — prevents a stray duplicate result from overwriting it.
    trade.result       = result;
    trade.resultSource = "PO_EXTERNAL_" + eventName.toUpperCase();
    if (externalId && (trade.externalId === externalId)) trade._resultFinal = true;
    const amount = finiteOrNull(trade.amount) || 0;
    if (result === "WIN") {
      const pct = payoutPct ?? finiteOrNull(trade.payoutPercent) ?? 82;
      trade.pnl       = round(amount * (pct / 100));
      trade.pnlSource = "PO_WIN_" + pct;
      if (payoutPct) trade.payoutPercent = payoutPct;
    } else if (result === "LOSS") {
      trade.pnl       = round(-amount);
      trade.pnlSource = "PO_LOSS";
    } else {
      trade.pnl       = 0;
      trade.pnlSource = "PO_DRAW";
    }

    if (this.pgTrades) {
      this.pgTrades.updateStatus(trade.id, trade).catch(err =>
        console.warn("[tradeTracker] SQL updateStatus error:", err.message)
      );
    } else {
      this.save();
    }
  }

  list({ limit = 100 } = {}) {
    return this.trades.slice(-Number(limit || 100)).reverse();
  }

  stats() {
    const closed = this.trades.filter(t => t.status === "CLOSED");
    const wins = closed.filter(t => t.result === "WIN").length;
    const losses = closed.filter(t => t.result === "LOSS").length;
    const draws = closed.filter(t => t.result === "DRAW").length;
    const noPrice = closed.filter(t => t.result === "NO_PRICE").length;
    const total = closed.length;
    const decisive = wins + losses;
    const winRate = decisive ? Number(((wins / decisive) * 100).toFixed(2)) : 0;
    const profit = round(closed.reduce((sum, t) => sum + (finiteOrNull(t.pnl) || 0), 0));

    return {
      total: this.trades.length,
      open: this.trades.filter(t => t.status === "OPEN").length,
      closed: total,
      wins,
      losses,
      draws,
      noPrice,
      winRate,
      profit,
      last: this.trades[this.trades.length - 1] || null
    };
  }

  statsByIndicator() {
    const map = {};
    const closed = this.trades.filter(t => t.status === "CLOSED");
    const add = (id, name, trade) => {
      if (!id) return;
      const key = String(id).toLowerCase();
      if (!map[key]) map[key] = { id: key, name: name || key, total: 0, wins: 0, losses: 0, draws: 0, noPrice: 0, profit: 0, winRate: 0, lastTradeAt: null };
      const st = map[key];
      st.total += 1;
      if (trade.result === "WIN") st.wins += 1;
      else if (trade.result === "LOSS") st.losses += 1;
      else if (trade.result === "DRAW") st.draws += 1;
      else if (trade.result === "NO_PRICE") st.noPrice += 1;
      st.profit = round(st.profit + (finiteOrNull(trade.pnl) || 0));
      st.lastTradeAt = trade.closedAt || trade.openedAt || st.lastTradeAt;
    };

    for (const trade of closed) {
      const indicators = trade.meta?.strategy?.indicators || [];
      if (Array.isArray(indicators) && indicators.length) {
        indicators.forEach(ind => add(ind.id, ind.name, trade));
      } else {
        // Try indicatorResults (all computed results saved by signalRunner)
        const allResults = trade.meta?.indicatorResults || trade.meta?.signal?.results || [];
        const decisive = allResults.filter(r => r.side === "BUY" || r.side === "SELL");
        if (decisive.length) {
          decisive.forEach(r => add(r.id, r.indicator || r.name || r.id, trade));
        } else if (allResults.length) {
          // Use any available result
          const r = allResults[0];
          add(r.id, r.indicator || r.name || r.id, trade);
        } else {
          // No indicator data at all — bucket by signal name
          const sigName = trade.meta?.signal?.indicator || trade.meta?.signal?.id || "moving-average";
          add(sigName, sigName, trade);
        }
      }
    }

    for (const st of Object.values(map)) {
      const decisive = st.wins + st.losses;
      st.winRate = decisive ? Number(((st.wins / decisive) * 100).toFixed(2)) : 0;
    }

    return map;
  }

  save() {
    if (this.pgTrades) return; // SQL writes happen per-operation
    storage.writeJson("trades.json", this.trades);
  }
}

module.exports = TradeTracker;
