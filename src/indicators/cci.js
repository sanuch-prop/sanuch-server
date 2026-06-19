// CCI (Commodity Channel Index) индикатор
const { calculateCCI } = require('./utils');

/**
 * Анализ CCI
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeCCI(candles, settings = {}) {
  const {
    period = 20,
    overbought = 100,
    oversold = -100,
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

  const cciValues = calculateCCI(candles, period);
  
  const lastCCI = cciValues[cciValues.length - 1];
  const prevCCI = cciValues[cciValues.length - 2];
  const prev2CCI = cciValues[cciValues.length - 3];

  if (lastCCI === null) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа CCI' };
  }

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  // Пересечение уровней
  const crossedAboveOverbought = prevCCI <= overbought && lastCCI > overbought;
  const crossedBelowOversold = prevCCI >= oversold && lastCCI < oversold;
  const leftOverbought = prevCCI > overbought && lastCCI <= overbought;
  const leftOversold = prevCCI < oversold && lastCCI >= oversold;

  // Уровни
  const aboveOverbought = lastCCI > overbought;
  const belowOversold = lastCCI < oversold;
  const inNormalRange = !aboveOverbought && !belowOversold;

  // Генерируем сигналы
  if (crossedAboveOverbought) {
    signalType = 'PUT';
    action = 'CROSSED_ABOVE_OVERBOUGHT';
    confidence = 0.70;
  } else if (crossedBelowOversold) {
    signalType = 'CALL';
    action = 'CROSSED_BELOW_OVERSOLD';
    confidence = 0.70;
  } else if (aboveOverbought && prevCCI < lastCCI) {
    signalType = 'PUT';
    action = 'OVERBOUGHT_INCREASING';
    confidence = 0.60;
  } else if (belowOversold && prevCCI > lastCCI) {
    signalType = 'CALL';
    action = 'OVERSOLD_DECREASING';
    confidence = 0.60;
  } else if (leftOverbought) {
    signalType = 'CALL';
    action = 'REVERSAL_FROM_OVERBOUGHT';
    confidence = 0.65;
  } else if (leftOversold) {
    signalType = 'PUT';
    action = 'REVERSAL_FROM_OVERSOLD';
    confidence = 0.65;
  }

  return {
    ok: true,
    ready: true,
    indicator: 'cci',
    symbol,
    timeframe,
    settings: { period, overbought, oversold },
    signal: signalType,
    action,
    confidence,
    values: {
      current: lastCCI,
      previous: prevCCI,
      prev2: prev2CCI
    },
    levels: {
      overbought,
      oversold,
      aboveOverbought,
      belowOversold,
      inNormalRange
    },
    crossovers: {
      crossedAboveOverbought,
      crossedBelowOversold,
      leftOverbought,
      leftOversold
    },
    trend: lastCCI > prevCCI ? 'INCREASING' : 'DECREASING',
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeCCI };
