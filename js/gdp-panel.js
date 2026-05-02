// ============================================================================
// StockSage gdp-panel — Global ticker detail modal
// Loaded as a plain <script>; relies on shared global scope.
// Loads after halal.js (uses HALAL_STATIC).
//
// Depends on:
//   utils.js — PROXY_URL, escapeHtml, formatBigNumber
//   halal.js — HALAL_STATIC (read inside loadGdpHalal)
//
// Note: gdpGoFull and getTickerLogoUrl + TICKER_DOMAIN are currently
// orphaned (no callers in the codebase). Kept per user direction;
// step 13 re-evaluates wiring.
//
// Note: loadGdpAI does inline JSON parsing instead of safeParseJSON.
// Pre-existing duplication; out of refactor scope.
// ============================================================================

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL TICKER DETAIL PANEL — barcha tabda ishlaydi
// ═══════════════════════════════════════════════════════════════════════════
let gdpOpen = false;

async function showTickerPanel(ticker, marketType) {
  if (gdpOpen) closeTickerPanel();
  gdpOpen = true;
  ticker = ticker.toUpperCase();
  marketType = marketType || 'stock';

  // Overlay yaratamiz
  const overlay = document.createElement('div');
  overlay.className = 'gdp-overlay';
  overlay.id = 'gdp-overlay';

  overlay.innerHTML = `
    <div class="gdp-panel" id="gdp-panel">
      <div class="gdp-handle"></div>
      <div class="gdp-header">
        <div class="gdp-ticker-info">
          <span class="gdp-ticker">${ticker}</span>
          <div class="gdp-price-wrap">
            <span class="gdp-price" id="gdp-price">Yuklanmoqda...</span>
            <span class="gdp-change" id="gdp-change"></span>
          </div>
        </div>
        <button class="gdp-close-btn" onclick="closeTickerPanel()">
          <i class="ri ri-close-line"></i>
        </button>
      </div>
      <div class="gdp-body">
        <div class="gdp-tabs">
          <button class="gdp-tab active" data-gdp-tab="overview"><i class="ri ri-bar-chart-2-fill"></i> Umumiy</button>
          <button class="gdp-tab" data-gdp-tab="ai"><i class="ri ri-sparkling-2-fill"></i> AI Tahlil</button>
          <button class="gdp-tab" data-gdp-tab="news"><i class="ri ri-newspaper-fill"></i> Yangiliklar</button>
          ${marketType === 'stock' ? '<button class="gdp-tab" data-gdp-tab="halal"><i class="ri ri-shield-check-fill"></i> Halollik</button>' : ''}
        </div>

        <!-- Overview -->
        <div class="gdp-tab-content active" id="gdp-tab-overview">
          <div class="gdp-stat-grid" id="gdp-stats">
            <div class="gdp-stat"><div class="gdp-stat-val">—</div><div class="gdp-stat-lbl">Narx</div></div>
            <div class="gdp-stat"><div class="gdp-stat-val">—</div><div class="gdp-stat-lbl">Change%</div></div>
            <div class="gdp-stat"><div class="gdp-stat-val">—</div><div class="gdp-stat-lbl">Yuqori</div></div>
            <div class="gdp-stat"><div class="gdp-stat-val">—</div><div class="gdp-stat-lbl">Pastki</div></div>
            <div class="gdp-stat"><div class="gdp-stat-val">—</div><div class="gdp-stat-lbl">Hajm</div></div>
            <div class="gdp-stat"><div class="gdp-stat-val">—</div><div class="gdp-stat-lbl">Market Cap</div></div>
          </div>
          <!-- TradingView Mini Chart -->
          <div id="gdp-chart" style="height:200px;background:var(--bg-card);border-radius:12px;margin-bottom:16px;overflow:hidden;position:relative">
            <iframe
              src="https://s.tradingview.com/embed-widget/mini-symbol-overview/?locale=en#%7B%22symbol%22%3A%22${ticker}%22%2C%22width%22%3A%22100%25%22%2C%22height%22%3A%22200%22%2C%22dateRange%22%3A%221M%22%2C%22colorTheme%22%3A%22dark%22%2C%22isTransparent%22%3Atrue%2C%22autosize%22%3Atrue%7D"
              width="100%" height="200"
              style="border:none;position:absolute;inset:0"
              allowtransparency="true">
            </iframe>
          </div>
        </div>

        <!-- AI Tahlil -->
        <div class="gdp-tab-content" id="gdp-tab-ai">
          <div class="gdp-ai-box" id="gdp-ai-content">
            <div class="gdp-ai-head"><i class="ri ri-sparkling-2-fill"></i> AI Tahlil yuklanmoqda...</div>
            <div style="color:var(--text-muted);font-size:13px">Bir necha soniya kutib turing...</div>
          </div>
        </div>

        <!-- Yangiliklar -->
        <div class="gdp-tab-content" id="gdp-tab-news">
          <div id="gdp-news-content">
            <div style="color:var(--text-muted);padding:20px;text-align:center">Yangiliklar yuklanmoqda...</div>
          </div>
        </div>

        <!-- Halollik -->
        ${marketType === 'stock' ? `<div class="gdp-tab-content" id="gdp-tab-halal">
          <div id="gdp-halal-content">
            <div style="color:var(--text-muted);padding:20px;text-align:center">Halollik tahlil yuklanmoqda...</div>
          </div>
        </div>` : ''}

        <!-- To'liq tahlil tugmasi -->
        <button onclick="closeTickerPanel()" style="
          width:100%;padding:12px;background:var(--bg-card);color:var(--text-muted);
          border:1px solid var(--border);border-radius:12px;font-family:var(--mono);
          font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:20px">
          <i class="ri ri-close-line"></i> Yopish
        </button>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Tab switching
  overlay.querySelectorAll('.gdp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      overlay.querySelectorAll('.gdp-tab').forEach(t => t.classList.remove('active'));
      overlay.querySelectorAll('.gdp-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const tabId = 'gdp-tab-' + tab.dataset.gdpTab;
      const tabEl = document.getElementById(tabId);
      if (tabEl) tabEl.classList.add('active');
    });
  });

  // Overlay background → yopish
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeTickerPanel();
  });
  document.addEventListener('keydown', gdpEscHandler);

  // Ma'lumotlarni yuklash
  loadGdpData(ticker, marketType);
}

function gdpEscHandler(e) {
  if (e.key === 'Escape') closeTickerPanel();
}

function closeTickerPanel() {
  gdpOpen = false;
  document.getElementById('gdp-overlay')?.remove();
  document.removeEventListener('keydown', gdpEscHandler);
}

async function loadGdpData(ticker, marketType) {
  try {
    let price, change, changePercent, high, low, volume, marketCap, news = [], name = ticker;

    if (marketType === 'crypto') {
      // Binance'dan kripto ma'lumoti
      const res = await fetch(`${PROXY_URL}/binance/api/v3/ticker/24hr?symbol=${ticker}USDT`);
      if (res.ok) {
        const d = await res.json();
        price = parseFloat(d.lastPrice);
        change = parseFloat(d.priceChange);
        changePercent = parseFloat(d.priceChangePercent);
        high = parseFloat(d.highPrice);
        low = parseFloat(d.lowPrice);
        volume = parseFloat(d.quoteVolume);
        marketCap = null;
      }
    } else {
      // Polygon'dan aksiya ma'lumoti
      function daysAgoStr(n) {
        const d = new Date(); d.setDate(d.getDate() - n);
        return d.toISOString().split('T')[0];
      }

      // 90 kunlik candle — dam olish kunlarida ham ishlaydi
      const [candleRes, refRes, newsRes] = await Promise.all([
        fetch(`${PROXY_URL}/polygon/v2/aggs/ticker/${ticker}/range/1/day/${daysAgoStr(90)}/${daysAgoStr(1)}?adjusted=true&sort=asc&limit=90`),
        fetch(`${PROXY_URL}/polygon/v3/reference/tickers/${ticker}`),
        fetch(`${PROXY_URL}/polygon/v2/reference/news?ticker=${ticker}&limit=6&order=desc`),
      ]);

      if (candleRes.ok) {
        const cd = await candleRes.json();
        if (cd.results && cd.results.length >= 2) {
          const last = cd.results[cd.results.length - 1];
          const prev = cd.results[cd.results.length - 2];
          price = last.c;
          change = price - prev.c;
          changePercent = ((price - prev.c) / prev.c * 100);
          high = last.h; low = last.l;
          volume = last.v;
        } else if (cd.results && cd.results.length === 1) {
          const last = cd.results[0];
          price = last.c;
          change = 0; changePercent = 0;
          high = last.h; low = last.l; volume = last.v;
        }
      }
      // Polygon bo'sh kelsa — Finnhub fallback
      if (!price) {
        try {
          const fbRes = await fetch(`${PROXY_URL}/api/quote?symbol=${ticker}`);
          if (fbRes.ok) {
            const q = await fbRes.json();
            if (q.c) {
              price = q.c; change = q.d || 0;
              changePercent = q.dp || 0;
              high = q.h; low = q.l; volume = 0;
            }
          }
        } catch(e) { console.warn('Finnhub fallback failed:', e); }
      }
      if (refRes.ok) {
        const rd = await refRes.json();
        name = rd.results?.name || ticker;
        marketCap = rd.results?.market_cap;
      }
      if (newsRes.ok) {
        const nd = await newsRes.json();
        news = nd.results || [];
      }
    }

    // Header yangilash — barcha qiymatlar xavfsiz
    {
      const priceEl = document.getElementById('gdp-price');
      const changeEl = document.getElementById('gdp-change');
      const safePrice = price || 0;
      const safePct = changePercent || 0;
      const safeHigh = high || 0;
      const safeLow = low || 0;
      const safeVol = volume || 0;

      if (priceEl) {
        priceEl.textContent = safePrice
          ? '$' + (safePrice < 1 ? safePrice.toFixed(4) : safePrice.toFixed(2))
          : '—';
      }
      if (changeEl) {
        const up = safePct >= 0;
        changeEl.textContent = safePrice ? (up ? '+' : '') + safePct.toFixed(2) + '%' : '';
        changeEl.className = 'gdp-change ' + (up ? 'st-up' : 'st-down');
      }

      // Stats yangilash
      const statsEl = document.getElementById('gdp-stats');
      if (statsEl) {
        const fmt = v => (v && v > 0) ? ('$' + (v < 1 ? v.toFixed(4) : v.toFixed(2))) : '—';
        const pctStr = safePrice ? ((safePct >= 0 ? '+' : '') + safePct.toFixed(2) + '%') : '—';
        statsEl.innerHTML = [
          [fmt(safePrice), 'Narx'],
          [pctStr, 'Change%'],
          [fmt(safeHigh), 'Yuqori'],
          [fmt(safeLow), 'Pastki'],
          [safeVol > 0 ? formatBigNumber(safeVol).replace('$','') : '—', 'Hajm'],
          [marketCap ? '$' + formatBigNumber(marketCap) : '—', 'Market Cap'],
        ].map(([v, l]) => `
          <div class="gdp-stat">
            <div class="gdp-stat-val ${v&&v.includes('+') ? 'st-up' : ''}">${v}</div>
            <div class="gdp-stat-lbl">${l}</div>
          </div>`).join('');
      }
    }

    // Yangiliklar
    const newsEl = document.getElementById('gdp-news-content');
    if (newsEl) {
      if (news.length) {
        newsEl.innerHTML = news.map(n => `
          <div class="gdp-news-item">
            <a href="${n.article_url}" target="_blank" style="text-decoration:none">
              <div class="gdp-news-title">${escapeHtml(n.title || '')}</div>
              <div class="gdp-news-meta">${n.publisher?.name || ''} · ${n.published_utc ? new Date(n.published_utc).toLocaleDateString('uz') : ''}</div>
            </a>
          </div>`).join('');
      } else {
        newsEl.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">Yangiliklar topilmadi</div>';
      }
    }

    // AI tahlil
    loadGdpAI(ticker, marketType, price, changePercent);

    // Halollik (faqat aksiya uchun)
    if (marketType === 'stock') {
      loadGdpHalal(ticker);
    }

  } catch(e) {
    const priceEl = document.getElementById('gdp-price');
    if (priceEl) priceEl.textContent = 'Xato: ' + e.message;
  }
}

async function loadGdpAI(ticker, marketType, price, changePct) {
  const el = document.getElementById('gdp-ai-content');
  if (!el) return;
  try {
    const prompt = `${ticker} ${marketType === 'crypto' ? 'kripto' : 'aksiya'} bugun ${changePct >= 0 ? '+' : ''}${(changePct||0).toFixed(2)}% ${changePct >= 0 ? 'o\'sayapti' : 'tushyapti'}. Narx: $${price}. Search the web for recent news about ${ticker}.

Return ONLY JSON:
{"summary":"2-3 jumla o'zbek tilida qisqa tahlil","signal":"SOTIB_OL yoki KUZAT yoki EHTIYOT","signal_reason":"1 jumla sabab"}`;

    const res = await fetch(`${PROXY_URL}/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!res.ok) throw new Error('API ' + res.status);
    const data = await res.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    let json = text.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'');
    const fb = json.indexOf('{'), lb = json.lastIndexOf('}');
    if (fb !== -1) json = json.substring(fb, lb+1);
    const r = JSON.parse(json);

    const sigColor = r.signal === 'SOTIB_OL' ? 'var(--bull)' : r.signal === 'EHTIYOT' ? 'var(--bear)' : 'var(--warn)';
    el.innerHTML = `
      <div class="gdp-ai-head"><i class="ri ri-sparkling-2-fill"></i> AI Tahlili</div>
      <div style="margin-bottom:12px">${escapeHtml(r.summary)}</div>
      <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-elevated);border-radius:8px;border-left:3px solid ${sigColor}">
        <span style="font-family:var(--mono);font-weight:700;font-size:13px;color:${sigColor}">${r.signal}</span>
        <span style="font-size:12px;color:var(--text-dim)">${escapeHtml(r.signal_reason)}</span>
      </div>`;
  } catch(e) {
    if (el) el.innerHTML = `
      <div class="gdp-ai-head"><i class="ri ri-sparkling-2-fill"></i> AI Tahlili</div>
      <div style="color:var(--text-muted);font-size:13px">AI tahlili yuklanmadi (Claude API key kerak).</div>`;
  }
}

function loadGdpHalal(ticker) {
  const el = document.getElementById('gdp-halal-content');
  if (!el) return;
  // Statik ma'lumotdan topamiz
  const staticItem = HALAL_STATIC.find(s => s.ticker === ticker);
  if (staticItem) {
    const vCls = staticItem.verdict === 'HALOL' ? 'halal' : staticItem.verdict === 'SHUBHALI' ? 'doubtful' : 'haram';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div class="halal-score-ring" style="color:${staticItem.score>=70?'var(--bull)':staticItem.score>=40?'var(--warn)':'var(--bear)'};border-color:currentColor;width:56px;height:56px;font-size:20px">
          ${staticItem.score}
        </div>
        <div>
          <span class="halal-badge ${vCls}">${staticItem.verdict}</span>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text-muted);margin-top:6px">
            Haram: ${staticItem.haram_revenue_pct}% | Qarz: ${staticItem.interest_debt_pct}%
          </div>
        </div>
      </div>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.6">${escapeHtml(staticItem.summary||'')}</div>`;
  } else {
    el.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">Bu aksiya uchun halol malumoti yoq. Halol tabida tekshiring.</div>';
  }
}

function gdpGoFull(ticker, marketType) {
  // Foydalanuvchi Tahlil tabiga o'tishni xohlasa — endi faqat ticker inputga yoziladi
  // Sahifa o'zgarmaydi — foydalanuvchi o'zi navigatsiya qiladi
  currentMarket = marketType || 'stock';
  document.querySelectorAll('.market-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.market === currentMarket));
  if (currentMarket === 'crypto') {
    document.getElementById('search-box')?.classList.add('crypto-mode');
    document.getElementById('analyze-btn')?.classList.add('crypto-mode');
  } else {
    document.getElementById('search-box')?.classList.remove('crypto-mode');
    document.getElementById('analyze-btn')?.classList.remove('crypto-mode');
  }
  if (document.getElementById('analyze-btn')) {
    document.getElementById('analyze-btn').style.background = '';
    document.getElementById('analyze-btn').style.color = '';
  }
  renderQuickPicks?.();
  if (document.getElementById('ticker-input')) {
    document.getElementById('ticker-input').value = ticker;
  }
  // Panel yopiladi — foydalanuvchi o'sha sahifada qoladi
  closeTickerPanel();
}



// ── Ticker Logo Helper ────────────────────────────────────────────────────────
// Mashhur ticker → domain mapping (Clearbit uchun)
const TICKER_DOMAIN = {
  'AAPL':'apple.com','MSFT':'microsoft.com','GOOGL':'google.com','GOOG':'google.com',
  'AMZN':'amazon.com','META':'meta.com','TSLA':'tesla.com','NVDA':'nvidia.com',
  'AVGO':'broadcom.com','ORCL':'oracle.com','AMD':'amd.com','CRM':'salesforce.com',
  'CSCO':'cisco.com','INTC':'intel.com','QCOM':'qualcomm.com','IBM':'ibm.com',
  'ADBE':'adobe.com','INTU':'intuit.com','NOW':'servicenow.com','AMAT':'appliedmaterials.com',
  'JPM':'jpmorgan.com','BAC':'bankofamerica.com','WFC':'wellsfargo.com','GS':'goldmansachs.com',
  'MS':'morganstanley.com','V':'visa.com','MA':'mastercard.com','AXP':'americanexpress.com',
  'JNJ':'jnj.com','UNH':'unitedhealthgroup.com','PFE':'pfizer.com','ABBV':'abbvie.com',
  'MRK':'merck.com','LLY':'lilly.com','TMO':'thermofisher.com','ABT':'abbott.com',
  'XOM':'exxonmobil.com','CVX':'chevron.com','COP':'conocophillips.com',
  'WMT':'walmart.com','AMZN':'amazon.com','HD':'homedepot.com','COST':'costco.com',
  'MCD':'mcdonalds.com','NKE':'nike.com','SBUX':'starbucks.com','TGT':'target.com',
  'KO':'coca-cola.com','PEP':'pepsico.com','PG':'pg.com','PM':'pmi.com',
  'CAT':'caterpillar.com','GE':'ge.com','HON':'honeywell.com','UPS':'ups.com',
  'T':'att.com','VZ':'verizon.com','TMUS':'t-mobile.com',
  'NFLX':'netflix.com','DIS':'disney.com','CMCSA':'comcast.com',
  'BTC':'bitcoin.org','ETH':'ethereum.org','BNB':'bnbchain.org',
  'SOL':'solana.com','XRP':'ripple.com','DOGE':'dogecoin.com','ADA':'cardano.org',
};

function getTickerLogoUrl(ticker, type) {
  if (type === 'crypto') {
    // CoinGecko logo CDN — kripto
    const cryptoIds = {
      'BTC':'bitcoin','ETH':'ethereum','BNB':'binancecoin','SOL':'solana',
      'XRP':'ripple','DOGE':'dogecoin','ADA':'cardano','AVAX':'avalanche-2',
      'DOT':'polkadot','MATIC':'matic-network','LINK':'chainlink','UNI':'uniswap',
    };
    const id = cryptoIds[ticker.toUpperCase()];
    if (id) return `https://assets.coingecko.com/coins/images/1/small/bitcoin.png`
      .replace('/1/small/bitcoin', `/${id === 'bitcoin' ? '1' : id === 'ethereum' ? '279' : '825'}/small/${id}`);
    return `https://www.cryptocompare.com/media/37746338/${ticker.toLowerCase()}.png`;
  }
  // Clearbit — agar domain mapping mavjud bo'lsa
  const domain = TICKER_DOMAIN[ticker.toUpperCase()];
  if (domain) return `https://logo.clearbit.com/${domain}`;
  // TradingView SVG — universal fallback
  return `https://s3-symbol-logo.tradingview.com/${ticker.toLowerCase()}--big.svg`;
}
