// Bollinger Bands индикатор
const { calculateBollingerBands } = require('./utils');

/**
 * Анализ Bollinger Bands
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeBollingerBands(candles, settings = {}) {
  const {
    period = 20,
    stdDev = 2,
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
  const bbValues = calculateBollingerBands(closes, period, stdDev);
  
  const lastBB = bbValues[bbValues.length - 1];
  const prevBB = bbValues[bbValues.length - 2];
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  if (!lastBB || !prevBB) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа Bollinger Bands' };
  }

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  // Определяем позицию цены относительно полос
  const closeAboveUpper = lastClose > lastBB.upper;
  const closeBelowLower = lastClose < lastBB.lower;
  const closeNearUpper = lastClose > (lastBB.middle + (lastBB.upper - lastBB.middle) * 0.7);
  const closeNearLower = lastClose < (lastBB.middle - (lastBB.middle - lastBB.lower) * 0.7);

  // Проверяем пересечения
  const crossedUpper = prevClose <= lastBB.upper && lastClose > lastBB.upper;
  const crossedLower = prevClose >= lastBB.lower && lastClose < lastBB.lower;
  const bouncedFromLower = prevClose <= lastBB.lower && lastClose > lastBB.lower;
  const bouncedFromUpper = prevClose >= lastBB.upper && lastClose < lastBB.upper;

  // Проверяем сжатие полос (низкая волатильность)
  const bandWidth = lastBB.upper - lastBB.lower;
  const prevBandWidth = prevBB.upper - prevBB.lower;
  const bandsNarrowing = bandWidth < prevBandWidth;

  // Генерируем сигналы
  if (closeAboveUpper) {
    signalType = 'PUT';
    action = 'ABOVE_UPPER_BAND';
    confidence = 0.65;
  } else if (closeBelowLower) {
    signalType = 'CALL';
    action = 'BELOW_LOWER_BAND';
    confidence = 0.65;
  } else if (bouncedFromLower) {
    signalType = 'CALL';
    action = 'BOUNCED_FROM_LOWER';
    confidence = 0.70;
  } else if (bouncedFromUpper) {
    signalType = 'PUT';
    action = 'BOUNCED_FROM_UPPER';
    confidence = 0.70;
  } else if (closeNearUpper && !closeAboveUpper) {
    signalType = 'PUT';
    action = 'NEAR_UPPER_BAND';
    confidence = 0.55;
  } else if (closeNearLower && !closeBelowLower) {
    signalType = 'CALL';
    action = 'NEAR_LOWER_BAND';
    confidence = 0.55;
  }

  return {
    ok: true,
    ready: true,
    indicator: 'bollinger-bands',
    symbol,
    timeframe,
    settings: { period, stdDev },
    signal: signalType,
    action,
    confidence,
    values: {
      current: {
        upper: lastBB.upper,
        middle: lastBB.middle,
        lower: lastBB.lower,
        close: lastClose,
        bandWidth
      },
      previous: {
        upper: prevBB.upper,
        middle: prevBB.middle,
        lower: prevBB.lower,
        bandWidth: prevBandWidth
      }
    },
    position: {
      aboveUpper: closeAboveUpper,
      belowLower: closeBelowLower,
      nearUpper: closeNearUpper,
      nearLower: closeNearLower,
      percentBFromLower: ((lastClose - lastBB.lower) / (lastBB.upper - lastBB.lower)) * 100
    },
    volatility: {
      bandsNarrowing,
      bandWidth,
      prevBandWidth
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeBollingerBands };
