/**
 * Примеры использования всех индикаторов
 * Файл для быстрого тестирования и понимания работы
 */

const indicators = require('./indicators');

// Генерируем тестовые свечи
function generateTestCandles(count = 100) {
  const candles = [];
  let price = 1.1000;
  
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.5) * 0.002;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 0.001;
    const low = Math.min(open, close) - Math.random() * 0.001;
    
    candles.push({
      openTime: (Date.now() - (count - i) * 15000) / 1000,
      closeTime: (Date.now() - (count - i - 1) * 15000) / 1000,
      open: parseFloat(open.toFixed(5)),
      high: parseFloat(high.toFixed(5)),
      low: parseFloat(low.toFixed(5)),
      close: parseFloat(close.toFixed(5))
    });
    
    price = close;
  }
  
  return candles;
}

// Анализируем все индикаторы
function testAllIndicators() {
  const candles = generateTestCandles(50);
  
  console.log('📊 ТЕСТИРОВАНИЕ ВСЕХ ИНДИКАТОРОВ');
  console.log('================================\n');
  console.log(`Данные: ${candles.length} свечей`);
  console.log(`Диапазон: ${candles[0].close} - ${candles[candles.length - 1].close}\n`);
  
  const allIndicators = indicators.listIndicators();
  
  // Группируем по категориям
  const byCategory = {};
  allIndicators.forEach(ind => {
    if (!byCategory[ind.category]) {
      byCategory[ind.category] = [];
    }
    byCategory[ind.category].push(ind);
  });
  
  // Тестируем каждую категорию
  Object.entries(byCategory).forEach(([category, items]) => {
    console.log(`\n🔹 ${category.toUpperCase()} (${items.length} индикаторов)`);
    console.log('━'.repeat(50));
    
    items.forEach(item => {
      try {
        const result = indicators.analyzeIndicator(item.id, candles);
        
        if (!result.ok) {
          console.log(`❌ ${item.id}: ${result.error}`);
        } else if (!result.ready) {
          console.log(`⚠️  ${item.id}: ${result.error}`);
        } else {
          const signal = result.signal !== 'NONE' 
            ? `${result.signal} (${result.action}, confidence: ${(result.confidence * 100).toFixed(0)}%)`
            : '➖ NONE';
          console.log(`✅ ${item.id.padEnd(20)} → ${signal}`);
        }
      } catch (err) {
        console.log(`💥 ${item.id}: ${err.message}`);
      }
    });
  });
}

// Детальный анализ конкретного индикатора
function detailedAnalysis(indicatorId) {
  const candles = generateTestCandles(50);
  
  console.log(`\n📊 ДЕТАЛЬНЫЙ АНАЛИЗ: ${indicatorId}`);
  console.log('═'.repeat(50));
  
  const result = indicators.analyzeIndicator(indicatorId, candles);
  
  console.log('\n📋 Результат анализа:');
  console.log(JSON.stringify(result, null, 2));
}

// Сравнение нескольких индикаторов
function compareIndicators(indicatorIds) {
  const candles = generateTestCandles(50);
  
  console.log(`\n🔄 СРАВНЕНИЕ ИНДИКАТОРОВ: ${indicatorIds.join(', ')}`);
  console.log('═'.repeat(50));
  
  const results = {};
  
  indicatorIds.forEach(id => {
    const result = indicators.analyzeIndicator(id, candles);
    results[id] = result;
  });
  
  console.log('\n📊 Таблица сигналов:');
  console.log(`${'Индикатор'.padEnd(20)} | Signal | Action | Confidence`);
  console.log('─'.repeat(60));
  
  Object.entries(results).forEach(([id, result]) => {
    if (result.ok && result.ready) {
      const signal = result.signal || 'NONE';
      const action = result.action || '—';
      const conf = `${(result.confidence * 100).toFixed(0)}%`;
      console.log(`${id.padEnd(20)} | ${signal.padEnd(6)} | ${action.padEnd(20)} | ${conf}`);
    }
  });
}

// Информация об индикаторе
function showIndicatorInfo(indicatorId) {
  const info = indicators.getIndicatorInfo(indicatorId);
  
  if (!info.ok) {
    console.log(`❌ ${info.error}`);
    return;
  }
  
  console.log(`\n📘 ИНФОРМАЦИЯ ОБ ИНДИКАТОРЕ`);
  console.log('═'.repeat(50));
  console.log(`ID:           ${info.id}`);
  console.log(`Название:     ${info.name}`);
  console.log(`Описание:     ${info.description}`);
  console.log(`Категория:    ${info.category}`);
  console.log(`\nСтандартные настройки:`);
  console.log(JSON.stringify(info.defaultSettings, null, 2));
}

// Функция для проверки сигналов
function findBestSignals(confidenceThreshold = 0.65) {
  const candles = generateTestCandles(50);
  
  console.log(`\n🎯 СИГНАЛЫ С УВЕРЕННОСТЬЮ > ${(confidenceThreshold * 100).toFixed(0)}%`);
  console.log('═'.repeat(50));
  
  const allIndicators = indicators.listIndicators();
  let foundSignals = 0;
  
  const signals = [];
  
  allIndicators.forEach(item => {
    const result = indicators.analyzeIndicator(item.id, candles);
    
    if (result.ok && result.ready && result.signal !== 'NONE' && result.confidence >= confidenceThreshold) {
      signals.push({
        indicator: item.id,
        signal: result.signal,
        action: result.action,
        confidence: result.confidence,
        category: item.category
      });
      foundSignals++;
    }
  });
  
  if (foundSignals === 0) {
    console.log(`❌ Сигналов не найдено`);
    return;
  }
  
  // Сортируем по уверенности (по убыванию)
  signals.sort((a, b) => b.confidence - a.confidence);
  
  console.log(`\nНайдено сигналов: ${foundSignals}\n`);
  
  signals.forEach((sig, idx) => {
    console.log(`${idx + 1}. ${sig.indicator.padEnd(20)} [${sig.category}]`);
    console.log(`   Signal: ${sig.signal}, Action: ${sig.action}`);
    console.log(`   Confidence: ${(sig.confidence * 100).toFixed(0)}%\n`);
  });
}

// ============================================
// ЗАПУСК ПРИМЕРОВ
// ============================================

if (require.main === module) {
  // Раскомментируйте нужный тест:
  
  // 1. Тестирование всех индикаторов
  testAllIndicators();
  
  // 2. Детальный анализ
  // detailedAnalysis('moving-average');
  
  // 3. Сравнение индикаторов
  // compareIndicators(['moving-average', 'rsi', 'macd', 'adx']);
  
  // 4. Информация об индикаторе
  // showIndicatorInfo('moving-average');
  
  // 5. Поиск сильных сигналов
  // findBestSignals(0.70);
}

module.exports = {
  generateTestCandles,
  testAllIndicators,
  detailedAnalysis,
  compareIndicators,
  showIndicatorInfo,
  findBestSignals
};
