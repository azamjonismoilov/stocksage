// ============================================================================
// StockSage api — Cloudflare Worker proxy fetchers
// Loaded as a plain <script>; relies on shared global scope.
//
// Depends on:
//   utils.js     — PROXY_URL, daysAgo, safeParseJSON
//   technical.js — computeTechnicalSignals
//   inline       — patchSkeletonPrice (resolved at call time, not parse time)
// ============================================================================

// ==================== FAST DATA CALL (narx + raqamlar) ====================
// ── FAST DATA ─────────────────────────────────────────────────────────────
async function fetchFastData(ticker, isCrypto) {
  if (isCrypto) return fetchFastCrypto(ticker);
  // Polygon (Massive.com) avval — 10K+ aksiya, real-time
  try {
    return await fetchPolygonStock(ticker);
  } catch (ePoly) {
    console.warn('Polygon failed:', ePoly.message);
    try {
      return await fetchFinnhubStock(ticker);
    } catch (eFinn) {
      console.warn('Finnhub failed:', eFinn.message);
      return fetchClaudeStock(ticker);
    }
  }
}

// ── Polygon (Massive) stock fetch ────────────────────────────────────────────
async function fetchPolygonStock(ticker) {
  const base = `${PROXY_URL}/polygon`;

  function daysAgoStr(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  }

  const [refRes, candleRes, newsRes] = await Promise.all([
    fetch(`${base}/v3/reference/tickers/${ticker}`),
    fetch(`${base}/v2/aggs/ticker/${ticker}/range/1/day/${daysAgoStr(90)}/${daysAgoStr(1)}?adjusted=true&sort=asc&limit=120`),
    fetch(`${base}/v2/reference/news?ticker=${ticker}&limit=10&order=desc`),
  ]);

  if (!candleRes.ok) throw new Error('Polygon ' + candleRes.status);
  const candleData = await candleRes.json();
  if (!candleData.results || !candleData.results.length) {
    throw new Error(`"${ticker}" Polygon'da topilmadi`);
  }

  const refData = refRes.ok ? await refRes.json() : { results: {} };
  const newsData = newsRes.ok ? await newsRes.json() : { results: [] };

  const ref = refData.results || {};
  const bars = candleData.results;
  const last = bars[bars.length - 1];
  const prev = bars.length >= 2 ? bars[bars.length - 2] : last;

  const price = last.c;
  const prevClose = prev.c;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose * 100) : 0;

  const candles = {
    close: bars.map(b => b.c),
    high:  bars.map(b => b.h),
    low:   bars.map(b => b.l),
    open:  bars.map(b => b.o),
    volume:bars.map(b => b.v),
    time:  bars.map(b => Math.floor(b.t / 1000)),
  };

  const signals = computeTechnicalSignals(candles);

  const data = {
    type: 'stock', ticker,
    name: ref.name || ticker,
    exchange: ref.primary_exchange || 'N/A',
    industry: ref.sic_description || ref.type || 'N/A',
    currency: 'USD',
    price, change, changePercent,
    open: last.o, high: last.h, low: last.l, prevClose,
    volume24h: last.v || 0, quoteVolume24h: (last.vw || price) * (last.v || 0),
    marketCapUsd: ref.market_cap || null,
    rank: null,
    preSignals: signals || {
      rsi: 50, sma20: null, sma50: null,
      support: last.l, resistance: last.h,
      volumeRatio: 1,
      trend: changePercent > 0 ? 'bullish' : changePercent < 0 ? 'bearish' : 'neutral',
      rsiStatus: 'neutral', volumeStatus: 'neutral', lastClose: price
    },
    candles,
    news: (newsData.results || []).slice(0, 6).map(n => ({
      headline: n.title,
      source: n.publisher?.name || 'Polygon',
      url: n.article_url,
      datetime: Math.floor(new Date(n.published_utc).getTime() / 1000),
    })),
    earnings: null,
  };

  patchSkeletonPrice(data, false);
  return data;
}

// ── COINGECKO via proxy (crypto) ──────────────────────────────────────────
const CGIDS = {
  BTC:'bitcoin', ETH:'ethereum', BNB:'binancecoin', SOL:'solana',
  XRP:'ripple', DOGE:'dogecoin', ADA:'cardano', AVAX:'avalanche-2',
  DOT:'polkadot', LINK:'chainlink', LTC:'litecoin', UNI:'uniswap',
  MATIC:'matic-network', ATOM:'cosmos', NEAR:'near', APT:'aptos',
  ARB:'arbitrum', OP:'optimism', SUI:'sui', INJ:'injective-protocol',
  TRX:'tron', TON:'the-open-network', SHIB:'shiba-inu', PEPE:'pepe',
  FIL:'filecoin', ICP:'internet-computer', HBAR:'hedera-hashgraph',
  ETC:'ethereum-classic', XLM:'stellar', AAVE:'aave', MKR:'maker',
  GRT:'the-graph', LDO:'lido-dao', RUNE:'thorchain', WIF:'dogwifcoin',
  BONK:'bonk', SEI:'sei-network', TIA:'celestia',
  JUP:'jupiter-exchange-solana', WLD:'worldcoin-wld',
  FET:'fetch-ai', RENDER:'render-token', TAO:'bittensor'
};

async function fetchFastCrypto(ticker) {
  const upper  = ticker.toUpperCase();
  let coinId   = CGIDS[upper];

  if (!coinId) {
    const s = await fetch(`${PROXY_URL}/cg/search?query=${upper}`).catch(() => null);
    if (s?.ok) {
      const sd = await s.json();
      const m  = (sd.coins || []).find(c => c.symbol.toUpperCase() === upper);
      if (m) coinId = m.id;
    }
    if (!coinId) throw new Error(
      `"${ticker}" topilmadi. BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX va boshqalarni sinab ko'ring.`
    );
  }

  const [coinRes, ohlcRes] = await Promise.all([
    fetch(`${PROXY_URL}/cg/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`),
    fetch(`${PROXY_URL}/cg/coins/${coinId}/ohlc?vs_currency=usd&days=60`)
  ]);

  if (!coinRes.ok) {
    if (coinRes.status === 429) throw new Error('CoinGecko rate limit — 1 daqiqa kuting.');
    throw new Error(`Kripto ma'lumot yuklanmadi (${coinRes.status}).`);
  }

  const coin = await coinRes.json();
  const ohlc = ohlcRes.ok ? await ohlcRes.json() : [];
  const md   = coin.market_data;

  const candles = ohlc.length > 10 ? {
    close: ohlc.map(k => k[4]), high:  ohlc.map(k => k[2]),
    low:   ohlc.map(k => k[3]), open:  ohlc.map(k => k[1]),
    volume: ohlc.map(() => 0),  time:  ohlc.map(k => Math.floor(k[0] / 1000))
  } : null;

  const signals  = computeTechnicalSignals(candles);
  const price    = md.current_price.usd;
  const changePct = md.price_change_percentage_24h || 0;

  const data = {
    type: 'crypto', ticker: upper, name: coin.name,
    exchange: 'BINANCE',
    industry: (coin.categories && coin.categories[0]) || 'Cryptocurrency',
    currency: 'USDT',
    price, change: price - price / (1 + changePct / 100),
    changePercent: changePct,
    open: price / (1 + changePct / 100),
    high: md.high_24h.usd, low: md.low_24h.usd,
    prevClose: price / (1 + changePct / 100),
    volume24h: md.total_volume.usd || 0,
    quoteVolume24h: md.total_volume.usd || 0,
    marketCapUsd: md.market_cap.usd,
    rank: coin.market_cap_rank,
    preSignals: signals || {
      rsi: 50, sma20: null, sma50: null,
      support: md.low_24h.usd, resistance: md.high_24h.usd,
      volumeRatio: 1,
      trend: changePct > 0 ? 'bullish' : changePct < 0 ? 'bearish' : 'neutral',
      rsiStatus: 'neutral', volumeStatus: 'neutral', lastClose: price
    },
    candles, news: [], earnings: null
  };

  patchSkeletonPrice(data, true);
  return data;
}

// ── FINNHUB via Cloudflare proxy (real-time, ~200ms) ──────────────────────
async function fetchFinnhubStock(ticker) {
  const base = `${PROXY_URL}/api`;
  const now  = Math.floor(Date.now() / 1000);
  const from60 = now - 60 * 24 * 3600;

  const [qRes, pRes, nRes, eRes, cRes] = await Promise.all([
    fetch(`${base}/quote?symbol=${ticker}`),
    fetch(`${base}/stock/profile2?symbol=${ticker}`),
    fetch(`${base}/company-news?symbol=${ticker}&from=${daysAgo(7)}&to=${daysAgo(0)}`),
    fetch(`${base}/calendar/earnings?from=${daysAgo(0)}&to=${daysAgo(-90)}&symbol=${ticker}`),
    fetch(`${base}/stock/candle?symbol=${ticker}&resolution=D&from=${from60}&to=${now}`)
  ]);

  if (!qRes.ok) throw new Error(`Proxy xatolik (${qRes.status})`);
  const q = await qRes.json();
  if (!q.c || q.c === 0) throw new Error(`"${ticker}" topilmadi yoki bozor yopiq.`);

  const p    = pRes.ok ? await pRes.json() : {};
  const news = nRes.ok ? (await nRes.json()).slice(0, 6) : [];
  const earn = eRes.ok ? await eRes.json() : {};
  const cRaw = cRes.ok ? await cRes.json() : { s: 'no_data' };

  const candles = cRaw.s === 'ok' ? {
    close: cRaw.c, high: cRaw.h, low: cRaw.l,
    open: cRaw.o, volume: cRaw.v, time: cRaw.t
  } : null;

  const signals = computeTechnicalSignals(candles);

  const data = {
    type: 'stock', ticker,
    name: p.name || ticker,
    exchange: p.exchange || 'N/A',
    industry: p.finnhubIndustry || 'N/A',
    currency: 'USD',
    price: q.c, change: q.d, changePercent: q.dp,
    open: q.o, high: q.h, low: q.l, prevClose: q.pc,
    volume24h: 0, quoteVolume24h: 0,
    marketCapUsd: p.marketCapitalization ? p.marketCapitalization * 1e6 : null,
    rank: null,
    preSignals: signals || {
      rsi: 50, sma20: null, sma50: null,
      support: q.l, resistance: q.h,
      volumeRatio: 1,
      trend: q.dp > 0 ? 'bullish' : q.dp < 0 ? 'bearish' : 'neutral',
      rsiStatus: 'neutral', volumeStatus: 'neutral', lastClose: q.c
    },
    candles,
    news: news.map(n => ({ headline: n.headline, source: n.source, url: n.url, datetime: n.datetime })),
    earnings: (earn.earningsCalendar || [])[0] || null
  };

  patchSkeletonPrice(data, false);
  return data;
}

// ── CLAUDE web_search for stock data ──────────────────────────────────────
async function fetchClaudeStock(ticker) {
  const prompt = `Return ONLY a raw JSON object (absolutely no markdown, no backticks, no explanation) with live stock data for ${ticker} NYSE/NASDAQ. Search the web right now for the real current price.

{"name":"","exchange":"NYSE or NASDAQ","sector":"","price":0,"change":0,"changePercent":0,"open":0,"high":0,"low":0,"prevClose":0,"volume24h":0,"marketCapUsd":0,"rsi14":50,"sma20":null,"sma50":null,"support":0,"resistance":0,"earningsDate":null}

Use real current numbers. Return JSON only, nothing else.`;

  const res = await fetch(`${PROXY_URL}/claude`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      model:"claude-sonnet-4-20250514", max_tokens:600,
      messages:[{role:"user", content:prompt}],
      tools:[{type:"web_search_20250305", name:"web_search"}]
    })
  });
  if (!res.ok) throw new Error("API xatolik: " + res.status);
  const result = await res.json();
  const parsed = safeParseJSON(
    result.content.filter(b=>b.type==="text").map(b=>b.text).join("")
  );
  const data = {
    type:'stock', ticker,
    name: parsed.name || ticker,
    exchange: parsed.exchange || 'N/A',
    industry: parsed.sector || 'N/A',
    currency: 'USD',
    price: parsed.price || 0,
    change: parsed.change || 0,
    changePercent: parsed.changePercent || 0,
    open: parsed.open || 0,
    high: parsed.high || 0,
    low: parsed.low || 0,
    prevClose: parsed.prevClose || 0,
    volume24h: parsed.volume24h || 0,
    quoteVolume24h: parsed.volume24h || 0,
    marketCapUsd: parsed.marketCapUsd || null,
    rank: null,
    preSignals: {
      rsi: parsed.rsi14 || 50,
      sma20: parsed.sma20 || null,
      sma50: parsed.sma50 || null,
      support: parsed.support || parsed.low || 0,
      resistance: parsed.resistance || parsed.high || 0,
      volumeRatio: 1,
      trend: parsed.changePercent > 0 ? "bullish" : parsed.changePercent < 0 ? "bearish" : "neutral",
      rsiStatus: parsed.rsi14 >= 70 ? "bearish" : parsed.rsi14 <= 30 ? "bullish" : "neutral",
      volumeStatus: "neutral",
      lastClose: parsed.price || 0
    },
    news: [],
    earnings: parsed.earningsDate ? { date: parsed.earningsDate } : null,
    candles: null
  };
  patchSkeletonPrice(data, false);
  return data;
}

// ==================== AI EXPLANATION CALL (parallel) ====================
// If Finnhub key exists → no web_search needed (data already real)
// If no key → use web_search to also find news
async function fetchAIExplanation(ticker, isCrypto) {
  const needsSearch = isCrypto;

  // System prompt
  const system = `You are a financial analyst writing explanations in Uzbek language for beginner investors in Uzbekistan. 
Always write headline, explanation, bull_case, bear_case in Uzbek language.
Always return valid JSON only. No markdown, no backticks, no extra text.`;

  // User prompt — clear JSON schema
  const userPrompt = needsSearch
    ? `Search the web for the latest news and price data about ${ticker} cryptocurrency on Binance.

Then return this exact JSON structure (all text fields must be in Uzbek language):
{
"headline": "One sentence in Uzbek describing the most important thing happening with ${ticker} today (max 15 words)",
"explanation": "Two paragraphs in Uzbek explaining what happened and why. Use **bold** for key terms. Separate paragraphs with two newlines.",
"bull_case": "1-2 sentences in Uzbek: why the price could go up",
"bear_case": "1-2 sentences in Uzbek: why the price could go down",
"catalysts": [{"text": "upcoming event or catalyst", "impact": "positive", "timing": "date or timeframe"}],
"news": [{"headline": "news title", "source": "source name", "url": "https://...", "datetime": 0}]
}

Return JSON only. Maximum 3 catalysts, 5 news items.`

    : `Analyze ${ticker} stock and explain it in Uzbek for beginner investors.

Return this exact JSON structure (all text fields must be in Uzbek language):
{
"headline": "One sentence in Uzbek describing the most important thing about ${ticker} right now (max 15 words)",
"explanation": "Two paragraphs in Uzbek explaining the company, recent performance, and what investors should know. Use **bold** for key terms. Separate paragraphs with two newlines.",
"bull_case": "1-2 sentences in Uzbek: why the price could go up",
"bear_case": "1-2 sentences in Uzbek: why the price could go down",
"catalysts": [{"text": "upcoming event or catalyst", "impact": "positive", "timing": "date or timeframe"}]
}

Return JSON only. Maximum 3 catalysts.`;

  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 1200,
    system: system,
    messages: [{ role: "user", content: userPrompt }]
  };
  if (needsSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];

  const res = await fetch(`${PROXY_URL}/claude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    if (res.status === 400 || res.status === 402) throw new Error("Claude API kredit tugagan. console.anthropic.com da to'ldiring.");
    if (res.status === 401) throw new Error("Claude API key noto'g'ri. Cloudflare Worker da tekshiring.");
    throw new Error("AI API xatolik: " + res.status);
  }
  const result = await res.json();
  const text = result.content.filter(b => b.type === "text").map(b => b.text).join("");
  const parsed = safeParseJSON(text);

  return {
    headline:    parsed.headline    || ticker + " haqida ma'lumot yuklanmoqda...",
    explanation: parsed.explanation || "",
    bull_case:   parsed.bull_case   || "",
    bear_case:   parsed.bear_case   || "",
    catalysts:   parsed.catalysts   || [],
    news:        parsed.news        || []
  };
}

