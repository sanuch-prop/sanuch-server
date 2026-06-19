function nowIso() { return new Date().toISOString(); }
function makeId(prefix = "id") { return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2,10)}`; }
function makeRequestId() { return Math.floor(10000000 + Math.random() * 90000000); }
function normalizeAccountMode(mode) { return String(mode || "DEMO").trim().toUpperCase() === "REAL" ? "REAL" : "DEMO"; }
function accountModeToIsDemo(accountMode) { return normalizeAccountMode(accountMode) === "DEMO" ? 1 : 0; }
function normalizeAction(action) {
  const v = String(action || "").trim().toLowerCase();
  if (v === "buy") return "call";
  if (v === "sell") return "put";
  return v;
}
function normalizeSymbol(symbol) {
  let s = String(symbol || "").trim();
  if (!s) return "";

  // EUR/USD OTC -> EURUSD_otc
  // EUR/USD     -> EURUSD
  s = s.replace(/\s+/g, " ");
  const hasOtc = /\bOTC\b/i.test(s) || /_otc$/i.test(s);
  s = s.replace(/\bOTC\b/ig, "");
  s = s.replace("/", "");
  s = s.replace(/\s+/g, "");
  s = s.replace(/_OTC$/i, "");
  s = s.toUpperCase();

  return hasOtc ? `${s}_otc` : s;
}
function safeNumber(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function parseJsonSafe(text) { try { return JSON.parse(text); } catch { return null; } }
function round(value, digits = 5) { const n = Number(value); return Number.isFinite(n) ? Number(n.toFixed(digits)) : null; }
module.exports = { nowIso, makeId, makeRequestId, normalizeAccountMode, accountModeToIsDemo, normalizeAction, normalizeSymbol, safeNumber, parseJsonSafe, round };
