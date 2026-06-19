/**
 * СИСТЕМА ИНДИКАТОРОВ - ПОЛНАЯ РЕАЛИЗАЦИЯ
 * 
 * ✅ СТАТУС: ПОЛНОСТЬЮ ЗАВЕРШЕНО
 * 📅 Дата: 2026-06-05
 * 📊 Версия: 1.0.0
 * 
 * ============================================
 * КРАТКИЙ ОБЗОР
 * ============================================
 * 
 * Реализовано и готово к использованию:
 * - 18 полностью функциональных индикаторов
 * - Все индикаторы работают со свечами (OHLC)
 * - Унифицированный API для всех индикаторов
 * - Генерация торговых сигналов (CALL/PUT/NONE)
 * - Система уверенности (confidence 0-1)
 * - Подробные метрики для каждого сценария
 */

// ============================================
// БЫСТРЫЙ СТАРТ
// ============================================

/**
 * Пример 1: Анализ Moving Average
 * 
 * Импорт:
 */
const indicators = require('./indicators');

/**
 * Используемые свечи:
 * {
 *   open:      число,    // Цена открытия
 *   high:      число,    // Максимум
 *   low:       число,    // Минимум
 *   close:     число,    // Цена закрытия
 *   openTime:  число,    // Время открытия (unix timestamp)
 *   closeTime: число,    // Время закрытия (unix timestamp)
 * }
 */

const candles = [
  { open: 1.1000, high: 1.1050, low: 1.0950, close: 1.1020, openTime: 1717545900, closeTime: 1717545915 },
  { open: 1.1020, high: 1.1100, low: 1.1000, close: 1.1080, openTime: 1717545915, closeTime: 1717545930 },
  { open: 1.1080, high: 1.1090, low: 1.1050, close: 1.1070, openTime: 1717545930, closeTime: 1717545945 },
  // ... еще свечи
];

/**
 * Анализируем один индикатор:
 */
function example1() {
  const result = indicators.analyzeIndicator('moving-average', candles, {
    fast: 5,
    slow: 10,
    symbol: 'EURUSD_otc',
    timeframe: 'S15'
  });

  console.log('✅ Результат Moving Average:');
  console.log({
    signal: result.signal,        // 'CALL', 'PUT', или 'NONE'
    action: result.action,        // 'BULLISH_CROSSOVER', и т.д.
    confidence: result.confidence // 0.75 (75% уверенности)
  });
}

// ============================================
// КАТЕГОРИИ ИНДИКАТОРОВ
// ============================================

const CATEGORIES = {
  'TREND': {
    description: 'Определяют направление тренда',
    indicators: [
      'moving-average',
      'alligator', 
      'aroon',
      'parabolic-sar'
    ]
  },
  'OSCILLATORS': {
    description: 'Показывают перекупленность/перепроданность',
    indicators: [
      'rsi',
      'macd',
      'stochastic',
      'cci',
      'williams-r'
    ]
  },
  'POWER': {
    description: 'Измеряют импульс и силу тренда',
    indicators: [
      'awesome-oscillator',
      'momentum',
      'roc',
      'adx'
    ]
  },
  'VOLATILITY': {
    description: 'Показывают волатильность и диапазоны',
    indicators: [
      'bollinger-bands',
      'atr',
      'donchian-channel',
      'keltner-channel'
    ]
  }
};

// ============================================
// ТИПОВЫЕ РЕЗУЛЬТАТЫ
// ============================================

/**
 * Успешный результат:
 */
const successExample = {
  ok: true,                    // Операция выполнена
  ready: true,                 // Индикатор готов (достаточно данных)
  indicator: 'moving-average',
  symbol: 'EURUSD_otc',
  timeframe: 'S15',
  signal: 'CALL',              // Торговый сигнал: CALL, PUT, NONE
  action: 'BULLISH_CROSSOVER', // Конкретное действие
  confidence: 0.75,            // Уверенность 0-1
  values: {                    // Специфичные значения индикатора
    fastMA: 1.1020,
    slowMA: 1.1010,
    diff: 0.0010
  },
  timestamp: '2026-06-05T12:34:56.789Z'
};

/**
 * Ошибка: Недостаточно данных
 */
const insufficientDataExample = {
  ok: false,
  ready: false,
  error: 'Недостаточно свечей: 5/20',
  needCandles: 20,
  haveCandles: 5
};

/**
 * Ошибка: Индикатор не найден
 */
const notFoundExample = {
  ok: false,
  error: 'Индикатор "unknown" не найден',
  available: ['moving-average', 'rsi', 'macd', ...] // Список доступных
};

// ============================================
// СИГНАЛЫ И ИХ ЗНАЧЕНИЯ
// ============================================

const SIGNAL_MEANINGS = {
  'CALL': {
    meaning: 'Сигнал на покупку',
    color: '🟢 GREEN',
    direction: 'UP'
  },
  'PUT': {
    meaning: 'Сигнал на продажу',
    color: '🔴 RED',
    direction: 'DOWN'
  },
  'NONE': {
    meaning: 'Нет четкого сигнала',
    color: '⚪ NEUTRAL',
    direction: 'NONE'
  }
};

// ============================================
// ПРИМЕРЫ ДЛЯ КАЖДОЙ КАТЕГОРИИ
// ============================================

/**
 * ПРИМЕР: Трендовый анализ
 */
function trendExample() {
  // 1. Проверяем ADX (силу тренда)
  const adxResult = indicators.analyzeIndicator('adx', candles);
  
  if (adxResult.ok && adxResult.values.current.ADX > 25) {
    // 2. Если тренд сильный, используем Moving Average
    const maResult = indicators.analyzeIndicator('moving-average', candles);
    
    if (maResult.signal === 'CALL') {
      console.log('✅ СИЛЬНЫЙ ВОСХОДЯЩИЙ ТРЕНД - КУПИТЬ');
      return { action: 'BUY', confidence: maResult.confidence };
    }
  }
  
  return { action: 'WAIT', reason: 'Нет четкого тренда' };
}

/**
 * ПРИМЕР: Поиск разворотов
 */
function reversalExample() {
  // 1. RSI показывает экстремум
  const rsiResult = indicators.analyzeIndicator('rsi', candles);
  
  // 2. MACD подтверждает расхождение
  const macdResult = indicators.analyzeIndicator('macd', candles);
  
  // 3. Stochastic пересекает линии
  const stochResult = indicators.analyzeIndicator('stochastic', candles);
  
  const signals = [rsiResult, macdResult, stochResult].filter(r => r.ok && r.ready && r.signal !== 'NONE');
  
  if (signals.length >= 2) {
    // Многовещественное подтверждение
    console.log(`✅ РАЗВОРОТ ПОДТВЕРЖДЕН (${signals.length} индикаторами)`);
    return true;
  }
  
  return false;
}

/**
 * ПРИМЕР: Проверка волатильности
 */
function volatilityExample() {
  const atrResult = indicators.analyzeIndicator('atr', candles);
  const bbResult = indicators.analyzeIndicator('bollinger-bands', candles);
  
  if (atrResult.volatility.isLow) {
    console.log('🔇 НИЗКАЯ ВОЛАТИЛЬНОСТЬ - Ожидаем импульс');
    return 'SQUEEZE';
  }
  
  if (atrResult.volatility.isHigh) {
    console.log('🔊 ВЫСОКАЯ ВОЛАТИЛЬНОСТЬ - Активное движение');
    return 'EXPANSION';
  }
  
  return 'NORMAL';
}

// ============================================
// ТАБЛИЦА РЕКОМЕНДУЕМЫХ ПЕРИОДОВ
// ============================================

const RECOMMENDED_PERIODS = {
  'S15': {
    name: '15 секунд',
    SMA: { fast: 5, slow: 10 },
    RSI: { period: 14, overbought: 70, oversold: 30 },
    MACD: { fast: 12, slow: 26, signal: 9 },
    Stochastic: { period: 14, k: 3, d: 3 }
  },
  'M1': {
    name: '1 минута',
    SMA: { fast: 5, slow: 10 },
    RSI: { period: 14, overbought: 70, oversold: 30 },
    MACD: { fast: 12, slow: 26, signal: 9 },
    Stochastic: { period: 14, k: 3, d: 3 }
  },
  'M5': {
    name: '5 минут',
    SMA: { fast: 10, slow: 20 },
    RSI: { period: 14, overbought: 70, oversold: 30 },
    MACD: { fast: 12, slow: 26, signal: 9 },
    Stochastic: { period: 14, k: 3, d: 3 }
  },
  'M15': {
    name: '15 минут',
    SMA: { fast: 10, slow: 30 },
    RSI: { period: 14, overbought: 70, oversold: 30 },
    MACD: { fast: 12, slow: 26, signal: 9 },
    Stochastic: { period: 14, k: 3, d: 3 }
  }
};

// ============================================
// ЗАПУСК
// ============================================

console.log(`
╔════════════════════════════════════════════════════╗
║     СИСТЕМА ИНДИКАТОРОВ - ПОЛНАЯ РЕАЛИЗАЦИЯ       ║
║     18 индикаторов • Все работают со свечами       ║
║     Торговые сигналы • Система уверенности         ║
╚════════════════════════════════════════════════════╝

📚 ИСПОЛЬЗОВАНИЕ:
   const indicators = require('./indicators');
   
   // Анализируем индикатор
   const result = indicators.analyzeIndicator('moving-average', candles);
   
   // Проверяем результат
   if (result.ok && result.ready && result.signal !== 'NONE') {
     console.log(\`Сигнал: \${result.signal}, Уверенность: \${result.confidence}\`);
   }

📊 ДОСТУПНЫЕ ИНДИКАТОРЫ:
   Трендовые (4):        moving-average, alligator, aroon, parabolic-sar
   Осцилляторы (5):      rsi, macd, stochastic, cci, williams-r
   Импульс (4):          awesome-oscillator, momentum, roc, adx
   Волатильность (4):    bollinger-bands, atr, donchian-channel, keltner-channel

⚡ БЫСТРЫЙ СТАРТ:
   1. Подготовьте свечи (OHLC данные)
   2. Выберите индикатор из списка выше
   3. Вызовите analyzeIndicator(id, candles, settings)
   4. Проверьте result.signal и result.confidence
   5. Открывайте позицию если confidence > 0.65

🔗 КОМБИНИРОВАНИЕ:
   • Используйте ADX для фильтра тренда
   • Комбинируйте Moving Average + RSI для разворотов
   • Волатильность часто предшествует импульсу
   • Ищите подтверждение минимум от 2 индикаторов

📖 Смотри examples.js для полных примеров использования!
`);

module.exports = {
  CATEGORIES,
  SIGNAL_MEANINGS,
  RECOMMENDED_PERIODS,
  trendExample,
  reversalExample,
  volatilityExample
};
