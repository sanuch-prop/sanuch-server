// Вспомогательные функции для расчета индикаторов

/**
 * Простая скользящая средняя
 * @param {Array} values - массив значений (обычно close цены)
 * @param {number} period - количество периодов
 * @returns {Array} массив SMA значений (null для первых period-1 элементов)
 */
function calculateSMA(values, period) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

/**
 * Экспоненциальная скользящая средняя
 * @param {Array} values - массив значений
 * @param {number} period - количество периодов
 * @returns {Array} массив EMA значений
 */
function calculateEMA(values, period) {
  const result = [];
  const k = 2 / (period + 1);
  
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    
    if (i === period - 1) {
      // SMA первых 'period' значений
      const sum = values.slice(0, period).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    } else {
      // EMA = (Close - EMA_prev) * k + EMA_prev
      const ema = (values[i] - result[i - 1]) * k + result[i - 1];
      result.push(ema);
    }
  }
  return result;
}

/**
 * Relative Strength Index (RSI)
 * @param {Array} closes - массив цен закрытия
 * @param {number} period - период (обычно 14)
 * @returns {Array} массив RSI значений
 */
function calculateRSI(closes, period = 14) {
  const result = [];
  const changes = [];
  
  // Вычисляем изменения
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      result.push(null);
      continue;
    }
    
    let gains = 0;
    let losses = 0;
    
    for (let j = i - period + 1; j <= i; j++) {
      const change = changes[j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    result.push(rsi);
  }
  
  return result;
}

/**
 * Bollinger Bands
 * @param {Array} closes - массив цен закрытия
 * @param {number} period - период (обычно 20)
 * @param {number} stdDev - количество стандартных отклонений (обычно 2)
 * @returns {Array} массив объектов с middle, upper, lower
 */
function calculateBollingerBands(closes, period = 20, stdDev = 2) {
  const result = [];
  const smas = calculateSMA(closes, period);
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    
    const middle = smas[i];
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    
    // Вычисляем стандартное отклонение
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    result.push({
      middle,
      upper: middle + (std * stdDev),
      lower: middle - (std * stdDev)
    });
  }
  
  return result;
}

/**
 * MACD (Moving Average Convergence Divergence)
 * @param {Array} closes - массив цен закрытия
 * @param {number} fast - быстрая EMA (обычно 12)
 * @param {number} slow - медленная EMA (обычно 26)
 * @param {number} signal - период сигнальной линии (обычно 9)
 * @returns {Array} массив объектов с macd, signal, histogram
 */
function calculateMACD(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const result = [];
  const fastEMA = calculateEMA(closes, fast);
  const slowEMA = calculateEMA(closes, slow);
  
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
  }
  
  const signalLine = calculateEMA(macdLine.map(x => x === null ? 0 : x), signalPeriod);
  
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] === null || signalLine[i] === null) {
      result.push(null);
    } else {
      const histogram = macdLine[i] - signalLine[i];
      result.push({
        macd: macdLine[i],
        signal: signalLine[i],
        histogram
      });
    }
  }
  
  return result;
}

/**
 * Average True Range (ATR)
 * @param {Array} candles - массив свечей с high, low, close
 * @param {number} period - период (обычно 14)
 * @returns {Array} массив ATR значений
 */
function calculateATR(candles, period = 14) {
  const result = [];
  const trueRanges = [];
  
  // Вычисляем True Range
  for (let i = 0; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    
    trueRanges.push(tr);
  }
  
  // Вычисляем ATR
  for (let i = 0; i < trueRanges.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    
    if (i === period - 1) {
      const sum = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    } else {
      const prevATR = result[i - 1];
      const atr = (prevATR * (period - 1) + trueRanges[i]) / period;
      result.push(atr);
    }
  }
  
  return result;
}

/**
 * Стандартное отклонение
 * @param {Array} values - массив значений
 * @param {number} period - период
 * @returns {Array} массив std dev значений
 */
function calculateStdDev(values, period) {
  const result = [];
  
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    result.push(Math.sqrt(variance));
  }
  
  return result;
}

/**
 * Stochastic Oscillator
 * @param {Array} candles - массив свечей
 * @param {number} period - период (обычно 14)
 * @param {number} kPeriod - период К линии (обычно 3)
 * @param {number} dPeriod - период D линии (обычно 3)
 * @returns {Array} массив объектов с K и D значениями
 */
function calculateStochastic(candles, period = 14, kPeriod = 3, dPeriod = 3) {
  const result = [];
  const kValues = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
      kValues.push(null);
      continue;
    }
    
    const slice = candles.slice(i - period + 1, i + 1);
    const highest = Math.max(...slice.map(c => c.high));
    const lowest = Math.min(...slice.map(c => c.low));
    const close = candles[i].close;
    
    const k = ((close - lowest) / (highest - lowest)) * 100 || 0;
    kValues.push(k);
  }
  
  const dValues = calculateSMA(kValues, dPeriod);
  
  for (let i = 0; i < kValues.length; i++) {
    if (kValues[i] === null) {
      result.push(null);
    } else {
      result[i] = {
        K: kValues[i],
        D: dValues[i]
      };
    }
  }
  
  return result;
}

/**
 * ADX (Average Directional Index)
 * @param {Array} candles - массив свечей
 * @param {number} period - период (обычно 14)
 * @returns {Array} массив объектов с ADX, +DI, -DI
 */
function calculateADX(candles, period = 14) {
  const result = [];
  const plusDM = [];
  const minusDM = [];
  const trueRanges = [];
  
  // Вычисляем +DM, -DM и TR
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      plusDM.push(0);
      minusDM.push(0);
    } else {
      const prev = candles[i - 1];
      const curr = candles[i];
      
      const upMove = curr.high - prev.high;
      const downMove = prev.low - curr.low;
      
      let pDM = 0;
      let mDM = 0;
      
      if (upMove > 0 && upMove > downMove) pDM = upMove;
      if (downMove > 0 && downMove > upMove) mDM = downMove;
      
      plusDM.push(pDM);
      minusDM.push(mDM);
    }
    
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  // Вычисляем +DI и -DI
  const plusDI = [];
  const minusDI = [];
  let sumTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let sumPDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let sumMDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  
  plusDI.push((sumPDM / sumTR) * 100 || 0);
  minusDI.push((sumMDM / sumTR) * 100 || 0);
  
  for (let i = period + 1; i < candles.length; i++) {
    sumTR = sumTR - trueRanges[i - period] + trueRanges[i];
    sumPDM = sumPDM - plusDM[i - period] + plusDM[i];
    sumMDM = sumMDM - minusDM[i - period] + minusDM[i];
    
    plusDI.push((sumPDM / sumTR) * 100 || 0);
    minusDI.push((sumMDM / sumTR) * 100 || 0);
  }
  
  const diDiff = [];
  for (let i = 0; i < plusDI.length; i++) {
    diDiff.push(Math.abs(plusDI[i] - minusDI[i]));
  }
  
  const diSum = [];
  for (let i = 0; i < plusDI.length; i++) {
    diSum.push(plusDI[i] + minusDI[i]);
  }
  
  const dx = [];
  for (let i = 0; i < diDiff.length; i++) {
    dx.push(diSum[i] !== 0 ? (diDiff[i] / diSum[i]) * 100 : 0);
  }
  
  const adx = [];
  let sumDX = 0;
  for (let i = 0; i < period; i++) {
    sumDX += dx[i];
  }
  adx.push(sumDX / period);
  
  for (let i = period; i < dx.length; i++) {
    const newADX = (adx[adx.length - 1] * (period - 1) + dx[i]) / period;
    adx.push(newADX);
  }
  
  // Формируем результат
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const idx = i - (period - 1);
      result.push({
        ADX: adx[idx],
        plusDI: plusDI[idx],
        minusDI: minusDI[idx]
      });
    }
  }
  
  return result;
}

/**
 * CCI (Commodity Channel Index)
 * @param {Array} candles - массив свечей
 * @param {number} period - период (обычно 20)
 * @returns {Array} массив CCI значений
 */
function calculateCCI(candles, period = 20) {
  const result = [];
  const tp = []; // Typical Price
  
  for (const candle of candles) {
    tp.push((candle.high + candle.low + candle.close) / 3);
  }
  
  const sma = calculateSMA(tp, period);
  
  for (let i = 0; i < tp.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    
    const slice = tp.slice(i - period + 1, i + 1);
    const mean = sma[i];
    let sumDev = 0;
    
    for (const val of slice) {
      sumDev += Math.abs(val - mean);
    }
    
    const mdev = sumDev / period;
    const cci = mdev !== 0 ? (tp[i] - mean) / (0.015 * mdev) : 0;
    result.push(cci);
  }
  
  return result;
}

/**
 * Williams %R
 * @param {Array} candles - массив свечей
 * @param {number} period - период (обычно 14)
 * @returns {Array} массив Williams %R значений
 */
function calculateWilliamsR(candles, period = 14) {
  const result = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    
    const slice = candles.slice(i - period + 1, i + 1);
    const highest = Math.max(...slice.map(c => c.high));
    const lowest = Math.min(...slice.map(c => c.low));
    const close = candles[i].close;
    
    const wr = -100 * ((highest - close) / (highest - lowest)) || 0;
    result.push(wr);
  }
  
  return result;
}

/**
 * Momentum
 * @param {Array} closes - массив цен закрытия
 * @param {number} period - период (обычно 10)
 * @returns {Array} массив momentum значений
 */
function calculateMomentum(closes, period = 10) {
  const result = [];
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      result.push(null);
    } else {
      result.push(closes[i] - closes[i - period]);
    }
  }
  
  return result;
}

/**
 * Rate of Change (ROC)
 * @param {Array} closes - массив цен закрытия
 * @param {number} period - период (обычно 12)
 * @returns {Array} массив ROC значений
 */
function calculateROC(closes, period = 12) {
  const result = [];
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      result.push(null);
    } else {
      const roc = ((closes[i] - closes[i - period]) / closes[i - period]) * 100;
      result.push(roc);
    }
  }
  
  return result;
}

/**
 * Awesome Oscillator
 * @param {Array} candles - массив свечей
 * @param {number} fast - быстрая EMA (обычно 5)
 * @param {number} slow - медленная EMA (обычно 34)
 * @returns {Array} массив значений осциллятора
 */
function calculateAwesomeOscillator(candles, fast = 5, slow = 34) {
  const result = [];
  const medianPrices = candles.map(c => (c.high + c.low) / 2);
  
  const fastEMA = calculateEMA(medianPrices, fast);
  const slowEMA = calculateEMA(medianPrices, slow);
  
  for (let i = 0; i < candles.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      result.push(null);
    } else {
      result.push(fastEMA[i] - slowEMA[i]);
    }
  }
  
  return result;
}

/**
 * Bollinger Bands Width
 * @param {Array} closes - массив цен закрытия
 * @param {number} period - период (обычно 20)
 * @param {number} stdDev - количество стандартных отклонений
 * @returns {Array} массив ширины полос Боллинджера
 */
function calculateBBWidth(closes, period = 20, stdDev = 2) {
  const result = [];
  const bb = calculateBollingerBands(closes, period, stdDev);
  
  for (const band of bb) {
    if (band === null) {
      result.push(null);
    } else {
      result.push(band.upper - band.lower);
    }
  }
  
  return result;
}

/**
 * Donchian Channel
 * @param {Array} candles - массив свечей
 * @param {number} period - период (обычно 20)
 * @returns {Array} массив объектов с high и low каналов
 */
function calculateDonchianChannel(candles, period = 20) {
  const result = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      result.push({ high, low });
    }
  }
  
  return result;
}

/**
 * Keltner Channel
 * @param {Array} candles - массив свечей
 * @param {number} emaPeriod - период EMA (обычно 20)
 * @param {number} atrPeriod - период ATR (обычно 10)
 * @param {number} atrMultiplier - множитель ATR (обычно 2)
 * @returns {Array} массив объектов с каналом
 */
function calculateKeltnerChannel(candles, emaPeriod = 20, atrPeriod = 10, atrMultiplier = 2) {
  const result = [];
  const closes = candles.map(c => c.close);
  const ema = calculateEMA(closes, emaPeriod);
  const atr = calculateATR(candles, atrPeriod);
  
  for (let i = 0; i < candles.length; i++) {
    if (ema[i] === null || atr[i] === null) {
      result.push(null);
    } else {
      result.push({
        middle: ema[i],
        upper: ema[i] + (atr[i] * atrMultiplier),
        lower: ema[i] - (atr[i] * atrMultiplier)
      });
    }
  }
  
  return result;
}

module.exports = {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateBollingerBands,
  calculateBBWidth,
  calculateMACD,
  calculateATR,
  calculateStdDev,
  calculateStochastic,
  calculateADX,
  calculateCCI,
  calculateWilliamsR,
  calculateMomentum,
  calculateROC,
  calculateAwesomeOscillator,
  calculateDonchianChannel,
  calculateKeltnerChannel
};
