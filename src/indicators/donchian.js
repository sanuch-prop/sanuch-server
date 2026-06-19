// Donchian Channel индикатор
const { calculateDonchianChannel } = require('./utils');

/**
 * Анализ Donchian Channel
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeDonchianChannel(candles, settings = {}) {
  const {
    period = 20,
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

  const dcValues = calculateDonchianChannel(candles, period);
  
  const lastDC = dcValues[dcValues.length - 1];
  const prevDC = dcValues[dcValues.length - 2];
  const lastClose = candles[candles.length - 1].close;

  if (!lastDC || !prevDC) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа Donchian Channel' };
  }

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  // Определяем позицию цены относительно канала
  const atHighBreakout = lastClose >= lastDC.high;
  const atLowBreakout = lastClose <= lastDC.low;
  const channelWidth = lastDC.high - lastDC.low;
  const channelMid = (lastDC.high + lastDC.low) / 2;

  // Проверяем прорывы канала
  const prevClose = candles[candles.length - 2].close;
  const breakoutHigh = prevClose < lastDC.high && lastClose >= lastDC.high;
  const breakoutLow = prevClose > lastDC.low && lastClose <= lastDC.low;
  const wasInsideChannel = prevClose > prevDC.low && prevClose < prevDC.high;

  if (breakoutHigh && wasInsideChannel) {
    signalType = 'CALL';
    action = 'BREAKOUT_HIGH';
    confidence = 0.75;
  } else if (breakoutLow && wasInsideChannel) {
    signalType = 'PUT';
    action = 'BREAKOUT_LOW';
    confidence = 0.75;
  } else if (atHighBreakout && lastClose > channelMid) {
    signalType = 'CALL';
    action = 'NEAR_HIGH';
    confidence = 0.55;
  } else if (atLowBreakout && lastClose < channelMid) {
    signalType = 'PUT';
    action = 'NEAR_LOW';
    confidence = 0.55;
  }

  const prevChannelWidth = prevDC.high - prevDC.low;
  const channelNarrowing = channelWidth < prevChannelWidth;

  return {
    ok: true,
    ready: true,
    indicator: 'donchian-channel',
    symbol,
    timeframe,
    settings: { period },
    signal: signalType,
    action,
    confidence,
    values: {
      current: {
        high: lastDC.high,
        low: lastDC.low,
        close: lastClose,
        width: channelWidth,
        mid: channelMid
      },
      previous: {
        high: prevDC.high,
        low: prevDC.low,
        width: prevChannelWidth
      }
    },
    position: {
      atHighBreakout,
      atLowBreakout,
      percentFromLow: ((lastClose - lastDC.low) / channelWidth) * 100
    },
    breakouts: {
      breakoutHigh,
      breakoutLow,
      wasInsideChannel
    },
    volatility: {
      channelWidth,
      channelNarrowing
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeDonchianChannel };
