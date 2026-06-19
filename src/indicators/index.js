// Индекс всех доступных индикаторов
// Всесторонний набор индикаторов для анализа свечей

const { analyzeMovingAverage } = require('./movingAverage');
const { analyzeRSI } = require('./rsi');
const { analyzeMACD } = require('./macd');
const { analyzeStochastic } = require('./stochastic');
const { analyzeBollingerBands } = require('./bollingerBands');
const { analyzeADX } = require('./adx');
const { analyzeATR } = require('./atr');
const { analyzeAwesomeOscillator } = require('./awesome');
const { analyzeCCI } = require('./cci');
const { analyzeWilliamsR } = require('./williamsR');
const { analyzeMomentum, analyzeROC } = require('./momentum');
const { analyzeDonchianChannel } = require('./donchian');
const { analyzeKeltnerChannel } = require('./keltner');
const { analyzeAlligator } = require('./alligator');
const { analyzeParabolicSAR } = require('./parabolics');
const { analyzeAroon } = require('./aroon');

// Словарь всех индикаторов для анализа
const INDICATORS = {
  // ============ ТРЕНДОВЫЕ ИНДИКАТОРЫ ============
  'moving-average': {
    name: 'Moving Average',
    ru: 'Скользящая средняя',
    description: 'Пересечение быстрой и медленной скользящих средних',
    category: 'trend',
    analyze: analyzeMovingAverage,
    defaultSettings: { fast: 5, slow: 10, type: 'SMA' }
  },
  'alligator': {
    name: 'Alligator',
    ru: 'Аллигатор',
    description: 'Три сглаженные средние для определения фазы рынка',
    category: 'trend',
    analyze: analyzeAlligator,
    defaultSettings: { jawPeriod: 13, teethPeriod: 8, lipsPeriod: 5 }
  },
  'aroon': {
    name: 'Aroon',
    ru: 'Арун',
    description: 'Измеряет время между максимумами/минимумами',
    category: 'trend',
    analyze: analyzeAroon,
    defaultSettings: { period: 14 }
  },
  'parabolic-sar': {
    name: 'Parabolic SAR',
    ru: 'Параболический SAR',
    description: 'Stop and Reverse точки для разворота тренда',
    category: 'trend',
    analyze: analyzeParabolicSAR,
    defaultSettings: { initialAF: 0.02, maxAF: 0.2 }
  },

  // ============ ОСЦИЛЛЯТОРЫ ============
  'rsi': {
    name: 'RSI',
    ru: 'Индекс относительной силы',
    description: 'Показывает перекупленность/перепроданность',
    category: 'oscillators',
    analyze: analyzeRSI,
    defaultSettings: { period: 14, overbought: 70, oversold: 30 }
  },
  'macd': {
    name: 'MACD',
    ru: 'MACD',
    description: 'Сходимость и расхождение скользящих средних',
    category: 'oscillators',
    analyze: analyzeMACD,
    defaultSettings: { fast: 12, slow: 26, signal: 9 }
  },
  'stochastic': {
    name: 'Stochastic Oscillator',
    ru: 'Стохастический осциллятор',
    description: 'Сравнивает цену закрытия с диапазоном high/low',
    category: 'oscillators',
    analyze: analyzeStochastic,
    defaultSettings: { period: 14, kPeriod: 3, dPeriod: 3, overbought: 80, oversold: 20 }
  },
  'cci': {
    name: 'CCI',
    ru: 'Индекс товарного канала',
    description: 'Показывает отклонения от среднего значения',
    category: 'oscillators',
    analyze: analyzeCCI,
    defaultSettings: { period: 20, overbought: 100, oversold: -100 }
  },
  'williams-r': {
    name: 'Williams %R',
    ru: 'Williams %R',
    description: 'Похож на Stochastic, показывает экстремумы',
    category: 'oscillators',
    analyze: analyzeWilliamsR,
    defaultSettings: { period: 14, overbought: -20, oversold: -80 }
  },

  // ============ ИНДИКАТОРЫ ИМПУЛЬСА И СИЛЫ ============
  'awesome-oscillator': {
    name: 'Awesome Oscillator',
    ru: 'Чудесный осциллятор',
    description: 'Показывает рыночный импульс',
    category: 'power',
    analyze: analyzeAwesomeOscillator,
    defaultSettings: { fast: 5, slow: 34 }
  },
  'momentum': {
    name: 'Momentum',
    ru: 'Импульс',
    description: 'Измеряет скорость изменения цены',
    category: 'power',
    analyze: analyzeMomentum,
    defaultSettings: { period: 10 }
  },
  'roc': {
    name: 'Rate of Change',
    ru: 'Скорость изменения',
    description: 'Процентное изменение цены за период',
    category: 'power',
    analyze: analyzeROC,
    defaultSettings: { period: 12 }
  },
  'adx': {
    name: 'ADX',
    ru: 'Индекс силы тренда',
    description: 'Определяет силу тренда без направления',
    category: 'power',
    analyze: analyzeADX,
    defaultSettings: { period: 14, strongTrend: 25, weakTrend: 20 }
  },

  // ============ ИНДИКАТОРЫ ВОЛАТИЛЬНОСТИ ============
  'bollinger-bands': {
    name: 'Bollinger Bands',
    ru: 'Полосы Боллинджера',
    description: 'Отслеживают волатильность и крайние отклонения',
    category: 'volatility',
    analyze: analyzeBollingerBands,
    defaultSettings: { period: 20, stdDev: 2 }
  },
  'atr': {
    name: 'Average True Range',
    ru: 'ATR',
    description: 'Показывает волатильность рынка',
    category: 'volatility',
    analyze: analyzeATR,
    defaultSettings: { period: 14 }
  },
  'donchian-channel': {
    name: 'Donchian Channel',
    ru: 'Канал Дончиана',
    description: 'Отслеживает максимумы и минимумы за период',
    category: 'volatility',
    analyze: analyzeDonchianChannel,
    defaultSettings: { period: 20 }
  },
  'keltner-channel': {
    name: 'Keltner Channel',
    ru: 'Канал Келтнера',
    description: 'Использует EMA и ATR для определения каналов',
    category: 'volatility',
    analyze: analyzeKeltnerChannel,
    defaultSettings: { emaPeriod: 20, atrPeriod: 10, atrMultiplier: 2 }
  }
};

/**
 * Получить анализ по индикатору
 * @param {string} indicatorId - ID индикатора (например 'moving-average')
 * @param {Array} candles - массив свечей
 * @param {Object} settings - настройки индикатора
 * @returns {Object} результат анализа
 */
function analyzeIndicator(indicatorId, candles, settings = {}) {
  const indicator = INDICATORS[indicatorId];
  
  if (!indicator) {
    return {
      ok: false,
      error: `Индикатор "${indicatorId}" не найден`,
      available: Object.keys(INDICATORS)
    };
  }

  try {
    const result = indicator.analyze(candles, {
      ...indicator.defaultSettings,
      ...settings
    });
    
    return {
      ...result,
      indicatorId,
      indicatorName: indicator.name
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      indicatorId,
      stack: err.stack
    };
  }
}

/**
 * Получить информацию об индикаторе
 * @param {string} indicatorId - ID индикатора
 * @returns {Object} информация об индикаторе
 */
function getIndicatorInfo(indicatorId) {
  const indicator = INDICATORS[indicatorId];
  
  if (!indicator) {
    return {
      ok: false,
      error: `Индикатор "${indicatorId}" не найден`
    };
  }

  return {
    ok: true,
    id: indicatorId,
    name: indicator.name,
    description: indicator.description,
    category: indicator.category,
    defaultSettings: indicator.defaultSettings
  };
}

/**
 * Список всех доступных индикаторов
 * @returns {Array} массив ID индикаторов
 */
function listIndicators() {
  return Object.entries(INDICATORS).map(([id, info]) => ({
    id,
    name: info.name,
    description: info.description,
    category: info.category
  }));
}

// Добавляем все утилиты для расчетов
const utils = require('./utils');

module.exports = {
  INDICATORS,
  analyzeIndicator,
  getIndicatorInfo,
  listIndicators,
  // Все утилиты для расчетов индикаторов
  ...utils
};
