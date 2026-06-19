const CONFIG = require("./config");
const { normalizeSymbol, round } = require("./utils");

function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function str(value, fallback = "") {
  const s = String(value ?? "").trim();
  return s || fallback;
}

function last(arr) {
  return Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;
}

function cleanCandles(candles = []) {
  return (candles || [])
    .filter(c => c && c.isClosed !== false)
    .map(c => ({
      ...c,
      openTime: n(c.openTime ?? c.open_time ?? c.time, 0),
      closeTime: n(c.closeTime ?? c.close_time, n(c.openTime ?? c.open_time ?? c.time, 0)),
      open: n(c.open),
      high: n(c.high),
      low: n(c.low),
      close: n(c.close)
    }))
    .sort((a, b) => a.openTime - b.openTime);
}

function prop(candles, key) {
  return candles.map(c => n(c[key], null)).filter(v => v !== null);
}

function avg(values) {
  const arr = (values || []).filter(v => Number.isFinite(Number(v))).map(Number);
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

function sum(values) {
  return (values || []).reduce((a, b) => a + n(b), 0);
}

function highest(values) {
  const arr = (values || []).filter(v => Number.isFinite(Number(v))).map(Number);
  return arr.length ? Math.max(...arr) : null;
}

function lowest(values) {
  const arr = (values || []).filter(v => Number.isFinite(Number(v))).map(Number);
  return arr.length ? Math.min(...arr) : null;
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function crossUp(prevA, prevB, a, b) {
  return [prevA, prevB, a, b].every(v => Number.isFinite(Number(v))) && Number(prevA) <= Number(prevB) && Number(a) > Number(b);
}

function crossDown(prevA, prevB, a, b) {
  return [prevA, prevB, a, b].every(v => Number.isFinite(Number(v))) && Number(prevA) >= Number(prevB) && Number(a) < Number(b);
}

function normalizeId(value) {
  return String(value || "moving-average").toLowerCase().trim().replace(/_/g, "-");
}

function tfSeconds(timeframe) {
  return CONFIG.candles.timeframes[String(timeframe || "S15").toUpperCase()] || 15;
}

function getSetting(ind, names, fallback) {
  const settings = ind?.settings || {};
  const list = Array.isArray(names) ? names : [names];
  for (const key of list) {
    if (settings[key] !== undefined && settings[key] !== null && settings[key] !== "") return settings[key];
    if (ind[key] !== undefined && ind[key] !== null && ind[key] !== "") return ind[key];
  }
  return fallback;
}

function smaSeries(values, period) {
  period = Math.max(1, Math.trunc(n(period, 1)));
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < period) out.push(null);
    else out.push(avg(values.slice(i + 1 - period, i + 1)));
  }
  return out;
}

function emaSeries(values, period) {
  period = Math.max(1, Math.trunc(n(period, 1)));
  const out = [];
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = n(values[i], null);
    if (v === null) {
      out.push(null);
      continue;
    }
    if (prev === null) prev = i + 1 >= period ? avg(values.slice(i + 1 - period, i + 1)) : v;
    else prev = v * k + prev * (1 - k);
    out.push(i + 1 >= period ? prev : null);
  }
  return out;
}

function smmaSeries(values, period) {
  period = Math.max(1, Math.trunc(n(period, 1)));
  const out = [];
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = n(values[i], null);
    if (v === null || i + 1 < period) {
      out.push(null);
      continue;
    }
    if (prev === null) prev = avg(values.slice(i + 1 - period, i + 1));
    else prev = (prev * (period - 1) + v) / period;
    out.push(prev);
  }
  return out;
}

function wmaSeries(values, period) {
  period = Math.max(1, Math.trunc(n(period, 1)));
  const out = [];
  const denom = period * (period + 1) / 2;
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < period) {
      out.push(null);
      continue;
    }
    const slice = values.slice(i + 1 - period, i + 1);
    let total = 0;
    for (let j = 0; j < slice.length; j++) total += n(slice[j]) * (j + 1);
    out.push(total / denom);
  }
  return out;
}

function maSeries(values, period, method = "EMA") {
  const m = String(method || "EMA").toUpperCase();
  if (m === "SMA") return smaSeries(values, period);
  if (m === "WMA") return wmaSeries(values, period);
  if (m === "SMMA") return smmaSeries(values, period);
  return emaSeries(values, period);
}

function trueRangeSeries(candles) {
  return candles.map((c, i) => {
    const h = n(c.high), l = n(c.low), pc = i ? n(candles[i - 1].close) : n(c.close);
    return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  });
}

function atrSeries(candles, period = 14) {
  return smmaSeries(trueRangeSeries(candles), period);
}

function rsiSeries(closes, period = 14) {
  period = Math.max(1, Math.trunc(n(period, 14)));
  const out = Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - (100 / (1 + gain / loss));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = loss === 0 ? 100 : 100 - (100 / (1 + gain / loss));
  }
  return out;
}

function macdSeries(closes, fast = 12, slow = 26, signal = 9) {
  const emaF = emaSeries(closes, fast);
  const emaS = emaSeries(closes, slow);
  const macd = closes.map((_, i) => emaF[i] === null || emaS[i] === null ? null : emaF[i] - emaS[i]);
  const fill = macd.map(v => v ?? 0);
  const sig = emaSeries(fill, signal).map((v, i) => macd[i] === null ? null : v);
  const hist = macd.map((v, i) => v === null || sig[i] === null ? null : v - sig[i]);
  return { macd, signal: sig, hist };
}

function std(values) {
  const arr = (values || []).filter(v => Number.isFinite(Number(v))).map(Number);
  if (!arr.length) return null;
  const m = avg(arr);
  return Math.sqrt(avg(arr.map(v => Math.pow(v - m, 2))));
}

function bollingerSeries(closes, period = 20, deviation = 2) {
  const middle = smaSeries(closes, period);
  const upper = [];
  const lower = [];
  const width = [];
  for (let i = 0; i < closes.length; i++) {
    if (i + 1 < period || middle[i] === null) {
      upper.push(null); lower.push(null); width.push(null); continue;
    }
    const sd = std(closes.slice(i + 1 - period, i + 1)) || 0;
    upper.push(middle[i] + deviation * sd);
    lower.push(middle[i] - deviation * sd);
    width.push(middle[i] ? ((upper[i] - lower[i]) / Math.abs(middle[i])) * 100 : null);
  }
  return { upper, middle, lower, width };
}

function stochasticSeries(candles, kPeriod = 14, dPeriod = 3, smooth = 3) {
  const rawK = [];
  for (let i = 0; i < candles.length; i++) {
    if (i + 1 < kPeriod) { rawK.push(null); continue; }
    const slice = candles.slice(i + 1 - kPeriod, i + 1);
    const hh = highest(prop(slice, "high"));
    const ll = lowest(prop(slice, "low"));
    const c = n(candles[i].close);
    rawK.push(hh === ll ? 50 : ((c - ll) / (hh - ll)) * 100);
  }
  const k = smaSeries(rawK.map(v => v ?? 0), smooth).map((v, i) => rawK[i] === null ? null : v);
  const d = smaSeries(k.map(v => v ?? 0), dPeriod).map((v, i) => k[i] === null ? null : v);
  return { k, d };
}

function cciSeries(candles, period = 20) {
  const tp = candles.map(c => (n(c.high) + n(c.low) + n(c.close)) / 3);
  const out = [];
  for (let i = 0; i < tp.length; i++) {
    if (i + 1 < period) { out.push(null); continue; }
    const slice = tp.slice(i + 1 - period, i + 1);
    const ma = avg(slice);
    const dev = avg(slice.map(v => Math.abs(v - ma)));
    out.push(dev ? (tp[i] - ma) / (0.015 * dev) : 0);
  }
  return out;
}

function williamsRSeries(candles, period = 14) {
  return candles.map((c, i) => {
    if (i + 1 < period) return null;
    const slice = candles.slice(i + 1 - period, i + 1);
    const hh = highest(prop(slice, "high"));
    const ll = lowest(prop(slice, "low"));
    return hh === ll ? -50 : ((hh - n(c.close)) / (hh - ll)) * -100;
  });
}

function deMarkerSeries(candles, period = 14) {
  const deMax = [0], deMin = [0];
  for (let i = 1; i < candles.length; i++) {
    deMax.push(Math.max(n(candles[i].high) - n(candles[i - 1].high), 0));
    deMin.push(Math.max(n(candles[i - 1].low) - n(candles[i].low), 0));
  }
  const maxS = smaSeries(deMax, period), minS = smaSeries(deMin, period);
  return candles.map((_, i) => {
    if (maxS[i] === null || minS[i] === null) return null;
    const denom = maxS[i] + minS[i];
    return denom ? maxS[i] / denom : 0.5;
  });
}

function adxSeries(candles, period = 14) {
  const tr = trueRangeSeries(candles);
  const plusDM = [0], minusDM = [0];
  for (let i = 1; i < candles.length; i++) {
    const up = n(candles[i].high) - n(candles[i - 1].high);
    const down = n(candles[i - 1].low) - n(candles[i].low);
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const atr = smmaSeries(tr, period);
  const pSm = smmaSeries(plusDM, period), mSm = smmaSeries(minusDM, period);
  const plusDI = candles.map((_, i) => atr[i] ? 100 * pSm[i] / atr[i] : null);
  const minusDI = candles.map((_, i) => atr[i] ? 100 * mSm[i] / atr[i] : null);
  const dx = candles.map((_, i) => plusDI[i] === null || minusDI[i] === null || plusDI[i] + minusDI[i] === 0 ? null : 100 * Math.abs(plusDI[i] - minusDI[i]) / (plusDI[i] + minusDI[i]));
  const adx = smmaSeries(dx.map(v => v ?? 0), period).map((v, i) => dx[i] === null ? null : v);
  return { adx, plusDI, minusDI };
}

function aroonSeries(candles, period = 14) {
  return candles.map((_, i) => {
    if (i + 1 < period) return { up: null, down: null };
    const slice = candles.slice(i + 1 - period, i + 1);
    let hiIndex = 0, loIndex = 0;
    for (let j = 1; j < slice.length; j++) {
      if (n(slice[j].high) >= n(slice[hiIndex].high)) hiIndex = j;
      if (n(slice[j].low) <= n(slice[loIndex].low)) loIndex = j;
    }
    const sinceHigh = period - 1 - hiIndex;
    const sinceLow = period - 1 - loIndex;
    return { up: ((period - sinceHigh) / period) * 100, down: ((period - sinceLow) / period) * 100 };
  });
}

function vortexSeries(candles, period = 14) {
  const plus = [0], minus = [0], tr = trueRangeSeries(candles);
  for (let i = 1; i < candles.length; i++) {
    plus.push(Math.abs(n(candles[i].high) - n(candles[i - 1].low)));
    minus.push(Math.abs(n(candles[i].low) - n(candles[i - 1].high)));
  }
  return candles.map((_, i) => {
    if (i + 1 < period) return { plus: null, minus: null };
    const trSum = sum(tr.slice(i + 1 - period, i + 1));
    return { plus: trSum ? sum(plus.slice(i + 1 - period, i + 1)) / trSum : null, minus: trSum ? sum(minus.slice(i + 1 - period, i + 1)) / trSum : null };
  });
}

function parabolicSarSeries(candles, step = 0.02, maxStep = 0.2) {
  if (candles.length < 3) return Array(candles.length).fill(null);
  const out = Array(candles.length).fill(null);
  let up = n(candles[1].close) >= n(candles[0].close);
  let af = step;
  let ep = up ? n(candles[1].high) : n(candles[1].low);
  let sar = up ? n(candles[0].low) : n(candles[0].high);
  out[1] = sar;
  for (let i = 2; i < candles.length; i++) {
    sar = sar + af * (ep - sar);
    if (up) {
      sar = Math.min(sar, n(candles[i - 1].low), n(candles[i - 2].low));
      if (n(candles[i].low) < sar) {
        up = false; sar = ep; ep = n(candles[i].low); af = step;
      } else if (n(candles[i].high) > ep) {
        ep = n(candles[i].high); af = Math.min(maxStep, af + step);
      }
    } else {
      sar = Math.max(sar, n(candles[i - 1].high), n(candles[i - 2].high));
      if (n(candles[i].high) > sar) {
        up = true; sar = ep; ep = n(candles[i].high); af = step;
      } else if (n(candles[i].low) < ep) {
        ep = n(candles[i].low); af = Math.min(maxStep, af + step);
      }
    }
    out[i] = sar;
  }
  return out;
}

function superTrendSeries(candles, period = 10, mult = 3) {
  const atr = atrSeries(candles, period);
  const out = [];
  let fUpper = null, fLower = null, st = null, dir = 1;
  for (let i = 0; i < candles.length; i++) {
    const hl2 = (n(candles[i].high) + n(candles[i].low)) / 2;
    if (atr[i] === null) { out.push({ line: null, dir: 0 }); continue; }
    const upper = hl2 + mult * atr[i], lower = hl2 - mult * atr[i];
    if (fUpper === null) { fUpper = upper; fLower = lower; st = lower; dir = 1; }
    fUpper = (upper < fUpper || n(candles[i - 1]?.close, n(candles[i].close)) > fUpper) ? upper : fUpper;
    fLower = (lower > fLower || n(candles[i - 1]?.close, n(candles[i].close)) < fLower) ? lower : fLower;
    if (st === fUpper && n(candles[i].close) <= fUpper) { st = fUpper; dir = -1; }
    else if (st === fUpper && n(candles[i].close) > fUpper) { st = fLower; dir = 1; }
    else if (st === fLower && n(candles[i].close) >= fLower) { st = fLower; dir = 1; }
    else if (st === fLower && n(candles[i].close) < fLower) { st = fUpper; dir = -1; }
    out.push({ line: st, dir });
  }
  return out;
}

function channelSeries(candles, closes, type, settings) {
  const period = n(settings.period, type === "donchian-channel" ? 20 : 20);
  const deviation = n(settings.deviation ?? settings.multiplier, type === "envelopes" ? 0.2 : 2);
  const atrMult = n(settings.atrMultiplier ?? settings.multiplier, 2);
  if (type === "bollinger-bands" || type === "bollinger-bands-width") return bollingerSeries(closes, period, deviation);
  if (type === "donchian-channel") {
    return {
      upper: candles.map((_, i) => i + 1 >= period ? highest(prop(candles.slice(i + 1 - period, i + 1), "high")) : null),
      lower: candles.map((_, i) => i + 1 >= period ? lowest(prop(candles.slice(i + 1 - period, i + 1), "low")) : null),
      middle: candles.map((_, i) => i + 1 >= period ? avg([highest(prop(candles.slice(i + 1 - period, i + 1), "high")), lowest(prop(candles.slice(i + 1 - period, i + 1), "low"))]) : null),
      width: []
    };
  }
  if (type === "keltner-channel") {
    const middle = emaSeries(closes, period);
    const atr = atrSeries(candles, n(settings.atrPeriod, period));
    return { upper: middle.map((m, i) => m === null || atr[i] === null ? null : m + atrMult * atr[i]), middle, lower: middle.map((m, i) => m === null || atr[i] === null ? null : m - atrMult * atr[i]), width: [] };
  }
  // envelopes
  const middle = maSeries(closes, period, settings.method || "SMA");
  const pct = deviation / 100;
  return { upper: middle.map(v => v === null ? null : v * (1 + pct)), middle, lower: middle.map(v => v === null ? null : v * (1 - pct)), width: [] };
}

function listRules(value, fallback = []) {
  if (Array.isArray(value)) return value.map(x => String(x).toUpperCase().trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,+;|\s]+/).map(x => x.toUpperCase().trim()).filter(Boolean);
  return Array.isArray(fallback) ? fallback : [String(fallback).toUpperCase()];
}

function getRules(ind, side, kind, fallback) {
  const settings = ind.settings || {};
  const sideTitle = side === "BUY" ? "Buy" : "Sell";
  const sideLower = side.toLowerCase();
  const keys = kind === "confirm"
    ? [`confirm${sideTitle}Rules`, `confirm${sideTitle}Rule`, `confirmation${sideTitle}Rules`, `confirmation${sideTitle}Rule`, `${sideLower}ConfirmRules`, `${sideLower}ConfirmRule`]
    : [`${sideLower}Rules`, `${sideLower}Rule`, `signal${sideTitle}Rules`, `signal${sideTitle}Rule`, `${sideLower}SignalRules`, `${sideLower}SignalRule`];
  for (const key of keys) {
    const v = settings[key] ?? ind[key];
    if (v !== undefined && v !== null && v !== "") return listRules(v, fallback);
  }
  return listRules(fallback, fallback);
}

function allTrue(codes, evalRule) {
  const clean = codes.filter(c => !["Q", "D", "NO", "NONE", "OFF", "НЕ", "НЕТ"].includes(c));
  if (!clean.length) return false;
  return clean.every(code => evalRule(code));
}

function anyTrue(codes, evalRule) {
  const clean = codes.filter(c => !["Q", "D", "NO", "NONE", "OFF", "НЕ", "НЕТ"].includes(c));
  if (!clean.length) return false;
  return clean.some(code => evalRule(code));
}

function evalMode(ind) {
  const mode = String(getSetting(ind, ["ruleMode", "conditionMode", "rulesMode"], "ALL")).toUpperCase();
  return mode === "ANY" || mode === "ИЛИ" ? "ANY" : "ALL";
}

function runRules(codes, evalRule, mode = "ALL") {
  return mode === "ANY" ? anyTrue(codes, evalRule) : allTrue(codes, evalRule);
}

function lastAt(arr, offset = 0) {
  if (!Array.isArray(arr) || arr.length <= offset) return null;
  return arr[arr.length - 1 - offset];
}

function makeValues(values) {
  const out = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (typeof v === "number") out[k] = round(v, 6);
    else out[k] = v;
  }
  return out;
}

function buildIndicatorState(id, candles, ind) {
  const settings = ind.settings || {};
  const closes = prop(candles, "close"), highs = prop(candles, "high"), lows = prop(candles, "low");
  const close = last(closes), prevClose = closes[closes.length - 2];
  const period = n(getSetting(ind, ["period", "mainPeriod", "rsiPeriod"], 14), 14);
  const state = { id, close, prevClose, values: {}, minCandles: 20, eval: () => false, labels: {} };

  if (id === "macd" || id === "osma") {
    const fast = n(getSetting(ind, ["fast", "fastPeriod"], 12), 12);
    const slow = n(getSetting(ind, ["slow", "slowPeriod"], 26), 26);
    const signalPeriod = n(getSetting(ind, ["signal", "signalPeriod"], 9), 9);
    const m = macdSeries(closes, fast, slow, signalPeriod);
    const M = lastAt(m.macd), S = lastAt(m.signal), H = lastAt(m.hist);
    const Mp = lastAt(m.macd, 1), Sp = lastAt(m.signal, 1), Hp = lastAt(m.hist, 1);
    state.minCandles = Math.max(fast, slow, signalPeriod) + 10;
    state.values = { macd: M, signal: S, hist: H, prevMacd: Mp, prevSignal: Sp, prevHist: Hp, fast, slow, signalPeriod };
    state.labels = {
      A: "MACD выше Signal", B: "MACD выше Signal, обе линии выше нуля", C: "MACD выше Signal, обе линии ниже нуля",
      D: "MACD ниже Signal", E: "MACD ниже Signal, обе линии выше нуля", F: "MACD ниже Signal, обе линии ниже нуля",
      G: "MACD выше нуля", H: "MACD ниже нуля", I: "Signal выше нуля", J: "Signal ниже нуля",
      K: "MACD пересекает Signal сверху вниз", L: "MACD пересекает Signal сверху вниз, обе линии выше нуля", M: "MACD пересекает Signal сверху вниз, обе линии ниже нуля",
      N: "MACD пересекает Signal снизу вверх", O: "MACD пересекает Signal снизу вверх, обе линии выше нуля", P: "MACD пересекает Signal снизу вверх, обе линии ниже нуля", Q: "Не открывать сделку"
    };
    state.eval = code => {
      if (code === "A") return M > S;
      if (code === "B") return M > S && M > 0 && S > 0;
      if (code === "C") return M > S && M < 0 && S < 0;
      if (code === "D") return M < S;
      if (code === "E") return M < S && M > 0 && S > 0;
      if (code === "F") return M < S && M < 0 && S < 0;
      if (code === "G") return M > 0;
      if (code === "H") return M < 0;
      if (code === "I") return S > 0;
      if (code === "J") return S < 0;
      if (code === "K") return crossDown(Mp, Sp, M, S);
      if (code === "L") return crossDown(Mp, Sp, M, S) && M > 0 && S > 0;
      if (code === "M") return crossDown(Mp, Sp, M, S) && M < 0 && S < 0;
      if (code === "N") return crossUp(Mp, Sp, M, S);
      if (code === "O") return crossUp(Mp, Sp, M, S) && M > 0 && S > 0;
      if (code === "P") return crossUp(Mp, Sp, M, S) && M < 0 && S < 0;
      return false;
    };
    return state;
  }

  if (id === "rsi") {
    const overbought = n(getSetting(ind, "overbought", 70), 70);
    const oversold = n(getSetting(ind, "oversold", 30), 30);
    const r = rsiSeries(closes, period);
    const R = lastAt(r), Rp = lastAt(r, 1);
    state.minCandles = period + 5;
    state.values = { rsi: R, prevRsi: Rp, overbought, oversold };
    state.labels = { A: "RSI в зоне перепроданности", B: "RSI в зоне перекупленности", C: "RSI в умеренной зоне", E: "RSI выходит из перепроданности вверх", F: "RSI выходит из перекупленности вниз", G: "RSI растёт", H: "RSI падает", D: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return R <= oversold;
      if (code === "B") return R >= overbought;
      if (code === "C") return R > oversold && R < overbought;
      if (code === "E") return Rp < oversold && R >= oversold;
      if (code === "F") return Rp > overbought && R <= overbought;
      if (code === "G") return R > Rp;
      if (code === "H") return R < Rp;
      return false;
    };
    return state;
  }

  if (["bollinger-bands", "bollinger-bands-width", "donchian-channel", "keltner-channel", "envelopes"].includes(id)) {
    const ch = channelSeries(candles, closes, id, settings);
    const U = lastAt(ch.upper), M = lastAt(ch.middle), L = lastAt(ch.lower), W = lastAt(ch.width);
    const Up = lastAt(ch.upper, 1), Lp = lastAt(ch.lower, 1);
    state.minCandles = n(settings.period, 20) + 5;
    state.values = { upper: U, middle: M, lower: L, width: W, close, prevClose };
    state.labels = { A: "Цена ниже нижней линии", B: "Цена выше верхней линии", C: "Цена между верхней и нижней линией", E: "Цена пересекла нижнюю линию снизу вверх", F: "Цена пересекла верхнюю линию сверху вниз", G: "Пробой верхней линии вверх", H: "Пробой нижней линии вниз", I: "Ширина канала растёт", J: "Ширина канала падает", D: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return close < L;
      if (code === "B") return close > U;
      if (code === "C") return close >= L && close <= U;
      if (code === "E") return prevClose < Lp && close >= L;
      if (code === "F") return prevClose > Up && close <= U;
      if (code === "G") return prevClose <= Up && close > U;
      if (code === "H") return prevClose >= Lp && close < L;
      if (code === "I") return W !== null && W > lastAt(ch.width, 1);
      if (code === "J") return W !== null && W < lastAt(ch.width, 1);
      return false;
    };
    return state;
  }

  if (id === "moving-average" || id === "ema" || id === "sma-cross" || id === "sma_cross") {
    const fast = n(getSetting(ind, ["fast", "fastPeriod", "period1"], 5), 5);
    const slow = n(getSetting(ind, ["slow", "slowPeriod", "period2"], 10), 10);
    const method = getSetting(ind, ["method", "maMethod"], "EMA");
    const f = maSeries(closes, fast, method), s = maSeries(closes, slow, method);
    const F = lastAt(f), S = lastAt(s), Fp = lastAt(f, 1), Sp = lastAt(s, 1);
    state.minCandles = Math.max(fast, slow) + 5;
    state.values = { fastValue: F, slowValue: S, prevFast: Fp, prevSlow: Sp, fast, slow, method };
    state.labels = { A: "Быстрая средняя выше медленной", B: "Быстрая средняя ниже медленной", C: "Цена выше быстрой средней", D: "Цена ниже быстрой средней", E: "Быстрая средняя пересекает медленную снизу вверх", F: "Быстрая средняя пересекает медленную сверху вниз", G: "Обе средние растут", H: "Обе средние падают", Q: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return F > S;
      if (code === "B") return F < S;
      if (code === "C") return close > F;
      if (code === "D") return close < F;
      if (code === "E") return crossUp(Fp, Sp, F, S);
      if (code === "F") return crossDown(Fp, Sp, F, S);
      if (code === "G") return F > Fp && S > Sp;
      if (code === "H") return F < Fp && S < Sp;
      return false;
    };
    return state;
  }

  if (id === "stochastic") {
    const kPeriod = n(getSetting(ind, ["k", "kPeriod"], 14), 14), dPeriod = n(getSetting(ind, ["d", "dPeriod"], 3), 3), smooth = n(getSetting(ind, ["smooth", "slowing"], 3), 3);
    const overbought = n(getSetting(ind, "overbought", 80), 80), oversold = n(getSetting(ind, "oversold", 20), 20);
    const st = stochasticSeries(candles, kPeriod, dPeriod, smooth);
    const K = lastAt(st.k), D = lastAt(st.d), Kp = lastAt(st.k, 1), Dp = lastAt(st.d, 1);
    state.minCandles = kPeriod + dPeriod + smooth + 5;
    state.values = { k: K, d: D, prevK: Kp, prevD: Dp, overbought, oversold };
    state.labels = { A: "%K в перепроданности", B: "%K в перекупленности", C: "%K в умеренной зоне", E: "%K выше %D", F: "%K ниже %D", G: "%K пересекает %D снизу вверх", H: "%K пересекает %D сверху вниз", I: "Пересечение вверх в зоне перепроданности", J: "Пересечение вниз в зоне перекупленности", D: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return K <= oversold;
      if (code === "B") return K >= overbought;
      if (code === "C") return K > oversold && K < overbought;
      if (code === "E") return K > D;
      if (code === "F") return K < D;
      if (code === "G") return crossUp(Kp, Dp, K, D);
      if (code === "H") return crossDown(Kp, Dp, K, D);
      if (code === "I") return crossUp(Kp, Dp, K, D) && K <= oversold;
      if (code === "J") return crossDown(Kp, Dp, K, D) && K >= overbought;
      return false;
    };
    return state;
  }

  if (id === "cci") {
    const upper = n(getSetting(ind, "upper", 100), 100), lower = n(getSetting(ind, "lower", -100), -100);
    const cc = cciSeries(candles, period);
    const C = lastAt(cc), Cp = lastAt(cc, 1);
    state.minCandles = period + 5;
    state.values = { cci: C, prevCci: Cp, upper, lower };
    state.labels = { A: "CCI ниже нижнего уровня", B: "CCI выше верхнего уровня", C: "CCI в умеренной зоне", E: "CCI выходит из нижней зоны вверх", F: "CCI выходит из верхней зоны вниз", G: "CCI растёт", H: "CCI падает", D: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return C <= lower;
      if (code === "B") return C >= upper;
      if (code === "C") return C > lower && C < upper;
      if (code === "E") return Cp < lower && C >= lower;
      if (code === "F") return Cp > upper && C <= upper;
      if (code === "G") return C > Cp;
      if (code === "H") return C < Cp;
      return false;
    };
    return state;
  }

  if (id === "williams-r") {
    const overbought = n(getSetting(ind, "overbought", -20), -20), oversold = n(getSetting(ind, "oversold", -80), -80);
    const wr = williamsRSeries(candles, period);
    const W = lastAt(wr), Wp = lastAt(wr, 1);
    state.minCandles = period + 5;
    state.values = { williamsR: W, prevWilliamsR: Wp, overbought, oversold };
    state.labels = { A: "Williams %R в перепроданности", B: "Williams %R в перекупленности", C: "Williams %R в умеренной зоне", E: "Выход из перепроданности вверх", F: "Выход из перекупленности вниз", G: "Williams %R растёт", H: "Williams %R падает", D: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return W <= oversold;
      if (code === "B") return W >= overbought;
      if (code === "C") return W > oversold && W < overbought;
      if (code === "E") return Wp < oversold && W >= oversold;
      if (code === "F") return Wp > overbought && W <= overbought;
      if (code === "G") return W > Wp;
      if (code === "H") return W < Wp;
      return false;
    };
    return state;
  }

  if (id === "demarker") {
    const overbought = n(getSetting(ind, "overbought", 0.7), 0.7), oversold = n(getSetting(ind, "oversold", 0.3), 0.3);
    const d = deMarkerSeries(candles, period);
    const D = lastAt(d), Dp = lastAt(d, 1);
    state.minCandles = period + 5;
    state.values = { demarker: D, prevDemarker: Dp, overbought, oversold };
    state.labels = { A: "DeMarker в перепроданности", B: "DeMarker в перекупленности", C: "DeMarker в умеренной зоне", E: "Выход из перепроданности вверх", F: "Выход из перекупленности вниз", G: "DeMarker растёт", H: "DeMarker падает", D: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return D <= oversold;
      if (code === "B") return D >= overbought;
      if (code === "C") return D > oversold && D < overbought;
      if (code === "E") return Dp < oversold && D >= oversold;
      if (code === "F") return Dp > overbought && D <= overbought;
      if (code === "G") return D > Dp;
      if (code === "H") return D < Dp;
      return false;
    };
    return state;
  }

  if (id === "adx") {
    const trendLevel = n(getSetting(ind, "trendLevel", 20), 20);
    const a = adxSeries(candles, period);
    const A = lastAt(a.adx), P = lastAt(a.plusDI), M = lastAt(a.minusDI), Pp = lastAt(a.plusDI, 1), Mp = lastAt(a.minusDI, 1);
    state.minCandles = period * 2 + 5;
    state.values = { adx: A, plusDI: P, minusDI: M, trendLevel };
    state.labels = { A: "ADX выше уровня, +DI выше -DI", B: "ADX выше уровня, -DI выше +DI", C: "ADX ниже уровня", E: "+DI пересекает -DI снизу вверх", F: "-DI пересекает +DI снизу вверх", G: "ADX растёт", H: "ADX падает", D: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return A >= trendLevel && P > M;
      if (code === "B") return A >= trendLevel && M > P;
      if (code === "C") return A < trendLevel;
      if (code === "E") return crossUp(Pp, Mp, P, M);
      if (code === "F") return crossUp(Mp, Pp, M, P);
      if (code === "G") return A > lastAt(a.adx, 1);
      if (code === "H") return A < lastAt(a.adx, 1);
      return false;
    };
    return state;
  }

  if (["awesome-oscillator", "accelerator-oscillator"].includes(id)) {
    const median = candles.map(c => (n(c.high) + n(c.low)) / 2);
    const ao = median.map((_, i) => {
      const f = i + 1 >= 5 ? avg(median.slice(i - 4, i + 1)) : null;
      const s = i + 1 >= 34 ? avg(median.slice(i - 33, i + 1)) : null;
      return f !== null && s !== null ? f - s : null;
    });
    const aoFill = ao.map(v => v ?? 0);
    const ac = ao.map((v, i) => v === null ? null : v - (smaSeries(aoFill.slice(0, i + 1), 5).pop() || 0));
    const arr = id === "awesome-oscillator" ? ao : ac;
    const V = lastAt(arr), Vp = lastAt(arr, 1), Vpp = lastAt(arr, 2);
    state.minCandles = 40;
    state.values = { value: V, prev: Vp, ao: lastAt(ao), ac: lastAt(ac) };
    state.labels = { A: "Значение выше нуля", B: "Значение ниже нуля", C: "Пересечение нуля снизу вверх", D: "Пересечение нуля сверху вниз", E: "Значение растёт", F: "Значение падает", G: "Два роста подряд", H: "Два падения подряд", Q: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return V > 0;
      if (code === "B") return V < 0;
      if (code === "C") return Vp <= 0 && V > 0;
      if (code === "D") return Vp >= 0 && V < 0;
      if (code === "E") return V > Vp;
      if (code === "F") return V < Vp;
      if (code === "G") return V > Vp && Vp > Vpp;
      if (code === "H") return V < Vp && Vp < Vpp;
      return false;
    };
    return state;
  }

  if (["momentum", "rate-of-change", "osma", "schaff-trend-cycle"].includes(id)) {
    let arr;
    let center = 0;
    if (id === "osma") {
      const m = macdSeries(closes, n(settings.fast, 12), n(settings.slow, 26), n(settings.signal, 9));
      arr = m.hist;
    } else if (id === "momentum") {
      const p = n(settings.period, 14); center = 100;
      arr = closes.map((v, i) => i >= p ? 100 * v / closes[i - p] : null);
    } else if (id === "rate-of-change") {
      const p = n(settings.period, 9);
      arr = closes.map((v, i) => i >= p ? ((v - closes[i - p]) / closes[i - p]) * 100 : null);
    } else {
      const m = macdSeries(closes, n(settings.fast, 23), n(settings.slow, 50), n(settings.signal, 10));
      const hist = m.hist.map(v => v ?? 0);
      const lo = lowest(hist.slice(-period)) ?? 0, hi = highest(hist.slice(-period)) ?? 1;
      arr = hist.map(v => hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
      center = 50;
    }
    const V = lastAt(arr), Vp = lastAt(arr, 1);
    state.minCandles = Math.max(period, n(settings.slow, 26)) + 10;
    state.values = { value: V, prev: Vp, center };
    state.labels = { A: "Значение выше центральной линии", B: "Значение ниже центральной линии", C: "Пересечение центральной линии вверх", D: "Пересечение центральной линии вниз", E: "Значение растёт", F: "Значение падает", Q: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return V > center;
      if (code === "B") return V < center;
      if (code === "C") return Vp <= center && V > center;
      if (code === "D") return Vp >= center && V < center;
      if (code === "E") return V > Vp;
      if (code === "F") return V < Vp;
      return false;
    };
    return state;
  }

  if (id === "parabolic-sar") {
    const sar = parabolicSarSeries(candles, n(settings.step, 0.02), n(settings.maxStep, 0.2));
    const S = lastAt(sar), Sp = lastAt(sar, 1);
    state.minCandles = 10;
    state.values = { sar: S, prevSar: Sp, close, prevClose };
    state.labels = { A: "SAR ниже цены", B: "SAR выше цены", C: "SAR перешёл под цену", D: "SAR перешёл над цену", Q: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return S < close;
      if (code === "B") return S > close;
      if (code === "C") return Sp > prevClose && S < close;
      if (code === "D") return Sp < prevClose && S > close;
      return false;
    };
    return state;
  }

  if (id === "supertrend") {
    const st = superTrendSeries(candles, n(settings.period, 10), n(settings.multiplier, 3));
    const S = lastAt(st), Sp = lastAt(st, 1);
    state.minCandles = n(settings.period, 10) + 10;
    state.values = { line: S?.line, dir: S?.dir, prevDir: Sp?.dir };
    state.labels = { A: "SuperTrend вверх", B: "SuperTrend вниз", C: "SuperTrend сменился вверх", D: "SuperTrend сменился вниз", Q: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return S?.dir === 1;
      if (code === "B") return S?.dir === -1;
      if (code === "C") return Sp?.dir === -1 && S?.dir === 1;
      if (code === "D") return Sp?.dir === 1 && S?.dir === -1;
      return false;
    };
    return state;
  }

  if (id === "aroon") {
    const ar = aroonSeries(candles, period);
    const A = lastAt(ar), Ap = lastAt(ar, 1);
    state.minCandles = period + 5;
    state.values = { up: A?.up, down: A?.down, prevUp: Ap?.up, prevDown: Ap?.down };
    state.labels = { A: "Aroon Up выше Aroon Down", B: "Aroon Down выше Aroon Up", C: "Aroon Up выше 70", D: "Aroon Down выше 70", E: "Aroon Up пересекает Down вверх", F: "Aroon Down пересекает Up вверх", Q: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return A?.up > A?.down;
      if (code === "B") return A?.down > A?.up;
      if (code === "C") return A?.up >= 70;
      if (code === "D") return A?.down >= 70;
      if (code === "E") return crossUp(Ap?.up, Ap?.down, A?.up, A?.down);
      if (code === "F") return crossUp(Ap?.down, Ap?.up, A?.down, A?.up);
      return false;
    };
    return state;
  }

  if (id === "vortex") {
    const vx = vortexSeries(candles, period);
    const V = lastAt(vx), Vp = lastAt(vx, 1);
    state.minCandles = period + 5;
    state.values = { plus: V?.plus, minus: V?.minus, prevPlus: Vp?.plus, prevMinus: Vp?.minus };
    state.labels = { A: "+VI выше -VI", B: "-VI выше +VI", C: "+VI пересекает -VI вверх", D: "-VI пересекает +VI вверх", Q: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return V?.plus > V?.minus;
      if (code === "B") return V?.minus > V?.plus;
      if (code === "C") return crossUp(Vp?.plus, Vp?.minus, V?.plus, V?.minus);
      if (code === "D") return crossUp(Vp?.minus, Vp?.plus, V?.minus, V?.plus);
      return false;
    };
    return state;
  }

  if (id === "atr") {
    const atr = atrSeries(candles, period);
    const A = lastAt(atr), Ap = lastAt(atr, 1);
    const ma = smaSeries(atr.map(v => v ?? 0), n(settings.averagePeriod, period)).map((v, i) => atr[i] === null ? null : v);
    const M = lastAt(ma);
    state.minCandles = period + n(settings.averagePeriod, period) + 5;
    state.values = { atr: A, prevAtr: Ap, averageAtr: M };
    state.labels = { A: "ATR выше среднего", B: "ATR ниже среднего", C: "ATR растёт", D: "ATR падает", E: "ATR резко растёт", Q: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return A > M;
      if (code === "B") return A < M;
      if (code === "C") return A > Ap;
      if (code === "D") return A < Ap;
      if (code === "E") return M ? A > M * 1.2 : false;
      return false;
    };
    return state;
  }

  if (id === "alligator") {
    const jaw = maSeries(closes, n(settings.jaw, 13), "SMMA");
    const teeth = maSeries(closes, n(settings.teeth, 8), "SMMA");
    const lips = maSeries(closes, n(settings.lips, 5), "SMMA");
    const J = lastAt(jaw), T = lastAt(teeth), L = lastAt(lips), Jp = lastAt(jaw, 1), Tp = lastAt(teeth, 1), Lp = lastAt(lips, 1);
    state.minCandles = 20;
    state.values = { jaw: J, teeth: T, lips: L };
    state.labels = { A: "Линии раскрыты вверх", B: "Линии раскрыты вниз", C: "Lips выше Teeth", D: "Lips ниже Teeth", E: "Lips пересекает Teeth вверх", F: "Lips пересекает Teeth вниз", G: "Линии переплетены", Q: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return L > T && T > J;
      if (code === "B") return L < T && T < J;
      if (code === "C") return L > T;
      if (code === "D") return L < T;
      if (code === "E") return crossUp(Lp, Tp, L, T);
      if (code === "F") return crossDown(Lp, Tp, L, T);
      if (code === "G") return Math.max(J, T, L) - Math.min(J, T, L) < Math.abs(close) * 0.0002;
      return false;
    };
    return state;
  }

  if (id === "bulls-power" || id === "bears-power") {
    const ema = emaSeries(closes, n(settings.period, 13));
    const E = lastAt(ema), Ep = lastAt(ema, 1);
    const bulls = highs.map((h, i) => ema[i] === null ? null : h - ema[i]);
    const bears = lows.map((l, i) => ema[i] === null ? null : l - ema[i]);
    const BU = lastAt(bulls), BUp = lastAt(bulls, 1), BE = lastAt(bears), BEp = lastAt(bears, 1);
    state.minCandles = n(settings.period, 13) + 5;
    state.values = { bulls: BU, prevBulls: BUp, bears: BE, prevBears: BEp, ema: E, prevEma: Ep };
    state.labels = { A: "Bulls Power выше нуля", B: "Bears Power ниже нуля", C: "Bulls Power растёт", D: "Bears Power падает", E: "Bears Power растёт к нулю", F: "Bulls Power падает к нулю", Q: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return BU > 0;
      if (code === "B") return BE < 0;
      if (code === "C") return BU > BUp;
      if (code === "D") return BE < BEp;
      if (code === "E") return BE > BEp;
      if (code === "F") return BU < BUp;
      return false;
    };
    return state;
  }

  if (id === "fractals") {
    let upper = null, lower = null, upperTime = null, lowerTime = null;
    for (let i = 2; i < candles.length - 2; i++) {
      if (n(candles[i].high) > n(candles[i - 1].high) && n(candles[i].high) > n(candles[i - 2].high) && n(candles[i].high) > n(candles[i + 1].high) && n(candles[i].high) > n(candles[i + 2].high)) { upper = n(candles[i].high); upperTime = candles[i].openTime; }
      if (n(candles[i].low) < n(candles[i - 1].low) && n(candles[i].low) < n(candles[i - 2].low) && n(candles[i].low) < n(candles[i + 1].low) && n(candles[i].low) < n(candles[i + 2].low)) { lower = n(candles[i].low); lowerTime = candles[i].openTime; }
    }
    state.minCandles = 10;
    state.values = { upperFractal: upper, lowerFractal: lower, upperTime, lowerTime, close, prevClose };
    state.labels = { A: "Цена выше последнего верхнего фрактала", B: "Цена ниже последнего нижнего фрактала", C: "Пробой верхнего фрактала", D: "Пробой нижнего фрактала", Q: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return upper !== null && close > upper;
      if (code === "B") return lower !== null && close < lower;
      if (code === "C") return upper !== null && prevClose <= upper && close > upper;
      if (code === "D") return lower !== null && prevClose >= lower && close < lower;
      return false;
    };
    return state;
  }

  if (id === "ichimoku") {
    const tenkanP = n(settings.tenkan, 9), kijunP = n(settings.kijun, 26), spanBP = n(settings.spanB, 52);
    const line = p => candles.map((_, i) => i + 1 >= p ? (highest(prop(candles.slice(i + 1 - p, i + 1), "high")) + lowest(prop(candles.slice(i + 1 - p, i + 1), "low"))) / 2 : null);
    const tenkan = line(tenkanP), kijun = line(kijunP), spanB = line(spanBP);
    const T = lastAt(tenkan), K = lastAt(kijun), Tp = lastAt(tenkan, 1), Kp = lastAt(kijun, 1), B = lastAt(spanB);
    const spanA = (T + K) / 2;
    state.minCandles = spanBP + 5;
    state.values = { tenkan: T, kijun: K, spanA, spanB: B, close };
    state.labels = { A: "Tenkan выше Kijun", B: "Tenkan ниже Kijun", C: "Tenkan пересекает Kijun вверх", D: "Tenkan пересекает Kijun вниз", E: "Цена выше облака", F: "Цена ниже облака", Q: "Не открывать сделку" };
    state.eval = code => {
      const cloudTop = Math.max(spanA, B), cloudBottom = Math.min(spanA, B);
      if (code === "A") return T > K;
      if (code === "B") return T < K;
      if (code === "C") return crossUp(Tp, Kp, T, K);
      if (code === "D") return crossDown(Tp, Kp, T, K);
      if (code === "E") return close > cloudTop;
      if (code === "F") return close < cloudBottom;
      return false;
    };
    return state;
  }

  if (id === "zig-zag") {
    state.minCandles = 20;
    state.values = { close, prevClose };
    state.labels = { A: "Цена растёт относительно прошлой свечи", B: "Цена падает относительно прошлой свечи", Q: "Не открывать сделку" };
    state.eval = code => {
      if (code === "A") return close > prevClose;
      if (code === "B") return close < prevClose;
      return false;
    };
    return state;
  }

  state.values = { close, prevClose };
  state.labels = { A: "Цена выше прошлой свечи", B: "Цена ниже прошлой свечи", Q: "Не открывать сделку" };
  state.eval = code => code === "A" ? close > prevClose : (code === "B" ? close < prevClose : false);
  return state;
}

function defaultRulesFor(id) {
  const map = {
    "macd": { buy: ["N"], sell: ["K"], confirmBuy: ["A"], confirmSell: ["D"] },
    "osma": { buy: ["C"], sell: ["D"], confirmBuy: ["A"], confirmSell: ["B"] },
    "rsi": { buy: ["A"], sell: ["B"], confirmBuy: ["A"], confirmSell: ["B"] },
    "bollinger-bands": { buy: ["A"], sell: ["B"], confirmBuy: ["C"], confirmSell: ["C"] },
    "bollinger-bands-width": { buy: ["I"], sell: ["I"], confirmBuy: ["I"], confirmSell: ["I"] },
    "moving-average": { buy: ["E"], sell: ["F"], confirmBuy: ["A"], confirmSell: ["B"] },
    "ema": { buy: ["E"], sell: ["F"], confirmBuy: ["A"], confirmSell: ["B"] },
    "sma-cross": { buy: ["E"], sell: ["F"], confirmBuy: ["A"], confirmSell: ["B"] },
    "stochastic": { buy: ["I"], sell: ["J"], confirmBuy: ["E"], confirmSell: ["F"] },
    "cci": { buy: ["E"], sell: ["F"], confirmBuy: ["C"], confirmSell: ["C"] },
    "williams-r": { buy: ["E"], sell: ["F"], confirmBuy: ["C"], confirmSell: ["C"] },
    "demarker": { buy: ["E"], sell: ["F"], confirmBuy: ["C"], confirmSell: ["C"] },
    "adx": { buy: ["A"], sell: ["B"], confirmBuy: ["A"], confirmSell: ["B"] },
    "awesome-oscillator": { buy: ["C"], sell: ["D"], confirmBuy: ["A"], confirmSell: ["B"] },
    "accelerator-oscillator": { buy: ["G"], sell: ["H"], confirmBuy: ["E"], confirmSell: ["F"] },
    "momentum": { buy: ["C"], sell: ["D"], confirmBuy: ["A"], confirmSell: ["B"] },
    "rate-of-change": { buy: ["C"], sell: ["D"], confirmBuy: ["A"], confirmSell: ["B"] },
    "parabolic-sar": { buy: ["C"], sell: ["D"], confirmBuy: ["A"], confirmSell: ["B"] },
    "supertrend": { buy: ["C"], sell: ["D"], confirmBuy: ["A"], confirmSell: ["B"] },
    "aroon": { buy: ["E"], sell: ["F"], confirmBuy: ["A"], confirmSell: ["B"] },
    "vortex": { buy: ["C"], sell: ["D"], confirmBuy: ["A"], confirmSell: ["B"] },
    "donchian-channel": { buy: ["G"], sell: ["H"], confirmBuy: ["B"], confirmSell: ["A"] },
    "keltner-channel": { buy: ["E"], sell: ["F"], confirmBuy: ["C"], confirmSell: ["C"] },
    "envelopes": { buy: ["E"], sell: ["F"], confirmBuy: ["C"], confirmSell: ["C"] },
    "alligator": { buy: ["E"], sell: ["F"], confirmBuy: ["A"], confirmSell: ["B"] },
    "bulls-power": { buy: ["A", "C"], sell: ["F"], confirmBuy: ["C"], confirmSell: ["F"] },
    "bears-power": { buy: ["E"], sell: ["B", "D"], confirmBuy: ["E"], confirmSell: ["D"] },
    "fractals": { buy: ["C"], sell: ["D"], confirmBuy: ["A"], confirmSell: ["B"] },
    "ichimoku": { buy: ["C", "E"], sell: ["D", "F"], confirmBuy: ["A"], confirmSell: ["B"] },
    "zig-zag": { buy: ["A"], sell: ["B"], confirmBuy: ["A"], confirmSell: ["B"] },
    "atr": { buy: ["C"], sell: ["C"], confirmBuy: ["A"], confirmSell: ["A"] }
  };
  return map[id] || { buy: ["A"], sell: ["B"], confirmBuy: ["A"], confirmSell: ["B"] };
}

function ruleListToText(codes, labels) {
  return codes.map(c => `${c}: ${labels[c] || "условие"}`).join(" + ");
}

function analyzeConfiguredIndicator(candlesInput, indicator = {}, options = {}) {
  const id = normalizeId(indicator.id || indicator.indicatorId || indicator.name || "moving-average");
  const settings = indicator.settings || {};
  const name = indicator.name || settings.name || id;
  const symbol = normalizeSymbol(options.symbol || indicator.symbol || candlesInput?.[0]?.symbol || "EURUSD_otc");
  const timeframe = String(indicator.timeframe || settings.timeframe || options.timeframe || CONFIG.signal.defaultTimeframe || "S15").toUpperCase();
  const expirySec = n(indicator.expirySec ?? settings.expirySec ?? options.expirySec ?? CONFIG.autoSignal.expirySec ?? 15, 15);
  const candles = cleanCandles(candlesInput || []);
  const state = buildIndicatorState(id, candles, { ...indicator, id, name, settings });
  const lastCandle = last(candles);
  const need = Number(state.minCandles || 20);

  if (candles.length < need) {
    return {
      ok: true,
      ready: false,
      statusRu: `Недостаточно свечей: ${candles.length}/${need}`,
      id,
      indicator: name,
      symbol,
      timeframe,
      side: "WAIT",
      action: null,
      score: 0,
      maxScore: 100,
      values: makeValues(state.values),
      ruleLabels: state.labels,
      reasons: [`Недостаточно свечей: ${candles.length}/${need}.`],
      lastCandle,
      expirySec
    };
  }

  const defaults = defaultRulesFor(id);
  const mode = evalMode(indicator);
  const buyRules = getRules(indicator, "BUY", "signal", defaults.buy);
  const sellRules = getRules(indicator, "SELL", "signal", defaults.sell);
  const confirmBuyRules = getRules(indicator, "BUY", "confirm", defaults.confirmBuy);
  const confirmSellRules = getRules(indicator, "SELL", "confirm", defaults.confirmSell);

  const allowBuy = String(getSetting(indicator, ["allowBuy", "buyEnabled", "buy", "signalBuy"], true)) !== "false";
  const allowSell = String(getSetting(indicator, ["allowSell", "sellEnabled", "sell", "signalSell"], true)) !== "false";

  const evalRule = code => state.eval(String(code || "").toUpperCase());
  const buySignal = allowBuy && runRules(buyRules, evalRule, mode);
  const sellSignal = allowSell && runRules(sellRules, evalRule, mode);
  const buyConfirm = allowBuy && runRules(confirmBuyRules, evalRule, mode);
  const sellConfirm = allowSell && runRules(confirmSellRules, evalRule, mode);

  let side = "WAIT";
  if (buySignal && !sellSignal) side = "BUY";
  else if (sellSignal && !buySignal) side = "SELL";
  else if (buySignal && sellSignal) side = "WAIT";

  const action = side === "BUY" ? "call" : side === "SELL" ? "put" : null;
  const reasons = [];
  if (buySignal) reasons.push(`Покупка: выполнено ${ruleListToText(buyRules, state.labels)}.`);
  if (sellSignal) reasons.push(`Продажа: выполнено ${ruleListToText(sellRules, state.labels)}.`);
  if (buySignal && sellSignal) reasons.push("Одновременно выполнены покупка и продажа — сигнал не используется, чтобы не открыть кашу.");
  if (!buySignal && !sellSignal) reasons.push("Сигнала нет: условия покупки/продажи не выполнены.");

  return {
    ok: true,
    ready: true,
    statusRu: side === "WAIT" ? "Ожидание сигнала" : "Сигнал найден",
    id,
    indicator: name,
    symbol,
    timeframe,
    side,
    action,
    score: side === "WAIT" ? 0 : 100,
    maxScore: 100,
    confidence: side === "WAIT" ? 0 : 100,
    values: makeValues(state.values),
    ruleLabels: state.labels,
    ruleMode: mode,
    rules: {
      buy: buyRules,
      sell: sellRules,
      confirmBuy: confirmBuyRules,
      confirmSell: confirmSellRules
    },
    signalMatched: { BUY: buySignal, SELL: sellSignal },
    confirmationMatched: { BUY: buyConfirm, SELL: sellConfirm },
    signalSides: [buySignal ? "BUY" : null, sellSignal ? "SELL" : null].filter(Boolean),
    confirmSides: [buyConfirm ? "BUY" : null, sellConfirm ? "SELL" : null].filter(Boolean),
    reasons,
    lastCandle,
    expirySec,
    timeframeSec: tfSeconds(timeframe)
  };
}

function getIndicatorRuleCatalog() {
  const ids = [
    "macd", "osma", "rsi", "bollinger-bands", "bollinger-bands-width", "moving-average", "ema", "stochastic", "cci", "williams-r", "demarker", "adx", "awesome-oscillator", "accelerator-oscillator", "momentum", "rate-of-change", "parabolic-sar", "supertrend", "aroon", "vortex", "donchian-channel", "keltner-channel", "envelopes", "alligator", "bulls-power", "bears-power", "fractals", "ichimoku", "zig-zag", "atr"
  ];
  const dummy = [{ open: 1, high: 1, low: 1, close: 1, openTime: 1, closeTime: 2, isClosed: true }];
  const out = {};
  for (const id of ids) {
    const state = buildIndicatorState(id, dummy, { id, settings: {} });
    out[id] = { defaults: defaultRulesFor(id), rules: state.labels };
  }
  return out;
}

module.exports = {
  analyzeConfiguredIndicator,
  getIndicatorRuleCatalog,
  defaultRulesFor,
  tfSeconds
};
