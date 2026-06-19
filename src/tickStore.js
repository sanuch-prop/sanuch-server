const fs = require("fs");
const path = require("path");
const CONFIG = require("./config");
const storage = require("./storage");
const { normalizeSymbol, safeNumber, nowIso } = require("./utils");
const { canonicalSymbolFor } = require("./assetUniverse");

function normalizeMarketSymbol(value) {
  return canonicalSymbolFor(value) || normalizeSymbol(value);
}

class TickStore {
  constructor() {
    this.latest = new Map();
    this.ticks = new Map();
    this.loadLatestFromDisk();
  }

  dataFilePath() {
    return path.join(process.cwd(), CONFIG.storage.dataDir, "ticks.jsonl");
  }

  loadLatestFromDisk() {
    const p = this.dataFilePath();
    if (!fs.existsSync(p)) return;

    try {
      const stat = fs.statSync(p);
      // Не читаем гигантский файл целиком: берём хвост. Этого хватает, чтобы после перезапуска
      // /prices и /bridge/assets сразу показывали последние активы, а не пустоту.
      const tailBytes = Math.min(stat.size, 30 * 1024 * 1024);
      const fd = fs.openSync(p, "r");
      const buffer = Buffer.alloc(tailBytes);
      fs.readSync(fd, buffer, 0, tailBytes, stat.size - tailBytes);
      fs.closeSync(fd);

      let text = buffer.toString("utf8");
      if (stat.size > tailBytes) text = text.slice(text.indexOf("\n") + 1);

      const rows = text.split(/\r?\n/).filter(Boolean);
      for (const line of rows) {
        try {
          const row = JSON.parse(line);
          this.rememberTick(row);
        } catch (_) {
          // Битая строка в jsonl не должна валить сервер.
        }
      }
    } catch (err) {
      console.warn("[tickStore] cannot hydrate ticks.jsonl:", err.message);
    }
  }

  rememberTick(input) {
    const rawSymbol = input?.symbol ?? input?.asset ?? input?.name;
    const symbol = normalizeMarketSymbol(rawSymbol);
    const wireSymbol = normalizeSymbol(input?.wireSymbol || rawSymbol);
    const price = safeNumber(input?.price ?? input?.value ?? input?.rate ?? input?.close);
    const serverTime = safeNumber(input?.serverTime ?? input?.time ?? input?.timestamp);

    if (!symbol || price === null || serverTime === null) return null;

    const tick = {
      symbol,
      wireSymbol,
      price,
      serverTime,
      source: input.source || "UNKNOWN",
      receivedAt: input.receivedAt || nowIso()
    };

    const currentLatest = this.latest.get(symbol);
    if (!currentLatest || Number(tick.serverTime) >= Number(currentLatest.serverTime || 0)) {
      this.latest.set(symbol, tick);
    }

    if (!this.ticks.has(symbol)) this.ticks.set(symbol, []);
    const arr = this.ticks.get(symbol);
    arr.push(tick);

    const max = CONFIG.storage.maxTicksPerSymbol;
    if (arr.length > max) arr.splice(0, arr.length - max);

    return tick;
  }

  addTick(input) {
    const tick = this.rememberTick(input);

    if (!tick) {
      const rawSymbol = input?.symbol ?? input?.asset ?? input?.name;
      return {
        ok: false,
        error: "BAD_TICK",
        details: {
          symbol: normalizeMarketSymbol(rawSymbol),
          wireSymbol: normalizeSymbol(rawSymbol),
          price: safeNumber(input?.price ?? input?.value ?? input?.rate ?? input?.close),
          serverTime: safeNumber(input?.serverTime ?? input?.time ?? input?.timestamp)
        }
      };
    }

    storage.appendJsonl("ticks.jsonl", tick);
    return { ok: true, tick };
  }

  getLatest(symbol) {
    return this.latest.get(normalizeMarketSymbol(symbol)) || null;
  }

  getTicks(symbol, limit = 100) {
    return (this.ticks.get(normalizeMarketSymbol(symbol)) || []).slice(-Number(limit || 100));
  }

  getSymbols() {
    return [...this.latest.keys()].sort();
  }

  state() {
    return {
      symbols: this.getSymbols(),
      latest: Object.fromEntries([...this.latest.entries()])
    };
  }
}

module.exports = TickStore;
