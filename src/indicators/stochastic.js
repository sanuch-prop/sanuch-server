// Stochastic Oscillator индикатор
const { calculateStochastic } = require('./utils');

/**
 * Анализ Stochastic
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeStochastic(candles, settings = {}) {
  const {
    period = 14,
    kPeriod = 3,
    dPeriod = 3,
    overbought = 80,
    oversold = 20,
    symbol = 'UNKNOWN',
    timeframe = 'S15'
  } = settings;

  if (!Array.isArray(candles) || candles.length === 0) {
    return { ok: false, ready: false, error: 'Нет данных свечей' };
  }

  if (candles.length < period + kPeriod + dPeriod) {
    return {
      ok: false,
      ready: false,
      error: `Недостаточно свечей: ${candles.length}/${period + kPeriod + dPeriod}`,
      needCandles: period + kPeriod + dPeriod
    };
  }

  const stochValues = calculateStochastic(candles, period, kPeriod, dPeriod);
  
  const lastStoch = stochValues[stochValues.length - 1];
  const prevStoch = stochValues[stochValues.length - 2];

  if (!lastStoch || !prevStoch) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа Stochastic' };
  }

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  // Анализ сигналов
  const kCrossedD = prevStoch.K < prevStoch.D && lastStoch.K > lastStoch.D;
  const kCrossedDDown = prevStoch.K > prevStoch.D && lastStoch.K < lastStoch.D;

  if (kCrossedD && lastStoch.K < oversold) {
    signalType = 'CALL';
    action = 'BULLISH_CROSSOVER_OVERSOLD';
    confidence = 0.75;
  } else if (kCrossedDDown && lastStoch.K > overbought) {
    signalType = 'PUT';
    action = 'BEARISH_CROSSOVER_OVERBOUGHT';
    confidence = 0.75;
  } else if (lastStoch.K < oversold) {
    signalType = 'CALL';
    action = 'OVERSOLD';
    confidence = 0.60;
  } else if (lastStoch.K > overbought) {
    signalType = 'PUT';
    action = 'OVERBOUGHT';
    confidence = 0.60;
  }

  return {
    ok: true,
    ready: true,
    indicator: 'stochastic',
    symbol,
    timeframe,
    settings: { period, kPeriod, dPeriod, overbought, oversold },
    signal: signalType,
    action,
    confidence,
    values: {
      current: {
        K: lastStoch.K,
        D: lastStoch.D
      },
      previous: {
        K: prevStoch.K,
        D: prevStoch.D
      }
    },
    levels: {
      overbought,
      oversold,
      isOverbought: lastStoch.K > overbought,
      isOversold: lastStoch.K < oversold
    },
    crossovers: {
      bullishCrossover: kCrossedD,
      bearishCrossover: kCrossedDDown
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeStochastic };
