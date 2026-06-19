// RSI (Relative Strength Index) индикатор
const { calculateRSI } = require('./utils');

/**
 * Анализ RSI
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeRSI(candles, settings = {}) {
  const {
    period = 14,
    overbought = 70,
    oversold = 30,
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

  const closes = candles.map(c => c.close);
  const rsiValues = calculateRSI(closes, period);
  
  const lastRSI = rsiValues[rsiValues.length - 1];
  const prevRSI = rsiValues[rsiValues.length - 2];
  const prev2RSI = rsiValues[rsiValues.length - 3];

  let signal = 'NONE';
  let action = null;
  let confidence = 0;

  // Анализ сигналов
  if (lastRSI > overbought) {
    signal = 'PUT';
    action = 'OVERBOUGHT';
    confidence = 0.65;
    
    // Дивергенция вниз
    if (prevRSI !== null && lastRSI < prevRSI) {
      confidence = 0.75;
      action = 'OVERBOUGHT_DIVERGENCE';
    }
  } else if (lastRSI < oversold) {
    signal = 'CALL';
    action = 'OVERSOLD';
    confidence = 0.65;
    
    // Дивергенция вверх
    if (prevRSI !== null && lastRSI > prevRSI) {
      confidence = 0.75;
      action = 'OVERSOLD_DIVERGENCE';
    }
  }

  return {
    ok: true,
    ready: true,
    indicator: 'rsi',
    symbol,
    timeframe,
    settings: { period, overbought, oversold },
    signal,
    action,
    confidence,
    values: {
      current: lastRSI,
      previous: prevRSI,
      prev2: prev2RSI
    },
    levels: {
      overbought,
      oversold,
      isOverbought: lastRSI > overbought,
      isOversold: lastRSI < oversold
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeRSI };
