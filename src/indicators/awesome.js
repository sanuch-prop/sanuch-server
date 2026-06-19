// Awesome Oscillator индикатор
const { calculateAwesomeOscillator, calculateSMA } = require('./utils');

/**
 * Анализ Awesome Oscillator
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeAwesomeOscillator(candles, settings = {}) {
  const {
    fast = 5,
    slow = 34,
    symbol = 'UNKNOWN',
    timeframe = 'S15'
  } = settings;

  if (!Array.isArray(candles) || candles.length === 0) {
    return { ok: false, ready: false, error: 'Нет данных свечей' };
  }

  if (candles.length < slow + 1) {
    return {
      ok: false,
      ready: false,
      error: `Недостаточно свечей: ${candles.length}/${slow + 1}`,
      needCandles: slow + 1
    };
  }

  const aoValues = calculateAwesomeOscillator(candles, fast, slow);
  
  const lastAO = aoValues[aoValues.length - 1];
  const prevAO = aoValues[aoValues.length - 2];
  const prev2AO = aoValues[aoValues.length - 3];
  const prev3AO = aoValues[aoValues.length - 4];

  if (lastAO === null) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа Awesome Oscillator' };
  }

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  // Пересечение нулевой линии
  const bullishCrossover = prevAO < 0 && lastAO > 0;
  const bearishCrossover = prevAO > 0 && lastAO < 0;

  // Направление и увеличение
  const aoIncreasing = lastAO > prevAO;
  const aoDecreasing = lastAO < prevAO;
  const aboveZero = lastAO > 0;
  const belowZero = lastAO < 0;

  // Паттерн "Блюдце" (Saucer) - два красных столбца, затем зеленый выше
  let saucerPattern = false;
  if (prev3AO !== null && prev2AO !== null && prevAO !== null &&
      prev3AO < 0 && prev2AO < prev3AO && prevAO < prev2AO && lastAO > prevAO) {
    saucerPattern = true;
  }

  // Паттерн "Двойной минимум"
  const twoLows = prev3AO !== null && prevAO !== null &&
    prev3AO < 0 && lastAO < 0 && prevAO < prev3AO && lastAO > prevAO;

  // Генерируем сигналы
  if (bullishCrossover) {
    signalType = 'CALL';
    action = 'BULLISH_CROSSOVER';
    confidence = 0.75;
  } else if (bearishCrossover) {
    signalType = 'PUT';
    action = 'BEARISH_CROSSOVER';
    confidence = 0.75;
  } else if (saucerPattern) {
    signalType = 'CALL';
    action = 'SAUCER_PATTERN';
    confidence = 0.75;
  } else if (twoLows && lastAO > prevAO && aboveZero) {
    signalType = 'CALL';
    action = 'DOUBLE_BOTTOM_PATTERN';
    confidence = 0.70;
  } else if (aboveZero && aoIncreasing) {
    signalType = 'CALL';
    action = 'BULLISH_MOMENTUM';
    confidence = 0.60;
  } else if (belowZero && aoDecreasing) {
    signalType = 'PUT';
    action = 'BEARISH_MOMENTUM';
    confidence = 0.60;
  }

  return {
    ok: true,
    ready: true,
    indicator: 'awesome-oscillator',
    symbol,
    timeframe,
    settings: { fast, slow },
    signal: signalType,
    action,
    confidence,
    values: {
      current: lastAO,
      previous: prevAO,
      prev2: prev2AO,
      prev3: prev3AO
    },
    direction: {
      aboveZero,
      belowZero,
      increasing: aoIncreasing,
      decreasing: aoDecreasing
    },
    patterns: {
      bullishCrossover,
      bearishCrossover,
      saucerPattern,
      doubleBothPattern: twoLows
    },
    momentum: {
      level: lastAO,
      trend: aboveZero ? 'POSITIVE' : 'NEGATIVE'
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeAwesomeOscillator };
