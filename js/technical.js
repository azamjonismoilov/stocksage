// ============================================================================
// StockSage technical — indicators, signals, patterns, MTF trend, confluence
// Loaded as a plain <script>; relies on shared global scope.
// Uses PROXY_URL from utils.js (in fetchMultiTimeframeTrend).
// ============================================================================

// ── GURUH 1: Asosiy indikatorlar ─────────────────────────────────────────────
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateSMA(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(values, period) {
  if (values.length < period) return values[values.length-1];
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a,b) => a+b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

// ── GURUH 2: Murakkab indikatorlar ───────────────────────────────────────────
function calculateMACD(closes) {
  if (closes.length < 26) return null;
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12 - ema26;
  // Signal line (9 EMA of MACD) — approximation
  const macdHistory = [];
  for (let i = 26; i <= closes.length; i++) {
    const e12 = calculateEMA(closes.slice(0, i), 12);
    const e26 = calculateEMA(closes.slice(0, i), 26);
    macdHistory.push(e12 - e26);
  }
  const signal = macdHistory.length >= 9 ? calculateEMA(macdHistory, 9) : macdHistory[macdHistory.length-1];
  const histogram = macdLine - signal;
  const prevHistogram = macdHistory.length >= 2
    ? macdHistory[macdHistory.length-2] - calculateEMA(macdHistory.slice(0,-1), 9)
    : 0;
  return {
    macd: macdLine,
    signal,
    histogram,
    crossover: histogram > 0 && prevHistogram <= 0 ? 'bullish' : histogram < 0 && prevHistogram >= 0 ? 'bearish' : 'neutral'
  };
}

function calculateBollingerBands(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma = slice.reduce((a,b) => a+b, 0) / period;
  const variance = slice.reduce((a,b) => a + Math.pow(b-sma,2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = sma + mult * std;
  const lower = sma - mult * std;
  const last = closes[closes.length-1];
  const bWidth = (upper - lower) / sma * 100;
  const bPos = (last - lower) / (upper - lower) * 100; // 0-100%
  return { upper, middle: sma, lower, bWidth, bPos };
}

function calculateATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i-1]),
      Math.abs(lows[i] - closes[i-1])
    );
    trs.push(tr);
  }
  const atr = trs.slice(-period).reduce((a,b) => a+b, 0) / period;
  return atr;
}

// ── GURUH 3: Candlestick pattern detector ────────────────────────────────────
function detectCandlePatterns(candles) {
  if (!candles || !candles.close || candles.close.length < 3) return [];
  const patterns = [];
  const n = candles.close.length;

  const c = (i) => ({
    o: candles.open[i],
    h: candles.high[i],
    l: candles.low[i],
    c: candles.close[i],
    body: Math.abs(candles.close[i] - candles.open[i]),
    range: candles.high[i] - candles.low[i],
    isBull: candles.close[i] > candles.open[i],
    isBear: candles.close[i] < candles.open[i],
  });

  const last = c(n-1);
  const prev = c(n-2);
  const prev2 = n >= 3 ? c(n-3) : null;

  // Hammer (bullish) — pastki shadow uzun, kichik tana
  const lowerShadow = last.isBull ? last.o - last.l : last.c - last.l;
  const upperShadow = last.isBull ? last.h - last.c : last.h - last.o;
  if (last.body > 0 && lowerShadow >= 2 * last.body && upperShadow <= last.body * 0.5 && last.range > 0) {
    patterns.push({ name: 'Hammer', signal: 'bullish', strength: 70, desc: "Pastki shadow uzun — sotuvchilar zaiflashayapti" });
  }

  // Shooting Star (bearish) — yuqori shadow uzun
  if (last.body > 0 && upperShadow >= 2 * last.body && lowerShadow <= last.body * 0.5) {
    patterns.push({ name: 'Shooting Star', signal: 'bearish', strength: 70, desc: "Yuqori shadow uzun — qaytish signali" });
  }

  // Doji — tana juda kichik (qaytish signali)
  if (last.body < last.range * 0.1 && last.range > 0) {
    patterns.push({ name: 'Doji', signal: 'neutral', strength: 50, desc: "Bozor qarorsiz — qaytish ehtimoli" });
  }

  // Bullish Engulfing — kechagi bear, bugungi bull va o'rtasidagi
  if (prev.isBear && last.isBull && last.c > prev.o && last.o < prev.c && last.body > prev.body) {
    patterns.push({ name: 'Bullish Engulfing', signal: 'bullish', strength: 80, desc: "Bugungi candle kechagisini to'liq qopladi" });
  }

  // Bearish Engulfing
  if (prev.isBull && last.isBear && last.o > prev.c && last.c < prev.o && last.body > prev.body) {
    patterns.push({ name: 'Bearish Engulfing', signal: 'bearish', strength: 80, desc: "Bugungi tushish candle yuqoriga zarba" });
  }

  // 3 White Soldiers (kuchli bullish)
  if (prev2 && prev.isBull && last.isBull && prev2.isBull &&
      last.c > prev.c && prev.c > prev2.c) {
    patterns.push({ name: 'Three White Soldiers', signal: 'bullish', strength: 85, desc: "3 ta ketma-ket yuqoriga candle" });
  }

  // 3 Black Crows (kuchli bearish)
  if (prev2 && prev.isBear && last.isBear && prev2.isBear &&
      last.c < prev.c && prev.c < prev2.c) {
    patterns.push({ name: 'Three Black Crows', signal: 'bearish', strength: 85, desc: "3 ta ketma-ket pastga candle" });
  }

  // Morning Star (bullish reversal)
  if (prev2 && prev2.isBear && last.isBull &&
      prev.body < prev2.body * 0.5 && // o'rtadagi candle kichik
      last.c > (prev2.o + prev2.c) / 2) {
    patterns.push({ name: 'Morning Star', signal: 'bullish', strength: 78, desc: "Pastki nuqtada qaytish patterni" });
  }

  // Evening Star (bearish reversal)
  if (prev2 && prev2.isBull && last.isBear &&
      prev.body < prev2.body * 0.5 &&
      last.c < (prev2.o + prev2.c) / 2) {
    patterns.push({ name: 'Evening Star', signal: 'bearish', strength: 78, desc: "Yuqori nuqtada qaytish patterni" });
  }

  return patterns;
}

// ── GURUH 4: Entry point va orchestrator ─────────────────────────────────────
function computeEntryPoints(price, support, resistance, atr, rsi, trend, macd, bb) {
  const atrVal = atr || price * 0.02;
  let signal = 'KUTING'; // SOTIB_OL, SOTING, KUTING
  let confidence = 50; // 0-100
  const reasons = [];

  // Bullish signallar
  if (trend === 'bullish') { confidence += 10; reasons.push('Trend yuqoriga'); }
  if (rsi < 45 && rsi > 30) { confidence += 15; reasons.push('RSI past zonada (' + rsi.toFixed(0) + ')'); }
  if (rsi <= 30) { confidence += 20; reasons.push('RSI oversold (' + rsi.toFixed(0) + ') — qaytish ehtimoli'); }
  if (macd?.crossover === 'bullish') { confidence += 20; reasons.push('MACD bullish crossover'); }
  if (bb && bb.bPos < 20) { confidence += 15; reasons.push('Bollinger pastki chegarasida'); }
  if (price <= support * 1.02) { confidence += 10; reasons.push('Support darajasiga yaqin'); }

  // Bearish signallar
  if (trend === 'bearish') { confidence -= 10; reasons.push('Trend pastga'); }
  if (rsi >= 70) { confidence -= 20; reasons.push('RSI overbought (' + rsi.toFixed(0) + ') — tushish xavfi'); }
  if (macd?.crossover === 'bearish') { confidence -= 20; reasons.push('MACD bearish crossover'); }
  if (bb && bb.bPos > 80) { confidence -= 15; reasons.push('Bollinger yuqori chegarasida'); }
  if (price >= resistance * 0.98) { confidence -= 10; reasons.push('Resistance darajasiga yaqin'); }

  confidence = Math.max(10, Math.min(90, confidence));

  if (confidence >= 65) signal = 'SOTIB_OL';
  else if (confidence <= 35) signal = 'SOTING';
  else signal = 'KUTING';

  // Kirish nuqtasi, stop-loss, take-profit
  const entry = price;
  const stopLoss = signal === 'SOTIB_OL'
    ? Math.max(support, price - atrVal * 1.5)
    : Math.min(resistance, price + atrVal * 1.5);

  const riskAmount = Math.abs(price - stopLoss);
  const tp1 = signal === 'SOTIB_OL' ? price + riskAmount * 1.5 : price - riskAmount * 1.5;
  const tp2 = signal === 'SOTIB_OL' ? price + riskAmount * 2.5 : price - riskAmount * 2.5;
  const tp3 = signal === 'SOTIB_OL' ? Math.min(resistance, price + riskAmount * 4) : Math.max(support, price - riskAmount * 4);

  const riskReward = riskAmount > 0 ? (Math.abs(tp1 - price) / riskAmount).toFixed(1) : '—';

  return {
    signal, confidence,
    entry, stopLoss, tp1, tp2, tp3,
    riskAmount, riskReward,
    reasons: reasons.slice(0, 4),
  };
}

function computeTechnicalSignals(candles) {
  if (!candles || !candles.close || candles.close.length < 14) {
    return null;
  }

  const closes = candles.close;
  const highs = candles.high;
  const lows = candles.low;
  const volumes = candles.volume;
  const lastClose = closes[closes.length - 1];

  // RSI (14)
  const rsi = calculateRSI(closes, 14);

  // SMA 20 & 50
  const sma20 = calculateSMA(closes, 20);
  const sma50 = closes.length >= 50 ? calculateSMA(closes, 50) : null;

  // Volume trend (current vs avg of last 20)
  const recentVol = volumes.slice(-20);
  const avgVol = recentVol.reduce((a, b) => a + b, 0) / recentVol.length;
  const lastVol = volumes[volumes.length - 1];
  const volRatio = lastVol / avgVol;

  // Support/Resistance (60-day high/low)
  const support = Math.min(...lows.slice(-30));
  const resistance = Math.max(...highs.slice(-30));

  // Trend
  let trend = 'neutral';
  if (sma50 && lastClose > sma20 && sma20 > sma50) trend = 'bullish';
  else if (sma50 && lastClose < sma20 && sma20 < sma50) trend = 'bearish';
  else if (lastClose > sma20) trend = 'bullish';
  else if (lastClose < sma20) trend = 'bearish';

  // RSI status
  let rsiStatus = 'neutral';
  if (rsi >= 70) rsiStatus = 'bearish'; // overbought
  else if (rsi <= 30) rsiStatus = 'bullish'; // oversold

  // Volume status
  let volStatus = 'neutral';
  if (volRatio > 1.5) volStatus = 'bullish';
  else if (volRatio < 0.6) volStatus = 'bearish';

  // MACD (12, 26, 9)
  const macd = calculateMACD(closes);

  // Bollinger Bands (20, 2)
  const bb = calculateBollingerBands(closes, 20, 2);

  // ATR (14) — stop-loss uchun
  const atr = calculateATR(highs, lows, closes, 14);

  // Kirish nuqtasi va stop-loss
  const entry = computeEntryPoints(lastClose, support, resistance, atr, rsi, trend, macd, bb);

  return {
    rsi, rsiStatus,
    sma20, sma50,
    trend,
    volumeRatio: volRatio,
    volumeStatus: volStatus,
    support, resistance,
    lastClose,
    macd, bb, atr,
    entry,
  };
}

// ── GURUH 5: Multi-timeframe trend va confluence score ───────────────────────
// NOTE: detectCandlePatterns, computeConfluenceScore, fetchMultiTimeframeTrend
// hozircha hech qaerdan chaqirilmaydi — renderMBTechnical bilan bog'lash
// keyingi bosqichda bo'ladi.
async function fetchMultiTimeframeTrend(ticker) {
  const dAgo = n => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; };

  function getTrend(closes) {
    if (!closes || closes.length < 10) return 'neutral';
    const sma20 = closes.slice(-20).reduce((a,b)=>a+b,0) / Math.min(20, closes.length);
    const last = closes[closes.length-1];
    if (last > sma20 * 1.01) return 'bullish';
    if (last < sma20 * 0.99) return 'bearish';
    return 'neutral';
  }

  try {
    const [dailyRes, h4Res, h1Res] = await Promise.all([
      fetch(`${PROXY_URL}/polygon/v2/aggs/ticker/${ticker}/range/1/day/${dAgo(60)}/${dAgo(1)}?adjusted=true&sort=asc&limit=60`),
      fetch(`${PROXY_URL}/polygon/v2/aggs/ticker/${ticker}/range/4/hour/${dAgo(20)}/${dAgo(1)}?adjusted=true&sort=asc&limit=120`),
      fetch(`${PROXY_URL}/polygon/v2/aggs/ticker/${ticker}/range/1/hour/${dAgo(7)}/${dAgo(1)}?adjusted=true&sort=asc&limit=120`),
    ]);

    const dd = dailyRes.ok ? await dailyRes.json() : null;
    const h4d = h4Res.ok ? await h4Res.json() : null;
    const h1d = h1Res.ok ? await h1Res.json() : null;

    return {
      daily:  dd?.results ? getTrend(dd.results.map(r=>r.c)) : 'neutral',
      h4:     h4d?.results ? getTrend(h4d.results.map(r=>r.c)) : 'neutral',
      h1:     h1d?.results ? getTrend(h1d.results.map(r=>r.c)) : 'neutral',
    };
  } catch(e) {
    console.warn('MTF trend error:', e);
    return null;
  }
}

function computeConfluenceScore(sig, patterns, mtfTrend) {
  const factors = [];
  let bullishScore = 0;
  let bearishScore = 0;

  // 1. RSI
  if (sig.rsi <= 30) {
    factors.push({ name: 'RSI Oversold', signal: 'bullish', points: 15, detail: `RSI: ${sig.rsi.toFixed(1)} — kuchli sotib olish zonasi` });
    bullishScore += 15;
  } else if (sig.rsi <= 40) {
    factors.push({ name: 'RSI Past', signal: 'bullish', points: 8, detail: `RSI: ${sig.rsi.toFixed(1)} — past darajada` });
    bullishScore += 8;
  } else if (sig.rsi >= 70) {
    factors.push({ name: 'RSI Overbought', signal: 'bearish', points: 15, detail: `RSI: ${sig.rsi.toFixed(1)} — sotish zonasi` });
    bearishScore += 15;
  } else if (sig.rsi >= 60) {
    factors.push({ name: 'RSI Yuqori', signal: 'bearish', points: 8, detail: `RSI: ${sig.rsi.toFixed(1)} — yuqori darajada` });
    bearishScore += 8;
  }

  // 2. MACD
  if (sig.macd) {
    if (sig.macd.crossover === 'bullish') {
      factors.push({ name: 'MACD Bullish Cross', signal: 'bullish', points: 15, detail: 'MACD signal liniyasini yuqoridan kesdi' });
      bullishScore += 15;
    } else if (sig.macd.crossover === 'bearish') {
      factors.push({ name: 'MACD Bearish Cross', signal: 'bearish', points: 15, detail: 'MACD signal liniyasini pastdan kesdi' });
      bearishScore += 15;
    } else if (sig.macd.histogram > 0) {
      factors.push({ name: 'MACD Bullish', signal: 'bullish', points: 5, detail: 'MACD ijobiy zonada' });
      bullishScore += 5;
    } else {
      factors.push({ name: 'MACD Bearish', signal: 'bearish', points: 5, detail: 'MACD salbiy zonada' });
      bearishScore += 5;
    }
  }

  // 3. Bollinger Bands
  if (sig.bb) {
    if (sig.bb.bPos < 10) {
      factors.push({ name: 'Bollinger Bottom', signal: 'bullish', points: 12, detail: 'Pastki chegarasiga juda yaqin' });
      bullishScore += 12;
    } else if (sig.bb.bPos < 25) {
      factors.push({ name: 'Bollinger Past', signal: 'bullish', points: 7, detail: 'Pastki chegarasiga yaqin' });
      bullishScore += 7;
    } else if (sig.bb.bPos > 90) {
      factors.push({ name: 'Bollinger Top', signal: 'bearish', points: 12, detail: 'Yuqori chegarasiga juda yaqin' });
      bearishScore += 12;
    } else if (sig.bb.bPos > 75) {
      factors.push({ name: 'Bollinger Yuqori', signal: 'bearish', points: 7, detail: 'Yuqori chegarasiga yaqin' });
      bearishScore += 7;
    }
  }

  // 4. Volume
  if (sig.volumeRatio > 2) {
    factors.push({ name: 'Volume Spike', signal: sig.trend === 'bullish' ? 'bullish' : 'bearish', points: 12, detail: `Hajm: ${sig.volumeRatio.toFixed(1)}x normal` });
    if (sig.trend === 'bullish') bullishScore += 12; else bearishScore += 12;
  } else if (sig.volumeRatio > 1.3) {
    factors.push({ name: 'Volume Increase', signal: sig.trend === 'bullish' ? 'bullish' : 'bearish', points: 6, detail: `Hajm: ${sig.volumeRatio.toFixed(1)}x normal` });
    if (sig.trend === 'bullish') bullishScore += 6; else bearishScore += 6;
  }

  // 5. Support/Resistance
  const distToSup = sig.lastClose - sig.support;
  const distToRes = sig.resistance - sig.lastClose;
  const range = sig.resistance - sig.support;
  if (range > 0) {
    const supRatio = distToSup / range;
    if (supRatio < 0.1) {
      factors.push({ name: 'Support Touch', signal: 'bullish', points: 12, detail: `Support darajasiga yetdi ($${sig.support.toFixed(2)})` });
      bullishScore += 12;
    } else if (supRatio > 0.9) {
      factors.push({ name: 'Resistance Touch', signal: 'bearish', points: 12, detail: `Resistance darajasiga yetdi ($${sig.resistance.toFixed(2)})` });
      bearishScore += 12;
    }
  }

  // 6. Candlestick patterns
  patterns.forEach(p => {
    const pts = Math.round(p.strength / 6);  // Max ~14 punkt
    factors.push({ name: p.name, signal: p.signal, points: pts, detail: p.desc });
    if (p.signal === 'bullish') bullishScore += pts;
    else if (p.signal === 'bearish') bearishScore += pts;
  });

  // 7. Multi-timeframe alignment
  if (mtfTrend) {
    const aligned = mtfTrend.daily === mtfTrend.h4 && mtfTrend.h4 === mtfTrend.h1;
    if (aligned && mtfTrend.daily === 'bullish') {
      factors.push({ name: 'MTF Alignment', signal: 'bullish', points: 15, detail: '3 ta timeframe — barcha bullish' });
      bullishScore += 15;
    } else if (aligned && mtfTrend.daily === 'bearish') {
      factors.push({ name: 'MTF Alignment', signal: 'bearish', points: 15, detail: '3 ta timeframe — barcha bearish' });
      bearishScore += 15;
    }
  }

  const totalScore = Math.max(bullishScore, bearishScore);
  const direction = bullishScore > bearishScore ? 'bullish' : bearishScore > bullishScore ? 'bearish' : 'neutral';

  let verdict, color;
  if (totalScore >= 60 && direction === 'bullish') { verdict = 'KUCHLI SOTIB OL'; color = 'var(--bull)'; }
  else if (totalScore >= 40 && direction === 'bullish') { verdict = 'SOTIB OL'; color = 'var(--bull)'; }
  else if (totalScore >= 60 && direction === 'bearish') { verdict = 'KUCHLI SOT'; color = 'var(--bear)'; }
  else if (totalScore >= 40 && direction === 'bearish') { verdict = 'SOT'; color = 'var(--bear)'; }
  else { verdict = 'KUTING'; color = 'var(--warn)'; }

  return {
    bullishScore: Math.min(100, bullishScore),
    bearishScore: Math.min(100, bearishScore),
    direction,
    verdict,
    color,
    factors,
  };
}
