// MACD (Moving Average Convergence Divergence) индикатор
const { calculateMACD } = require('./utils');

/**
 * Анализ MACD
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeMACD(candles, settings = {}) {
  const {
    fast = 12,
    slow = 26,
    signal = 9,
    symbol = 'UNKNOWN',
    timeframe = 'S15'
  } = settings;

  if (!Array.isArray(candles) || candles.length === 0) {
    return { ok: false, ready: false, error: 'Нет данных свечей' };
  }

  if (candles.length < slow + signal) {
    return {
      ok: false,
      ready: false,
      error: `Недостаточно свечей: ${candles.length}/${slow + signal}`,
      needCandles: slow + signal
    };
  }

  const closes = candles.map(c => c.close);
  const macdValues = calculateMACD(closes, fast, slow, signal);
  
  const lastMACD = macdValues[macdValues.length - 1];
  const prevMACD = macdValues[macdValues.length - 2];
  const prev2MACD = macdValues[macdValues.length - 3];

  if (!lastMACD || !prevMACD) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа MACD' };
  }

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  // Пересечение MACD с сигнальной линией
  const bullishCrossover = prevMACD.histogram < 0 && lastMACD.histogram > 0;
  const bearishCrossover = prevMACD.histogram > 0 && lastMACD.histogram < 0;

  // Разворот гистограммы
  const histogramIncreasing = lastMACD.histogram > prevMACD.histogram;
  const histogramDecreasing = lastMACD.histogram < prevMACD.histogram;

  if (bullishCrossover) {
    signalType = 'CALL';
    action = 'BULLISH_CROSSOVER';
    confidence = 0.75;
  } else if (bearishCrossover) {
    signalType = 'PUT';
    action = 'BEARISH_CROSSOVER';
    confidence = 0.75;
  } else if (lastMACD.macd > lastMACD.signal && histogramIncreasing) {
    signalType = 'CALL';
    action = 'BULLISH_MOMENTUM';
    confidence = 0.60;
  } else if (lastMACD.macd < lastMACD.signal && histogramDecreasing) {
    signalType = 'PUT';
    action = 'BEARISH_MOMENTUM';
    confidence = 0.60;
  }

  return {
    ok: true,
    ready: true,
    indicator: 'macd',
    symbol,
    timeframe,
    settings: { fast, slow, signal },
    signal: signalType,
    action,
    confidence,
    values: {
      current: {
        macd: lastMACD.macd,
        signal: lastMACD.signal,
        histogram: lastMACD.histogram
      },
      previous: {
        macd: prevMACD.macd,
        signal: prevMACD.signal,
        histogram: prevMACD.histogram
      }
    },
    direction: {
      macdAboveSignal: lastMACD.macd > lastMACD.signal,
      histogramPositive: lastMACD.histogram > 0,
      histogramIncreasing
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeMACD };
