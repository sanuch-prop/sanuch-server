// ATR (Average True Range) индикатор
const { calculateATR } = require('./utils');

/**
 * Анализ ATR
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeATR(candles, settings = {}) {
  const {
    period = 14,
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

  const atrValues = calculateATR(candles, period);
  
  const lastATR = atrValues[atrValues.length - 1];
  const prevATR = atrValues[atrValues.length - 2];
  const prev5ATR = atrValues.length >= 6 ? atrValues[atrValues.length - 6] : null;

  if (lastATR === null) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа ATR' };
  }

  // Вычисляем среднее значение ATR (за последние 20 периодов)
  const recentATR = atrValues.slice(-20).filter(v => v !== null);
  const avgATR = recentATR.length > 0 ? 
    recentATR.reduce((a, b) => a + b, 0) / recentATR.length : lastATR;

  // Вычисляем изменение волатильности
  const atrIncreasing = prevATR !== null && lastATR > prevATR;
  const atrVolatilityHigh = lastATR > avgATR * 1.2;
  const atrVolatilityLow = lastATR < avgATR * 0.8;

  // Вычисляем процент изменения ATR
  const atrChangePercent = prevATR !== null ? ((lastATR - prevATR) / prevATR) * 100 : 0;

  let action = null;
  let confidence = 0.50;

  if (atrVolatilityHigh && atrIncreasing) {
    action = 'HIGH_VOLATILITY_EXPANDING';
    confidence = 0.70;
  } else if (atrVolatilityLow) {
    action = 'LOW_VOLATILITY_SQUEEZE';
    confidence = 0.65; // Может быть пред-импульсное сжатие
  } else {
    action = 'NORMAL_VOLATILITY';
  }

  return {
    ok: true,
    ready: true,
    indicator: 'atr',
    symbol,
    timeframe,
    settings: { period },
    signal: 'NONE', // ATR не дает прямых сигналов, но используется для фильтрации
    action,
    confidence,
    values: {
      current: lastATR,
      previous: prevATR,
      average: avgATR,
      prev5: prev5ATR
    },
    volatility: {
      isHigh: atrVolatilityHigh,
      isLow: atrVolatilityLow,
      isIncreasing: atrIncreasing,
      changePercent: atrChangePercent,
      ratio: lastATR / avgATR
    },
    analysis: {
      forExitPoints: lastATR, // Используется для определения stop-loss и take-profit
      forChannels: lastATR,   // Используется в динамических каналах
      forBreakouts: atrVolatilityLow ? 'LIKELY' : 'NORMAL' // Низкая волатильность перед прорывом
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeATR };
