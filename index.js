require("dotenv").config();
const http = require("http");

// Catch unhandled rejections so we can see what's crashing the server
process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled Promise Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception:", err.message, err.stack);
});

const CONFIG = require("./src/config");
const { parseJsonSafe, nowIso, normalizeSymbol } = require("./src/utils");
const TickStore = require("./src/tickStore");
const CandleBuilder = require("./src/candleBuilder");
const { analyzeSmaCross, analyzeIndicator, analyzeStrategy } = require("./src/signalEngine");
const TaskStore = require("./src/taskStore");
const TradeTracker = require("./src/tradeTracker");
const PayoutStore = require("./src/payoutStore");
const SignalRunner = require("./src/signalRunner");
const DepositStore = require("./src/depositStore");
const dashboardPage = require("./src/dashboardPage");
const { INDICATOR_CATEGORIES, INDICATORS } = require("./src/indicatorData");
const { allAssetSymbols, allSubscriptionSymbols } = require("./src/assetUniverse");
const licenseStore = require("./src/licenseStore");
const monoPoller = require("./src/monoPoller");

// Инициализация компонентов системы
const tickStore = new TickStore();
const candleBuilder = new CandleBuilder();
const taskStore = new TaskStore();
const payoutStore = new PayoutStore();
const depositStore = new DepositStore();
const tradeTracker = new TradeTracker(tickStore, candleBuilder);
const signalRunner = new SignalRunner({ tickStore, candleBuilder, taskStore, payoutStore, tradeTracker });

// АРХИТЕКТУРНОЕ ИСПРАВЛЕНИЕ: Восстановление состояния при перезапуске сервера
function initStoreStates() {
  console.log("[init] Загрузка сохраненного состояния с диска...");
  try {
    if (typeof candleBuilder.load === "function") candleBuilder.load();
    if (typeof taskStore.load === "function") taskStore.load();
    if (typeof tradeTracker.load === "function") tradeTracker.load();
    if (typeof payoutStore.load === "function") payoutStore.load();
    if (typeof signalRunner.load === "function") signalRunner.load();
    if (typeof depositStore.load === "function") depositStore.load();
    console.log("[init] Все хранилища успешно десериализованы.");
  } catch (err) {
    console.error("[init] Ошибка при загрузке базы данных:", err.message);
  }
}

function send(res, code, data) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Sanuch-Client-Id"
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res, code, html) {
  res.writeHead(code, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

function getParsedUrl(req) {
  return new URL(req.url, `http://${req.headers.host || "localhost"}`);
}

function getQuery(req) {
  return Object.fromEntries(getParsedUrl(req).searchParams.entries());
}

async function readBody(req) {
  return new Promise(resolve => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) req.destroy();
    });
    req.on("end", () => resolve(body));
  });
}

function normalizeIncomingTick(input, contextSymbol = null) {
  if (input === null || input === undefined) return null;

  if (Array.isArray(input)) {
    // Сырой тик Pocket Option: ["EURUSD_otc", 1780660261.868, 1.19469]
    if (input.length >= 3 && typeof input[0] === "string") {
      return {
        symbol: input[0],
        serverTime: input[1],
        price: input[2],
        source: "PO_RAW_ARRAY"
      };
    }

    // Строка истории с переданным контекстом: [1780660261.868, 1.19469]
    if (input.length >= 2 && contextSymbol) {
      return {
        symbol: contextSymbol,
        serverTime: input[0],
        price: input[1],
        source: "PO_HISTORY_ARRAY",
        fromHistory: true
      };
    }
  }

  if (typeof input === "object") {
    const symbol = input.symbol || input.asset || input.name || contextSymbol;
    const price = input.price ?? input.value ?? input.rate ?? input.close;
    const serverTime = input.serverTime ?? input.time ?? input.timestamp;
    if (symbol && price !== undefined && serverTime !== undefined) {
      return {
        ...input,
        symbol,
        price,
        serverTime,
        source: input.source || (input.fromHistory ? "PO_HISTORY_OBJECT" : "PO_OBJECT")
      };
    }
  }

  return null;
}

function expandIncomingTicks(value, contextSymbol = null, out = []) {
  if (value === null || value === undefined) return out;

  const direct = normalizeIncomingTick(value, contextSymbol);
  if (direct) {
    out.push(direct);
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) expandIncomingTicks(item, contextSymbol, out);
    return out;
  }

  if (typeof value === "object") {
    const nextSymbol = value.symbol || value.asset || value.name || contextSymbol;
    if (Array.isArray(value.history)) {
      for (const item of value.history) expandIncomingTicks(item, nextSymbol, out);
    }

    for (const [key, item] of Object.entries(value)) {
      if (["history", "symbol", "asset", "name", "price", "value", "rate", "close", "serverTime", "time", "timestamp"].includes(key)) continue;
      expandIncomingTicks(item, nextSymbol, out);
    }
  }

  return out;
}

function dedupeIncomingTicks(ticks) {
  const map = new Map();
  for (const tick of ticks || []) {
    const symbol = normalizeSymbol(tick.symbol || tick.asset || tick.name);
    const price = Number(tick.price ?? tick.value ?? tick.rate ?? tick.close);
    const serverTime = Number(tick.serverTime ?? tick.time ?? tick.timestamp);
    if (!symbol || !Number.isFinite(price) || !Number.isFinite(serverTime)) continue;
    map.set(`${symbol}|${serverTime}|${price}`, { ...tick, symbol, price, serverTime });
  }
  return [...map.values()];
}

async function handle(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Sanuch-Client-Id"
    });
    return res.end();
  }

  const pathname = getParsedUrl(req).pathname;

  try {
    if (req.method === "GET" && (pathname === "/" || pathname === "/dashboard")) {
      return sendHtml(res, 200, dashboardPage());
    }

    if (req.method === "GET" && pathname === "/privacy") {
      return sendHtml(res, 200, `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Privacy Policy — Sanuch Trading</title><style>body{font-family:sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#222;line-height:1.6}h1{color:#1a1a2e}h2{color:#333}</style></head><body><h1>Privacy Policy — Sanuch Trading</h1><p>Last updated: June 2026</p><h2>Data Collection</h2><p>Sanuch Trading Chrome Extension does <strong>not</strong> collect, store, or transmit any personally identifiable information about users.</p><h2>Data Storage</h2><p>The extension stores user settings (indicator configurations, strategy preferences) locally in the browser using Chrome's built-in <code>chrome.storage.local</code> API. This data never leaves your device.</p><h2>Server Communication</h2><p>The extension communicates with our server (sanuch-server-production.up.railway.app) solely for license verification and trading signal synchronization. No personal data is sent — only an anonymous device identifier and license key.</p><h2>Third Parties</h2><p>We do not sell, trade, or transfer your data to any third parties.</p><h2>Contact</h2><p>If you have questions, contact: vasyadom8228@gmail.com</p></body></html>`);
    }

    if (req.method === "GET" && pathname === "/health") {
      return send(res, 200, {
        ok: true,
        name: CONFIG.appName,
        version: CONFIG.version,
        status: "running",
        time: nowIso(),
        port: CONFIG.port
      });
    }

    if (req.method === "GET" && pathname === "/state") {
      return send(res, 200, {
        ok: true,
        version: CONFIG.version,
        time: nowIso(),
        ticks: tickStore.state(),
        tasks: taskStore.state(),
        trades: { ...tradeTracker.stats(), byIndicator: tradeTracker.statsByIndicator() },
        payouts: payoutStore.state(),
        auto: signalRunner.status(),
        deposits: depositStore.state(tradeTracker.trades, payoutStore)
      });
    }

    if (req.method === "POST" && pathname === "/tick") {
      const body = parseJsonSafe(await readBody(req));
      if (!body) return send(res, 400, { ok: false, error: "BAD_JSON" });

      const inputs = dedupeIncomingTicks(expandIncomingTicks(body));
      const first = inputs[0] || body;
      const result = tickStore.addTick(first);
      if (!result.ok) return send(res, 400, result);

      candleBuilder.addTick(result.tick);
      
      // АРХИТЕКТУРНОЕ ИСПРАВЛЕНИЕ: Убран агрессивный scanAndCloseExpired() из потока тиков,
      // чтобы избежать закрытия по неточным локальным ценам до прихода вебсокет-пакета.
      return send(res, 200, {
        ok: true,
        tick: result.tick
      });
    }

    if (req.method === "POST" && pathname === "/ticks") {
      const body = parseJsonSafe(await readBody(req));
      if (!body) return send(res, 400, { ok: false, error: "BAD_JSON" });

      const rawInputs = Array.isArray(body)
        ? body
        : (Array.isArray(body.ticks) ? body.ticks : [body]);

      const inputs = dedupeIncomingTicks(expandIncomingTicks(rawInputs));

      let accepted = 0;
      let rejected = 0;
      const rejectedSamples = [];

      // Оптимизация пакетной обработки для прогрева (warm-up)
      for (const input of inputs) {
        const result = tickStore.addTick(input);
        if (result.ok) {
          accepted += 1;
          candleBuilder.addTick(result.tick);
        } else {
          rejected += 1;
          if (rejectedSamples.length < 5) rejectedSamples.push(result.details || result.error);
        }
      }

      return send(res, 200, {
        ok: true,
        total: inputs.length,
        accepted,
        rejected,
        rejectedSamples
      });
    }

    if (req.method === "GET" && pathname === "/prices") {
      const q = getQuery(req);
      if (q.symbol) return send(res, 200, { ok: true, latest: tickStore.getLatest(q.symbol) });
      return send(res, 200, { ok: true, symbols: tickStore.getSymbols(), latest: tickStore.state().latest });
    }

    if (req.method === "GET" && pathname === "/debug/market") {
      const q = getQuery(req);
      const symbols = tickStore.getSymbols();
      const candleState = candleBuilder.state();
      const targets = allAssetSymbols();
      const wanted = q.symbols
        ? String(q.symbols).split(",").map(normalizeSymbol).filter(Boolean)
        : ["EURUSD_otc", "AUDCAD_otc", "NFLX_otc", "#AAPL_otc", "BTCUSD"].map(normalizeSymbol);

      const sample = {};
      for (const symbol of wanted) {
        sample[symbol] = {
          latest: tickStore.getLatest(symbol),
          S15: candleBuilder.getCandles(symbol, "S15", 3, false),
          M1: candleBuilder.getCandles(symbol, "M1", 3, false)
        };
      }

      return send(res, 200, {
        ok: true,
        version: CONFIG.version,
        priceSymbolsTotal: symbols.length,
        priceSymbols: symbols,
        candleKeysTotal: candleState.keys.length,
        candleKeysSample: candleState.keys.slice(0, 80),
        targetSymbolsTotal: targets.length,
        missingTargetSamples: targets.filter(s => !symbols.includes(normalizeSymbol(s))).slice(0, 80),
        sample
      });
    }

    if (req.method === "GET" && pathname === "/timeframes") {
      return send(res, 200, {
        ok: true,
        timeframes: Object.keys(CONFIG.candles.timeframes),
        seconds: CONFIG.candles.timeframes,
        note: "Таймфреймы анализа ограничены S5-M15. Экспирация сделки отдельная и свободная."
      });
    }

    if (req.method === "GET" && pathname === "/subscriptions/targets") {
      const staticSymbols = allAssetSymbols();
      const staticSubscriptionSymbols = allSubscriptionSymbols();
      const payoutSymbols = payoutStore.list({ limit: 5000 }).map(a => a.symbol).filter(Boolean);
      const cfg = signalRunner.config || {};
      const configWatchlist = Array.isArray(cfg.watchlist) ? cfg.watchlist : [];
      const indicatorSymbols = Array.isArray(cfg.indicators)
        ? cfg.indicators.flatMap(ind => Array.isArray(ind.assets) ? ind.assets : [])
        : [];

      const symbols = [...new Set([
        ...staticSymbols,
        ...payoutSymbols,
        ...configWatchlist,
        ...indicatorSymbols
      ].filter(Boolean))];

      const subscriptionSymbols = [...new Set([
        ...staticSubscriptionSymbols,
        ...symbols
      ].filter(Boolean))];

      return send(res, 200, {
        ok: true,
        mode: "ALL_ASSETS_ALWAYS",
        symbols,
        total: symbols.length,
        subscriptionSymbols,
        subscriptionTotal: subscriptionSymbols.length,
        note: "symbols = имена сервера; subscriptionSymbols = варианты для subfor Pocket Option",
        timeframes: Object.keys(CONFIG.candles.timeframes),
        candlesPerSymbolTimeframe: CONFIG.storage.maxCandlesPerKey,
        expiry: {
          free: true,
          minSec: CONFIG.trading.minExpirySec,
          maxSec: CONFIG.trading.maxExpirySec
        }
      });
    }

    if (req.method === "GET" && pathname === "/bridge/status") {
      const targetSymbols = allAssetSymbols().map(normalizeSymbol).filter(Boolean);
      const priceSymbols = tickStore.getSymbols();
      const candleState = candleBuilder.state();
      const withLatest = targetSymbols.filter(s => !!tickStore.getLatest(s));

      return send(res, 200, {
        ok: true,
        mode: "MARKET_BRIDGE_V2_1_4_CONTINUOUS",
        version: CONFIG.version,
        targets: {
          total: targetSymbols.length,
          withLatest: withLatest.length,
          symbols: targetSymbols
        },
        prices: {
          total: priceSymbols.length,
          symbols: priceSymbols
        },
        candles: {
          keys: candleState.keys.length,
          countByKey: candleState.countByKey
        },
        timeframes: Object.keys(CONFIG.candles.timeframes),
        candlesPerSymbolTimeframe: CONFIG.storage.maxCandlesPerKey,
        note: "Сервер хранит 100 свечей на каждый актив/таймфрейм, если Pocket Option реально отдаёт поток по этому активу. N/A-активы не блокируют мост."
      });
    }

    if (req.method === "GET" && pathname === "/bridge/assets") {
      const targetSymbols = allAssetSymbols().map(normalizeSymbol).filter(Boolean);
      const q = getQuery(req);
      const limit = Math.max(1, Math.min(Number(q.limit || 300), 1000));

      const assets = targetSymbols.slice(0, limit).map(symbol => {
        const latest = tickStore.getLatest(symbol);
        const candles = {};
        for (const tf of Object.keys(CONFIG.candles.timeframes)) {
          candles[tf] = candleBuilder.getCandles(symbol, tf, 100, false).length;
        }
        return {
          symbol,
          status: latest ? "ACTIVE" : "NO_STREAM_YET",
          latest,
          candles
        };
      });

      return send(res, 200, {
        ok: true,
        total: targetSymbols.length,
        returned: assets.length,
        assets
      });
    }

    if (req.method === "POST" && pathname === "/bridge/targets") {
      const body = parseJsonSafe(await readBody(req)) || {};
      const symbols = Array.isArray(body.symbols) ? body.symbols.map(normalizeSymbol).filter(Boolean) : [];
      return send(res, 200, {
        ok: true,
        accepted: symbols.length,
        symbols,
        note: "Цели приняты. Источник правды для подписки остаётся /subscriptions/targets."
      });
    }

    if (req.method === "GET" && pathname === "/debug/candles") {
      const q = getQuery(req);
      const limit = Math.max(1, Math.min(Number(q.limit || 50), 200));
      const candleState = candleBuilder.state();
      const tickState = tickStore.state();
      
      const allSymbols = tickState.symbols || [];
      const candleKeys = candleState.keys || [];
      const symbolsWithCandles = new Set();
      const symbolsWithoutCandles = [];
      
      for (const key of candleKeys) {
        const match = key.match(/^([^|]+)\|/);
        if (match) symbolsWithCandles.add(match[1]);
      }
      
      for (const sym of allSymbols) {
        if (!symbolsWithCandles.has(sym)) symbolsWithoutCandles.push(sym);
      }

      return send(res, 200, {
        ok: true,
        summary: {
          totalSymbols: allSymbols.length,
          symbolsWithCandles: symbolsWithCandles.size,
          symbolsWithoutCandles: symbolsWithoutCandles.length,
          totalCandleKeys: candleKeys.length,
          totalCandlesStored: Object.values(candleState.countByKey || {}).reduce((a, b) => a + b, 0)
        },
        symbolsWithoutCandles: symbolsWithoutCandles.slice(0, limit),
        candleKeySample: candleKeys.slice(0, limit),
        candleCountSample: Object.fromEntries(Object.entries(candleState.countByKey || {}).slice(0, limit)),
        note: "Диагностика: показывает какие символы получают тики, но не строят свечи"
      });
    }

    if (req.method === "GET" && pathname === "/candles") {
      const q = getQuery(req);
      const symbol = q.symbol || "EURUSD_otc";
      const timeframe = q.timeframe || "S15";
      const limit = Number(q.limit || 100);
      const closedOnly = String(q.closedOnly || "false") === "true";

      return send(res, 200, {
        ok: true,
        symbol: normalizeSymbol(symbol),
        timeframe: String(timeframe).toUpperCase(),
        limit,
        closedOnly,
        candles: candleBuilder.getCandles(symbol, timeframe, limit, closedOnly)
      });
    }

    if (req.method === "GET" && pathname === "/indicators") {
      return send(res, 200, {
        ok: true,
        categories: INDICATOR_CATEGORIES,
        indicators: INDICATORS
      });
    }

    if (req.method === "GET" && pathname === "/signals") {
      const q = getQuery(req);
      const symbol = q.symbol || "EURUSD_otc";
      const timeframe = q.timeframe || CONFIG.signal.defaultTimeframe;
      const indicatorId = q.indicator || q.id || "moving-average";
      const candles = candleBuilder.getCandles(symbol, timeframe, Number(q.limit || 260), true);
      return send(res, 200, analyzeIndicator(candles, {
        id: indicatorId,
        name: indicatorId,
        timeframe,
        expirySec: Number(q.expirySec || CONFIG.autoSignal.expirySec),
        settings: q
      }, { symbol, timeframe }));
    }

    if (req.method === "POST" && pathname === "/signals/test") {
      const body = parseJsonSafe(await readBody(req));
      if (!body) return send(res, 400, { ok: false, error: "BAD_JSON" });
      const symbol = body.symbol || "EURUSD_otc";
      const config = { ...signalRunner.config, ...body };
      return send(res, 200, analyzeStrategy({
        symbol,
        config,
        getCandles: (timeframe, limit = 260) => candleBuilder.getCandles(symbol, timeframe || config.timeframe, limit, true)
      }));
    }

    if (req.method === "GET" && pathname === "/indicators/stats") {
      return send(res, 200, { ok: true, stats: tradeTracker.statsByIndicator() });
    }

    if (req.method === "POST" && pathname === "/payouts/reset") {
      payoutStore.assets = {};
      payoutStore.save();
      return send(res, 200, { ok: true, message: "Payouts сброшены" });
    }

    if (req.method === "POST" && pathname === "/payouts/update") {
      const body = parseJsonSafe(await readBody(req));
      if (!body) return send(res, 400, { ok: false, error: "BAD_JSON" });

      const result = payoutStore.updateMany({
        ...body,
        clientId: body.clientId || req.headers["x-sanuch-client-id"] || "unknown-client"
      });

      payoutStore.save();
      return send(res, 200, result);
    }

    if (req.method === "GET" && pathname === "/payouts") {
      const q = getQuery(req);
      return send(res, 200, {
        ok: true,
        stats: payoutStore.state(),
        assets: payoutStore.list({
          minPayoutPercent: q.min ? Number(q.min) : null,
          activeOnly: String(q.activeOnly || "false") === "true",
          limit: Number(q.limit || 500)
        })
      });
    }

    if (req.method === "GET" && pathname === "/auto/status") {
      return send(res, 200, signalRunner.status());
    }

    if (req.method === "POST" && pathname === "/auto/reset-confirm") {
      signalRunner.pendingConfirm = {};
      return send(res, 200, { ok: true, message: "pendingConfirm сброшен" });
    }

    if (req.method === "POST" && pathname === "/auto/config") {
      const body = parseJsonSafe(await readBody(req));
      if (!body) return send(res, 400, { ok: false, error: "BAD_JSON" });
      
      const result = signalRunner.updateConfig(body);
      // АРХИТЕКТУРНОЕ ИСПРАВЛЕНИЕ: Мгновенный сброс новой конфигурации на диск
      if (typeof signalRunner.save === "function") signalRunner.save();
      
      return send(res, 200, result);
    }

    if (req.method === "POST" && pathname === "/auto/start") {
      const bodyText = await readBody(req);
      const body = bodyText ? parseJsonSafe(bodyText) : {};
      return send(res, 200, signalRunner.start(body || {}));
    }

    if (req.method === "POST" && pathname === "/auto/stop") {
      return send(res, 200, signalRunner.stop());
    }

    if (req.method === "POST" && pathname === "/auto/scan") {
      return send(res, 200, signalRunner.scan({ force: true }));
    }

    if (req.method === "GET" && pathname === "/deposits/plans") {
      return send(res, 200, {
        ok: true,
        plans: depositStore.listPlans(),
        modes: depositStore.listModes(),
        legacyPrograms: depositStore.listLegacyPrograms()
      });
    }

    if (req.method === "GET" && pathname === "/deposits/active") {
      return send(res, 200, depositStore.calculate(tradeTracker.trades, payoutStore));
    }

    if (req.method === "POST" && pathname === "/deposits/select") {
      const body = parseJsonSafe(await readBody(req));
      if (!body) return send(res, 400, { ok: false, error: "BAD_JSON" });

      const result = depositStore.select(body);
      return send(res, 200, {
        ...result,
        calculated: depositStore.calculate(tradeTracker.trades, payoutStore)
      });
    }

    if (req.method === "POST" && pathname === "/deposits/reset") {
      const bodyText = await readBody(req);
      const body = bodyText ? parseJsonSafe(bodyText) : {};
      const result = depositStore.reset(body || {});
      return send(res, 200, {
        ...result,
        calculated: depositStore.calculate(tradeTracker.trades, payoutStore)
      });
    }

    if (req.method === "POST" && pathname === "/tasks/create") {
      const body = parseJsonSafe(await readBody(req));
      if (!body) return send(res, 400, { ok: false, error: "BAD_JSON" });

      const result = taskStore.createOpenTradeTask(body);
      return send(res, result.ok ? 200 : 400, result);
    }

    if (req.method === "GET" && pathname === "/tasks/poll") {
      const q = getQuery(req);
      const clientId = q.clientId || req.headers["x-sanuch-client-id"] || "default-client";
      return send(res, 200, {
        ok: true,
        clientId,
        tasks: taskStore.poll(clientId, Number(q.limit || CONFIG.tasks.pollLimit))
      });
    }

    if (req.method === "POST" && pathname === "/tasks/ack") {
      const body = parseJsonSafe(await readBody(req));
      if (!body) return send(res, 400, { ok: false, error: "BAD_JSON" });

      const result = taskStore.ack(body);
      if (!result.ok) return send(res, 400, result);

      let openedTrade = null;
      const shouldRecord = ["SUCCESS_OPEN_ORDER", "OPENED", "FAILED_NO_CONFIRMATION"].includes(result.task.status);
      if (shouldRecord) {
        openedTrade = tradeTracker.openFromTask(result.task).trade || null;
        if (openedTrade && body.externalId) {
          openedTrade.externalId = String(body.externalId);
        }
      }

      return send(res, 200, { ...result, openedTrade });
    }

    // АРХИТЕКТУРНОЕ ИСПРАВЛЕНИЕ: Точная фиксация результатов сделки из вебсокета брокера
    if (req.method === "POST" && pathname === "/trades/result") {
      const body = parseJsonSafe(await readBody(req));
      if (body && body.data) {
        console.log(`[tradeTracker] Получен точный исход сделки от Pocket Option:`, body.data);
        // Вызываем метод, который перезапишет статус сделки на основе реального ответа брокера
        tradeTracker.applyExternalResult(body.event || "unknown", body.data);
        // Принудительно сохраняем результат
        if (typeof tradeTracker.save === "function") tradeTracker.save();
      }
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && pathname === "/tasks") {
      const q = getQuery(req);
      return send(res, 200, {
        ok: true,
        stats: taskStore.state(),
        tasks: taskStore.list({ limit: Number(q.limit || 100) })
      });
    }

    if (req.method === "GET" && pathname === "/trades") {
      const q = getQuery(req);
      return send(res, 200, {
        ok: true,
        stats: tradeTracker.stats(),
        indicatorStats: tradeTracker.statsByIndicator(),
        trades: tradeTracker.list({ limit: Number(q.limit || 100) })
      });
    }

    if (req.method === "GET" && (pathname === "/auto/trades" || pathname === "/auto/history")) {
      const q = getQuery(req);
      const st = tradeTracker.stats();
      return send(res, 200, {
        ok: true,
        stats: st,
        indicatorStats: tradeTracker.statsByIndicator(),
        trades: tradeTracker.list({ limit: Number(q.limit || 200) })
      });
    }

    // ── ЛИЦЕНЗИИ ──────────────────────────────────────────────────────────────

    // POST /license/check  { platform_id }  → статус + код для оплаты
    if (req.method === "POST" && pathname === "/license/check") {
      const body = parseJsonSafe(await readBody(req)) || {};
      const pid = String(body.platform_id || "").trim();
      if (!pid) return send(res, 400, { ok: false, error: "platform_id required" });
      const user = licenseStore.getOrCreate(pid);
      return send(res, 200, { ok: true, ...licenseStore.getStatus(pid) });
    }

    // POST /license/trade  { platform_id, count? }  → регистрирует сделки, возвращает ok/expired
    if (req.method === "POST" && pathname === "/license/trade") {
      const body = parseJsonSafe(await readBody(req)) || {};
      const pid = String(body.platform_id || "").trim();
      if (!pid) return send(res, 400, { ok: false, error: "platform_id required" });
      licenseStore.getOrCreate(pid);
      const result = licenseStore.countTrade(pid, body.count);
      return send(res, 200, result);
    }

    // ── ADMIN ──────────────────────────────────────────────────────────────────

    function isAdmin(req) {
      const token = req.headers["x-admin-token"];
      return token && token === process.env.ADMIN_TOKEN;
    }

    // GET /admin/users
    if (req.method === "GET" && pathname === "/admin/users") {
      if (!isAdmin(req)) return send(res, 403, { ok: false, error: "Forbidden" });
      return send(res, 200, { ok: true, users: licenseStore.listAll() });
    }

    // POST /admin/activate  { platform_id }
    if (req.method === "POST" && pathname === "/admin/activate") {
      if (!isAdmin(req)) return send(res, 403, { ok: false, error: "Forbidden" });
      const body = parseJsonSafe(await readBody(req)) || {};
      const pid = String(body.platform_id || "").trim();
      if (!pid) return send(res, 400, { ok: false, error: "platform_id required" });
      licenseStore.getOrCreate(pid);
      licenseStore.activate(pid, "manual", 0);
      return send(res, 200, { ok: true, status: licenseStore.getStatus(pid) });
    }

    // POST /admin/block  { platform_id }
    if (req.method === "POST" && pathname === "/admin/block") {
      if (!isAdmin(req)) return send(res, 403, { ok: false, error: "Forbidden" });
      const body = parseJsonSafe(await readBody(req)) || {};
      const pid = String(body.platform_id || "").trim();
      licenseStore.setStatus(pid, "blocked");
      return send(res, 200, { ok: true });
    }

    // POST /admin/reset-trial  { platform_id }
    if (req.method === "POST" && pathname === "/admin/reset-trial") {
      if (!isAdmin(req)) return send(res, 403, { ok: false, error: "Forbidden" });
      const body = parseJsonSafe(await readBody(req)) || {};
      const pid = String(body.platform_id || "").trim();
      licenseStore.resetTrial(pid);
      return send(res, 200, { ok: true });
    }

    // POST /license/login  { key, device_id }  → войти по лицензионному ключу
    if (req.method === "POST" && pathname === "/license/login") {
      const body = parseJsonSafe(await readBody(req)) || {};
      const result = licenseStore.loginByKey(body.key, body.device_id);
      if (!result.ok) {
        const msgs = {
          key_not_found: "Ключ не найден. Проверьте правильность ввода.",
          not_active:    "Этот ключ ещё не активирован.",
          key_bound:     "Ключ уже привязан к другому устройству. Обратитесь в поддержку."
        };
        return send(res, 200, { ok: false, error: result.error, message: msgs[result.error] || "Ошибка" });
      }
      return send(res, 200, result);
    }

    // POST /admin/rebind  { key }  → сброс привязки ключа к устройству
    if (req.method === "POST" && pathname === "/admin/rebind") {
      if (!isAdmin(req)) return send(res, 403, { ok: false, error: "Forbidden" });
      const body = parseJsonSafe(await readBody(req)) || {};
      const ok = licenseStore.rebindKey(body.key);
      return send(res, 200, { ok });
    }

    // ──────────────────────────────────────────────────────────────────────────

    return send(res, 404, { ok: false, error: "NOT_FOUND" });
  } catch (err) {
    console.error("[server error]", err);
    return send(res, 500, { ok: false, error: "SERVER_ERROR", message: err.message });
  }
}

// Интервал резервного автосохранения данных
setInterval(() => {
  try {
    candleBuilder.save();
    taskStore.save();
    tradeTracker.save();
    payoutStore.save();
    signalRunner.save();
    depositStore.save();
  } catch (err) {
    console.warn("[autosave]", err.message);
  }
}, CONFIG.storage.autoSaveMs);

// АРХИТЕКТУРНОЕ ИСПРАВЛЕНИЕ: Локальный сканнер переведен в режим FALLBACK.
// Он больше не закрывает сделки секунда-в-секунду. Он ждет, например, 10 секунд после экспирации.
// Если расширение за 10 секунд не передало пакет через /trades/result, включается аварийное закрытие.
setInterval(() => {
  try {
    if (typeof tradeTracker.scanAndCloseExpiredWithFallback === "function") {
      tradeTracker.scanAndCloseExpiredWithFallback(10000); // 10 сек задержки
    } else {
      tradeTracker.scanAndCloseExpired(); // Базовый метод, если логику фоллбека еще не вынесли в класс
    }
  } catch (err) {
    console.warn("[trade scan]", err.message);
  }
}, 1000); // Снижена частота до 1 секунды, чтобы не грузить поток

// Интервал работы сигнального движка
setInterval(() => {
  try {
    signalRunner.scan();
  } catch (err) {
    console.warn("[signal runner]", err.message);
  }
}, CONFIG.autoSignal?.scanMs || 1000);

const { execSync } = require("child_process");

function killPortWin(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`).toString();
    const pids = new Set();
    out.split("\n").forEach(line => {
      const m = line.match(/(\d+)\s*$/);
      if (m && m[1] !== "0") pids.add(m[1]);
    });
    pids.forEach(pid => {
      try { 
        execSync(`taskkill /PID ${pid} /F`); 
        console.log(`[server] killed PID ${pid} on port ${port}`); 
      } catch (_) {}
    });
  } catch (_) {}
}

const server = http.createServer(handle);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`[server] Порт ${CONFIG.port} занят — принудительно завершаем старый процесс и перезапускаем через 1 сек...`);
    killPortWin(CONFIG.port);
    setTimeout(() => server.listen(CONFIG.port), 1000);
  } else {
    console.error("[server] Критическая ошибка:", err.message);
    process.exit(1);
  }
});

// Запуск: если PostgreSQL — сначала грузим все данные из БД, потом стартуем
async function boot() {
  const USE_PG = String(process.env.STORAGE_MODE || "file").toLowerCase() === "postgres"
    && !!process.env.DATABASE_URL;
  if (USE_PG) {
    console.log("[boot] PostgreSQL mode — loading data from Supabase...");
    await require("./src/pgStorage").loadAll();
  }
  initStoreStates();
  server.listen(CONFIG.port, () => {
    console.log(`\n${CONFIG.appName} v${CONFIG.version}`);
    console.log(`Server: http://localhost:${CONFIG.port}`);
    console.log(`Health: http://localhost:${CONFIG.port}/health\n`);
    monoPoller.start();
  });
}

boot().catch((err) => {
  console.error("[boot] Fatal error:", err.message);
  process.exit(1);
});