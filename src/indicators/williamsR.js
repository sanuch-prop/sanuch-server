// Williams %R индикатор
const { calculateWilliamsR } = require('./utils');

/**
 * Анализ Williams %R
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeWilliamsR(candles, settings = {}) {
  const {
    period = 14,
    overbought = -20,
    oversold = -80,
    symbol = 'UNKNOWN',
    timeframe = 'S15'
  } = settings;

  if (!Array.isArray(candles) || candles.length === 0) {
    return { ok: false, ready: false, error: 'Нет данных свечей' };
  }

  if (candles.length < period + 1) {
    return {
      ok: false,
      ready: false,
      error: `Недостаточно свечей: ${candles.length}/${period + 1}`,
      needCandles: period + 1
    };
  }

  const wrValues = calculateWilliamsR(candles, period);
  
  const lastWR = wrValues[wrValues.length - 1];
  const prevWR = wrValues[wrValues.length - 2];

  if (lastWR === null) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа Williams %R' };
  }

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  // Анализ уровней
  const isOverbought = lastWR > overbought;
  const isOversold = lastWR < oversold;
  const crossedAboveOverbought = prevWR <= overbought && lastWR > overbought;
  const crossedBelowOversold = prevWR >= oversold && lastWR < oversold;

  if (isOversold && prevWR < lastWR) {
    signalType = 'CALL';
    action = 'OVERSOLD_RECOVERY';
    confidence = 0.70;
  } else if (isOverbought && prevWR > lastWR) {
    signalType = 'PUT';
    action = 'OVERBOUGHT_REVERSAL';
    confidence = 0.70;
  } else if (crossedAboveOverbought) {
    signalType = 'PUT';
    action = 'CROSSED_OVERBOUGHT';
    confidence = 0.65;
  } else if (crossedBelowOversold) {
    signalType = 'CALL';
    action = 'CROSSED_OVERSOLD';
    confidence = 0.65;
  } else if (isOversold) {
    signalType = 'CALL';
    action = 'OVERSOLD';
    confidence = 0.55;
  } else if (isOverbought) {
    signalType = 'PUT';
    action = 'OVERBOUGHT';
    confidence = 0.55;
  }

  return {
    ok: true,
    ready: true,
    indicator: 'williams-r',
    symbol,
    timeframe,
    settings: { period, overbought, oversold },
    signal: signalType,
    action,
    confidence,
    values: {
      current: lastWR,
      previous: prevWR
    },
    levels: {
      overbought,
      oversold,
      isOverbought,
      isOversold
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeWilliamsR };
