// ============================================================================
// StockSage main — orchestration layer (analyze, navigate, watchlist, alerts)
// Loaded LAST (after all other modules); relies on shared global scope.
//
// Cross-module dependencies (all resolved at call time via globals):
//   utils.js     — PROXY_URL, escapeHtml, formatPrice, formatBigNumber,
//                  timeAgo, daysAgo, formatExplanation, safeParseJSON,
//                  showError, hideError, showToast
//   technical.js — computeTechnicalSignals (used inside renderResults)
//   api.js       — fetchFastData, fetchAIExplanation (called from analyze)
//                  Note: api.js's fetchPolygonStock/fetchFinnhubStock call
//                  patchSkeletonPrice — lazy-resolved here at call time.
//   halal.js     — HALAL_STATIC, classifyHalal (referenced by renderResults
//                  for the halal mini-card)
//   pump.js      — initPumpPage (called from navigateTo)
//   screener.js  — initMegaPage (called from navigateTo)
//   gdp-panel.js — showTickerPanel (called from watchlist click handlers)
//   pages.js     — loadMarketBeatPanels (called by renderResults),
//                  loadGlobalStats (called at bootstrap),
//                  initCalendarTabs / initPulsePage / initDatesPage /
//                  initListTabs / loadFuturesPage / loadCryptoMarket /
//                  loadCongressPage / loadHeatmap / loadInsider
//                  (all called from navigateTo)
//
// Bootstrap section (end of file) wires up watchlist/alerts on first
// load and starts the 60s watchlist-price-refresh interval.
// ============================================================================

// ==================== STATE ====================
let currentMarket = 'stock';
let currentSymbol = null;

const QUICK_PICKS = {
  stock:   ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'AMD'],
  crypto:  ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX'],
  futures: ['GLD', 'SLV', 'USO', 'UNG', 'GDX', 'UUP', 'TLT', 'VXX']
};

const MARKET_CONFIG = {
  stock: {
    placeholder: "Aksiya tickerini kiriting (masalan, AAPL, TSLA, NVDA)...",
    validate: t => /^[A-Z]{1,5}$/.test(t),
    errorMsg: "Tikker noto'g'ri format. 1-5 ta lotin harfini kiriting (masalan: AAPL)."
  },
  crypto: {
    placeholder: "Kripto symbolini kiriting (masalan, BTC, ETH, SOL)...",
    validate: t => /^[A-Z0-9]{2,10}$/.test(t),
    errorMsg: "Kripto symbol noto'g'ri. Faqat token nomini kiriting (masalan: BTC, ETH)."
  },
  futures: {
    placeholder: "ETF ticker kiriting (masalan, GLD, USO, TLT, UUP)...",
    validate: t => /^[A-Z]{1,5}$/.test(t),
    errorMsg: "Ticker noto'g'ri. ETF nomini kiriting (masalan: GLD, USO, TLT)."
  }
};

// ==================== INIT ====================
function updateTime() {
  const now = new Date();
  const opts = { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' };
  document.getElementById('datetime').textContent = 'NYC ' + now.toLocaleTimeString('en-US', opts);
}
updateTime();
setInterval(updateTime, 30000);

// ==================== MODAL ====================


document.getElementById('api-save-btn')?.addEventListener('click', () => {
  document.getElementById('api-modal').classList.remove('active');
});


// ==================== MARKET TOGGLE ====================
document.querySelectorAll('.market-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentMarket = btn.dataset.market;
    document.querySelectorAll('.market-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const config = MARKET_CONFIG[currentMarket];
    const input = document.getElementById('ticker-input');
    if (input) {
      input.placeholder = config.placeholder;
      input.value = '';
    }

    const searchBox = document.getElementById('search-box');
    const analyzeBtn = document.getElementById('analyze-btn');
    if (currentMarket === 'crypto') {
      searchBox.classList.add('crypto-mode');
      analyzeBtn.classList.add('crypto-mode');
    } else {
      searchBox.classList.remove('crypto-mode');
      analyzeBtn.classList.remove('crypto-mode');
    }
    // Futures gold rengi
    if (currentMarket === 'futures') {
      analyzeBtn.style.background = '#00d4ff';
      analyzeBtn.style.color = '#000';
    } else {
      analyzeBtn.style.background = '';
      analyzeBtn.style.color = '';
    }

    renderQuickPicks();
    hideError();
  });
});

function renderQuickPicks() {
  const container = document.getElementById('quick-picks');
  const cls = currentMarket === 'crypto' ? 'quick-pick crypto' : 'quick-pick';
  container.innerHTML = QUICK_PICKS[currentMarket].map(t =>
    `<button class="${cls}" data-ticker="${t}">${t}</button>`
  ).join('');
  container.querySelectorAll('.quick-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('ticker-input').value = btn.dataset.ticker;
      analyze();
    });
  });
}
renderQuickPicks();

document.getElementById('ticker-input')?.addEventListener('keypress', e => {
  if (e.key === 'Enter') analyze();
});
document.getElementById('analyze-btn')?.addEventListener('click', analyze);

// ==================== MAIN ANALYZE ====================
async function analyze() {
  const ticker = document.getElementById('ticker-input').value.trim().toUpperCase();
  const config = MARKET_CONFIG[currentMarket];

  if (!ticker) {
    showError('Iltimos, ' + (currentMarket === 'crypto' ? 'kripto symbolini' : 'aksiya tickerini') + ' kiriting.');
    return;
  }
  if (!config.validate(ticker)) {
    showError(config.errorMsg);
    return;
  }

  hideError();
  document.getElementById('results').classList.remove('active');
  document.getElementById('loading').classList.add('active');
  document.getElementById('analyze-btn').disabled = true;

  try {
    const isCrypto = currentMarket === 'crypto';
    currentSymbol = ticker;

    // Show skeleton immediately — user sees UI in ~0ms
    document.getElementById('loading').classList.remove('active');
    renderSkeleton(ticker, isCrypto);

    // Two parallel calls: fast data + rich AI explanation
    const [fastData, aiData] = await Promise.all([
      fetchFastData(ticker, isCrypto),
      fetchAIExplanation(ticker, isCrypto)
    ]);

    // Merge and render full results
    // Merge news: Finnhub news (fastData) preferred, AI news as fallback
    const mergedNews = fastData.news.length > 0 ? fastData.news : (aiData.news || []);
    const merged = { ...fastData, news: mergedNews, aiContext: aiData };
    renderResults(ticker, merged, merged.preSignals, aiData);

  } catch (err) {
    console.error(err);
    showError('Xatolik: ' + err.message);
    document.getElementById('loading').classList.remove('active');
    document.getElementById('results').classList.remove('active');
  } finally {
    document.getElementById('analyze-btn').disabled = false;
  }
}

function setLoadingStep(text) {
  document.getElementById('loading-step').textContent = text;
}

// ==================== SKELETON UI ====================
function renderSkeleton(ticker, isCrypto) {
  const results = document.getElementById('results');
  results.innerHTML = `
    <div class="ticker-header">
      <div class="ticker-info">
        <div class="symbol" style="opacity:0.9">
          ${ticker}
          <span class="market-badge ${isCrypto ? 'crypto' : ''}">${isCrypto ? 'CRYPTO' : 'STOCK'}</span>
        </div>
        <div class="company skel skel-text" style="width:200px;height:16px;margin-bottom:6px;"></div>
        <div class="skel skel-text" style="width:140px;height:13px;"></div>
      </div>
      <div class="price-block">
        <div class="skel skel-text" style="width:160px;height:52px;margin-bottom:8px;border-radius:8px;"></div>
        <div class="skel skel-text" style="width:110px;height:20px;margin-bottom:4px;"></div>
        <div class="skel skel-text" style="width:90px;height:13px;"></div>
      </div>
    </div>

    <div class="daily-explainer" id="skel-explainer">
      <div class="explainer-tag"><i class="ri-sparkling-2-fill"></i> AI Tushuntirish yuklanmoqda...</div>
      <div class="skel skel-text" style="width:80%;height:28px;margin-bottom:16px;border-radius:6px;"></div>
      <div class="skel skel-text" style="width:100%;height:14px;margin-bottom:8px;"></div>
      <div class="skel skel-text" style="width:95%;height:14px;margin-bottom:8px;"></div>
      <div class="skel skel-text" style="width:88%;height:14px;margin-bottom:8px;"></div>
      <div class="skel skel-text" style="width:60%;height:14px;margin-bottom:20px;"></div>
      <div class="scenarios">
        <div class="scenario bull"><div class="skel skel-text" style="width:100%;height:14px;margin-bottom:6px;"></div><div class="skel skel-text" style="width:80%;height:14px;"></div></div>
        <div class="scenario bear"><div class="skel skel-text" style="width:100%;height:14px;margin-bottom:6px;"></div><div class="skel skel-text" style="width:80%;height:14px;"></div></div>
      </div>
    </div>

    <div class="signals-grid">
      ${[1,2,3,4].map(() => `<div class="signal-cell"><div class="skel skel-text" style="width:60%;height:11px;margin-bottom:10px;"></div><div class="skel skel-text" style="width:80%;height:32px;margin-bottom:8px;border-radius:6px;"></div><div class="skel skel-text" style="width:50%;height:13px;"></div></div>`).join('')}
    </div>

    <div class="stats-grid" style="opacity:0.5">
      ${[1,2,3,4,5].map(() => `<div class="stat-cell"><div class="skel skel-text" style="width:60%;height:11px;margin-bottom:8px;"></div><div class="skel skel-text" style="width:80%;height:18px;"></div></div>`).join('')}
    </div>

    <div class="chart-card">
      <div class="chart-card-header">
        <div class="chart-title"><div class="card-icon"><i class="ri-candlestick-fill"></i></div><span>TradingView Chart</span></div>
        <div class="interval-tabs" id="interval-tabs">
          <button class="interval-tab" data-interval="15">15m</button>
          <button class="interval-tab" data-interval="60">1H</button>
          <button class="interval-tab" data-interval="240">4H</button>
          <button class="interval-tab active" data-interval="D">1D</button>
          <button class="interval-tab" data-interval="W">1W</button>
        </div>
      </div>
      <div class="tradingview-wrap" id="tv-container"></div>
    </div>
  `;
  results.classList.add('active');
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Chart loads immediately — doesn't wait for API
  initTradingViewChart(ticker, 'D', isCrypto);

  document.querySelectorAll('#interval-tabs .interval-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#interval-tabs .interval-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      initTradingViewChart(ticker, tab.dataset.interval, isCrypto);
    });
  });
}

// Patch price into skeleton as soon as fastData resolves
function patchSkeletonPrice(parsed, isCrypto) {
  if (!parsed || !parsed.price) return;
  const priceChangeClass = (parsed.changePercent || 0) >= 0 ? 'up' : 'down';
  const sign = (parsed.changePercent || 0) >= 0 ? '+' : '';

  // Try to patch ticker-info
  const companyEl = document.querySelector('.ticker-info .company');
  if (companyEl) {
    companyEl.classList.remove('skel','skel-text');
    companyEl.style = '';
    companyEl.textContent = parsed.name || '';
  }

  // Patch price block
  const priceBlock = document.querySelector('.price-block');
  if (priceBlock) {
    priceBlock.innerHTML = `
      <div class="current-price">$${formatPrice(parsed.price)}</div>
      <div class="price-change ${priceChangeClass}">
        ${sign}${formatPrice(Math.abs(parsed.change || 0))} (${sign}${(parsed.changePercent || 0).toFixed(2)}%)
      </div>
      <div class="price-meta">${isCrypto ? '24 soat' : 'Bugun'} · ${isCrypto ? 'COINGECKO' : 'WEB'}</div>
    `;
  }
}

// ==================== RENDER ====================
function renderResults(ticker, data, signals, ai) {
  document.getElementById('loading').classList.remove('active');
  const results = document.getElementById('results');
  const isCrypto = data.type === 'crypto';

  const priceChangeClass = data.changePercent >= 0 ? 'up' : 'down';
  const priceChangeSign = data.changePercent >= 0 ? '+' : '';
  const changeLabel = isCrypto ? '24 soat' : 'Bugun';

  const marketBadgeHtml = isCrypto
    ? `<span class="market-badge crypto">CRYPTO</span>`
    : `<span class="market-badge">STOCK</span>`;

  const exchangeText = isCrypto
    ? `BINANCE · ${ticker}/USDT`
    : `${escapeHtml(data.exchange)} · ${escapeHtml(data.industry)}`;

  // Stats grid
  const statsHtml = isCrypto ? `
    <div class="stat-cell">
      <div class="stat-label">24s High</div>
      <div class="stat-value">$${formatPrice(data.high)}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">24s Low</div>
      <div class="stat-value">$${formatPrice(data.low)}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Open</div>
      <div class="stat-value">$${formatPrice(data.open)}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">24s Volume</div>
      <div class="stat-value">${formatBigNumber(data.quoteVolume24h)}</div>
    <div class="stat-cell">
      <div class="stat-label">Market Cap</div>
      <div class="stat-value">${data.marketCapUsd ? formatBigNumber(data.marketCapUsd) : 'N/A'}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">CMC Rank</div>
      <div class="stat-value">#${data.rank || 'N/A'}</div>
    </div>
    </div>
  ` : `
    <div class="stat-cell">
      <div class="stat-label">Day High</div>
      <div class="stat-value">$${formatPrice(data.high)}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Day Low</div>
      <div class="stat-value">$${formatPrice(data.low)}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Open</div>
      <div class="stat-value">$${formatPrice(data.open)}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Prev Close</div>
      <div class="stat-value">$${formatPrice(data.prevClose)}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Market Cap</div>
      <div class="stat-value">${data.marketCap ? formatBigNumber(data.marketCap * 1e6) : 'N/A'}</div>
    </div>
  `;

  // Signals
  const signalsHtml = signals ? `
    <div class="signal-cell">
      <div class="signal-label">RSI (14)</div>
      <div class="signal-value">${signals.rsi.toFixed(1)}</div>
      <div class="signal-status ${signals.rsiStatus}">
        ${signals.rsi >= 70 ? '<i class="ri-arrow-up-fill"></i> Haddan oshgan' : signals.rsi <= 30 ? '<i class="ri-arrow-down-fill"></i> Past baholangan' : '<i class="ri-subtract-fill"></i> Normal'}
      </div>
    </div>
    <div class="signal-cell">
      <div class="signal-label">Trend</div>
      <div class="signal-value">${signals.trend === 'bullish' ? '<i class="ri-arrow-up-fill"></i>' : signals.trend === 'bearish' ? '<i class="ri-arrow-down-fill"></i>' : '<i class="ri-arrow-right-fill"></i>'}</div>
      <div class="signal-status ${signals.trend === 'bullish' ? 'bullish' : signals.trend === 'bearish' ? 'bearish' : 'neutral'}">
        ${signals.trend === 'bullish' ? 'Ko\'tarilish' : signals.trend === 'bearish' ? 'Tushish' : 'Yon'}
      </div>
    </div>
    <div class="signal-cell">
      <div class="signal-label">Volume</div>
      <div class="signal-value">${signals.volumeRatio.toFixed(1)}x</div>
      <div class="signal-status ${signals.volumeStatus}">
        ${signals.volumeRatio > 1.5 ? '<i class="ri-arrow-up-fill"></i> Yuqori' : signals.volumeRatio < 0.6 ? '<i class="ri-arrow-down-fill"></i> Past' : '<i class="ri-subtract-fill"></i> O\'rtacha'}
      </div>
    </div>
    <div class="signal-cell">
      <div class="signal-label">SMA 20</div>
      <div class="signal-value">$${formatPrice(signals.sma20)}</div>
      <div class="signal-status ${data.price > signals.sma20 ? 'bullish' : 'bearish'}">
        ${data.price > signals.sma20 ? '<i class="ri-arrow-up-fill"></i> Yuqorida' : '<i class="ri-arrow-down-fill"></i> Pastda'}
      </div>
    </div>
  ` : `<div class="info-text" style="grid-column: 1 / -1;">Texnik signallar hisoblash uchun ma'lumot yetarli emas.</div>`;

  // News
  const newsHtml = data.news.length > 0
    ? data.news.map(n => `
        <div class="news-item">
          <div class="news-headline">${escapeHtml(n.headline)}</div>
          <div class="news-meta">
            <span class="news-source">${escapeHtml(n.source)}</span>
            <span>${timeAgo(n.datetime)} oldin</span>
          </div>
          ${n.url ? `<a href="${escapeHtml(n.url)}" target="_blank" class="news-link">Maqolani o'qish <i class="ri-arrow-right-line"></i></a>` : ''}
        </div>
      `).join('')
    : `<div class="info-text">Yangiliklar yo'q yoki yuklanmadi. ${isCrypto ? 'Kripto uchun yangiliklar AI tushuntirishida ko\'rsatiladi.' : ''}</div>`;

  // Catalysts
  const catalystsHtml = (ai.catalysts && ai.catalysts.length > 0)
    ? ai.catalysts.map(c => `
        <div class="catalyst-item">
          <div class="catalyst-marker ${c.impact}"></div>
          <div>
            <div class="catalyst-text">${escapeHtml(c.text)}</div>
            <div class="catalyst-meta">${c.impact === 'positive' ? '<i class="ri-arrow-up-fill"></i> Ijobiy' : c.impact === 'negative' ? '<i class="ri-arrow-down-fill"></i> Salbiy' : '<i class="ri-subtract-fill"></i> Neytral'}</div>
          </div>
          <div class="catalyst-time">${escapeHtml(c.timing)}</div>
        </div>
      `).join('')
    : `<div class="info-text">Yaqin catalystlar topilmadi.</div>`;

  results.innerHTML = `
    <div class="ticker-header">
      <div class="ticker-info">
        <div class="symbol">
          ${ticker}
          ${marketBadgeHtml}
        </div>
        <div class="company">${escapeHtml(data.name)}</div>
        <div class="exchange">${exchangeText}</div>
      </div>
      <div class="price-block">
        <div class="current-price">$${formatPrice(data.price)}</div>
        <div class="price-change ${priceChangeClass}">
          ${priceChangeSign}${formatPrice(Math.abs(data.change))} (${priceChangeSign}${data.changePercent.toFixed(2)}%)
        </div>
        <div class="price-meta">${changeLabel} · ${isCrypto ? 'COINGECKO' : 'FINNHUB'}</div>
      </div>
      <div class="wl-btn-wrap">
        <button class="add-to-wl-btn" id="add-to-wl-btn" onclick="toggleWatchlist()">
          <i class="ri-bookmark-line" id="wl-btn-icon"></i>
          <span id="wl-btn-text">Watchlist</span>
        </button>
      </div>
    </div>

    <div class="daily-explainer">
      <div class="explainer-tag"><i class="ri-sparkling-2-fill"></i> AI Tushuntirish · O'zbek tilida</div>
      <div class="explainer-headline">${escapeHtml(ai.headline)}</div>
      <div class="explainer-body">${formatExplanation(ai.explanation)}</div>

      <div class="scenarios">
        <div class="scenario bull">
          <div class="scenario-label"><i class="ri-arrow-up-fill"></i> Bull Case</div>
          <div class="scenario-text">${escapeHtml(ai.bull_case)}</div>
        </div>
        <div class="scenario bear">
          <div class="scenario-label"><i class="ri-arrow-down-fill"></i> Bear Case</div>
          <div class="scenario-text">${escapeHtml(ai.bear_case)}</div>
        </div>
      </div>
    </div>

    <div class="signals-grid">
      ${signalsHtml}
    </div>

    <div class="stats-grid">
      ${statsHtml}
    </div>

    <div class="chart-card">
      <div class="chart-card-header">
        <div class="chart-title">
          <div class="card-icon"><i class="ri-candlestick-fill"></i></div>
          <span>TradingView Chart</span>
        </div>
        <div class="interval-tabs" id="interval-tabs">
          <button class="interval-tab" data-interval="15">15m</button>
          <button class="interval-tab" data-interval="60">1H</button>
          <button class="interval-tab" data-interval="240">4H</button>
          <button class="interval-tab active" data-interval="D">1D</button>
          <button class="interval-tab" data-interval="W">1W</button>
        </div>
      </div>
      <div class="tradingview-wrap" id="tv-container"></div>
    </div>

    <div class="analysis-grid">
      <div class="card">
        <div class="card-header">
          <div class="card-icon"><i class="ri-newspaper-fill"></i></div>
          <div class="card-title">So'nggi yangiliklar (real)</div>
        </div>
        ${newsHtml}
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-icon"><i class="ri-flashlight-fill"></i></div>
          <div class="card-title">Yaqin catalystlar</div>
        </div>
        ${catalystsHtml}

        ${signals ? `
          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border);">
            <div class="card-title" style="margin-bottom: 12px;">Asosiy darajalar</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <div class="signal-label">Support</div>
                <div style="font-family: var(--display); font-weight: 700; font-size: 22px; color: var(--bull);">$${formatPrice(signals.support)}</div>
              </div>
              <div>
                <div class="signal-label">Resistance</div>
                <div style="font-family: var(--display); font-weight: 700; font-size: 22px; color: var(--bear);">$${formatPrice(signals.resistance)}</div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>

    <!-- MARKETBEAT-STYLE PANELS -->
    <div class="mb-grid" id="mb-panels" style="display:none">


      <!-- Texnik Tahlil + Kirish nuqtasi -->
      <div class="card" style="grid-column: span 2">
        <div class="card-header">
          <div class="card-icon"><i class="ri-line-chart-fill" style="color:var(--accent)"></i></div>
          <div class="card-title">Texnik Tahlil — Kirish Nuqtasi va Stop-Loss</div>
        </div>
        <div id="mb-technical"><div class="info-text">Yuklanmoqda...</div></div>
      </div>

      <!-- Halol Screening -->
      <div class="card">
        <div class="card-header">
          <div class="card-icon"><i class="ri-shield-check-fill" style="color:var(--bull)"></i></div>
          <div class="card-title">Halollik Tahlili</div>
        </div>
        <div id="mb-halal"><div class="info-text">Yuklanmoqda...</div></div>
      </div>

      <!-- Analyst Ratings -->
      <div class="card">
        <div class="card-header">
          <div class="card-icon"><i class="ri-award-fill"></i></div>
          <div class="card-title">Analyst Ratings</div>
        </div>
        <div id="mb-analyst"><div class="info-text">Yuklanmoqda...</div></div>
      </div>

      <!-- Short Interest -->
      <div class="card">
        <div class="card-header">
          <div class="card-icon"><i class="ri-arrow-down-circle-fill"></i></div>
          <div class="card-title">Short Interest</div>
        </div>
        <div id="mb-short"><div class="info-text">Yuklanmoqda...</div></div>
      </div>

      <!-- Institutional Ownership -->
      <div class="card">
        <div class="card-header">
          <div class="card-icon"><i class="ri-building-fill"></i></div>
          <div class="card-title">Institutional Ownership — Smart Money</div>
        </div>
        <div id="mb-institutional"><div class="info-text">Yuklanmoqda...</div></div>
      </div>

      <!-- Dividend -->
      <div class="card" id="mb-dividend-card">
        <div class="card-header">
          <div class="card-icon"><i class="ri-money-dollar-circle-fill"></i></div>
          <div class="card-title">Dividend Ma'lumotlari</div>
        </div>
        <div id="mb-dividend"><div class="info-text">Yuklanmoqda...</div></div>
      </div>

    </div>

    <!-- Earnings History — full width -->
    <div class="card" id="mb-earnings-card" style="display:none;margin-bottom:24px">
      <div class="card-header">
        <div class="card-icon"><i class="ri-bar-chart-grouped-fill"></i></div>
        <div class="card-title">Earnings Tarixi — Surprise tahlili</div>
      </div>
      <div id="mb-earnings"><div class="info-text">Yuklanmoqda...</div></div>
    </div>

    <div class="disclaimer">
      <strong><i class="ri-error-warning-fill"></i> MUHIM:</strong> StockSage sizga moliyaviy MASLAHAT BERMAYDI. Bu platforma — ta'lim va tushunish vositasi. Real narxlar Finnhub va Binance API'dan, texnik signallar haqiqiy formula bilan hisoblanadi, AI esa o'zbek tilida tushuntiradi. Investitsiya qarorlari sizniki — mas'uliyat ham. ${isCrypto ? 'Kripto bozori juda o\'zgaruvchan — pulingizning katta qismini yoqotishingiz mumkin.' : ''}
    </div>
  `;


  results.classList.add('active');

  // Load MarketBeat panels for stocks
  if (!isCrypto) {
    loadMarketBeatPanels(ticker, isCrypto);
  } else {
    const panels = document.getElementById('mb-panels');
    const earningsCard = document.getElementById('mb-earnings-card');
    if (panels) panels.style.display = 'none';
    if (earningsCard) earningsCard.style.display = 'none';
  }

  // Chart already loaded by skeleton — only re-attach interval tab listeners
  const existingContainer = document.getElementById('tv-container');
  if (existingContainer && !existingContainer.querySelector('iframe')) {
    initTradingViewChart(ticker, 'D', isCrypto);
  }

  document.querySelectorAll('#interval-tabs .interval-tab').forEach(tab => {
    tab.replaceWith(tab.cloneNode(true)); // remove old listeners
  });
  document.querySelectorAll('#interval-tabs .interval-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#interval-tabs .interval-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      initTradingViewChart(ticker, tab.dataset.interval, isCrypto);
    });
  });
}


// ==================== TRADINGVIEW CHART (IFRAME) ====================
function initTradingViewChart(ticker, interval, isCrypto) {
  const symbol = isCrypto ? `BINANCE:${ticker}USDT` : ticker;
  const container = document.getElementById('tv-container');
  container.innerHTML = '';

  const iframe = document.createElement('iframe');
  iframe.src = 'https://s.tradingview.com/widgetembed/?' +
    'frameElementId=tv-iframe' +
    '&symbol=' + encodeURIComponent(symbol) +
    '&interval=' + interval +
    '&hidesidetoolbar=0' +
    '&hidetoptoolbar=0' +
    '&symboledit=1' +
    '&saveimage=0' +
    '&toolbarbg=131316' +
    '&studies=%5B%22MASimple%40tv-basicstudies%22%2C%22RSI%40tv-basicstudies%22%5D' +
    '&theme=dark' +
    '&style=1' +
    '&timezone=Asia%2FTashkent' +
    '&withdateranges=1' +
    '&showpopupbutton=1' +
    '&locale=en';

  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  iframe.allowFullscreen = true;
  iframe.scrolling = 'no';
  iframe.id = 'tv-iframe';

  container.appendChild(iframe);
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
function navigateTo(page) {
  if (!document.getElementById('page-' + page)) page = 'home';
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  // Save current page to localStorage
  try { localStorage.setItem('ss_page', page); } catch(e) {}

  if (page === 'heatmap' && !heatmapLoaded) loadHeatmap();
  if (page === 'screener') initMegaPage();
  if (page === 'crypto-market' && !cryptoMarketLoaded) loadCryptoMarket();
  if (page === 'calendar' && !calLoaded.earnings) loadCalendarPage();
  if (page === 'congress' && !congressLoaded) loadCongressPage();
  if (page === 'futures' && !futuresLoaded) loadFuturesPage();
  if (page === 'pulse') initPulsePage();
  if (page === 'dates') initDatesPage();
  if (page === 'halal') initHalalPage();
  if (page === 'pump') initPumpPage();

  if (page === 'lists') {
    initListTabs();
    if (!listLoaded.highs) loadListPanel('highs');
  }
  if (page === 'insider' && !insiderLoaded) {
    insiderLoaded = true;
    document.getElementById('insider-results').innerHTML =
      '<div class="info-text" style="padding:40px">Ticker kiriting va qidiring.</div>';
  }
}

function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Reload da localStorage dan sahifani tiklash
  const hash = (function(){ try { return localStorage.getItem('ss_page') || 'home'; } catch(e) { return 'home'; } })();
  navigateTo(hash);
}
initNav();

// ═══════════════════════════════════════════════════════════════════════════
// WATCHLIST
// ═══════════════════════════════════════════════════════════════════════════
let watchlist = JSON.parse(localStorage.getItem('ss_watchlist') || '[]');
let watchlistPrices = {}; // { ticker: { price, changePercent, name, isCrypto } }
let alertCheckInterval = null;

function saveWatchlist() {
  localStorage.setItem('ss_watchlist', JSON.stringify(watchlist));
}

function isInWatchlist(ticker) {
  return watchlist.some(w => w.ticker === ticker);
}

function toggleWatchlist() {
  if (!currentSymbol) return;
  const ticker = currentSymbol.toUpperCase();
  const isCrypto = currentMarket === 'crypto';

  if (isInWatchlist(ticker)) {
    watchlist = watchlist.filter(w => w.ticker !== ticker);
    showToast(`<i class="ri-bookmark-line"></i> ${ticker} watchlist'dan olib tashlandi`);
  } else {
    watchlist.push({ ticker, isCrypto, addedAt: Date.now() });
    showToast(`<i class="ri-bookmark-fill"></i> ${ticker} watchlist'ga qo'shildi!`);
  }

  saveWatchlist();
  updateWlButton(ticker);
  renderWatchlist();
  refreshWatchlistPrices();
}

function updateWlButton(ticker) {
  const btn = document.getElementById('add-to-wl-btn');
  const icon = document.getElementById('wl-btn-icon');
  const text = document.getElementById('wl-btn-text');
  if (!btn) return;
  if (isInWatchlist(ticker)) {
    btn.classList.add('added');
    icon.className = 'ri-bookmark-fill';
    text.textContent = "Qo'shildi";
  } else {
    btn.classList.remove('added');
    icon.className = 'ri-bookmark-line';
    text.textContent = 'Watchlist';
  }
}

function renderWatchlist() {
  const grid    = document.getElementById('watchlist-grid');
  const empty   = document.getElementById('watchlist-empty');
  const dashboard = document.getElementById('dashboard-grid');

  if (!grid) return;

  if (watchlist.length === 0) {
    grid.style.display = 'none';
    empty.style.display = 'block';
    if (dashboard) dashboard.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  grid.style.display = 'grid';
  if (dashboard) dashboard.style.display = 'grid';

  grid.innerHTML = watchlist.map(w => {
    const p = watchlistPrices[w.ticker];
    const changeClass = p && p.changePercent >= 0 ? 'up' : 'down';
    const changeSign  = p && p.changePercent >= 0 ? '+' : '';
    return `
      <div class="wl-card ${w.isCrypto ? 'crypto-card' : ''}" onclick="loadFromWatchlist('${w.ticker}', ${w.isCrypto})">
        <div class="wl-card-top">
          <span class="wl-ticker">${w.ticker}</span>
          <button class="wl-remove" onclick="event.stopPropagation(); removeFromWatchlist('${w.ticker}')">
            <i class="ri-close-line"></i>
          </button>
        </div>
        ${p
          ? `<div class="wl-price">$${formatPrice(p.price)}</div>
             <div class="wl-change ${changeClass}">${changeSign}${p.changePercent.toFixed(2)}%</div>
             <div class="wl-name">${escapeHtml(p.name || w.ticker)}</div>`
          : `<div class="wl-loading">Yuklanmoqda...</div>`
        }
      </div>
    `;
  }).join('');

  renderEarningsCalendar();
}

function removeFromWatchlist(ticker) {
  watchlist = watchlist.filter(w => w.ticker !== ticker);
  saveWatchlist();
  renderWatchlist();
  refreshWatchlistPrices();
  showToast(`<i class="ri-close-line"></i> ${ticker} olib tashlandi`);
}

function loadFromWatchlist(ticker, isCrypto) {
  // Market toggle
  currentMarket = isCrypto ? 'crypto' : 'stock';
  document.querySelectorAll('.market-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.market === currentMarket);
  });
  const searchBox = document.getElementById('search-box');
  const analyzeBtn = document.getElementById('analyze-btn');
  if (isCrypto) {
    searchBox.classList.add('crypto-mode');
    analyzeBtn.classList.add('crypto-mode');
  } else {
    searchBox.classList.remove('crypto-mode');
    analyzeBtn.classList.remove('crypto-mode');
  }
  renderQuickPicks();

  document.getElementById('ticker-input').value = ticker;
  analyze();
  window.scrollTo({ top: document.getElementById('results').offsetTop - 20, behavior: 'smooth' });
}

// Watchlist narxlarini yangilash (har 60 soniyada)
async function refreshWatchlistPrices() {
  if (watchlist.length === 0) return;

  for (const w of watchlist) {
    try {
      let price, changePercent, name;

      if (w.isCrypto) {
        const coinId = CGIDS[w.ticker];
        if (!coinId) continue;
        const res = await fetch(`${PROXY_URL}/cg/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`);
        if (!res.ok) continue;
        const data = await res.json();
        price = data.market_data.current_price.usd;
        changePercent = data.market_data.price_change_percentage_24h;
        name = data.name;
      } else {
const dAgoB=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.toISOString().split('T')[0];};
        const res = await fetch(`${PROXY_URL}/polygon/v2/aggs/ticker/${w.ticker}/range/1/day/${dAgoB(5)}/${dAgoB(1)}?adjusted=true&sort=asc&limit=5`);
        if (!res.ok) { console.error('Quote fetch failed for', w.ticker, res.status); continue; }
        const q = await res.json();
        console.log('Quote for', w.ticker, ':', q);
        price = q.c;
        changePercent = q.dp;
        // Use cached name from watchlistPrices or ticker
        name = (watchlistPrices[w.ticker] && watchlistPrices[w.ticker].name) || w.ticker;
      }

      if (price && !isNaN(price)) {
        watchlistPrices[w.ticker] = { price, changePercent: changePercent || 0, name: name || w.ticker };
        checkPriceAlerts(w.ticker, price);
      } else {
        console.error('Invalid price for', w.ticker, ':', price, 'q:', JSON.stringify(arguments));
      }

    } catch(e) { console.error('Watchlist price fetch error:', w.ticker, e); }
  }

  renderWatchlist();
}

// ═══════════════════════════════════════════════════════════════════════════
// EARNINGS CALENDAR
// ═══════════════════════════════════════════════════════════════════════════
async function renderEarningsCalendar() {
  const list = document.getElementById('earnings-list');
  if (!list) return;

  const stockItems = watchlist.filter(w => !w.isCrypto);
  if (stockItems.length === 0) {
    list.innerHTML = '<div class="info-text">Aksiya qo&#39;shsangiz, earnings sanalar ko&#39;rinadi.</div>';
    return;
  }

  list.innerHTML = '<div class="info-text">Yuklanmoqda...</div>';

  const now   = new Date();
  const from  = daysAgo(0);
  const to    = daysAgo(-30); // keyingi 30 kun

  try {
    const tickers = stockItems.map(w => w.ticker).join(',');
    const res = await fetch(`${PROXY_URL}/api/calendar/earnings?from=${from}&to=${to}&symbol=${stockItems[0].ticker}`);

    // Har bir ticker uchun alohida fetch (Finnhub free plan limitation)
    const earningsData = [];
    for (const w of stockItems.slice(0, 5)) {
      const r = await fetch(`${PROXY_URL}/api/calendar/earnings?from=${from}&to=${to}&symbol=${w.ticker}`);
      if (!r.ok) continue;
      const d = await r.json();
      if (d.earningsCalendar && d.earningsCalendar.length > 0) {
        earningsData.push(...d.earningsCalendar.slice(0, 2));
      }
    }

    earningsData.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (earningsData.length === 0) {
      list.innerHTML = '<div class="info-text">Yaqin 30 kunda earnings yo&#39;q.</div>';
      return;
    }

    list.innerHTML = earningsData.map(e => {
      const eDate   = new Date(e.date);
      const diffMs  = eDate - now;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      let badgeClass = 'upcoming', badgeText = `${diffDays} kun`;
      if (diffDays <= 0) { badgeClass = 'today'; badgeText = 'BUGUN'; }
      else if (diffDays <= 3) { badgeClass = 'soon'; badgeText = `${diffDays} kun`; }

      return `
        <div class="earnings-item">
          <span class="earnings-ticker">${escapeHtml(e.symbol)}</span>
          <span class="earnings-date">${e.date}</span>
          <span class="earnings-badge ${badgeClass}">${badgeText}</span>
        </div>
      `;
    }).join('');

  } catch(e) {
    list.innerHTML = '<div class="info-text">Earnings yuklanmadi.</div>';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRICE ALERTS
// ═══════════════════════════════════════════════════════════════════════════
let alerts = JSON.parse(localStorage.getItem('ss_alerts') || '[]');

function saveAlerts() {
  localStorage.setItem('ss_alerts', JSON.stringify(alerts));
}

function renderAlerts() {
  const list  = document.getElementById('alerts-list');
  const empty = document.getElementById('alerts-empty');
  if (!list) return;

  if (alerts.length === 0) {
    if (empty) empty.style.display = 'block';
    list.querySelectorAll('.alert-item').forEach(el => el.remove());
    return;
  }

  if (empty) empty.style.display = 'none';

  // Remove old items
  list.querySelectorAll('.alert-item').forEach(el => el.remove());

  alerts.forEach((a, i) => {
    const el = document.createElement('div');
    el.className = 'alert-item';
    el.innerHTML = `
      <div class="alert-info">
        <div class="alert-ticker">${escapeHtml(a.ticker)}</div>
        <div class="alert-target">
          Narx
          <span class="${a.direction}">${a.direction === 'above' ? '↑ yuqori' : '↓ pastga'}</span>
          $<span>${formatPrice(a.targetPrice)}</span> bo&#39;lsa
        </div>
      </div>
      <button class="alert-remove" onclick="removeAlert(${i})">
        <i class="ri-close-line"></i>
      </button>
    `;
    list.insertBefore(el, list.querySelector('.alert-form'));
  });
}

function removeAlert(i) {
  alerts.splice(i, 1);
  saveAlerts();
  renderAlerts();
}

document.getElementById('alert-add-btn')?.addEventListener('click', () => {
  const ticker    = document.getElementById('alert-ticker').value.trim().toUpperCase();
  const price     = parseFloat(document.getElementById('alert-price').value);
  const direction = document.getElementById('alert-direction').value;

  if (!ticker || isNaN(price) || price <= 0) {
    showToast('<i class="ri-error-warning-fill"></i> Ticker va narx kiriting!', 'warn');
    return;
  }

  alerts.push({ ticker, targetPrice: price, direction, createdAt: Date.now() });
  saveAlerts();
  renderAlerts();
  document.getElementById('alert-ticker').value = '';
  document.getElementById('alert-price').value = '';
  showToast(`<i class="ri-notification-3-fill"></i> Alert qo'shildi: ${ticker} $${price}`);

  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
});

function checkPriceAlerts(ticker, currentPrice) {
  alerts.forEach((a, i) => {
    if (a.ticker !== ticker) return;
    const triggered =
      (a.direction === 'above' && currentPrice >= a.targetPrice) ||
      (a.direction === 'below' && currentPrice <= a.targetPrice);

    if (triggered) {
      const msg = `${ticker}: $${formatPrice(currentPrice)} — maqsad narxga yetdi!`;
      showToast(`<i class="ri-notification-3-fill"></i> ${msg}`, 'alert');

      // Browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('StockSage Alert', { body: msg, icon: '/favicon.ico' });
      }

      // Remove triggered alert
      alerts.splice(i, 1);
      saveAlerts();
      renderAlerts();
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INIT on load
// ═══════════════════════════════════════════════════════════════════════════
renderWatchlist();
renderAlerts();
refreshWatchlistPrices();
loadGlobalStats();

// Har 60 soniyada watchlist narxlarini yangilash
setInterval(refreshWatchlistPrices, 60000);
