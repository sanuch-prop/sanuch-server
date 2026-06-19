// ADX (Average Directional Index) индикатор
const { calculateADX } = require('./utils');

/**
 * Анализ ADX
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeADX(candles, settings = {}) {
  const {
    period = 14,
    strongTrend = 25,
    weakTrend = 20,
    symbol = 'UNKNOWN',
    timeframe = 'S15'
  } = settings;

  if (!Array.isArray(candles) || candles.length === 0) {
    return { ok: false, ready: false, error: 'Нет данных свечей' };
  }

  if (candles.length < period * 2 + 5) {
    return {
      ok: false,
      ready: false,
      error: `Недостаточно свечей: ${candles.length}/${period * 2 + 5}`,
      needCandles: period * 2 + 5
    };
  }

  const adxValues = calculateADX(candles, period);
  
  const lastADX = adxValues[adxValues.length - 1];
  const prevADX = adxValues[adxValues.length - 2];
  const prev2ADX = adxValues[adxValues.length - 3];

  if (!lastADX || !prevADX) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа ADX' };
  }

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  // Определяем силу тренда
  const isTrendStrong = lastADX.ADX > strongTrend;
  const isTrendWeak = lastADX.ADX < weakTrend;
  const isTrendForming = lastADX.ADX > weakTrend && lastADX.ADX < strongTrend;
  const adxIncreasing = lastADX.ADX > prevADX.ADX;

  // Определяем направление по DI
  const plusDIAbove = lastADX.plusDI > lastADX.minusDI;
  const minusDIAbove = lastADX.minusDI > lastADX.plusDI;

  // Пересечения DI линий
  const diCrossoverBullish = prevADX.plusDI < prevADX.minusDI && lastADX.plusDI > lastADX.minusDI;
  const diCrossoverBearish = prevADX.plusDI > prevADX.minusDI && lastADX.plusDI < lastADX.minusDI;

  // Генерируем сигналы
  if (isTrendStrong && plusDIAbove) {
    signalType = 'CALL';
    action = 'STRONG_UPTREND';
    confidence = isTrendStrong ? 0.80 : 0.60;
  } else if (isTrendStrong && minusDIAbove) {
    signalType = 'PUT';
    action = 'STRONG_DOWNTREND';
    confidence = 0.80;
  } else if (diCrossoverBullish && isTrendForming) {
    signalType = 'CALL';
    action = 'BULLISH_DI_CROSSOVER';
    confidence = 0.70;
  } else if (diCrossoverBearish && isTrendForming) {
    signalType = 'PUT';
    action = 'BEARISH_DI_CROSSOVER';
    confidence = 0.70;
  } else if (isTrendWeak) {
    action = 'NO_TREND';
    confidence = 0.50;
  }

  return {
    ok: true,
    ready: true,
    indicator: 'adx',
    symbol,
    timeframe,
    settings: { period, strongTrend, weakTrend },
    signal: signalType,
    action,
    confidence,
    values: {
      current: {
        ADX: lastADX.ADX,
        plusDI: lastADX.plusDI,
        minusDI: lastADX.minusDI
      },
      previous: {
        ADX: prevADX.ADX,
        plusDI: prevADX.plusDI,
        minusDI: prevADX.minusDI
      }
    },
    trend: {
      strength: lastADX.ADX,
      isStrong: isTrendStrong,
      isWeak: isTrendWeak,
      isForming: isTrendForming,
      increasing: adxIncreasing
    },
    direction: {
      plusDIAbove,
      minusDIAbove,
      diDiff: lastADX.plusDI - lastADX.minusDI
    },
    crossovers: {
      bullishCrossover: diCrossoverBullish,
      bearishCrossover: diCrossoverBearish
    },
    levels: {
      strongTrend,
      weakTrend
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeADX };
