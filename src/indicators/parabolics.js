// Parabolic SAR индикатор
const { calculateATR } = require('./utils');

/**
 * Анализ Parabolic SAR
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeParabolicSAR(candles, settings = {}) {
  const {
    initialAF = 0.02,
    maxAF = 0.2,
    symbol = 'UNKNOWN',
    timeframe = 'S15'
  } = settings;

  if (!Array.isArray(candles) || candles.length === 0) {
    return { ok: false, ready: false, error: 'Нет данных свечей' };
  }

  if (candles.length < 5) {
    return {
      ok: false,
      ready: false,
      error: `Недостаточно свечей: ${candles.length}/5`,
      needCandles: 5
    };
  }

  // Вычисляем SAR значения
  const sarValues = calculateParabolicSARValues(candles, initialAF, maxAF);
  
  const lastSAR = sarValues[sarValues.length - 1];
  const prevSAR = sarValues[sarValues.length - 2];
  const prev2SAR = sarValues[sarValues.length - 3];
  const lastClose = candles[candles.length - 1].close;

  if (!lastSAR) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа Parabolic SAR' };
  }

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  // Определяем направление тренда
  const uptrend = lastClose > lastSAR.sar;
  const downtrend = lastClose < lastSAR.sar;

  // Пересечение SAR
  const sarCrossoverUp = prevSAR && prevSAR.sar > prevClose(candles) && lastSAR.sar < lastClose;
  const sarCrossoverDown = prevSAR && prevSAR.sar < prevClose(candles) && lastSAR.sar > lastClose;

  if (uptrend && lastSAR.trend === 'UP') {
    signalType = 'CALL';
    action = 'UPTREND';
    confidence = 0.70;
  } else if (downtrend && lastSAR.trend === 'DOWN') {
    signalType = 'PUT';
    action = 'DOWNTREND';
    confidence = 0.70;
  } else if (sarCrossoverUp) {
    signalType = 'CALL';
    action = 'TREND_REVERSAL_UP';
    confidence = 0.75;
  } else if (sarCrossoverDown) {
    signalType = 'PUT';
    action = 'TREND_REVERSAL_DOWN';
    confidence = 0.75;
  }

  return {
    ok: true,
    ready: true,
    indicator: 'parabolic-sar',
    symbol,
    timeframe,
    settings: { initialAF, maxAF },
    signal: signalType,
    action,
    confidence,
    values: {
      current: {
        sar: lastSAR.sar,
        ep: lastSAR.ep,
        af: lastSAR.af,
        trend: lastSAR.trend
      },
      previous: prevSAR ? {
        sar: prevSAR.sar,
        ep: prevSAR.ep,
        af: prevSAR.af,
        trend: prevSAR.trend
      } : null
    },
    distance: Math.abs(lastClose - lastSAR.sar),
    trend: uptrend ? 'UPTREND' : downtrend ? 'DOWNTREND' : 'REVERSAL',
    timestamp: new Date().toISOString()
  };
}

function prevClose(candles) {
  return candles[candles.length - 2].close;
}

function calculateParabolicSARValues(candles, initialAF = 0.02, maxAF = 0.2) {
  const result = [];
  let uptrend = candles[1].close > candles[0].close;
  let sar = uptrend ? candles[0].low : candles[0].high;
  let ep = uptrend ? candles[1].high : candles[1].low;
  let af = initialAF;

  result.push({
    sar,
    ep,
    af,
    trend: uptrend ? 'UP' : 'DOWN'
  });

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;

    // Обновляем SAR
    sar = sar + af * (ep - sar);

    // Проверяем разворот
    if (uptrend) {
      if (low < sar) {
        uptrend = false;
        sar = ep;
        ep = low;
        af = initialAF;
      } else {
        if (high > ep) {
          ep = high;
          af = Math.min(af + initialAF, maxAF);
        }
        sar = Math.min(sar, candles[i - 1].low);
        if (i > 1) {
          sar = Math.min(sar, candles[i - 2].low);
        }
      }
    } else {
      if (high > sar) {
        uptrend = true;
        sar = ep;
        ep = high;
        af = initialAF;
      } else {
        if (low < ep) {
          ep = low;
          af = Math.min(af + initialAF, maxAF);
        }
        sar = Math.max(sar, candles[i - 1].high);
        if (i > 1) {
          sar = Math.max(sar, candles[i - 2].high);
        }
      }
    }

    result.push({
      sar,
      ep,
      af,
      trend: uptrend ? 'UP' : 'DOWN'
    });
  }

  return result;
}

module.exports = { analyzeParabolicSAR };
