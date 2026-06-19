// Moving Average индикатор
// Простой пример использования MA для анализа тренда

const { calculateSMA, calculateEMA } = require('./utils');

/**
 * Анализ Moving Average crossover
 * @param {Array} candles - массив свечей с close ценами
 * @param {Object} settings - настройки индикатора
 *   - fast: число (по умолчанию 5)
 *   - slow: число (по умолчанию 10)
 *   - type: 'SMA' или 'EMA' (по умолчанию 'SMA')
 *   - symbol: строка
 *   - timeframe: строка
 * @returns {Object} результат анализа
 */
function analyzeMovingAverage(candles, settings = {}) {
  const {
    fast = 5,
    slow = 10,
    type = 'SMA',
    symbol = 'UNKNOWN',
    timeframe = 'S15'
  } = settings;

  // Валидация
  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      ok: false,
      ready: false,
      error: 'Нет данных свечей'
    };
  }

  if (candles.length < slow + 1) {
    return {
      ok: false,
      ready: false,
      error: `Недостаточно свечей: ${candles.length}/${slow + 1}`,
      needCandles: slow + 1,
      haveCandles: candles.length
    };
  }

  // Извлекаем цены закрытия
  const closes = candles.map(c => c.close);

  // Выбираем тип скользящей средней
  const calculateMA = type.toUpperCase() === 'EMA' ? calculateEMA : calculateSMA;

  // Вычисляем быструю и медленную MA
  const fastMA = calculateMA(closes, fast);
  const slowMA = calculateMA(closes, slow);

  // Берем последние значения
  const lastFast = fastMA[fastMA.length - 1];
  const lastSlow = slowMA[slowMA.length - 1];
  const prevFast = fastMA[fastMA.length - 2];
  const prevSlow = slowMA[slowMA.length - 2];

  // Проверяем был ли crossover
  const bullishCrossover = prevFast !== null && prevSlow !== null &&
    prevFast <= prevSlow && lastFast > lastSlow;
  const bearishCrossover = prevFast !== null && prevSlow !== null &&
    prevFast >= prevSlow && lastFast < lastSlow;

  // Определяем сигнал
  let signal = 'NONE';
  let action = null;
  let confidence = 0;

  if (bullishCrossover) {
    signal = 'CALL';
    action = 'BUY';
    confidence = 0.75;
  } else if (bearishCrossover) {
    signal = 'PUT';
    action = 'SELL';
    confidence = 0.75;
  } else if (lastFast > lastSlow) {
    signal = 'CALL';
    action = 'UPTREND';
    confidence = 0.60;
  } else if (lastFast < lastSlow) {
    signal = 'PUT';
    action = 'DOWNTREND';
    confidence = 0.60;
  }

  const lastCandle = candles[candles.length - 1];

  return {
    ok: true,
    ready: true,
    indicator: 'moving-average',
    symbol,
    timeframe,
    type,
    settings: { fast, slow },
    signal,
    action,
    confidence,
    values: {
      fastMA: lastFast,
      slowMA: lastSlow,
      diff: lastFast - lastSlow,
      position: lastFast > lastSlow ? 'ABOVE' : 'BELOW'
    },
    crossover: {
      bullish: bullishCrossover,
      bearish: bearishCrossover
    },
    lastCandle: {
      close: lastCandle.close,
      time: lastCandle.closeTime
    }
  };
}

module.exports = {
  analyzeMovingAverage
};
