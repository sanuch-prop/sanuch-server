// Keltner Channel индикатор
const { calculateKeltnerChannel } = require('./utils');

/**
 * Анализ Keltner Channel
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeKeltnerChannel(candles, settings = {}) {
  const {
    emaPeriod = 20,
    atrPeriod = 10,
    atrMultiplier = 2,
    symbol = 'UNKNOWN',
    timeframe = 'S15'
  } = settings;

  if (!Array.isArray(candles) || candles.length === 0) {
    return { ok: false, ready: false, error: 'Нет данных свечей' };
  }

  if (candles.length < Math.max(emaPeriod, atrPeriod) + 5) {
    return {
      ok: false,
      ready: false,
      error: `Недостаточно свечей: ${candles.length}/${Math.max(emaPeriod, atrPeriod) + 5}`,
      needCandles: Math.max(emaPeriod, atrPeriod) + 5
    };
  }

  const kcValues = calculateKeltnerChannel(candles, emaPeriod, atrPeriod, atrMultiplier);
  
  const lastKC = kcValues[kcValues.length - 1];
  const prevKC = kcValues[kcValues.length - 2];
  const lastClose = candles[candles.length - 1].close;

  if (!lastKC || !prevKC) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа Keltner Channel' };
  }

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  // Определяем позицию цены относительно канала
  const aboveUpper = lastClose > lastKC.upper;
  const belowLower = lastClose < lastKC.lower;
  const closeToUpper = lastClose > (lastKC.middle + (lastKC.upper - lastKC.middle) * 0.7);
  const closeToLower = lastClose < (lastKC.middle - (lastKC.middle - lastKC.lower) * 0.7);

  // Проверяем пересечения
  const prevClose = candles[candles.length - 2].close;
  const breakoutUpper = prevClose <= lastKC.upper && lastClose > lastKC.upper;
  const breakoutLower = prevClose >= lastKC.lower && lastClose < lastKC.lower;
  const bouncedFromUpper = prevClose >= lastKC.upper && lastClose < lastKC.upper;
  const bouncedFromLower = prevClose <= lastKC.lower && lastClose > lastKC.lower;

  // Тренд через среднюю линию
  const prevMid = prevKC.middle;
  const currMid = lastKC.middle;
  const midlineUptrend = currMid > prevMid && lastClose > currMid;
  const midlineDowntrend = currMid < prevMid && lastClose < currMid;

  if (breakoutUpper) {
    signalType = 'CALL';
    action = 'BREAKOUT_UPPER';
    confidence = 0.70;
  } else if (breakoutLower) {
    signalType = 'PUT';
    action = 'BREAKOUT_LOWER';
    confidence = 0.70;
  } else if (bouncedFromUpper) {
    signalType = 'PUT';
    action = 'BOUNCED_FROM_UPPER';
    confidence = 0.65;
  } else if (bouncedFromLower) {
    signalType = 'CALL';
    action = 'BOUNCED_FROM_LOWER';
    confidence = 0.65;
  } else if (midlineUptrend) {
    signalType = 'CALL';
    action = 'MIDLINE_UPTREND';
    confidence = 0.60;
  } else if (midlineDowntrend) {
    signalType = 'PUT';
    action = 'MIDLINE_DOWNTREND';
    confidence = 0.60;
  }

  const channelWidth = lastKC.upper - lastKC.lower;
  const prevChannelWidth = prevKC.upper - prevKC.lower;
  const channelNarrowing = channelWidth < prevChannelWidth;

  return {
    ok: true,
    ready: true,
    indicator: 'keltner-channel',
    symbol,
    timeframe,
    settings: { emaPeriod, atrPeriod, atrMultiplier },
    signal: signalType,
    action,
    confidence,
    values: {
      current: {
        upper: lastKC.upper,
        middle: lastKC.middle,
        lower: lastKC.lower,
        close: lastClose,
        width: channelWidth
      },
      previous: {
        upper: prevKC.upper,
        middle: prevKC.middle,
        lower: prevKC.lower,
        width: prevChannelWidth
      }
    },
    position: {
      aboveUpper,
      belowLower,
      closeToUpper,
      closeToLower,
      percentFromLower: ((lastClose - lastKC.lower) / channelWidth) * 100
    },
    breakouts: {
      breakoutUpper,
      breakoutLower,
      bouncedFromUpper,
      bouncedFromLower
    },
    trend: {
      midlineUptrend,
      midlineDowntrend,
      midlineIncreasing: currMid > prevMid
    },
    volatility: {
      channelWidth,
      channelNarrowing
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeKeltnerChannel };
