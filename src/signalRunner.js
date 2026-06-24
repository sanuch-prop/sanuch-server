const CONFIG = require("./config");
const storage = require("./storage");
const { analyzeStrategy } = require("./signalEngine");
const { normalizeSymbol, nowIso } = require("./utils");
const { allAssetSymbols } = require("./assetUniverse");

const REASON_RU = {
  AUTO_DISABLED:          "Авто-режим выключен.",
  NO_SIGNAL:              "Сигнала нет: индикатор ждёт условия.",
  LOW_SCORE:              "Слабый сигнал: оценка ниже минимальной.",
  COOLDOWN:               "Пауза: повторный вход запрещён (cooldown).",
  LOW_PAYOUT:             "Payout ниже минимального порога.",
  DUPLICATE_TASK:         "Дублирующаяся задача уже в очереди.",
  TASK_CREATE_FAILED:     "Ошибка создания задачи.",
  SIGNAL_LOST:            "Сигнал снят, ожидание сброшено.",
  DIRECTION_CHANGED:      "Направление изменилось, сброс.",
  WAIT_STEP1_SAME_CANDLE: "Шаг 1/3: та же свеча, ждём новую.",
  CONFIRMED_STEP2:        "Шаг 2/3: подтверждение получено, ждём свечу для входа.",
  WAIT_STEP2_SAME_CANDLE: "Шаг 2/3: та же свеча, ждём новую.",
  STEP1_SIGNAL:           "Шаг 1/3: сигнал найден, ждём подтверждение.",
  STEP3_OPEN:             "Шаг 3/3: открытие сделки!",
  TRADE_ALREADY_OPEN:     "Блок: по этой паре уже есть открытая сделка.",
  TASK_PENDING:           "Блок: задача по этой паре ещё ожидает исполнения.",
  MAX_OPEN_TRADES:        "Блок: достигнут лимит одновременно открытых сделок.",
  OUTSIDE_WORK_HOURS:     "Вне часов работы индикатора.",
  MG_MAX_STEPS:           "Мартингейл: все шаги перекрытия исчерпаны."
};

class SignalRunner {
  constructor({ tickStore, candleBuilder, taskStore, payoutStore, tradeTracker }) {
    this.tickStore = tickStore;
    this.candleBuilder = candleBuilder;
    this.taskStore = taskStore;
    this.payoutStore = payoutStore;
    this.tradeTracker = tradeTracker || null;

    this.config = {
      ...CONFIG.autoSignal,
      ...storage.readJson("auto-config.json", {}),
      enabled: false  // never auto-resume after server restart — user must press Start
    };

    this.lastScanAt = null;
    this.lastCreatedAtByKey = {};
    this.lastSignals = {};
    this.lastSkips = {};      // last skip reason per symbol: { symbol → { reason, message, at } }
    this.createdTotal = 0;
    this.duplicateTotal = 0;
    this.skippedTotal = 0;
    this.lastEvent = null;

    // 3-candle confirmation state: { confirmKey → { step, action, candleOpenTime, signal, seenAt } }
    this.pendingConfirm = {};

    // Event log (max 120 entries, shown in UI)
    this.eventLog = [];
  }

  // Считает шаг мартингейла и ставку для данного символа.
  // Формула авто-расчёта: (сумма убытков + базовая ставка) / (payout / 100).
  // Работает для любого payout от 60% до 92%.
  // WIN сбрасывает цепочку. DRAW/NO_PRICE нейтральны.
  // Check if current time (adjusted by timezoneOffsetHours) falls within "HH:MM-HH:MM" window.
  _isWithinWorkTime(workTime, timezoneOffsetHours = 0) {
    if (!workTime || workTime === "00:00-23:59") return true;
    const m = String(workTime).match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    if (!m) return true;
    const now = new Date();
    const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const offsetMin = Math.round(Number(timezoneOffsetHours || 0) * 60);
    const localMin = ((utcMin + offsetMin) % 1440 + 1440) % 1440;
    const startMin = Number(m[1]) * 60 + Number(m[2]);
    const endMin   = Number(m[3]) * 60 + Number(m[4]);
    if (startMin <= endMin) return localMin >= startMin && localMin <= endMin;
    return localMin >= startMin || localMin <= endMin; // crosses midnight
  }

  // Return total recoveries across all enabled mg steps (for maxSteps limit).
  _getMgMaxRecoveries(iSett) {
    const stepCount = Math.max(1, Math.min(5, Number(iSett.mgStepCount || 1)));
    let total = 0;
    for (let i = 1; i <= stepCount; i++) {
      const p = `mg${i}_`;
      if (iSett[p + 'enabled'] === 'off') continue;
      total += Math.max(1, Number(iSett[p + 'recoveries'] !== undefined ? iSett[p + 'recoveries'] : 2));
    }
    return total || 1;
  }

  // Return config for the active mg step given the current consecutive loss count.
  // Returns null if all steps are exhausted (stop martingale).
  _getMgStepForLoss(iSett, lossCount) {
    if (lossCount <= 0) return null;
    const stepCount = Math.max(1, Math.min(5, Number(iSett.mgStepCount || 1)));
    let cumulative = 0;
    for (let i = 1; i <= stepCount; i++) {
      const p = `mg${i}_`;
      if (iSett[p + 'enabled'] === 'off') continue;
      const recoveries = Math.max(1, Number(iSett[p + 'recoveries'] !== undefined ? iSett[p + 'recoveries'] : 2));
      cumulative += recoveries;
      if (lossCount <= cumulative) {
        return {
          stepNum: i,
          expiry:             Number(iSett[p + 'expiry']              || 0) || null,
          direction:          iSett[p + 'direction']                  || 'same',
          autoCoef:           iSett[p + 'autoCoef']                   !== 'off',
          minPayout:          Number(iSett[p + 'minPayout']           || 0),
          lowPayoutAction:    iSett[p + 'lowPayoutAction']            || 'skip',
          unavailableAction:  iSett[p + 'unavailableAction']          || 'skip'
        };
      }
    }
    return null; // all steps exhausted
  }

  getMartingaleInfo(symbol, currentPayoutPercent, overrides = {}) {
    const cfg = this.config;
    const baseAmount = overrides.baseAmount !== undefined ? Number(overrides.baseAmount) : (Number(cfg.amount) || 1);
    const isEnabled = Object.prototype.hasOwnProperty.call(overrides, 'enabled') ? overrides.enabled : !!cfg.martingaleEnabled;
    if (!isEnabled) return { amount: baseAmount, step: 0 };

    const maxSteps = Math.max(1, Number(overrides.maxSteps || cfg.martingaleSteps) || 3);

    const trades = this.tradeTracker?.trades || [];
    const closed = trades
      .filter(t => t.symbol === symbol && t.status === "CLOSED")
      .sort((a, b) => (b.closedAtMs || 0) - (a.closedAtMs || 0));

    let steps = 0;
    let totalLosses = 0;
    for (const t of closed) {
      if (t.result === "LOSS") {
        steps++;
        totalLosses += Number(t.amount || baseAmount);
        if (steps >= maxSteps) break;
      } else if (t.result === "WIN") {
        break;
      }
      // DRAW / NO_PRICE — нейтрально
    }

    if (steps === 0) return { amount: baseAmount, step: 0 };

    const payout = Number(currentPayoutPercent || 0);
    let amount;
    if (payout >= 50) {
      // Авто-расчёт: (все убытки + базовая прибыль-цель) / payout
      amount = Math.round(((totalLosses + baseAmount) / (payout / 100)) * 100) / 100;
    } else {
      // Фолбек: фиксированный множитель (когда payout неизвестен)
      const multiplier = Math.max(1.01, Number(cfg.martingaleMultiplier) || 2);
      amount = Math.round(baseAmount * Math.pow(multiplier, steps) * 100) / 100;
    }

    return { amount, step: steps };
  }

  getMartingaleAmount(symbol, currentPayoutPercent) {
    return this.getMartingaleInfo(symbol, currentPayoutPercent).amount;
  }

  _logEvent(level, symbol, message, extra = {}) {
    const entry = {
      time: nowIso(),
      level,   // "info" | "confirm" | "trade" | "skip" | "error"
      symbol: symbol || null,
      message,
      ...extra
    };
    this.eventLog.unshift(entry);
    if (this.eventLog.length > 120) this.eventLog.length = 120;
    this.lastEvent = { time: entry.time, message: symbol ? `${symbol}: ${message}` : message };
    return entry;
  }

  updateConfig(patch = {}) {
    const allowed = [
      "enabled", "userId", "clientId", "accountMode", "watchlist",
      "subscribeAllAssets", "timeframe", "fast", "slow", "amount",
      "expirySec", "minScore", "minAgree", "aggregation", "indicators",
      "cooldownMs", "source", "usePayoutFilter", "minPayoutPercent",
      "useConfirmRule", "maxOpenTrades",
      "martingaleEnabled", "martingaleMultiplier", "martingaleSteps", "martingaleReset",
      "timezoneOffsetHours"
    ];

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        this.config[key] = patch[key];
      }
    }

    // When global timeframe changes, propagate to all indicator configs
    if ("timeframe" in patch && !("indicators" in patch) && Array.isArray(this.config.indicators)) {
      this.config.indicators = this.config.indicators.map(ind => ({ ...ind, timeframe: this.config.timeframe }));
    }

    if (typeof this.config.watchlist === "string") {
      this.config.watchlist = this.config.watchlist
        .split(",")
        .map(s => normalizeSymbol(s))
        .filter(Boolean);
    }

    if (Array.isArray(this.config.watchlist)) {
      this.config.watchlist = this.config.watchlist.map(s => normalizeSymbol(s)).filter(Boolean);
    }

    this.save();
    return this.status();
  }

  start(patch = {}) {
    this.updateConfig({ ...patch, enabled: true });
    this._logEvent("info", null, "Авто-режим запущен.");
    return this.status();
  }

  stop() {
    this.config.enabled = false;
    this.pendingConfirm = {};
    this._logEvent("info", null, "Авто-режим остановлен. Ожидания сброшены.");
    this.save();
    return this.status();
  }

  // Full session reset: stops auto, disables ALL indicators, clears pending state.
  // Called on account switch (Demo↔Real) so the next session starts clean.
  clearSession() {
    this.config.enabled = false;
    if (Array.isArray(this.config.indicators)) {
      this.config.indicators = this.config.indicators.map(i => ({ ...i, enabled: false }));
    }
    this.pendingConfirm = {};
    this.lastCreatedAtByKey = {};
    this._logEvent("info", null, "Сессия сброшена: все индикаторы отключены.");
    this.save();
    return this.status();
  }

  // Called on every fresh page load with detected account mode.
  // If mode changed from previous stored mode → clearSession automatically.
  setAccountMode(mode) {
    const prev = this.config.accountMode;
    this.config.accountMode = mode;
    if (prev && prev !== mode) {
      this.clearSession();
      console.log(`[setAccountMode] ${prev}→${mode}: session cleared`);
      return { changed: true, cleared: true, mode };
    }
    this.save();
    return { changed: false, cleared: false, mode };
  }

  getSymbols() {
    let syms;
    const list = Array.isArray(this.config.watchlist) ? this.config.watchlist.filter(Boolean) : [];

    if (list.length) {
      syms = [...new Set(list.map(s => normalizeSymbol(s)).filter(Boolean))];
    } else if (this.config.subscribeAllAssets !== false) {
      const payoutSymbols = this.payoutStore?.list({ limit: 5000 }).map(a => a.symbol).filter(Boolean) || [];
      const tickSymbols = this.tickStore.getSymbols();
      syms = [...new Set([...allAssetSymbols(), ...payoutSymbols, ...tickSymbols].map(s => normalizeSymbol(s)).filter(Boolean))];
    } else {
      syms = this.tickStore.getSymbols();
    }

    // Prefer OTC in all cases: if both EURUSD and EURUSD_otc exist, keep only EURUSD_otc
    const otcSet = new Set(syms.filter(s => s.endsWith("_otc")));
    return syms.filter(s => s.endsWith("_otc") || !otcSet.has(s + "_otc"));
  }

  scan({ force = false } = {}) {
    this.lastScanAt = nowIso();

    if (!this.config.enabled && !force) {
      return { ok: true, enabled: false, created: [], skipped: [{ reason: "AUTO_DISABLED" }] };
    }

    // Удалить устаревшие ожидания (старше 10 минут)
    const staleCutoff = Date.now() - 10 * 60 * 1000;
    for (const key of Object.keys(this.pendingConfirm)) {
      if ((this.pendingConfirm[key].seenAt || 0) < staleCutoff) {
        this._logEvent("skip", key.split("|")[0], `Ожидание устарело (>10 мин), сброс.`);
        delete this.pendingConfirm[key];
      }
    }

    const useConfirm = this.config.useConfirmRule !== false; // по умолчанию включено
    const created = [];
    const skipped = [];
    const skip = (symbol, reason, message, extra = {}) => {
      const entry = { symbol, reason, message, ...extra };
      skipped.push(entry);
      this.skippedTotal += 1;
      if (symbol) this.lastSkips[symbol] = { reason, message: message || reason, at: Date.now() };
    };
    const symbols = this.getSymbols();

    for (const symbol of symbols) {
      const signal = analyzeStrategy({
        symbol,
        config: this.config,
        getCandles: (timeframe, limit = 260) => this.candleBuilder.getCandles(symbol, timeframe || this.config.timeframe, limit, true)
      });

      this.lastSignals[symbol] = signal;

      // --- Нет сигнала ---
      if (!signal.ready || !signal.action || signal.side === "WAIT") {
        // Если было ожидание — сбросить
        const pendingKeysForSymbol = Object.keys(this.pendingConfirm).filter(k => k.startsWith(symbol + "|"));
        for (const k of pendingKeysForSymbol) {
          this._logEvent("skip", symbol, REASON_RU.SIGNAL_LOST + ` (был шаг ${this.pendingConfirm[k].step}/3)`);
          delete this.pendingConfirm[k];
        }
        const notReadyReason = !signal.ready
          ? (signal.reasons ? signal.reasons[0] : "Мало данных для расчёта.")
          : "Сигнала нет: индикатор ждёт условия.";
        skip(symbol, "NO_SIGNAL", notReadyReason, { signal });
        continue;
      }

      // --- Низкий score ---
      if (Number(signal.score) < Number(this.config.minScore || 1)) {
        skip(symbol, "LOW_SCORE", REASON_RU.LOW_SCORE + ` Оценка ${signal.score} < мин. ${this.config.minScore}.`, { signal });
        continue;
      }

      // --- Блок: одна сделка на символ ---
      // Запрещаем открывать второй контракт пока первый не закрылся.
      // Сбрасываем pendingConfirm чтобы 3-свечное подтверждение начиналось заново после закрытия.
      {
        const hasOpenTrade = this.tradeTracker
          ? this.tradeTracker.trades.some(t => t.symbol === symbol && t.status === "OPEN")
          : false;
        const hasPendingTask = this.taskStore
          ? this.taskStore.tasks.some(t => t.symbol === symbol && ["CREATED", "DELIVERED"].includes(t.status))
          : false;

        if (hasOpenTrade || hasPendingTask) {
          // Сбрасываем состояние подтверждения — начнём заново когда пара освободится
          for (const k of Object.keys(this.pendingConfirm).filter(k => k.startsWith(symbol + "|"))) {
            delete this.pendingConfirm[k];
          }
          const reason = hasOpenTrade ? "TRADE_ALREADY_OPEN" : "TASK_PENDING";
          const msg = hasOpenTrade
            ? `${REASON_RU.TRADE_ALREADY_OPEN} (${symbol})`
            : `${REASON_RU.TASK_PENDING} (${symbol})`;
          skip(symbol, reason, msg);
          continue;
        }
      }

      // Build indicator config map once per symbol — used for maxOpenTrades check AND iSett below
      const indConfigMap = new Map(
        (this.config.indicators || []).map(c => [String(c.id || "").toLowerCase(), c])
      );

      // --- Блок: лимит одновременно открытых сделок ---
      {
        const openTrades = this.tradeTracker
          ? this.tradeTracker.trades.filter(t => t.status === "OPEN")
          : [];

        // CRITICAL: re-read pending tasks inside the loop so tasks created for earlier
        // symbols in this same scan are visible — prevents N×limit flooding.
        const pendingTasks = this.taskStore
          ? this.taskStore.tasks.filter(t => ["CREATED", "DELIVERED"].includes(t.status))
          : [];

        const contributing = (
          signal.chosenResults?.length ? signal.chosenResults : signal.results || []
        ).filter(i => i.side === signal.side);

        let blockedBy = null;
        for (const ind of contributing) {
          const indConf = indConfigMap.get(String(ind.id || "").toLowerCase()) || {};
          const indMax = Number(indConf.settings?.maxOpenTrades || ind.settings?.maxOpenTrades || 0);
          if (indMax > 0) {
            const indId = ind.id;
            const indOpen = openTrades.filter(t =>
              Array.isArray(t.meta?.strategy?.indicators) &&
              t.meta.strategy.indicators.some(i => i.id === indId)
            ).length;
            const indPending = pendingTasks.filter(t =>
              Array.isArray(t.meta?.strategy?.indicators) &&
              t.meta.strategy.indicators.some(i => i.id === indId)
            ).length;
            if (indOpen + indPending >= indMax) {
              blockedBy = `${ind.indicator || ind.id}: ${indOpen}+${indPending}/${indMax}`;
              break;
            }
          }
        }

        // Global strategy limit
        if (!blockedBy) {
          const globalMax = Number(this.config.maxOpenTrades || 0);
          const totalInFlight = openTrades.length + pendingTasks.length;
          if (globalMax > 0 && totalInFlight >= globalMax) {
            blockedBy = `${openTrades.length}+${pendingTasks.length}/${globalMax} (глоб.)`;
          }
        }

        if (blockedBy) {
          skip(symbol, "MAX_OPEN_TRADES", `${REASON_RU.MAX_OPEN_TRADES} ${blockedBy}`);
          continue;
        }
      }

      // --- Правило 3 свечей (включено по умолчанию) ---
      if (useConfirm) {
        const timeframe = signal.timeframe || this.config.timeframe;
        const candleOpenTime = Number(signal.lastCandle?.openTime || 0);
        const confirmKey = `${symbol}|${timeframe}|${signal.action}`;
        const pending = this.pendingConfirm[confirmKey];

        // Нет ожидания — шаг 1: сигнал найден
        if (!pending) {
          this.pendingConfirm[confirmKey] = { step: 1, action: signal.action, candleOpenTime, signal, seenAt: Date.now() };
          const indName = signal.chosenResults?.[0]?.indicator || signal.results?.[0]?.indicator || "Индикатор";
          const why = signal.reasons ? signal.reasons[0] : "";
          this._logEvent("info", symbol, `${REASON_RU.STEP1_SIGNAL} ${signal.side} · ${indName}. ${why}`);
          skip(symbol, "ОЖИДАНИЕ_ПОДТВЕРЖДЕНИЯ", REASON_RU.STEP1_SIGNAL, { step: 1, signal });
          continue;
        }

        // Направление изменилось — сброс и шаг 1
        if (pending.action !== signal.action) {
          delete this.pendingConfirm[confirmKey];
          this.pendingConfirm[confirmKey] = { step: 1, action: signal.action, candleOpenTime, signal, seenAt: Date.now() };
          this._logEvent("skip", symbol, REASON_RU.DIRECTION_CHANGED + ` → ${signal.side}`);
          skip(symbol, "НАПРАВЛЕНИЕ_ИЗМЕНИЛОСЬ", REASON_RU.DIRECTION_CHANGED, { signal });
          continue;
        }

        // Шаг 1: ждём новой свечи → шаг 2
        if (pending.step === 1) {
          const candleAdvanced = candleOpenTime > 0 && candleOpenTime > pending.candleOpenTime;
          // Fallback: если candleOpenTime=0 (нет данных) — считаем шаг пройденным через 2 минуты
          const timeoutAdvance = candleOpenTime === 0 && (Date.now() - pending.seenAt) > 2 * 60 * 1000;
          if (!candleAdvanced && !timeoutAdvance) {
            skip(symbol, "ОЖИДАНИЕ_СВЕЧИ_1", REASON_RU.WAIT_STEP1_SAME_CANDLE, { signal });
            continue;
          }
          pending.step = 2;
          pending.candleOpenTime = candleOpenTime;
          pending.signal = signal;
          pending.seenAt = Date.now();
          this._logEvent("confirm", symbol, REASON_RU.CONFIRMED_STEP2 + ` ${signal.side}`);
          skip(symbol, "ПОДТВЕРЖДЕНИЕ_ПОЛУЧЕНО", REASON_RU.CONFIRMED_STEP2, { step: 2, signal });
          continue;
        }

        // Шаг 2: ждём новой свечи → шаг 3 (вход)
        if (pending.step === 2) {
          const candleAdvanced = candleOpenTime > 0 && candleOpenTime > pending.candleOpenTime;
          const timeoutAdvance = candleOpenTime === 0 && (Date.now() - pending.seenAt) > 2 * 60 * 1000;
          if (!candleAdvanced && !timeoutAdvance) {
            skip(symbol, "ОЖИДАНИЕ_СВЕЧИ_2", REASON_RU.WAIT_STEP2_SAME_CANDLE, { signal });
            continue;
          }
          // Шаг 3 — открытие сделки
          delete this.pendingConfirm[confirmKey];
          this._logEvent("trade", symbol, REASON_RU.STEP3_OPEN + ` ${signal.action}`);
          this._logEvent("info", symbol, "[DBG-A] after step3 log — about to exit useConfirm block");
          // Продолжаем ниже — создаём задачу
        }
        this._logEvent("info", symbol, "[DBG-B] end of useConfirm block — step=" + (this.pendingConfirm[`${symbol}|${signal.timeframe||this.config.timeframe}|${signal.action}`]?.step ?? "deleted"));
      }
      // --- Конец правила 3 свечей ---
      this._logEvent("info", symbol, "[DBG-C] past useConfirm — reaching cooldown check");

      const lastCandle = signal.lastCandle;
      const signalKey = [
        "AUTO",
        this.config.accountMode,
        symbol,
        signal.timeframe || this.config.timeframe,
        signal.expirySec || this.config.expirySec,
        signal.action,
        signal.signalHash || lastCandle?.openTime || "no-candle"
      ].join("|");

      const lastCreatedAt = this.lastCreatedAtByKey[signalKey] || 0;
      if (Date.now() - lastCreatedAt < Number(this.config.cooldownMs || 15000)) {
        skip(symbol, "COOLDOWN", REASON_RU.COOLDOWN, { signalKey });
        continue;
      }

      const rawPayout = this.payoutStore?.get(symbol) || null;
      // Discard payout data older than 2 hours — stale values cause wrong pnl in history
      const payoutAgeMs = rawPayout ? (Date.now() - (rawPayout.updatedAtMs || 0)) : Infinity;
      const payout = payoutAgeMs < 2 * 60 * 60 * 1000 ? rawPayout : null;

      // Payout filter: per-indicator minPayoutPercent always applies (independent of global usePayoutFilter)
      // Global usePayoutFilter only controls the global minPayoutPercent threshold
      const indPayouts = (this.config.indicators || [])
        .map(ind => Number(ind?.settings?.minPayoutPercent || 0))
        .filter(v => v > 0);
      const indMinPayout = indPayouts.length ? Math.min(...indPayouts) : 0;
      const globalMinPayout = this.config.usePayoutFilter ? Number(this.config.minPayoutPercent || 75) : 0;
      const effectiveMinPayout = Math.max(indMinPayout, globalMinPayout);

      if (effectiveMinPayout > 0) {
        if (!payout) {
          skip(symbol, "NO_PAYOUT_DATA", `Нет данных о доходности для ${symbol} (мин. ${effectiveMinPayout}%)`, { signal });
          continue;
        }
        if (Number(payout.payoutPercent) < effectiveMinPayout) {
          skip(symbol, "LOW_PAYOUT", REASON_RU.LOW_PAYOUT + ` ${payout.payoutPercent}% < ${effectiveMinPayout}%`, { payout, signal });
          continue;
        }
      }

      const latest = this.tickStore.getLatest(symbol);
      const signalPrice = latest?.price ?? lastCandle?.close ?? null;

      // Warn if tick is stale but do not block — signalPrice falls back to last candle close
      const tickAgeSec = latest ? (Date.now() / 1000 - Number(latest.serverTime || 0)) : Infinity;
      if (tickAgeSec > 300) {
        this._logEvent("info", symbol, `Котировки устарели (${tickAgeSec === Infinity ? "нет данных" : tickAgeSec.toFixed(0) + "с"}), используем цену свечи.`);
      }

      // Per-indicator settings (from indicator's Регламент + Мартингейл tabs)
      // Signal results do NOT carry full settings — must read from stored config map (see line ~368)
      const chosenInd = signal.chosenResults?.[0] || signal.results?.[0] || null;
      const indConf = chosenInd ? (indConfigMap.get(String(chosenInd.id || "").toLowerCase()) || {}) : {};
      const iSett = indConf.settings || chosenInd?.settings || {};

      // Регламент: trading hours check
      const iWorkTime = iSett.workTime;
      if (iWorkTime && iWorkTime !== "00:00-23:59") {
        const tzOffset = Number(this.config.timezoneOffsetHours || 0);
        if (!this._isWithinWorkTime(iWorkTime, tzOffset)) {
          skip(symbol, "OUTSIDE_WORK_HOURS", REASON_RU.OUTSIDE_WORK_HOURS + ` (${iWorkTime}, UTC${tzOffset >= 0 ? "+" : ""}${tzOffset})`);
          continue;
        }
      }

      // Регламент: per-indicator trade amount (overrides global)
      const baseAmount = Number(iSett.amount || this.config.amount) || 1;

      // Регламент: per-indicator max simultaneous open trades
      const indMaxOpen = Number(iSett.maxOpenTrades || 0);
      if (indMaxOpen > 0 && this.tradeTracker && chosenInd?.id) {
        const indId = chosenInd.id;
        const openCount = this.tradeTracker.trades.filter(t =>
          t.status === "OPEN" &&
          t.meta?.strategy?.indicators?.some(i => i.id === indId)
        ).length;
        if (openCount >= indMaxOpen) {
          skip(symbol, "MAX_OPEN_TRADES", REASON_RU.MAX_OPEN_TRADES + ` (${openCount}/${indMaxOpen})`);
          continue;
        }
      }

      // Мартингейл: per-indicator multi-step martingale (mg1_ … mg5_ keys)
      const hasIndMg = iSett['mg1_enabled'] !== undefined || iSett['mg1_recoveries'] !== undefined || iSett.mgStepCount !== undefined;
      const indMgEnabled = hasIndMg ? (iSett['mg1_enabled'] !== 'off') : null;
      const mgEnabled  = indMgEnabled !== null ? indMgEnabled : !!this.config.martingaleEnabled;
      const payoutPct  = payout?.payoutPercent || null;

      let mgInfo = { amount: baseAmount, step: 0 };
      let activeMgStep = null;

      if (mgEnabled) {
        const maxRecoveries = hasIndMg
          ? this._getMgMaxRecoveries(iSett)
          : (Number(this.config.martingaleSteps) || 3);
        mgInfo = this.getMartingaleInfo(symbol, payoutPct, { enabled: true, maxSteps: maxRecoveries, baseAmount });

        if (mgInfo.step > 0 && hasIndMg) {
          activeMgStep = this._getMgStepForLoss(iSett, mgInfo.step);
          if (!activeMgStep) {
            skip(symbol, "MG_MAX_STEPS", REASON_RU.MG_MAX_STEPS);
            continue;
          }
          // Per-step payout threshold check
          if (activeMgStep.minPayout > 0 && payout && Number(payout.payoutPercent) < activeMgStep.minPayout) {
            if (activeMgStep.lowPayoutAction === 'stop') {
              this.config.enabled = false;
              this.save();
              this._logEvent("info", symbol, `Мартингейл шаг ${activeMgStep.stepNum}: выплата ${payout.payoutPercent}% < ${activeMgStep.minPayout}% — стратегия остановлена.`);
              break;
            }
            // 'skip' or 'new_asset' → skip this symbol
            skip(symbol, "LOW_PAYOUT", `Мартингейл шаг ${activeMgStep.stepNum}: выплата ${payout.payoutPercent}% < мин. ${activeMgStep.minPayout}%`);
            continue;
          }
        }
      }

      const tradeAmount = Number(signal.amount || mgInfo.amount);
      const mgStep = mgInfo.step;

      // Per-step expiry for recovery trades; else normal signal expiry
      const stepExpiry = activeMgStep?.expiry || null;
      const tradeExpirySec = mgStep > 0 && stepExpiry
        ? stepExpiry
        : Number(signal.expirySec || this.config.expirySec);

      // Per-step direction (reverse signal on deep losses if configured)
      const tradeAction = mgStep > 0 && activeMgStep?.direction === 'reverse'
        ? (signal.action === 'call' ? 'put' : 'call')
        : signal.action;

      if (mgEnabled && mgStep > 0) {
        this._logEvent("info", symbol, `Мартингейл шаг ${mgStep}${activeMgStep ? ` (уровень ${activeMgStep.stepNum})` : ""}: ставка $${tradeAmount} (база $${baseAmount}${payoutPct ? `, выплата ${payoutPct}%` : ""})`);
      }

      this._logEvent("info", symbol, `[DBG] pre-create: acct=${this.config.accountMode} action=${tradeAction} amt=${tradeAmount} exp=${tradeExpirySec} taskStore=${!!this.taskStore}`);
      const taskResult = this.taskStore.createOpenTradeTask({
        userId: this.config.userId,
        clientId: this.config.clientId,
        accountMode: this.config.accountMode,
        symbol,
        action: tradeAction,
        amount: tradeAmount,
        expirySec: tradeExpirySec,
        source: this.config.source,
        signalId: `${signalKey}`,
        signalPrice,
        reason: signal.reasons ? signal.reasons.join(" | ") : "",
        idemKey: signalKey,
        meta: {
          auto: true,
          martingale: mgEnabled ? { step: mgStep, baseAmount, tradeAmount } : null,
          strategy: {
            name: this.config.strategyName || "Моя стратегия",
            indicators: ((signal.chosenResults && signal.chosenResults.length ? signal.chosenResults : signal.results || []))
              .filter(i => i.side === signal.side)
              .map(i => ({ id: i.id, name: i.indicator || i.name || i.id, timeframe: i.timeframe, expirySec: i.expirySec, settings: i.settings || {} })),
            minAgree: signal.minAgree,
            activeCount: signal.activeCount,
            buyCount: signal.buyCount,
            sellCount: signal.sellCount
          },
          indicatorResults: signal.results || [],
          signal,
          payout
        }
      });

      if (taskResult.ok) {
        this.lastCreatedAtByKey[signalKey] = Date.now();
        this.createdTotal += 1;
        created.push(taskResult.task);
        this._logEvent("trade", symbol, `Задача создана: ${tradeAction} ${symbol} $${tradeAmount} ${tradeExpirySec}с`, { taskId: taskResult.task.id });
      } else if (taskResult.error === "DUPLICATE_TASK") {
        this.duplicateTotal += 1;
        skipped.push({ symbol, reason: "DUPLICATE_TASK", message: REASON_RU.DUPLICATE_TASK });
      } else {
        const errMsg = (taskResult.errors || []).join("; ") || REASON_RU.TASK_CREATE_FAILED;
        this._logEvent("error", symbol, `Ошибка создания задачи: ${errMsg}`);
        skipped.push({ symbol, reason: "TASK_CREATE_FAILED", message: errMsg, result: taskResult });
      }
    }

    return { ok: true, enabled: this.config.enabled, scanned: symbols.length, created, skipped };
  }

  status() {
    // Собираем текущие мартингейл-ставки по символам из вотчлиста
    const martingaleAmounts = {};
    if (this.config.martingaleEnabled) {
      const symbols = this.getSymbols().slice(0, 50);
      for (const s of symbols) {
        const pct = this.payoutStore?.get(s)?.payoutPercent || null;
        const amt = this.getMartingaleAmount(s, pct);
        if (amt !== Number(this.config.amount)) martingaleAmounts[s] = amt;
      }
    }

    return {
      ok: true,
      config: this.config,
      lastScanAt: this.lastScanAt,
      createdTotal: this.createdTotal,
      duplicateTotal: this.duplicateTotal,
      skippedTotal: this.skippedTotal,
      lastEvent: this.lastEvent,
      lastSignals: this.lastSignals,
      lastSkips: this.lastSkips,
      pendingConfirm: this.pendingConfirm,
      eventLog: this.eventLog.slice(0, 40),
      martingaleAmounts
    };
  }

  save() {
    storage.writeJson("auto-config.json", this.config);
  }
}

module.exports = SignalRunner;
