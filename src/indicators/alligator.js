// Alligator индикатор (Три сглаженные средние)
const { calculateSMA } = require('./utils');

/**
 * Анализ Alligator
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeAlligator(candles, settings = {}) {
  const {
    jawPeriod = 13,
    jawOffset = 8,
    teethPeriod = 8,
    teethOffset = 5,
    lipsPeriod = 5,
    lipsOffset = 3,
    symbol = 'UNKNOWN',
    timeframe = 'S15'
  } = settings;

  if (!Array.isArray(candles) || candles.length === 0) {
    return { ok: false, ready: false, error: 'Нет данных свечей' };
  }

  const maxPeriod = Math.max(jawPeriod, teethPeriod, lipsPeriod) + Math.max(jawOffset, teethOffset, lipsOffset);
  if (candles.length < maxPeriod + 5) {
    return {
      ok: false,
      ready: false,
      error: `Недостаточно свечей: ${candles.length}/${maxPeriod + 5}`,
      needCandles: maxPeriod + 5
    };
  }

  // Используем Typical Price (High + Low + Close) / 3
  const tp = candles.map(c => (c.high + c.low + c.close) / 3);

  // Вычисляем SMA
  const jaw = calculateSMA(tp, jawPeriod);
  const teeth = calculateSMA(tp, teethPeriod);
  const lips = calculateSMA(tp, lipsPeriod);

  // Применяем смещения (сдвиг влево)
  const shiftJaw = jaw.slice(jawOffset);
  const shiftTeeth = teeth.slice(teethOffset);
  const shiftLips = lips.slice(lipsOffset);

  const lastJaw = shiftJaw[shiftJaw.length - 1];
  const lastTeeth = shiftTeeth[shiftTeeth.length - 1];
  const lastLips = shiftLips[shiftLips.length - 1];

  const prevJaw = shiftJaw[shiftJaw.length - 2];
  const prevTeeth = shiftTeeth[shiftTeeth.length - 2];
  const prevLips = shiftLips[shiftLips.length - 2];

  if (!lastJaw || !lastTeeth || !lastLips) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа Alligator' };
  }

  // Определяем состояние аллигатора
  const isIntertwined = Math.abs(lastJaw - lastTeeth) < (Math.abs(lastTeeth - lastLips) * 0.5);
  const jawAboveTeethAboveLips = lastJaw > lastTeeth && lastTeeth > lastLips;
  const jawBelowTeethBelowLips = lastJaw < lastTeeth && lastTeeth < lastLips;

  // Проверяем раскрытие пасти (divergence between lines)
  const jawTeethDiff = Math.abs(lastJaw - lastTeeth);
  const teethLipsDiff = Math.abs(lastTeeth - lastLips);
  const isOpening = jawTeethDiff > Math.abs(prevJaw - prevTeeth);

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  if (jawAboveTeethAboveLips && isOpening) {
    signalType = 'CALL';
    action = 'UPTREND_FORMING';
    confidence = 0.75;
  } else if (jawBelowTeethBelowLips && isOpening) {
    signalType = 'PUT';
    action = 'DOWNTREND_FORMING';
    confidence = 0.75;
  } else if (isIntertwined) {
    signalType = 'NONE';
    action = 'CONSOLIDATION';
    confidence = 0.60;
  } else if (jawAboveTeethAboveLips) {
    signalType = 'CALL';
    action = 'UPTREND';
    confidence = 0.65;
  } else if (jawBelowTeethBelowLips) {
    signalType = 'PUT';
    action = 'DOWNTREND';
    confidence = 0.65;
  }

  return {
    ok: true,
    ready: true,
    indicator: 'alligator',
    symbol,
    timeframe,
    settings: { jawPeriod, teethPeriod, lipsPeriod },
    signal: signalType,
    action,
    confidence,
    values: {
      current: {
        jaw: lastJaw,
        teeth: lastTeeth,
        lips: lastLips
      },
      previous: {
        jaw: prevJaw,
        teeth: prevTeeth,
        lips: prevLips
      }
    },
    state: {
      isIntertwined,
      jawAboveTeethAboveLips,
      jawBelowTeethBelowLips,
      isOpening,
      jawTeethDiff,
      teethLipsDiff
    },
    trend: jawAboveTeethAboveLips ? 'UPTREND' : jawBelowTeethBelowLips ? 'DOWNTREND' : 'CONSOLIDATION',
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeAlligator };
