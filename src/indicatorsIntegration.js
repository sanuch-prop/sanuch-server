/**
 * ИНТЕГРАЦИЯ СИСТЕМ ИНДИКАТОРОВ
 * 
 * Объединяет существующие индикаторы signalEngine.js с новой системой indicators/
 * Позволяет использовать оба набора функций без конфликтов
 */

const oldIndicators = require('./signalEngine');
const newIndicators = require('./indicators');

/**
 * Унифицированный анализ индикатора
 * Пытается использовать новую систему, если доступно, иначе fallback на старую
 * 
 * @param {Array} candles - свечи OHLC
 * @param {String|Object} indicatorId - ID или конфиг индикатора
 * @param {Object} options - опции
 * @returns {Object} результат анализа
 */
function analyzeIndicator(candles, indicatorId, options = {}) {
  // Нормализуем ID
  const id = typeof indicatorId === 'string' 
    ? indicatorId.toLowerCase() 
    : (indicatorId.id || indicatorId.indicatorId || 'moving-average').toLowerCase();

  // Пытаемся использовать новую систему (если индикатор там есть)
  if (newIndicators.INDICATORS[id]) {
    try {
      const result = newIndicators.analyzeIndicator(id, candles, {
        symbol: options.symbol,
        timeframe: options.timeframe,
        ...options
      });

      // Преобразуем формат результата для совместимости
      if (result.ok && result.ready && result.signal !== 'NONE') {
        return {
          ok: true,
          ready: true,
          id,
          symbol: options.symbol || 'UNKNOWN',
          timeframe: options.timeframe || 'S15',
          side: result.signal === 'CALL' ? 'BUY' : result.signal === 'PUT' ? 'SELL' : 'WAIT',
          action: result.action,
          score: Math.round(result.confidence * 100),
          confidence: result.confidence,
          reasons: [`${result.action} (${(result.confidence * 100).toFixed(0)}%)`],
          values: result.values,
          indicator: id,
          source: 'new'
        };
      } else if (result.ok) {
        return {
          ok: true,
          ready: result.ready,
          id,
          symbol: options.symbol || 'UNKNOWN',
          timeframe: options.timeframe || 'S15',
          side: 'WAIT',
          action: result.action || 'NO_SIGNAL',
          score: 0,
          confidence: 0,
          reasons: [result.error || 'Недостаточно данных'],
          values: result.values || {},
          indicator: id,
          source: 'new',
          error: result.error
        };
      }
    } catch (err) {
      console.warn(`Ошибка новой системы для ${id}:`, err.message);
    }
  }

  // Fallback на старую систему если индикатора нет в новой или произошла ошибка
  try {
    return oldIndicators.analyzeIndicator(candles, { id, ...options }, options);
  } catch (err) {
    return {
      ok: false,
      error: `Индикатор "${id}" не найден в обеих системах`,
      available: [
        ...Object.keys(newIndicators.INDICATORS),
        // старые индикаторы
      ]
    };
  }
}

/**
 * Получить список всех доступных индикаторов (обе системы)
 */
function getAllIndicators() {
  const newList = newIndicators.listIndicators();
  
  // Старые индикаторы (которые были в signalEngine.js)
  const oldList = [
    { id: 'alligator', name: 'Alligator', category: 'trend', source: 'old' },
    { id: 'aroon', name: 'Aroon', category: 'trend', source: 'old' },
    { id: 'ichimoku', name: 'Ichimoku', category: 'trend', source: 'old' },
    { id: 'rsi', name: 'RSI', category: 'oscillators', source: 'old' },
    { id: 'cci', name: 'CCI', category: 'oscillators', source: 'old' },
    { id: 'demarker', name: 'DeMarker', category: 'oscillators', source: 'old' },
    { id: 'macd', name: 'MACD', category: 'oscillators', source: 'old' },
    { id: 'osma', name: 'OsMA', category: 'oscillators', source: 'old' },
    { id: 'stochastic', name: 'Stochastic', category: 'oscillators', source: 'old' },
    { id: 'williams-r', name: 'Williams %R', category: 'oscillators', source: 'old' },
    { id: 'schaff-trend-cycle', name: 'STC', category: 'oscillators', source: 'old' },
  ];
  
  // Объединяем, убирая дубликаты
  const all = [];
  const seen = new Set();
  
  // Сначала новые индикаторы
  newList.forEach(ind => {
    const key = ind.id.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      all.push({ ...ind, source: 'new' });
    }
  });
  
  // Затем старые (которые не перекрыты новыми)
  oldList.forEach(ind => {
    const key = ind.id.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      all.push(ind);
    }
  });
  
  return all;
}

/**
 * Информация об индикаторе
 */
function getIndicatorInfo(indicatorId) {
  const id = indicatorId.toLowerCase();
  
  // Сначала пытаемся новую систему
  if (newIndicators.INDICATORS[id]) {
    const info = newIndicators.getIndicatorInfo(id);
    return { ...info, source: 'new' };
  }
  
  // Затем старую систему
  const allInds = getAllIndicators();
  const found = allInds.find(i => i.id.toLowerCase() === id);
  
  if (found) {
    return { ...found, ok: true };
  }
  
  return {
    ok: false,
    error: `Индикатор "${id}" не найден`
  };
}

/**
 * Комбинированный анализ нескольких индикаторов
 */
function analyzeMultiple(candles, indicatorIds, options = {}) {
  const results = {};
  const signals = [];
  
  indicatorIds.forEach(id => {
    const result = analyzeIndicator(candles, id, options);
    results[id] = result;
    
    if (result.ok && result.ready && result.side !== 'WAIT') {
      signals.push({
        indicator: id,
        signal: result.side,
        score: result.score,
        confidence: result.confidence
      });
    }
  });
  
  // Вычисляем консенсус
  let consensus = 'WAIT';
  let totalScore = 0;
  let buyCount = 0, sellCount = 0;
  
  signals.forEach(sig => {
    totalScore += sig.score;
    if (sig.signal === 'BUY') buyCount++;
    else if (sig.signal === 'SELL') sellCount++;
  });
  
  if (signals.length > 0) {
    const avgScore = Math.round(totalScore / signals.length);
    if (buyCount > sellCount) {
      consensus = 'BUY';
    } else if (sellCount > buyCount) {
      consensus = 'SELL';
    }
  }
  
  return {
    ok: true,
    results,
    signals,
    consensus,
    agree: buyCount + sellCount > 0 ? (Math.max(buyCount, sellCount) / signals.length * 100).toFixed(0) : 0,
    timestamp: new Date().toISOString()
  };
}

/**
 * Фильтр по уверенности
 */
function filterByConfidence(candles, indicatorIds, minConfidence = 0.65, options = {}) {
  const analysis = analyzeMultiple(candles, indicatorIds, options);
  
  const strong = Object.entries(analysis.results)
    .filter(([id, result]) => result.ok && result.ready && (result.confidence || 0) >= minConfidence && result.side !== 'WAIT')
    .map(([id, result]) => ({
      indicator: id,
      signal: result.side,
      confidence: result.confidence,
      score: result.score
    }));
  
  return {
    ...analysis,
    strongSignals: strong,
    hasStrongSignal: strong.length > 0
  };
}

module.exports = {
  // Основные функции
  analyzeIndicator,
  analyzeMultiple,
  filterByConfidence,
  getAllIndicators,
  getIndicatorInfo,
  
  // Доступ к обеим системам
  newIndicators,
  oldIndicators,
  
  // Информация о версиях
  info: {
    description: 'Объединённая система индикаторов',
    newSystem: '18 новых индикаторов со свечами',
    oldSystem: 'Исходные индикаторы signalEngine.js',
    version: '1.0.0',
    date: '2026-06-05'
  }
};
