const CONFIG = require("./config");
const { normalizeSymbol, round } = require("./utils");

function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function last(arr) { return Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null; }
function prop(candles, key) { return candles.map(c => n(c[key], null)).filter(v => v !== null); }
function closedCandles(candles = []) { return (candles || []).filter(c => c && c.isClosed !== false); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function avg(values) { return values.length ? values.reduce((a, b) => a + n(b), 0) / values.length : null; }
function sum(values) { return values.reduce((a, b) => a + n(b), 0); }
function highest(values) { return values.length ? Math.max(...values.map(Number)) : null; }
function lowest(values) { return values.length ? Math.min(...values.map(Number)) : null; }
function crossUp(prevA, prevB, a, b) { return prevA !== null && prevB !== null && a !== null && b !== null && prevA <= prevB && a > b; }
function crossDown(prevA, prevB, a, b) { return prevA !== null && prevB !== null && a !== null && b !== null && prevA >= prevB && a < b; }

function sma(values, period) {
  period = Math.max(1, Number(period || 1));
  if (!Array.isArray(values) || values.length < period) return null;
  return avg(values.slice(-period));
}

function smaSeries(values, period) {
  const out = [];
  for (let i = 0; i < values.length; i++) out.push(i + 1 >= period ? avg(values.slice(i + 1 - period, i + 1)) : null);
  return out;
}

function emaSeries(values, period) {
  period = Math.max(1, Number(period || 1));
  const out = [];
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = n(values[i], null);
    if (v === null) { out.push(null); continue; }
    if (prev === null) prev = i + 1 >= period ? avg(values.slice(i + 1 - period, i + 1)) : v;
    else prev = v * k + prev * (1 - k);
    out.push(i + 1 >= period ? prev : null);
  }
  return out;
}

function smmaSeries(values, period) {
  period = Math.max(1, Number(period || 1));
  const out = [];
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = n(values[i], null);
    if (v === null) { out.push(null); continue; }
    if (i + 1 < period) { out.push(null); continue; }
    if (prev === null) prev = avg(values.slice(i + 1 - period, i + 1));
    else prev = (prev * (period - 1) + v) / period;
    out.push(prev);
  }
  return out;
}

function wmaSeries(values, period) {
  const out = [];
  const denom = period * (period + 1) / 2;
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < period) { out.push(null); continue; }
    const slice = values.slice(i + 1 - period, i + 1);
    let total = 0;
    for (let j = 0; j < slice.length; j++) total += slice[j] * (j + 1);
    out.push(total / denom);
  }
  return out;
}

function maSeries(values, period, method = "SMA") {
  const m = String(method || "SMA").toUpperCase();
  if (m === "EMA") return emaSeries(values, period);
  if (m === "WMA") return wmaSeries(values, period);
  if (m === "SMMA") return smmaSeries(values, period);
  return smaSeries(values, period);
}

function trueRangeSeries(candles) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const h = n(candles[i].high), l = n(candles[i].low), pc = i ? n(candles[i - 1].close) : n(candles[i].close);
    out.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return out;
}

function atrSeries(candles, period = 14) {
  return smmaSeries(trueRangeSeries(candles), period);
}

function std(values) {
  if (!values.length) return null;
  const m = avg(values);
  return Math.sqrt(avg(values.map(v => Math.pow(v - m, 2))));
}

function getSetting(ind, names, fallback) {
  const s = ind?.settings || ind || {};
  const list = Array.isArray(names) ? names : [names];
  for (const key of list) {
    if (s[key] !== undefined && s[key] !== null && s[key] !== "") return s[key];
    if (ind && ind[key] !== undefined && ind[key] !== null && ind[key] !== "") return ind[key];
  }
  const fields = Array.isArray(ind?.fields) ? ind.fields : [];
  for (const f of fields) {
    const label = String(f.label || "").toLowerCase();
    for (const key of list) {
      const k = String(key).toLowerCase();
      if (label.includes(k)) return f.value;
    }
  }
  return fallback;
}

function baseResult({ id, name, symbol, timeframe, ready = true, side = "WAIT", score = 0, maxScore = 100, reasons = [], values = {}, lastCandle = null, expirySec = null }) {
  const action = side === "BUY" ? "call" : (side === "SELL" ? "put" : null);
  return { ok: true, id, indicator: name || id, symbol: normalizeSymbol(symbol), timeframe, ready, side, action, score, maxScore, confidence: score, reasons, values, lastCandle, expirySec };
}

function waitResult(id, name, symbol, timeframe, reason, need = null, have = null) {
  return baseResult({ id, name, symbol, timeframe, ready: have === null || need === null ? false : have >= need, side: "WAIT", score: 0, reasons: [reason], values: { need, have }, lastCandle: null });
}

function needCandles(candles, count, id, name, symbol, timeframe) {
  if ((candles || []).length < count) return waitResult(id, name, symbol, timeframe, `Мало закрытых свечей: ${(candles || []).length}/${count}.`, count, (candles || []).length);
  return null;
}

function rsiSeries(closes, period = 14) {
  const out = Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
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


function conditionCode(value) {
  const m = String(value || "").trim().match(/^([A-Z])/i);
  return m ? m[1].toUpperCase() : "";
}

function hasCustomConditions(ind) {
  const s = ind?.settings || {};
  return !!(s.buyCondition || s.sellCondition || getSetting(ind, "buyCondition", "") || getSetting(ind, "sellCondition", ""));
}

function chooseSideByConditions(ind, checkBuy, checkSell) {
  const buyCond = ind?.settings?.buyCondition || getSetting(ind, "buyCondition", "");
  const sellCond = ind?.settings?.sellCondition || getSetting(ind, "sellCondition", "");
  const buyCode = conditionCode(buyCond);
  const sellCode = conditionCode(sellCond);
  const buy = buyCode && !["Q"].includes(buyCode) ? checkBuy(buyCode) : false;
  const sell = sellCode && !["Q"].includes(sellCode) ? checkSell(sellCode) : false;
  if (buy && !sell) return { side: "BUY", reason: `Условие покупки ${buyCode} совпало.` };
  if (sell && !buy) return { side: "SELL", reason: `Условие продажи ${sellCode} совпало.` };
  if (buy && sell) return { side: "WAIT", reason: `Конфликт условий: покупка ${buyCode} и продажа ${sellCode} совпали одновременно.` };
  return { side: "WAIT", reason: "Выбранные условия не совпали." };
}

function pickIndex(arr, idx) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const i = Math.max(0, Math.min(arr.length - 1, idx));
  return arr[i];
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

function aroon(candles, period = 14) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    if (i + 1 < period) { out.push({ up: null, down: null }); continue; }
    const slice = candles.slice(i + 1 - period, i + 1);
    let hiIndex = 0, loIndex = 0;
    for (let j = 1; j < slice.length; j++) {
      if (n(slice[j].high) >= n(slice[hiIndex].high)) hiIndex = j;
      if (n(slice[j].low) <= n(slice[loIndex].low)) loIndex = j;
    }
    const periodsSinceHigh = period - 1 - hiIndex;
    const periodsSinceLow = period - 1 - loIndex;
    out.push({ up: ((period - periodsSinceHigh) / period) * 100, down: ((period - periodsSinceLow) / period) * 100 });
  }
  return out;
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

function vortexSeries(candles, period = 14) {
  const plus = [0], minus = [0], tr = trueRangeSeries(candles);
  for (let i = 1; i < candles.length; i++) {
    plus.push(Math.abs(n(candles[i].high) - n(candles[i - 1].low)));
    minus.push(Math.abs(n(candles[i].low) - n(candles[i - 1].high)));
  }
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    if (i + 1 < period) { out.push({ plus: null, minus: null }); continue; }
    const trSum = sum(tr.slice(i + 1 - period, i + 1));
    out.push({ plus: trSum ? sum(plus.slice(i + 1 - period, i + 1)) / trSum : null, minus: trSum ? sum(minus.slice(i + 1 - period, i + 1)) / trSum : null });
  }
  return out;
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

function parabolicSar(candles, step = 0.02, maxStep = 0.2) {
  if (candles.length < 3) return [];
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
      } else if (n(candles[i].high) > ep) { ep = n(candles[i].high); af = Math.min(maxStep, af + step); }
    } else {
      sar = Math.max(sar, n(candles[i - 1].high), n(candles[i - 2].high));
      if (n(candles[i].high) > sar) {
        up = true; sar = ep; ep = n(candles[i].high); af = step;
      } else if (n(candles[i].low) < ep) { ep = n(candles[i].low); af = Math.min(maxStep, af + step); }
    }
    out[i] = sar;
  }
  return out;
}

function superTrend(candles, period = 10, mult = 3) {
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

function analyzeMovingAverage(candles, ind, symbol, timeframe) {
  const closes = prop(candles, "close");
  const lines = Array.isArray(ind.settings?.maLines) && ind.settings.maLines.length ? ind.settings.maLines : [
    { method: getSetting(ind, "method1", "EMA"), period: n(getSetting(ind, ["fast", "быстрый период", "period1"], 5), 5) },
    { method: getSetting(ind, "method2", "EMA"), period: n(getSetting(ind, ["slow", "медленный период", "period2"], 10), 10) }
  ];
  const maxP = Math.max(...lines.map(x => n(x.period, 1))) + 4;
  const missing = needCandles(candles, maxP, ind.id, ind.name, symbol, timeframe); if (missing) return missing;
  const series = lines.map(x => maSeries(closes, n(x.period, 5), x.method || "EMA"));
  const barShift = Math.max(0, n(getSetting(ind, "barShift", 0), 0));
  const idx = Math.max(1, closes.length - 1 - barShift);

  let buy = 0, sell = 0; const reasons = [];
  for (let i = 0; i < series.length - 1; i++) {
    const a = series[i], b = series[i + 1];
    const A = pickIndex(a, idx), B = pickIndex(b, idx), Ap = pickIndex(a, idx - 1), Bp = pickIndex(b, idx - 1);
    if (crossUp(Ap, Bp, A, B)) { buy += 2; reasons.push(`Средняя ${i + 1} пересекла среднюю ${i + 2} вверх.`); }
    if (crossDown(Ap, Bp, A, B)) { sell += 2; reasons.push(`Средняя ${i + 1} пересекла среднюю ${i + 2} вниз.`); }
    if (A > B) buy += 1; else if (A < B) sell += 1;
  }
  const close = pickIndex(closes, idx), main = pickIndex(series[0], idx), prevClose = pickIndex(closes, idx - 1), prevMain = pickIndex(series[0], idx - 1);
  if (series.length === 1) { if (close > main) buy += 1; if (close < main) sell += 1; }

  let side = buy > sell ? "BUY" : (sell > buy ? "SELL" : "WAIT");
  if (hasCustomConditions(ind)) {
    const fast = series[0], slow = series[1] || series[0];
    const F = pickIndex(fast, idx), S = pickIndex(slow, idx), Fp = pickIndex(fast, idx - 1), Sp = pickIndex(slow, idx - 1);
    const check = code => {
      if (code === "A" || code === "B") return crossUp(Fp, Sp, F, S);   // fast crosses slow up
      if (code === "C" || code === "D") return crossDown(Fp, Sp, F, S); // fast crosses slow down
      if (code === "E" || code === "F") return prevClose < prevMain && close > main; // price crosses main MA up
      if (code === "G" || code === "H") return prevClose > prevMain && close < main; // price crosses main MA down
      return false;
    };
    const chosen = chooseSideByConditions(ind, check, check);
    side = chosen.side;
    reasons.unshift(chosen.reason);
  }

  return baseResult({ id: ind.id, name: ind.name, symbol, timeframe, side, score: side === "WAIT" ? 0 : clamp(Math.max(buy, sell, 2) * 25, 55, 95), reasons: reasons.length ? reasons : [`Средние дают ${side}.`], values: { buy, sell, barShift, lines: lines.map((x, i) => ({ ...x, value: round(pickIndex(series[i], idx)) })) }, lastCandle: candles[idx] || last(candles), expirySec: ind.expirySec });
}

function analyzeIndicator(candlesInput, indicator = {}, options = {}) {
  const id = String(indicator.id || indicator.indicatorId || indicator.name || "moving-average").toLowerCase();
  const name = indicator.name || id;
  const timeframe = String(indicator.timeframe || indicator.settings?.timeframe || options.timeframe || CONFIG.signal.defaultTimeframe).toUpperCase();
  const symbol = normalizeSymbol(options.symbol || indicator.symbol || candlesInput?.[0]?.symbol || "EURUSD_otc");
  const expirySec = n(indicator.expirySec || indicator.settings?.expirySec || options.expirySec || 15, 15);
  const ind = { ...indicator, id, name, expirySec };
  const period = n(getSetting(ind, ["period", "основной период"], 14), 14);
  let missing;

  let candles = closedCandles(candlesInput || []);

  // MA handles barShift internally via idx offset
  if (id === "moving-average" || id === "sma_cross" || id === "sma-cross") return analyzeMovingAverage(candles, ind, symbol, timeframe);

  // Global barShift: trim candles so all indicators evaluate N candles in the past.
  // barShift=0 → current candle, barShift=1 → previous candle, etc.
  // Cross-based conditions (e.g. Rp < 30 && R >= 30) are naturally one-shot —
  // they fire only on the exact candle of the event, never on later candles.
  const barShift = Math.max(0, n(getSetting(ind, ["barShift", "barCheck"], 0)));
  if (barShift > 0 && candles.length > barShift + 5) candles = candles.slice(0, candles.length - barShift);

  const closes = prop(candles, "close");
  const highs = prop(candles, "high"), lows = prop(candles, "low");
  const lc = last(candles);
  const c = last(closes), cp = closes[closes.length - 2];

  if (["rsi", "cci", "demarker", "macd", "osma", "stochastic", "williams-r", "schaff-trend-cycle"].includes(id)) {
    missing = needCandles(candles, Math.max(35, period + 5), id, name, symbol, timeframe); if (missing) return missing;
  } else {
    missing = needCandles(candles, Math.max(20, period + 3), id, name, symbol, timeframe); if (missing) return missing;
  }

  let side = "WAIT", score = 0, reasons = [], values = {};

  if (id === "rsi") {
    const overbought = n(getSetting(ind, "overbought", 70), 70), oversold = n(getSetting(ind, "oversold", 30), 30);
    const r = rsiSeries(closes, period); const R = last(r), Rp = r[r.length - 2];
    if (Rp < oversold && R >= oversold) { side = "BUY"; score = 82; reasons.push(`RSI вышел из перепроданности ${oversold} вверх.`); }
    else if (Rp > overbought && R <= overbought) { side = "SELL"; score = 82; reasons.push(`RSI вышел из перекупленности ${overbought} вниз.`); }
    else if (R < oversold && R > Rp) { side = "BUY"; score = 62; reasons.push(`RSI ниже ${oversold}, но начал расти.`); }
    else if (R > overbought && R < Rp) { side = "SELL"; score = 62; reasons.push(`RSI выше ${overbought}, но начал падать.`); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return Rp < 30 && R >= 30;   // crosses 30 up
        if (code === "C" || code === "D") return Rp > 30 && R <= 30;   // crosses 30 down
        if (code === "E" || code === "F") return Rp < 50 && R >= 50;   // crosses 50 up
        if (code === "G" || code === "H") return Rp > 50 && R <= 50;   // crosses 50 down
        if (code === "I" || code === "J") return Rp < 70 && R >= 70;   // crosses 70 up
        if (code === "K" || code === "L") return Rp > 70 && R <= 70;   // crosses 70 down
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 80; reasons.unshift(chosen.reason);
    }
    values = { rsi: round(R), prev: round(Rp), overbought, oversold };
  }

  else if (id === "cci") {
    const cc = cciSeries(candles, period); const C = last(cc), Cp = cc[cc.length - 2];
    if (Cp < -100 && C >= -100) { side = "BUY"; score = 80; reasons.push("CCI вышел из зоны ниже -100 вверх."); }
    else if (Cp > 100 && C <= 100) { side = "SELL"; score = 80; reasons.push("CCI вышел из зоны выше +100 вниз."); }
    else if (C > 100) { side = "BUY"; score = 58; reasons.push("CCI выше +100: сильный покупательский импульс."); }
    else if (C < -100) { side = "SELL"; score = 58; reasons.push("CCI ниже -100: сильный продавцовский импульс."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return Cp < -100 && C >= -100;  // crosses -100 up
        if (code === "C" || code === "D") return Cp > -100 && C <= -100;  // crosses -100 down
        if (code === "E" || code === "F") return Cp < 0 && C >= 0;        // crosses 0 up
        if (code === "G" || code === "H") return Cp > 0 && C <= 0;        // crosses 0 down
        if (code === "I" || code === "J") return Cp < 100 && C >= 100;    // crosses +100 up
        if (code === "K" || code === "L") return Cp > 100 && C <= 100;    // crosses +100 down
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 80; reasons.unshift(chosen.reason);
    }
    values = { cci: round(C), prev: round(Cp) };
  }

  else if (id === "demarker") {
    const d = deMarkerSeries(candles, period); const D = last(d), Dp = d[d.length - 2];
    if (Dp < 0.3 && D >= 0.3) { side = "BUY"; score = 80; reasons.push("DeMarker вышел из зоны ниже 0.3 вверх."); }
    else if (Dp > 0.7 && D <= 0.7) { side = "SELL"; score = 80; reasons.push("DeMarker вышел из зоны выше 0.7 вниз."); }
    else if (D < 0.3 && D > Dp) { side = "BUY"; score = 60; reasons.push("DeMarker в перепроданности и растёт."); }
    else if (D > 0.7 && D < Dp) { side = "SELL"; score = 60; reasons.push("DeMarker в перекупленности и падает."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return Dp < 0.3 && D >= 0.3;
        if (code === "C" || code === "D") return Dp > 0.3 && D <= 0.3;
        if (code === "E" || code === "F") return Dp < 0.5 && D >= 0.5;
        if (code === "G" || code === "H") return Dp > 0.5 && D <= 0.5;
        if (code === "I" || code === "J") return Dp < 0.7 && D >= 0.7;
        if (code === "K" || code === "L") return Dp > 0.7 && D <= 0.7;
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 80; reasons.unshift(chosen.reason);
    }
    values = { demarker: round(D, 4), prev: round(Dp, 4) };
  }

  else if (id === "macd" || id === "osma") {
    const fast = n(getSetting(ind, "fast", 12), 12), slow = n(getSetting(ind, "slow", 26), 26), sigP = n(getSetting(ind, "signal", 9), 9);
    const m = macdSeries(closes, fast, slow, sigP); const M = last(m.macd), S = last(m.signal), H = last(m.hist); const Mp = m.macd[m.macd.length - 2], Sp = m.signal[m.signal.length - 2], Hp = m.hist[m.hist.length - 2];
    if (id === "macd") {
      if (crossUp(Mp, Sp, M, S)) { side = "BUY"; score = 84; reasons.push("MACD пересёк сигнальную линию снизу вверх."); }
      else if (crossDown(Mp, Sp, M, S)) { side = "SELL"; score = 84; reasons.push("MACD пересёк сигнальную линию сверху вниз."); }
      else if (M > S && H > Hp) { side = "BUY"; score = 60; reasons.push("MACD выше сигнальной, гистограмма усиливается."); }
      else if (M < S && H < Hp) { side = "SELL"; score = 60; reasons.push("MACD ниже сигнальной, гистограмма усиливается вниз."); }
    } else {
      if (Hp <= 0 && H > 0) { side = "BUY"; score = 82; reasons.push("OsMA пересекла ноль вверх."); }
      else if (Hp >= 0 && H < 0) { side = "SELL"; score = 82; reasons.push("OsMA пересекла ноль вниз."); }
      else if (H > 0 && H > Hp) { side = "BUY"; score = 58; reasons.push("OsMA положительная и растёт."); }
      else if (H < 0 && H < Hp) { side = "SELL"; score = 58; reasons.push("OsMA отрицательная и падает."); }
    }
    if (id === "macd" && hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return crossUp(Mp, Sp, M, S);
        if (code === "C" || code === "D") return crossUp(Mp, Sp, M, S) && M > 0 && S > 0;
        if (code === "E" || code === "F") return crossUp(Mp, Sp, M, S) && M < 0 && S < 0;
        if (code === "G" || code === "H") return crossDown(Mp, Sp, M, S);
        if (code === "I" || code === "J") return crossDown(Mp, Sp, M, S) && M > 0 && S > 0;
        if (code === "K" || code === "L") return crossDown(Mp, Sp, M, S) && M < 0 && S < 0;
        if (code === "M" || code === "N") return M > S && H > Hp;
        if (code === "O" || code === "P") return M < S && H < Hp;
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 84; reasons.unshift(chosen.reason);
    }
    if (id === "osma" && hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return Hp <= 0 && H > 0;
        if (code === "C" || code === "D") return Hp >= 0 && H < 0;
        if (code === "E" || code === "F") return H > Hp;
        if (code === "G" || code === "H") return H < Hp;
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 82; reasons.unshift(chosen.reason);
    }
    values = { macd: round(M), signal: round(S), hist: round(H), prevHist: round(Hp) };
  }

  else if (id === "stochastic") {
    const kP = n(getSetting(ind, "kPeriod", 14), 14), dP = n(getSetting(ind, "dPeriod", 3), 3), sm = n(getSetting(ind, "smooth", 3), 3);
    const s = stochasticSeries(candles, kP, dP, sm); const K = last(s.k), D = last(s.d), Kp = s.k[s.k.length - 2], Dp = s.d[s.d.length - 2];
    if (crossUp(Kp, Dp, K, D) && K < 35) { side = "BUY"; score = 84; reasons.push("Stochastic пересёк вверх в нижней зоне."); }
    else if (crossDown(Kp, Dp, K, D) && K > 65) { side = "SELL"; score = 84; reasons.push("Stochastic пересёк вниз в верхней зоне."); }
    else if (K < 20 && K > Kp) { side = "BUY"; score = 60; reasons.push("Stochastic в перепроданности и разворачивается вверх."); }
    else if (K > 80 && K < Kp) { side = "SELL"; score = 60; reasons.push("Stochastic в перекупленности и разворачивается вниз."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return crossUp(Kp, Dp, K, D) && K < 20;
        if (code === "C" || code === "D") return crossDown(Kp, Dp, K, D) && K < 20;
        if (code === "E" || code === "F") return crossUp(Kp, Dp, K, D) && K >= 20 && K <= 80;
        if (code === "G" || code === "H") return crossDown(Kp, Dp, K, D) && K >= 20 && K <= 80;
        if (code === "I" || code === "J") return crossUp(Kp, Dp, K, D) && K > 80;
        if (code === "K" || code === "L") return crossDown(Kp, Dp, K, D) && K > 80;
        if (code === "M" || code === "N") return Kp < 20 && K >= 20;
        if (code === "O" || code === "P") return Kp > 80 && K <= 80;
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 84; reasons.unshift(chosen.reason);
    }
    values = { k: round(K), d: round(D), prevK: round(Kp), prevD: round(Dp) };
  }

  else if (id === "williams-r") {
    const out = [];
    for (let i = 0; i < candles.length; i++) {
      if (i + 1 < period) { out.push(null); continue; }
      const slice = candles.slice(i + 1 - period, i + 1); const hh = highest(prop(slice, "high")); const ll = lowest(prop(slice, "low"));
      out.push(hh === ll ? -50 : -100 * (hh - n(candles[i].close)) / (hh - ll));
    }
    const W = last(out), Wp = out[out.length - 2];
    if (Wp < -80 && W >= -80) { side = "BUY"; score = 80; reasons.push("Williams %R вышел из зоны ниже -80 вверх."); }
    else if (Wp > -20 && W <= -20) { side = "SELL"; score = 80; reasons.push("Williams %R вышел из зоны выше -20 вниз."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return Wp < -80 && W >= -80;
        if (code === "C" || code === "D") return Wp > -80 && W <= -80;
        if (code === "E" || code === "F") return Wp < -50 && W >= -50;
        if (code === "G" || code === "H") return Wp > -50 && W <= -50;
        if (code === "I" || code === "J") return Wp < -20 && W >= -20;
        if (code === "K" || code === "L") return Wp > -20 && W <= -20;
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 80; reasons.unshift(chosen.reason);
    }
    values = { williamsR: round(W), prev: round(Wp) };
  }

  else if (id === "schaff-trend-cycle") {
    const stcFast = n(getSetting(ind, "fast", 23), 23), stcSlow = n(getSetting(ind, "slow", 50), 50), stcSig = n(getSetting(ind, "period", 10), 10);
    const m = macdSeries(closes, stcFast, stcSlow, stcSig); const macd = m.macd.map(v => v ?? 0);
    const st = stochasticSeries(candles.map((c, i) => ({...c, high: macd[i], low: macd[i], close: macd[i]})), 10, 3, 3);
    const S = last(st.k), Sp = st.k[st.k.length - 2];
    if (Sp < 20 && S >= 20) { side = "BUY"; score = 82; reasons.push("STC вышел из нижней зоны вверх."); }
    else if (Sp > 80 && S <= 80) { side = "SELL"; score = 82; reasons.push("STC вышел из верхней зоны вниз."); }
    else if (S > Sp && S < 50) { side = "BUY"; score = 58; reasons.push("STC растёт после нижней зоны."); }
    else if (S < Sp && S > 50) { side = "SELL"; score = 58; reasons.push("STC падает после верхней зоны."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return Sp < 20 && S >= 20;
        if (code === "C" || code === "D") return Sp > 20 && S <= 20;
        if (code === "E" || code === "F") return Sp < 80 && S >= 80;
        if (code === "G" || code === "H") return Sp > 80 && S <= 80;
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 82; reasons.unshift(chosen.reason);
    }
    values = { stc: round(S), prev: round(Sp) };
  }

  else if (id === "alligator") {
    const jawP = n(getSetting(ind, "jawPeriod", 13), 13), teethP = n(getSetting(ind, "teethPeriod", 8), 8), lipsP = n(getSetting(ind, "lipsPeriod", 5), 5);
    const jaw = smmaSeries(closes, jawP), teeth = smmaSeries(closes, teethP), lips = smmaSeries(closes, lipsP);
    const L = last(lips), T = last(teeth), J = last(jaw), Lp = lips[lips.length - 2], Tp = teeth[teeth.length - 2], Jp = jaw[jaw.length - 2];
    if (L > T && T > J && L > Lp && T >= Tp) { side = "BUY"; score = 78; reasons.push("Lips выше Teeth выше Jaws: раскрытие вверх."); }
    else if (L < T && T < J && L < Lp && T <= Tp) { side = "SELL"; score = 78; reasons.push("Lips ниже Teeth ниже Jaws: раскрытие вниз."); }
    else if (crossUp(Lp, Tp, L, T)) { side = "BUY"; score = 62; reasons.push("Lips пересекла Teeth вверх: ранний сигнал."); }
    else if (crossDown(Lp, Tp, L, T)) { side = "SELL"; score = 62; reasons.push("Lips пересекла Teeth вниз: ранний сигнал."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return crossUp(Lp, Tp, L, T) && L > J && T > J;
        if (code === "C" || code === "D") return crossDown(Lp, Tp, L, T) && L < J && T < J;
        if (code === "E" || code === "F") return L > T && T > J && L > Lp;
        if (code === "G" || code === "H") return L < T && T < J && L < Lp;
        if (code === "I" || code === "J") return crossUp(Lp, Tp, L, T);
        if (code === "K" || code === "L") return crossDown(Lp, Tp, L, T);
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 78; reasons.unshift(chosen.reason);
    }
    values = { lips: round(L), teeth: round(T), jaw: round(J), prevLips: round(Lp), prevTeeth: round(Tp), prevJaw: round(Jp) };
  }

  else if (id === "aroon") {
    const a = aroon(candles, period); const A = last(a), Ap = a[a.length - 2];
    if (A.up > A.down && A.up > 70) { side = "BUY"; score = crossUp(Ap.up, Ap.down, A.up, A.down) ? 84 : 66; reasons.push("Aroon Up выше Aroon Down и выше 70."); }
    else if (A.down > A.up && A.down > 70) { side = "SELL"; score = crossUp(Ap.down, Ap.up, A.down, A.up) ? 84 : 66; reasons.push("Aroon Down выше Aroon Up и выше 70."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return crossUp(Ap.up, Ap.down, A.up, A.down);
        if (code === "C" || code === "D") return crossDown(Ap.up, Ap.down, A.up, A.down);
        if (code === "E" || code === "F") return Ap.up < 50 && A.up >= 50;
        if (code === "G" || code === "H") return Ap.up > 50 && A.up <= 50;
        if (code === "I" || code === "J") return Ap.down < 50 && A.down >= 50;
        if (code === "K" || code === "L") return Ap.down > 50 && A.down <= 50;
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 84; reasons.unshift(chosen.reason);
    }
    values = { up: round(A.up), down: round(A.down), prevUp: round(Ap.up), prevDown: round(Ap.down) };
  }

  else if (id === "ichimoku") {
    const tenkanP = n(getSetting(ind, "tenkan", 9), 9), kijunP2 = n(getSetting(ind, "kijun", 26), 26), senkouP = n(getSetting(ind, "senkou", 52), 52);
    missing = needCandles(candles, senkouP + 3, id, name, symbol, timeframe); if (missing) return missing;
    const conv = (i, p) => (highest(highs.slice(i + 1 - p, i + 1)) + lowest(lows.slice(i + 1 - p, i + 1))) / 2;
    const i = candles.length - 1;
    const tenkan = conv(i, tenkanP), kijun = conv(i, kijunP2), spanA = (tenkan + kijun) / 2, spanB = conv(i, senkouP);
    const top = Math.max(spanA, spanB), bottom = Math.min(spanA, spanB);
    if (c > top && tenkan > kijun) { side = "BUY"; score = 76; reasons.push("Цена выше облака, Tenkan выше Kijun."); }
    else if (c < bottom && tenkan < kijun) { side = "SELL"; score = 76; reasons.push("Цена ниже облака, Tenkan ниже Kijun."); }
    if (hasCustomConditions(ind)) {
      const i2 = candles.length - 2;
      const tenkanP = (highest(highs.slice(i2 + 1 - 9, i2 + 1)) + lowest(lows.slice(i2 + 1 - 9, i2 + 1))) / 2;
      const kijunP = (highest(highs.slice(i2 + 1 - 26, i2 + 1)) + lowest(lows.slice(i2 + 1 - 26, i2 + 1))) / 2;
      const check = code => {
        if (code === "A" || code === "B") return crossUp(tenkanP, kijunP, tenkan, kijun);
        if (code === "C" || code === "D") return crossDown(tenkanP, kijunP, tenkan, kijun);
        if (code === "E" || code === "F") return c > top && tenkan > kijun;
        if (code === "G" || code === "H") return c < bottom && tenkan < kijun;
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 76; reasons.unshift(chosen.reason);
    }
    values = { tenkan: round(tenkan), kijun: round(kijun), spanA: round(spanA), spanB: round(spanB), close: round(c) };
  }

  else if (id === "parabolic-sar") {
    const sar = parabolicSar(candles, n(getSetting(ind, "step", 0.02), 0.02), n(getSetting(ind, "max", 0.2), 0.2));
    const S = last(sar), Sp = sar[sar.length - 2];
    if (cp < Sp && c > S) { side = "BUY"; score = 84; reasons.push("Parabolic SAR перешёл под цену."); }
    else if (cp > Sp && c < S) { side = "SELL"; score = 84; reasons.push("Parabolic SAR перешёл над цену."); }
    else if (c > S) { side = "BUY"; score = 58; reasons.push("Цена выше Parabolic SAR."); }
    else if (c < S) { side = "SELL"; score = 58; reasons.push("Цена ниже Parabolic SAR."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return cp < Sp && c > S;   // SAR flipped below price
        if (code === "C" || code === "D") return cp > Sp && c < S;   // SAR flipped above price
        if (code === "E" || code === "F") return c > S;              // SAR below price
        if (code === "G" || code === "H") return c < S;              // SAR above price
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 84; reasons.unshift(chosen.reason);
    }
    values = { sar: round(S), prevSar: round(Sp), close: round(c) };
  }

  else if (id === "supertrend") {
    const st = superTrend(candles, n(getSetting(ind, "period", 10), 10), n(getSetting(ind, "multiplier", 3), 3));
    const S = last(st), Sp = st[st.length - 2];
    if (S.dir === 1 && Sp.dir === -1) { side = "BUY"; score = 86; reasons.push("SuperTrend сменился вверх."); }
    else if (S.dir === -1 && Sp.dir === 1) { side = "SELL"; score = 86; reasons.push("SuperTrend сменился вниз."); }
    else if (S.dir === 1) { side = "BUY"; score = 60; reasons.push("SuperTrend под ценой: тренд вверх."); }
    else if (S.dir === -1) { side = "SELL"; score = 60; reasons.push("SuperTrend над ценой: тренд вниз."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return S.dir === 1 && Sp.dir === -1;  // just turned up
        if (code === "C" || code === "D") return S.dir === -1 && Sp.dir === 1;  // just turned down
        if (code === "E" || code === "F") return S.dir === 1;                   // currently up
        if (code === "G" || code === "H") return S.dir === -1;                  // currently down
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 86; reasons.unshift(chosen.reason);
    }
    values = { line: round(S.line), dir: S.dir, prevDir: Sp.dir };
  }

  else if (id === "vortex") {
    const v = vortexSeries(candles, period); const V = last(v), Vp = v[v.length - 2];
    if (V.plus > V.minus) { side = "BUY"; score = crossUp(Vp.plus, Vp.minus, V.plus, V.minus) ? 82 : 62; reasons.push("+VI выше -VI."); }
    else if (V.minus > V.plus) { side = "SELL"; score = crossUp(Vp.minus, Vp.plus, V.minus, V.plus) ? 82 : 62; reasons.push("-VI выше +VI."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return crossUp(Vp.plus, Vp.minus, V.plus, V.minus);
        if (code === "C" || code === "D") return crossDown(Vp.plus, Vp.minus, V.plus, V.minus);
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 82; reasons.unshift(chosen.reason);
    }
    values = { plusVI: round(V.plus), minusVI: round(V.minus) };
  }

  else if (id === "zig-zag") {
    const depth = n(getSetting(ind, "depth", 12), 12);
    const recentHigh = highest(highs.slice(-depth - 1, -1)), recentLow = lowest(lows.slice(-depth - 1, -1));
    if (c > recentHigh) { side = "BUY"; score = 68; reasons.push("Цена пробила последний значимый максимум ZigZag."); }
    else if (c < recentLow) { side = "SELL"; score = 68; reasons.push("Цена пробила последний значимый минимум ZigZag."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return c > recentHigh;
        if (code === "C" || code === "D") return c < recentLow;
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 68; reasons.unshift(chosen.reason);
    }
    values = { recentHigh: round(recentHigh), recentLow: round(recentLow), close: round(c) };
  }

  else if (id === "atr") {
    const atr = atrSeries(candles, period); const A = last(atr), Ap = atr[atr.length - 2], avgAtr = sma(atr.filter(v => v !== null), period) || A;
    if (A > avgAtr && A > Ap && c > cp) { side = "BUY"; score = 56; reasons.push("ATR растёт, последняя свеча вверх: импульс покупки."); }
    else if (A > avgAtr && A > Ap && c < cp) { side = "SELL"; score = 56; reasons.push("ATR растёт, последняя свеча вниз: импульс продажи."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return A > Ap && c > cp;   // rising ATR, bullish candle
        if (code === "C" || code === "D") return A > Ap && c < cp;   // rising ATR, bearish candle
        if (code === "E" || code === "F") return A < Ap && c > cp;   // falling ATR, bullish candle
        if (code === "G" || code === "H") return A < Ap && c < cp;   // falling ATR, bearish candle
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 56; reasons.unshift(chosen.reason);
    }
    values = { atr: round(A), prev: round(Ap), avgAtr: round(avgAtr) };
  }

  else if (id === "bollinger-bands" || id === "bollinger-bands-width") {
    const p = n(getSetting(ind, "period", 20), 20), dev = n(getSetting(ind, "deviation", 2), 2);
    missing = needCandles(candles, p + 3, id, name, symbol, timeframe); if (missing) return missing;
    const mid = smaSeries(closes, p); const upper = [], lower = [], width = [];
    for (let i = 0; i < closes.length; i++) {
      if (i + 1 < p) { upper.push(null); lower.push(null); width.push(null); continue; }
      const sd = std(closes.slice(i + 1 - p, i + 1)); upper.push(mid[i] + dev * sd); lower.push(mid[i] - dev * sd); width.push(mid[i] ? (upper[i] - lower[i]) / mid[i] : null);
    }
    const U = last(upper), L = last(lower), M = last(mid), Up = upper[upper.length - 2], Lp = lower[lower.length - 2], W = last(width), Wp = width[width.length - 2];
    if (id === "bollinger-bands") {
      if (cp < Lp && c > L) { side = "BUY"; score = 82; reasons.push("Цена вернулась выше нижней Bollinger Band."); }
      else if (cp > Up && c < U) { side = "SELL"; score = 82; reasons.push("Цена вернулась ниже верхней Bollinger Band."); }
      else if (c > U) { side = "BUY"; score = 58; reasons.push("Пробой верхней Bollinger Band: импульс вверх."); }
      else if (c < L) { side = "SELL"; score = 58; reasons.push("Пробой нижней Bollinger Band: импульс вниз."); }
    } else {
      if (W > Wp && c > M) { side = "BUY"; score = 55; reasons.push("Ширина Bollinger растёт, цена выше средней."); }
      else if (W > Wp && c < M) { side = "SELL"; score = 55; reasons.push("Ширина Bollinger растёт, цена ниже средней."); }
    }
    if (hasCustomConditions(ind)) {
      const checkBB = code => {
        if (code === "A" || code === "B") return cp < L && c > L;        // price crosses lower up (bounce)
        if (code === "C" || code === "D") return cp > L && c < L;        // price crosses lower down (breakdown)
        if (code === "E" || code === "F") return cp < M && c > M;        // price crosses middle up
        if (code === "G" || code === "H") return cp > M && c < M;        // price crosses middle down
        if (code === "I" || code === "J") return cp < U && c > U;        // price crosses upper up (breakout)
        if (code === "K" || code === "L") return cp > U && c < U;        // price crosses upper down (rejection)
        return false;
      };
      const checkBBW = code => {
        if (code === "A" || code === "B") return W > Wp && c > cp;       // width growing, bullish
        if (code === "C" || code === "D") return W > Wp && c < cp;       // width growing, bearish
        if (code === "E" || code === "F") return W < Wp && c > cp;       // width shrinking, bullish
        if (code === "G" || code === "H") return W < Wp && c < cp;       // width shrinking, bearish
        return false;
      };
      const checkFn = id === "bollinger-bands" ? checkBB : checkBBW;
      const chosen = chooseSideByConditions(ind, checkFn, checkFn);
      side = chosen.side; score = side === "WAIT" ? 0 : 76; reasons.unshift(chosen.reason);
    }
    values = { upper: round(U), middle: round(M), lower: round(L), width: round(W), prevWidth: round(Wp) };
  }

  else if (id === "donchian-channel") {
    const p = n(getSetting(ind, "period", 20), 20); missing = needCandles(candles, p + 2, id, name, symbol, timeframe); if (missing) return missing;
    const prevSlice = candles.slice(-p - 1, -1); const U = highest(prop(prevSlice, "high")), L = lowest(prop(prevSlice, "low"));
    if (c > U) { side = "BUY"; score = 76; reasons.push("Цена закрылась выше верхней границы Donchian."); }
    else if (c < L) { side = "SELL"; score = 76; reasons.push("Цена закрылась ниже нижней границы Donchian."); }
    if (hasCustomConditions(ind)) {
      const prevC = closes[closes.length - 2];
      const check = code => {
        if (code === "A" || code === "B") return c > U;                // breakout above upper
        if (code === "C" || code === "D") return c < L;                // breakout below lower
        if (code === "E" || code === "F") return prevC > U && c < U;   // rejection from upper
        if (code === "G" || code === "H") return prevC < L && c > L;   // bounce from lower
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 76; reasons.unshift(chosen.reason);
    }
    values = { upper: round(U), lower: round(L), close: round(c) };
  }

  else if (id === "envelopes") {
    const p = n(getSetting(ind, "period", 14), 14), dev = n(getSetting(ind, "deviation", 0.2), 0.2) / 100;
    const mid = smaSeries(closes, p); const M = last(mid), Mp = mid[mid.length - 2]; const U = M * (1 + dev), L = M * (1 - dev), Up = Mp * (1 + dev), Lp = Mp * (1 - dev);
    if (cp < Lp && c > L) { side = "BUY"; score = 76; reasons.push("Цена вернулась внутрь канала Envelopes от нижней границы."); }
    else if (cp > Up && c < U) { side = "SELL"; score = 76; reasons.push("Цена вернулась внутрь канала Envelopes от верхней границы."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return cp < L && c > L;
        if (code === "C" || code === "D") return cp > L && c < L;
        if (code === "E" || code === "F") return cp < M && c > M;
        if (code === "G" || code === "H") return cp > M && c < M;
        if (code === "I" || code === "J") return cp < U && c > U;
        if (code === "K" || code === "L") return cp > U && c < U;
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 76; reasons.unshift(chosen.reason);
    }
    values = { upper: round(U), middle: round(M), lower: round(L) };
  }

  else if (id === "keltner-channel") {
    const p = n(getSetting(ind, "period", 20), 20), mult = n(getSetting(ind, "multiplier", 2), 2);
    const mid = emaSeries(closes, p), atr = atrSeries(candles, p); const M = last(mid), A = last(atr), Mp = mid[mid.length - 2], Ap = atr[atr.length - 2];
    const U = M + mult * A, L = M - mult * A, Up = Mp + mult * Ap, Lp = Mp - mult * Ap;
    if (cp < Lp && c > L) { side = "BUY"; score = 76; reasons.push("Цена вернулась внутрь Keltner от нижней границы."); }
    else if (cp > Up && c < U) { side = "SELL"; score = 76; reasons.push("Цена вернулась внутрь Keltner от верхней границы."); }
    else if (c > U) { side = "BUY"; score = 58; reasons.push("Цена выше верхнего Keltner: импульс вверх."); }
    else if (c < L) { side = "SELL"; score = 58; reasons.push("Цена ниже нижнего Keltner: импульс вниз."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return cp < L && c > L;
        if (code === "C" || code === "D") return cp > L && c < L;
        if (code === "E" || code === "F") return cp < M && c > M;
        if (code === "G" || code === "H") return cp > M && c < M;
        if (code === "I" || code === "J") return cp < U && c > U;
        if (code === "K" || code === "L") return cp > U && c < U;
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 76; reasons.unshift(chosen.reason);
    }
    values = { upper: round(U), middle: round(M), lower: round(L), atr: round(A) };
  }

  else if (id === "awesome-oscillator" || id === "accelerator-oscillator") {
    const median = candles.map(c => (n(c.high) + n(c.low)) / 2);
    const ao = median.map((_, i) => {
      const fast = i + 1 >= 5 ? avg(median.slice(i - 4, i + 1)) : null;
      const slow = i + 1 >= 34 ? avg(median.slice(i - 33, i + 1)) : null;
      return fast !== null && slow !== null ? fast - slow : null;
    });
    const aoFill = ao.map(v => v ?? 0); const ac = ao.map((v, i) => v === null ? null : v - (sma(aoFill.slice(0, i + 1), 5) || 0));
    const arr = id === "awesome-oscillator" ? ao : ac; const V = last(arr), Vp = arr[arr.length - 2];
    if (Vp <= 0 && V > 0) { side = "BUY"; score = 80; reasons.push((id === "awesome-oscillator" ? "AO" : "AC") + " пересёк ноль вверх."); }
    else if (Vp >= 0 && V < 0) { side = "SELL"; score = 80; reasons.push((id === "awesome-oscillator" ? "AO" : "AC") + " пересёк ноль вниз."); }
    else if (V > 0 && V > Vp) { side = "BUY"; score = 58; reasons.push((id === "awesome-oscillator" ? "AO" : "AC") + " положительный и растёт."); }
    else if (V < 0 && V < Vp) { side = "SELL"; score = 58; reasons.push((id === "awesome-oscillator" ? "AO" : "AC") + " отрицательный и падает."); }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (id === "awesome-oscillator") {
          if (code === "A" || code === "B") return Vp <= 0 && V > 0;    // crosses zero up
          if (code === "C" || code === "D") return Vp >= 0 && V < 0;    // crosses zero down
          if (code === "E" || code === "F") return V > 0 && V > Vp;     // green bar above zero
          if (code === "G" || code === "H") return V > 0 && V < Vp;     // red bar above zero
          if (code === "I" || code === "J") return V < 0 && V > Vp;     // green bar below zero
          if (code === "K" || code === "L") return V < 0 && V < Vp;     // red bar below zero
        } else {
          if (code === "A" || code === "B") return Vp <= 0 && V > 0;
          if (code === "C" || code === "D") return Vp >= 0 && V < 0;
          if (code === "E" || code === "F") return V > Vp;               // bar turned green
          if (code === "G" || code === "H") return V < Vp;               // bar turned red
        }
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 80; reasons.unshift(chosen.reason);
    }
    values = { value: round(V), prev: round(Vp), ao: round(last(ao)), ac: round(last(ac)) };
  }

  else if (id === "adx") {
    const trendLevel = n(getSetting(ind, "trendLevel", 25), 25);
    const a = adxSeries(candles, period); const A = last(a.adx), P = last(a.plusDI), M = last(a.minusDI);
    if (A >= trendLevel && P > M) { side = "BUY"; score = clamp(55 + (A - trendLevel), 58, 90); reasons.push(`ADX ${round(A)} выше ${trendLevel}, +DI выше -DI.`); }
    else if (A >= trendLevel && M > P) { side = "SELL"; score = clamp(55 + (A - trendLevel), 58, 90); reasons.push(`ADX ${round(A)} выше ${trendLevel}, -DI выше +DI.`); }
    else reasons.push(`ADX ниже ${trendLevel}: тренд слабый.`);
    if (hasCustomConditions(ind)) {
      const Ap2 = a.adx[a.adx.length - 2], Pp2 = a.plusDI[a.plusDI.length - 2], Mp2 = a.minusDI[a.minusDI.length - 2];
      const check = code => {
        if (code === "A" || code === "B") return crossUp(Pp2, Mp2, P, M);              // +DI crosses -DI up
        if (code === "C" || code === "D") return crossDown(Pp2, Mp2, P, M);             // +DI crosses -DI down
        if (code === "E" || code === "F") return P > M && Ap2 < 25 && A >= 25;          // +DI>-DI, ADX crosses 25 up
        if (code === "G" || code === "H") return M > P && Ap2 < 25 && A >= 25;          // -DI>+DI, ADX crosses 25 up
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 82; reasons.unshift(chosen.reason);
    }
    values = { adx: round(A), plusDI: round(P), minusDI: round(M), trendLevel };
  }

  else if (id === "bears-power" || id === "bulls-power") {
    const ema = emaSeries(closes, n(getSetting(ind, "period", 13), 13)); const E = last(ema), Ep = ema[ema.length - 2];
    const bulls = highs.map((h, i) => ema[i] === null ? null : h - ema[i]);
    const bears = lows.map((l, i) => ema[i] === null ? null : l - ema[i]);
    const BULL = last(bulls), BULLp = bulls[bulls.length - 2], BEAR = last(bears), BEARp = bears[bears.length - 2];
    if (id === "bulls-power") {
      if (BULL > 0 && BULL > BULLp && E >= Ep) { side = "BUY"; score = 62; reasons.push("Bulls Power выше нуля и усиливается."); }
      else if (BULL > 0 && BULL < BULLp) { side = "SELL"; score = 58; reasons.push("Bulls Power теряет силу после верхней зоны."); }
    } else {
      if (BEAR < 0 && BEAR < BEARp && E <= Ep) { side = "SELL"; score = 62; reasons.push("Bears Power ниже нуля и усиливается вниз."); }
      else if (BEAR < 0 && BEAR > BEARp) { side = "BUY"; score = 58; reasons.push("Bears Power теряет силу, продавец слабеет."); }
    }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (id === "bulls-power") {
          if (code === "A" || code === "B") return BULL > 0 && BULL > BULLp;          // BP positive and rising
          if (code === "C" || code === "D") return BULL > 0 && BULL < BULLp;          // BP positive and falling
          if (code === "E" || code === "F") return BULLp <= 0 && BULL > 0;            // BP crosses zero up
          if (code === "G" || code === "H") return BULLp >= 0 && BULL < 0;            // BP crosses zero down
        } else {
          if (code === "A" || code === "B") return BEAR < 0 && BEAR < BEARp;          // BP negative and falling
          if (code === "C" || code === "D") return BEAR < 0 && BEAR > BEARp;          // BP negative and rising (weakening)
          if (code === "E" || code === "F") return BEARp <= 0 && BEAR > 0;            // BP crosses zero up
          if (code === "G" || code === "H") return BEARp >= 0 && BEAR < 0;            // BP crosses zero down
        }
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 62; reasons.unshift(chosen.reason);
    }
    values = { bulls: round(BULL), bears: round(BEAR), ema: round(E) };
  }

  else if (id === "fractals") {
    // Reversal logic: signal fires IMMEDIATELY when fractal is confirmed (2 candles after peak/low).
    // DOWN fractal (local low) confirmed → BUY (reversal up expected).
    // UP fractal (local high) confirmed → SELL (reversal down expected).
    // maxAge=1: signal active for 1 extra candle after confirmation, then dies.
    // This means the trade opens within 1-2 candles of the fractal appearing — not 8 candles later.
    const maxAge = Number(getSetting(ind, "maxAge", 1));
    const idx = candles.length - 1;
    let upVal = null, downVal = null, upAge = Infinity, downAge = Infinity;
    for (let i = idx - 2; i >= Math.max(2, idx - 2 - maxAge); i--) {
      const age = (idx - 2) - i; // 0 = just confirmed this scan, 1 = 1 candle ago
      const isUp   = n(candles[i].high) > n(candles[i-1].high) && n(candles[i].high) > n(candles[i-2].high) && n(candles[i].high) > n(candles[i+1].high) && n(candles[i].high) > n(candles[i+2].high);
      const isDown = n(candles[i].low)  < n(candles[i-1].low)  && n(candles[i].low)  < n(candles[i-2].low)  && n(candles[i].low)  < n(candles[i+1].low)  && n(candles[i].low)  < n(candles[i+2].low);
      if (upVal   === null && isUp)   { upVal   = n(candles[i].high); upAge   = age; }
      if (downVal === null && isDown) { downVal = n(candles[i].low);  downAge = age; }
      if (upVal !== null && downVal !== null) break;
    }
    // Prefer the most recently confirmed fractal; DOWN → BUY, UP → SELL
    if (downVal !== null && (upVal === null || downAge <= upAge)) {
      side = "BUY"; score = 70; reasons.push(`Нижний фрактал подтверждён (${downAge} св. назад) — разворот вверх.`);
    } else if (upVal !== null) {
      side = "SELL"; score = 70; reasons.push(`Верхний фрактал подтверждён (${upAge} св. назад) — разворот вниз.`);
    }
    if (hasCustomConditions(ind)) {
      const check = code => {
        if (code === "A" || code === "B") return downVal !== null;   // down fractal confirmed
        if (code === "C" || code === "D") return upVal !== null;     // up fractal confirmed
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 70; reasons.unshift(chosen.reason);
    }
    values = { lastUpperFractal: round(upVal), lastLowerFractal: round(downVal), close: round(c), upAge, downAge };
  }

  else if (id === "momentum" || id === "rate-of-change") {
    const p = n(getSetting(ind, "period", id === "momentum" ? 14 : 9), id === "momentum" ? 14 : 9); missing = needCandles(candles, p + 3, id, name, symbol, timeframe); if (missing) return missing;
    const val = closes.map((v, i) => i >= p ? (id === "momentum" ? 100 * v / closes[i - p] : ((v - closes[i - p]) / closes[i - p]) * 100) : null);
    const V = last(val), Vp = val[val.length - 2]; const mid = id === "momentum" ? 100 : 0;
    if (Vp <= mid && V > mid) { side = "BUY"; score = 78; reasons.push((id === "momentum" ? "Momentum" : "ROC") + " пересёк центральную линию вверх."); }
    else if (Vp >= mid && V < mid) { side = "SELL"; score = 78; reasons.push((id === "momentum" ? "Momentum" : "ROC") + " пересёк центральную линию вниз."); }
    else if (V > mid && V > Vp) { side = "BUY"; score = 56; reasons.push((id === "momentum" ? "Momentum" : "ROC") + " выше центральной линии и растёт."); }
    else if (V < mid && V < Vp) { side = "SELL"; score = 56; reasons.push((id === "momentum" ? "Momentum" : "ROC") + " ниже центральной линии и падает."); }
    if (hasCustomConditions(ind)) {
      const midVal = id === "momentum" ? 100 : 0;
      const check = code => {
        if (code === "A" || code === "B") return Vp <= midVal && V > midVal;   // crosses mid up
        if (code === "C" || code === "D") return Vp >= midVal && V < midVal;   // crosses mid down
        if (code === "E" || code === "F") return V > Vp;                       // current > previous
        if (code === "G" || code === "H") return V < Vp;                       // current < previous
        return false;
      };
      const chosen = chooseSideByConditions(ind, check, check);
      side = chosen.side; score = side === "WAIT" ? 0 : 78; reasons.unshift(chosen.reason);
    }
    values = { value: round(V), prev: round(Vp), center: mid };
  }

  else {
    return waitResult(id, name, symbol, timeframe, `Для индикатора ${id} логика не найдена.`);
  }

  return baseResult({ id, name, symbol, timeframe, side, score, reasons: reasons.length ? reasons : ["Сигнала нет: индикатор ждёт условия."], values, lastCandle: lc, expirySec });
}


function indicatorAllowedForSymbol(ind, symbol) {
  const assets = Array.isArray(ind.assets) ? ind.assets.map(normalizeSymbol).filter(Boolean) : [];
  if (!assets.length) return true;
  return assets.includes(normalizeSymbol(symbol));
}

function normalizeIndicatorConfig(item = {}) {
  const id = String(item.id || item.indicatorId || item.name || "moving-average").toLowerCase();
  const timeframe = String(item.timeframe || item.settings?.timeframe || CONFIG.signal.defaultTimeframe).toUpperCase();
  const expirySec = n(item.expirySec || item.settings?.expirySec || CONFIG.autoSignal.expirySec || 15, 15);
  return { ...item, id, timeframe, expirySec, settings: item.settings || {} };
}

function analyzeStrategy({ symbol, config = {}, getCandles }) {
  const rawIndicators = Array.isArray(config.indicators) && config.indicators.length
    ? config.indicators
    : [{ id: "moving-average", name: "Moving Average", timeframe: config.timeframe || CONFIG.signal.defaultTimeframe, expirySec: config.expirySec || 15, settings: { fast: config.fast || 5, slow: config.slow || 10 } }];
  const indicators = rawIndicators.slice(0, 7).map(normalizeIndicatorConfig);
  const activeIndicators = indicators.filter(ind => indicatorAllowedForSymbol(ind, symbol));
  const results = [];
  for (const ind of activeIndicators) {
    const tf = ind.timeframe || config.timeframe || CONFIG.signal.defaultTimeframe;
    const candles = typeof getCandles === "function" ? getCandles(tf, 260) : [];
    results.push(analyzeIndicator(candles, ind, { symbol, timeframe: tf, expirySec: ind.expirySec || config.expirySec }));
  }
  if (!activeIndicators.length) {
    return { ok: true, id: "strategy", indicator: "Strategy Engine", symbol: normalizeSymbol(symbol), timeframe: config.timeframe || CONFIG.signal.defaultTimeframe, ready: false, side: "WAIT", action: null, score: 0, maxScore: 100, buyCount: 0, sellCount: 0, waitCount: 0, minAgree: 1, activeCount: 0, expirySec: config.expirySec || 15, indicators, results: [], reasons: ["Для этого актива нет включённых индикаторов."], lastCandle: null, signalHash: "no-active-indicators" };
  }
  const ready = results.filter(r => r.ready !== false);
  const buy = ready.filter(r => r.side === "BUY");
  const sell = ready.filter(r => r.side === "SELL");
  const activeCount = activeIndicators.length || 1;
  const minAgree = Math.max(1, Math.min(activeCount, n(config.minAgree, Math.ceil(activeCount / 2))));
  let side = "WAIT", chosen = [];
  if (buy.length >= minAgree && buy.length > sell.length) { side = "BUY"; chosen = buy; }
  else if (sell.length >= minAgree && sell.length > buy.length) { side = "SELL"; chosen = sell; }
  const action = side === "BUY" ? "call" : side === "SELL" ? "put" : null;
  const score = action ? Math.round((chosen.length / activeCount) * 100) : 0;
  const candleCandidates = chosen.length ? chosen : ready;
  const lastCandle = candleCandidates.map(r => r.lastCandle).filter(Boolean).sort((a,b)=>n(b.openTime)-n(a.openTime))[0] || null;
  const expirySec = chosen[0]?.expirySec || config.expirySec || 15;
  const amount = n(chosen[0]?.settings?.amount || config.amount || 1, 1);
  const reasons = results.map(r => `${r.indicator}: ${r.side} ${r.score}/${r.maxScore} — ${(r.reasons || []).join("; ")}`);
  const chosenResults = chosen;
  const signalHash = results.map(r => `${r.id}:${r.side}:${r.score}:${r.lastCandle?.openTime || 0}`).join("|");
  return { ok: true, id: "strategy", indicator: "Strategy Engine", symbol: normalizeSymbol(symbol), timeframe: config.timeframe || CONFIG.signal.defaultTimeframe, ready: ready.length > 0, side, action, score, maxScore: 100, buyCount: buy.length, sellCount: sell.length, waitCount: results.length - buy.length - sell.length, minAgree, activeCount, expirySec, amount, indicators: activeIndicators, allIndicators: indicators, results, chosenResults, reasons, lastCandle, signalHash };
}

function analyzeSmaCross(candles, options = {}) {
  return analyzeIndicator(candles, { id: "moving-average", name: "SMA_CROSS", timeframe: options.timeframe, expirySec: options.expirySec, settings: { fast: options.fast || CONFIG.signal.defaultFast, slow: options.slow || CONFIG.signal.defaultSlow } }, options);
}

module.exports = {
  sma,
  smaSeries,
  emaSeries,
  smmaSeries,
  wmaSeries,
  maSeries,
  rsiSeries,
  cciSeries,
  stochasticSeries,
  macdSeries,
  atrSeries,
  analyzeIndicator,
  analyzeStrategy,
  analyzeSmaCross
};
