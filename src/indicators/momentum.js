// Momentum и ROC индикаторы
const { calculateMomentum, calculateROC } = require('./utils');

/**
 * Анализ Momentum
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeMomentum(candles, settings = {}) {
  const {
    period = 10,
    symbol = 'UNKNOWN',
    timeframe = 'S15'
  } = settings;

  if (!Array.isArray(candles) || candles.length === 0) {
    return { ok: false, ready: false, error: 'Нет данных свечей' };
  }

  if (candles.length < period + 2) {
    return {
      ok: false,
      ready: false,
      error: `Недостаточно свечей: ${candles.length}/${period + 2}`,
      needCandles: period + 2
    };
  }

  const closes = candles.map(c => c.close);
  const momValues = calculateMomentum(closes, period);
  
  const lastMom = momValues[momValues.length - 1];
  const prevMom = momValues[momValues.length - 2];
  const prev2Mom = momValues[momValues.length - 3];

  if (lastMom === null) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа Momentum' };
  }

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  const isPositive = lastMom > 0;
  const isIncreasing = lastMom > prevMom;
  const crossedZero = prevMom < 0 && lastMom > 0 || prevMom > 0 && lastMom < 0;

  if (crossedZero && isPositive) {
    signalType = 'CALL';
    action = 'CROSSED_ZERO_UP';
    confidence = 0.70;
  } else if (crossedZero && !isPositive) {
    signalType = 'PUT';
    action = 'CROSSED_ZERO_DOWN';
    confidence = 0.70;
  } else if (isPositive && isIncreasing) {
    signalType = 'CALL';
    action = 'POSITIVE_INCREASING';
    confidence = 0.60;
  } else if (!isPositive && !isIncreasing) {
    signalType = 'PUT';
    action = 'NEGATIVE_DECREASING';
    confidence = 0.60;
  }

  return {
    ok: true,
    ready: true,
    indicator: 'momentum',
    symbol,
    timeframe,
    settings: { period },
    signal: signalType,
    action,
    confidence,
    values: {
      current: lastMom,
      previous: prevMom,
      prev2: prev2Mom
    },
    direction: {
      positive: isPositive,
      increasing: isIncreasing,
      crossedZero
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Анализ Rate of Change (ROC)
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeROC(candles, settings = {}) {
  const {
    period = 12,
    symbol = 'UNKNOWN',
    timeframe = 'S15'
  } = settings;

  if (!Array.isArray(candles) || candles.length === 0) {
    return { ok: false, ready: false, error: 'Нет данных свечей' };
  }

  if (candles.length < period + 2) {
    return {
      ok: false,
      ready: false,
      error: `Недостаточно свечей: ${candles.length}/${period + 2}`,
      needCandles: period + 2
    };
  }

  const closes = candles.map(c => c.close);
  const rocValues = calculateROC(closes, period);
  
  const lastROC = rocValues[rocValues.length - 1];
  const prevROC = rocValues[rocValues.length - 2];
  const prev2ROC = rocValues[rocValues.length - 3];

  if (lastROC === null) {
    return { ok: false, ready: false, error: 'Недостаточно данных для анализа ROC' };
  }

  let signalType = 'NONE';
  let action = null;
  let confidence = 0;

  const isPositive = lastROC > 0;
  const isIncreasing = lastROC > prevROC;
  const crossedZero = prevROC < 0 && lastROC > 0 || prevROC > 0 && lastROC < 0;
  const extreme = Math.abs(lastROC) > 5;

  if (crossedZero && isPositive) {
    signalType = 'CALL';
    action = 'CROSSED_ZERO_UP';
    confidence = extreme ? 0.75 : 0.65;
  } else if (crossedZero && !isPositive) {
    signalType = 'PUT';
    action = 'CROSSED_ZERO_DOWN';
    confidence = extreme ? 0.75 : 0.65;
  } else if (isPositive && extreme && isIncreasing) {
    signalType = 'CALL';
    action = 'STRONG_POSITIVE_MOMENTUM';
    confidence = 0.70;
  } else if (!isPositive && extreme && !isIncreasing) {
    signalType = 'PUT';
    action = 'STRONG_NEGATIVE_MOMENTUM';
    confidence = 0.70;
  }

  return {
    ok: true,
    ready: true,
    indicator: 'roc',
    symbol,
    timeframe,
    settings: { period },
    signal: signalType,
    action,
    confidence,
    values: {
      current: lastROC,
      previous: prevROC,
      prev2: prev2ROC
    },
    direction: {
      positive: isPositive,
      increasing: isIncreasing,
      crossedZero,
      extreme
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = { analyzeMomentum, analyzeROC };
