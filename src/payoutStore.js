const CONFIG = require("./config");
const storage = require("./storage");
const { normalizeSymbol, symbolToLabel, nowIso, safeNumber } = require("./utils");

class PayoutStore {
  constructor() {
    const saved = storage.readJson("payouts.json", { assets: {} });
    this.assets = saved.assets || {};
  }

  updateMany(input = {}) {
    const source = input.source || "UNKNOWN";
    const clientId = input.clientId || "unknown-client";
    const items = Array.isArray(input.assets) ? input.assets : [];
    const updated = [];

    for (const item of items) {
      const symbol = normalizeSymbol(item.symbol || item.label || item.asset);
      const payoutPercent = safeNumber(item.payoutPercent ?? item.payout ?? item.percent);

      if (!symbol || payoutPercent === null) continue;

      const record = {
        symbol,
        label: item.label || symbolToLabel(symbol),
        payoutPercent,
        category: item.category || null,
        active: item.active !== false,
        source,
        clientId,
        updatedAt: nowIso(),
        updatedAtMs: Date.now()
      };

      this.assets[symbol] = record;
      updated.push(record);
    }

    this.trim();

    return {
      ok: true,
      accepted: updated.length,
      updated
    };
  }

  trim() {
    const entries = Object.entries(this.assets);
    if (entries.length <= CONFIG.payouts.maxAssets) return;

    entries.sort((a, b) => (b[1].updatedAtMs || 0) - (a[1].updatedAtMs || 0));
    this.assets = Object.fromEntries(entries.slice(0, CONFIG.payouts.maxAssets));
  }

  get(symbol) {
    return this.assets[normalizeSymbol(symbol)] || null;
  }

  list({ minPayoutPercent = null, activeOnly = false, limit = 500 } = {}) {
    let out = Object.values(this.assets);

    if (activeOnly) out = out.filter(a => a.active !== false);
    if (minPayoutPercent !== null) {
      const min = Number(minPayoutPercent);
      out = out.filter(a => Number(a.payoutPercent) >= min);
    }

    out.sort((a, b) => {
      const p = Number(b.payoutPercent) - Number(a.payoutPercent);
      if (p !== 0) return p;
      return String(a.symbol).localeCompare(String(b.symbol));
    });

    return out.slice(0, Number(limit || 500));
  }

  state() {
    const all = Object.values(this.assets);
    const now = Date.now();
    const fresh = all.filter(a => now - (a.updatedAtMs || 0) <= CONFIG.payouts.staleAfterMs);

    return {
      total: all.length,
      fresh: fresh.length,
      lastUpdatedAt: all.map(a => a.updatedAt).sort().pop() || null,
      top: this.list({ limit: 10 })
    };
  }

  save() {
    storage.writeJson("payouts.json", { assets: this.assets });
  }
}

module.exports = PayoutStore;
