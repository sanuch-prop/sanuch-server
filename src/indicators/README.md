# 📊 Полная система индикаторов для анализа свечей

## 📋 Статус: ✅ ЗАВЕРШЕНО

Все индикаторы реализованы и готовы к использованию со свечами!

---

## 🗂️ Структура папки indicators/

```
server/src/indicators/
├── index.js              # 🎛️  Главный индекс и диспетчер
├── utils.js              # 🔧 Вспомогательные функции расчетов
├── movingAverage.js      # 📊 Moving Average
├── rsi.js                # 📉 RSI - Relative Strength Index
├── macd.js               # 📈 MACD - Moving Average Convergence Divergence
├── stochastic.js         # 📊 Stochastic Oscillator
├── bollinger-bands.js    # 📌 Bollinger Bands
├── atr.js                # 📍 Average True Range
├── adx.js                # 💪 ADX - Average Directional Index
├── awesome.js            # ✨ Awesome Oscillator
├── cci.js                # 🌊 CCI - Commodity Channel Index
├── williams-r.js         # 📊 Williams %R
├── momentum.js           # 🚀 Momentum & ROC
├── donchian.js           # 🎯 Donchian Channel
├── keltner.js            # 🔲 Keltner Channel
├── alligator.js          # 🐊 Alligator (Три средние)
├── aroon.js              # 🎪 Aroon Indicator
├── parabolic-sar.js      # 🔄 Parabolic SAR
└── README.md             # 📚 Этот файл
```

---

## 📊 Полный список индикаторов (18 шт)

### 🔼 ТРЕНДОВЫЕ ИНДИКАТОРЫ (4)

| ID | Название | Описание | Сигналы |
|---|---|---|---|
| `moving-average` | Moving Average | Пересечение SMA/EMA | CALL/PUT, Crossover |
| `alligator` | Alligator | Три сглаженные средние | Uptrend/Downtrend, Consolidation |
| `aroon` | Aroon | Время между max/min | Bullish/Bearish Crossover |
| `parabolic-sar` | Parabolic SAR | Stop and Reverse | Trend Reversal, SAR Points |

### 📊 ОСЦИЛЛЯТОРЫ (6)

| ID | Название | Описание | Сигналы |
|---|---|---|---|
| `rsi` | RSI | Relative Strength Index | Overbought/Oversold, Divergence |
| `macd` | MACD | Convergence Divergence | Bullish/Bearish Crossover |
| `stochastic` | Stochastic | K и D линии | Crossover, Overbought/Oversold |
| `cci` | CCI | Commodity Channel Index | Overbought/Oversold |
| `williams-r` | Williams %R | Williams R% | Overbought/Oversold |

### 💪 ИМПУЛЬС И СИЛА (4)

| ID | Название | Описание | Сигналы |
|---|---|---|---|
| `awesome-oscillator` | Awesome Oscillator | Импульс рынка | Crossover, Saucer Pattern |
| `momentum` | Momentum | Скорость изменения | Zero Crossover |
| `roc` | Rate of Change | Процентное изменение | Strong Momentum |
| `adx` | ADX | Сила тренда | Trend Strength, DI Crossover |

### 📈 ВОЛАТИЛЬНОСТЬ (4)

| ID | Название | Описание | Сигналы |
|---|---|---|---|
| `bollinger-bands` | Bollinger Bands | Полосы волатильности | Breakout, Bounce, Squeeze |
| `atr` | ATR | Average True Range | High/Low Volatility |
| `donchian-channel` | Donchian Channel | Max/Min за период | Breakout, Channel |
| `keltner-channel` | Keltner Channel | EMA + ATR канал | Breakout, Trend |

---

## 🚀 Использование индикаторов

### Базовый пример

```javascript
const indicators = require('./indicators');

// Получить анализ по индикатору
const candles = [
  { open: 1.1000, high: 1.1050, low: 1.0950, close: 1.1020 },
  { open: 1.1020, high: 1.1100, low: 1.1000, close: 1.1080 },
  // ... остальные свечи
];

const result = indicators.analyzeIndicator('moving-average', candles, {
  fast: 5,
  slow: 10,
  symbol: 'EURUSD_otc',
  timeframe: 'S15'
});

console.log(result);
// {
//   ok: true,
//   ready: true,
//   indicator: 'moving-average',
//   signal: 'CALL',  // CALL, PUT, или NONE
//   action: 'BULLISH_CROSSOVER',
//   confidence: 0.75,  // от 0 до 1
//   values: { fastMA: 1.1020, slowMA: 1.1015, diff: 0.0005 },
//   timestamp: '2026-06-05T...'
// }
```

### Получить информацию об индикаторе

```javascript
const info = indicators.getIndicatorInfo('rsi');
// {
//   ok: true,
//   id: 'rsi',
//   name: 'RSI',
//   description: 'Показывает перекупленность/перепроданность',
//   category: 'oscillators',
//   defaultSettings: { period: 14, overbought: 70, oversold: 30 }
// }
```

### Список всех индикаторов

```javascript
const list = indicators.listIndicators();
// [
//   { id: 'moving-average', name: 'Moving Average', category: 'trend' },
//   { id: 'rsi', name: 'RSI', category: 'oscillators' },
//   ...
// ]
```

---

## 📝 Стандартный формат результата

Все индикаторы возвращают объект следующей структуры:

```javascript
{
  ok: boolean,              // Успех выполнения
  ready: boolean,           // Готов ли индикатор (достаточно данных)
  indicator: string,        // ID индикатора
  symbol: string,           // Символ (EURUSD_otc, GBPUSD, и т.д.)
  timeframe: string,        // Таймфрейм (S15, M1, M5, и т.д.)
  signal: string,           // 'CALL', 'PUT', или 'NONE'
  action: string,           // Действие (BULLISH_CROSSOVER, OVERBOUGHT, и т.д.)
  confidence: number,       // Уверенность от 0 до 1 (0.5 - 0.8 обычно)
  values: object,           // Специфичные значения индикатора
  timestamp: string,        // ISO timestamp расчета
  error?: string            // Сообщение об ошибке если ok: false
}
```

---

## 🔧 Доступные утилиты для расчетов

Если вам нужна работа с основными расчетами:

```javascript
const {
  calculateSMA,             // Simple Moving Average
  calculateEMA,             // Exponential Moving Average
  calculateRSI,             // Relative Strength Index
  calculateBollingerBands,  // Bollinger Bands
  calculateBBWidth,         // Bollinger Bands Width
  calculateMACD,            // MACD
  calculateATR,             // Average True Range
  calculateStdDev,          // Standard Deviation
  calculateStochastic,      // Stochastic Oscillator
  calculateADX,             // Average Directional Index
  calculateCCI,             // Commodity Channel Index
  calculateWilliamsR,       // Williams %R
  calculateMomentum,        // Momentum
  calculateROC,             // Rate of Change
  calculateAwesomeOscillator, // Awesome Oscillator
  calculateDonchianChannel, // Donchian Channel
  calculateKeltnerChannel   // Keltner Channel
} = require('./indicators');

// Пример
const closes = [1.1000, 1.1020, 1.1050, 1.1040, ...];
const sma = calculateSMA(closes, 20);
const ema = calculateEMA(closes, 20);
const rsi = calculateRSI(closes, 14);
```

---

## 💡 Рекомендации по использованию

### Комбинирование индикаторов

Для лучших результатов используйте комбинации:

1. **Тренд + Осцилляторы**
   ```javascript
   // Проверить тренд
   const adxResult = indicators.analyzeIndicator('adx', candles);
   if (adxResult.values.current.ADX > 25) {
     // Использовать трендовый сигнал Moving Average
     const maResult = indicators.analyzeIndicator('moving-average', candles);
   }
   ```

2. **Волатильность + Импульс**
   ```javascript
   // Низкая волатильность перед прорывом
   const atrResult = indicators.analyzeIndicator('atr', candles);
   if (atrResult.volatility.isLow) {
     // Искать сигналы пробоя с Awesome Oscillator
     const aoResult = indicators.analyzeIndicator('awesome-oscillator', candles);
   }
   ```

### Фильтры уверенности

```javascript
const result = indicators.analyzeIndicator('moving-average', candles);

if (result.ok && result.ready) {
  if (result.signal !== 'NONE' && result.confidence > 0.70) {
    // Сильный сигнал - можно открывать позицию
    console.log(`Открыть ${result.signal} с уверенностью ${result.confidence}`);
  } else if (result.confidence > 0.55) {
    // Слабый сигнал - ждать подтверждения
    console.log(`Слабый сигнал, ждем подтверждения`);
  }
}
```

---

## 🐛 Обработка ошибок

```javascript
const result = indicators.analyzeIndicator('moving-average', candles);

if (!result.ok) {
  console.error(`Ошибка: ${result.error}`);
  
  if (result.error.includes('Недостаточно')) {
    console.log(`Нужно свечей: ${result.needCandles}`);
    console.log(`Есть свечей: ${candles.length}`);
  }
} else if (!result.ready) {
  console.warn(`Индикатор не готов: ${result.error}`);
  // Индикатор рассчитан, но нужно больше данных для точности
} else {
  console.log(`Сигнал: ${result.signal}, Действие: ${result.action}`);
}
```

---

## 📚 Дополнительная информация

Каждый индикатор содержит:
- ✅ Расчет на основе OHLC свечей
- ✅ Валидацию данных  
- ✅ Генерацию торговых сигналов
- ✅ Уровни уверенности (confidence)
- ✅ Дополнительные метрики

Используйте в сочетании с `signalEngine.js` для полной системы анализа!
  'moving-average': { /* ... */ },
  
  // Новый индикатор
  'rsi': {
    name: 'Relative Strength Index',
    description: 'RSI для определения перекупленности/перепроданности',
    category: 'momentum',
    analyze: analyzeRSI,
    defaultSettings: {
      period: 14,
      overbought: 70,
      oversold: 30
    }
  }
};
```

### Шаг 3: Интегрировать в signalEngine.js

Откройте `server/src/signalEngine.js` и добавьте поддержку нового индикатора:

```javascript
const { INDICATORS } = require('./indicators');

function analyzeIndicator(candles, indicator, context) {
  const indicatorModule = INDICATORS[indicator.id];
  
  if (!indicatorModule) {
    // Fallback к существующей логике
    return analyzeMovingAverageSignal(candles, indicator);
  }

  // Используем новую систему индикаторов
  return indicatorModule.analyze(candles, {
    ...indicator.settings,
    symbol: context.symbol,
    timeframe: context.timeframe
  });
}
```

---

## 📐 Стандартный интерфейс индикатора

### Входные параметры

```javascript
{
  candles: [
    {
      symbol: "EURUSD_otc",
      timeframe: "S15",
      openTime: 1780665300,
      closeTime: 1780665315,
      open: 1.19046,
      high: 1.19052,
      low: 1.19035,
      close: 1.19035,
      ticks: 45,
      isClosed: true
    },
    // ...
  ],
  settings: {
    symbol: "EURUSD_otc",
    timeframe: "S15",
    // индикатор-специфичные настройки
  }
}
```

### Выходной формат

```javascript
{
  ok: true,                        // success flag
  ready: true,                     // has enough data?
  indicator: "moving-average",     // indicator ID
  symbol: "EURUSD_otc",            // asset
  timeframe: "S15",                // timeframe
  signal: "CALL" | "PUT" | "NONE", // trade signal
  action: "BUY" | "SELL" | ...,    // action description
  confidence: 0.75,                // 0-1 confidence level
  values: {
    // индикатор-специфичные значения
    fastMA: 1.1905,
    slowMA: 1.1900,
    diff: 0.0005
  },
  // опционально: дополнительные данные
  error?: "Error message"
}
```

---

## 🔧 Доступные вспомогательные функции

### В `utils.js`:

```javascript
calculateSMA(values, period)              // Простая скользящая средняя
calculateEMA(values, period)              // Экспоненциальная СС
calculateRSI(closes, period)              // Relative Strength Index
calculateBollingerBands(closes, period, stdDev)  // Полосы Боллинджера
calculateMACD(closes, fast, slow, signal) // MACD
calculateATR(candles, period)             // Average True Range
calculateStdDev(values, period)           // Стандартное отклонение
```

### Пример использования:

```javascript
const { calculateSMA, calculateRSI } = require('./utils');

const closes = candles.map(c => c.close);
const sma = calculateSMA(closes, 20);
const rsi = calculateRSI(closes, 14);
```

---

## 🎯 Типовые категории индикаторов

### Trend (Тренд)
- Moving Average
- ADX
- Parabolic SAR
- Ichimoku

### Momentum (Импульс)
- RSI
- Stochastic
- MACD
- CCI

### Volatility (Волатильность)
- Bollinger Bands
- ATR
- Keltner Channel

### Volume (Объем)
- On-Balance Volume
- Volume Rate of Change

---

## 📋 Чек-лист для нового индикатора

- [ ] Создан файл `yourIndicator.js`
- [ ] Функция возвращает стандартный интерфейс (ok, ready, signal, confidence)
- [ ] Добавлена валидация входных данных
- [ ] Добавлен в `INDICATORS` словарь в `index.js`
- [ ] Экспортирована функция
- [ ] Протестирована на историческим данным
- [ ] Обновлена документация

---

## 🧪 Тестирование индикатора

### Через API

```bash
# Получить свечи
curl 'http://localhost:8787/candles?symbol=EURUSD_otc&timeframe=S15&limit=50&closedOnly=true' \
  > candles.json

# Тестировать локально
node -e "
const candles = require('./candles.json').candles;
const { analyzeRSI } = require('./server/src/indicators/rsi');
console.log(analyzeRSI(candles, { symbol: 'EURUSD_otc', timeframe: 'S15' }));
"
```

### Через браузер

```javascript
// В консоли браузера
fetch('http://localhost:8787/signals?symbol=EURUSD_otc&timeframe=S15&indicator=rsi&period=14')
  .then(r => r.json())
  .then(d => console.table(d))
```

---

## 📚 Примеры готовых индикаторов

### Moving Average ✅
- Файл: `movingAverage.js`
- Функция: `analyzeMovingAverage()`
- Статус: Готов к использованию

### Другие индикаторы (TODO)
Используйте как шаблон для создания своих

---

## 💡 Советы

1. **Запасайте данные**: убедитесь что свечей достаточно для расчета
2. **Кэшируйте результаты**: если анализируете много пар, сохраняйте промежуточные значения
3. **Комбинируйте индикаторы**: лучшие сигналы от комбинирования 2-3 индикаторов
4. **Тестируйте backtest**: проверяйте на исторических данных перед торговлей
5. **Регулируйте доверие**: confidence не должно быть 1.0

---

## 🔗 Ссылки

- [signalEngine.js](../signalEngine.js) — интеграция индикаторов
- [API /signals](../../../docs/API.md#signals) — endpoint для получения сигналов
- [INDICATORS_READY.md](../../../docs/INDICATORS_READY.md) — статус системы
