const CONFIG = require("./config");
const storage = require("./storage");
const { normalizeSymbol, round } = require("./utils");
const { canonicalSymbolFor } = require("./assetUniverse");

function normalizeMarketSymbol(value) {
  return canonicalSymbolFor(value) || normalizeSymbol(value);
}

function tfSeconds(timeframe) {
  return CONFIG.candles.timeframes[String(timeframe || "S15").toUpperCase()] || null;
}

function n(value, fallback = null) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function mergeCandleInto(map, keySymbol, keyTimeframe, candleLike) {
  const sec = tfSeconds(keyTimeframe);
  const rawOpenTime = n(candleLike.openTime);
  if (!sec || rawOpenTime === null) return;

  const openTime = Math.floor(rawOpenTime / sec) * sec;
  const closeTime = openTime + sec;
  const open = n(candleLike.open);
  const high = n(candleLike.high);
  const low = n(candleLike.low);
  const close = n(candleLike.close);
  if ([open, high, low, close].some(v => v === null)) return;

  const firstServerTime = n(candleLike.firstServerTime, openTime);
  const lastServerTime = n(candleLike.lastServerTime, firstServerTime);
  const ticks = Math.max(1, Math.floor(n(candleLike.ticks, 1)));
  const updatedAt = candleLike.updatedAt || new Date().toISOString();

  const existing = map.get(openTime);
  if (!existing) {
    map.set(openTime, {
      symbol: keySymbol,
      timeframe: keyTimeframe,
      openTime,
      closeTime,
      open: round(open),
      high: round(Math.max(open, high, low, close)),
      low: round(Math.min(open, high, low, close)),
      close: round(close),
      ticks,
      isClosed: false,
      firstServerTime,
      lastServerTime,
      updatedAt
    });
    return;
  }

  existing.high = round(Math.max(existing.high, high, open, close));
  existing.low = round(Math.min(existing.low, low, open, close));
  existing.ticks += ticks;

  if (firstServerTime < n(existing.firstServerTime, existing.openTime)) {
    existing.firstServerTime = firstServerTime;
    existing.open = round(open);
  }

  if (lastServerTime >= n(existing.lastServerTime, existing.openTime)) {
    existing.lastServerTime = lastServerTime;
    existing.close = round(close);
  }

  if (String(updatedAt) > String(existing.updatedAt || "")) existing.updatedAt = updatedAt;
}

function normalizeCandleArray(symbol, timeframe, arr, max = CONFIG.storage.maxCandlesPerKey) {
  if (!Array.isArray(arr)) return [];

  const cleanSymbol = normalizeMarketSymbol(symbol);
  const cleanTimeframe = String(timeframe || "S15").toUpperCase();
  const byOpenTime = new Map();

  for (const candle of arr) mergeCandleInto(byOpenTime, cleanSymbol, cleanTimeframe, candle || {});

  const out = [...byOpenTime.values()].sort((a, b) => a.openTime - b.openTime);
  if (out.length > max) out.splice(0, out.length - max);

  for (let i = 0; i < out.length; i++) out[i].isClosed = i < out.length - 1;
  return out;
}

class CandleBuilder {
  constructor() {
    const loaded = storage.readJson("candles.json", {});
    this.candles = {};

    if (loaded && typeof loaded === "object") {
      for (const [key, arr] of Object.entries(loaded)) {
        const parts = String(key).split("|");
        if (parts.length < 2) continue;
        const timeframe = parts.pop();
        const symbol = parts.join("|");
        const k = this.key(symbol, timeframe);
        this.candles[k] = normalizeCandleArray(symbol, timeframe, arr);
      }
    }
  }

  key(symbol, timeframe) {
    return `${normalizeMarketSymbol(symbol)}|${String(timeframe || "S15").toUpperCase()}`;
  }

  addTick(tick) {
    return Object.entries(CONFIG.candles.timeframes)
      .map(([tf, sec]) => this.addTickToTimeframe(tick, tf, sec))
      .filter(Boolean);
  }

  addTickToTimeframe(tick, timeframe, sec) {
    const symbol = normalizeMarketSymbol(tick.symbol);
    const price = Number(tick.price);
    let serverTime = Number(tick.serverTime);

    if (!symbol || !Number.isFinite(price) || !Number.isFinite(serverTime)) return null;

    // Pocket обычно отдаёт время в секундах. Если пришли миллисекунды — приводим к секундам.
    if (serverTime > 10_000_000_000) serverTime = serverTime / 1000;

    const openTime = Math.floor(serverTime / sec) * sec;
    const closeTime = openTime + sec;
    const k = this.key(symbol, timeframe);

    if (!Array.isArray(this.candles[k])) this.candles[k] = [];

    const arr = this.candles[k];
    let candle = arr.find(c => c && Number(c.openTime) === openTime);

    if (!candle) {
      candle = {
        symbol,
        timeframe,
        openTime,
        closeTime,
        open: round(price),
        high: round(price),
        low: round(price),
        close: round(price),
        ticks: 1,
        isClosed: false,
        firstServerTime: serverTime,
        lastServerTime: serverTime,
        updatedAt: tick.receivedAt || new Date().toISOString()
      };
      arr.push(candle);
    } else {
      candle.high = round(Math.max(Number(candle.high), price));
      candle.low = round(Math.min(Number(candle.low), price));
      candle.ticks = Math.max(1, Number(candle.ticks || 0)) + 1;

      const firstServerTime = n(candle.firstServerTime, candle.openTime);
      const lastServerTime = n(candle.lastServerTime, candle.openTime);

      if (serverTime < firstServerTime) {
        candle.open = round(price);
        candle.firstServerTime = serverTime;
      }

      if (serverTime >= lastServerTime) {
        candle.close = round(price);
        candle.lastServerTime = serverTime;
      }

      candle.updatedAt = tick.receivedAt || new Date().toISOString();
    }

    // Важно: поток Pocket может сначала прислать свежие live-тиki, а потом history старее.
    // Поэтому нельзя держать свечи в порядке прихода. Для индикаторов нужен строгий порядок времени.
    this.candles[k] = normalizeCandleArray(symbol, timeframe, arr);

    return this.candles[k].find(c => c.openTime === openTime) || null;
  }

  getCandles(symbol, timeframe, limit = 100, closedOnly = false) {
    const k = this.key(symbol, timeframe);
    const [cleanSymbol, cleanTimeframe] = k.split("|");
    let arr = normalizeCandleArray(cleanSymbol, cleanTimeframe, this.candles[k] || []);
    this.candles[k] = arr;
    if (closedOnly) arr = arr.filter(c => c && c.isClosed);
    return arr.slice(-Number(limit || 100));
  }

  save() {
    storage.writeJson("candles.json", this.candles);
  }

  state() {
    const keys = Object.keys(this.candles || {});
    return {
      keys,
      countByKey: Object.fromEntries(keys.map(k => [k, Array.isArray(this.candles[k]) ? this.candles[k].length : 0]))
    };
  }
}

module.exports = CandleBuilder;
