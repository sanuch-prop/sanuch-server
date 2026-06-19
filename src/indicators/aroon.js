// Aroon индикатор
/**
 * Анализ Aroon
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeAroon(candles, settings = {}) {
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

  const result = [];

  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    
    // Находим последний максимум и минимум
    let maxIdx = 0;
    let minIdx = 0;
    let maxHigh = slice[0].high;
    let minLow = slice[0].low;

    for (let j = 1; j < slice.length; j++) {
      if (slice[j].high > maxHigh) {
        maxHigh = slice[j].high;
        maxIdx = j;
      }
      if (slice[j].low < minLow) {
        minLow = slice[j].low;
        minIdx = j;
      }
    }

    // Aroon Up = ((period - periods since max) / period) * 100
    // Aroon Down = ((period - periods since min) / period) * 100
    const aroonUp = ((period - (slice.length - 1 - maxIdx)) / period) * 100;
    const aroonDown = ((period - (slice.length - 1 - minIdx)) / period) * 100;

    result.push({
      aroonUp,
      aroonDown,
      oscillator: aroonUp - aroonDown
    });
  }

  const lastAroon = result[result.length - 1];
  const prevAroon = result.length > 1 ? result[result.length - 2] : null;
  const prev2Aroon = result.length > 2 ? result[result.length - 3] : null;

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  // Анализ сигналов
  const upCrossover = prevAroon && prevAroon.aroonUp < prevAroon.aroonDown && 
    lastAroon.aroonUp > lastAroon.aroonDown && lastAroon.aroonUp > 50;
  const downCrossover = prevAroon && prevAroon.aroonUp > prevAroon.aroonDown && 
    lastAroon.aroonUp < lastAroon.aroonDown && lastAroon.aroonDown > 50;

  if (lastAroon.aroonUp > 70 && upCrossover) {
    signalType = 'CALL';
    action = 'BULLISH_CROSSOVER';
    confidence = 0.75;
  } else if (lastAroon.aroonDown > 70 && downCrossover) {
    signalType = 'PUT';
    action = 'BEARISH_CROSSOVER';
    confidence = 0.75;
  } else if (lastAroon.aroonUp > 70 && lastAroon.aroonUp > lastAroon.aroonDown) {
    signalType = 'CALL';
    action = 'STRONG_UPTREND';
    confidence = 0.65;
  } else if (lastAroon.aroonDown > 70 && lastAroon.aroonDown > lastAroon.aroonUp) {
    signalType = 'PUT';
    action = 'STRONG_DOWNTREND';
    confidence = 0.65;
  }

  return {
    ok: true,
    ready: true,
    indicator: 'aroon',
    symbol,
    timeframe,
    settings: { period },
    signal: signalType,
    action,
    confidence,
    values: {
      current: {
        aroonUp: lastAroon.aroonUp,
        aroonDown: lastAroon.aroonDown,
        oscillator: lastAroon.oscillator
      },
      previous: prevAroon ? {
        aroonUp: prevAroon.aroonUp,
        aroonDown: prevAroon.aroonDown,
        oscillator: prevAroon.oscillator
      } : null
    },
    levels: {
      aroonUpAbove70: lastAroon.aroonUp > 70,
      aroonDownAbove70: lastAroon.aroonDown > 70,
      crossover: lastAroon.aroonUp > lastAroon.aroonDown
    },
    trend: lastAroon.aroonUp > lastAroon.aroonDown ? 'UPTREND' : 'DOWNTREND',
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeAroon };
