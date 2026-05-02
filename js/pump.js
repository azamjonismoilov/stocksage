// ============================================================================
// StockSage pump — Pump Signal page (crypto + stocks)
// Loaded as a plain <script>; relies on shared global scope.
//
// Depends on:
//   utils.js — PROXY_URL, escapeHtml, formatBigNumber
//   inline   — showTickerPanel (lazy-resolved via loadPumpToAnalyze;
//              fires on user click after inline script is loaded)
// ============================================================================

// ═══════════════════════════════════════════════════════════════════════════
// PUMP SIGNAL PAGE
// ═══════════════════════════════════════════════════════════════════════════
let pumpLoaded = false;
let pumpData = [];

let pumpType = 'crypto'; // 'crypto' yoki 'stock'

function initPumpPage() {
  if (pumpLoaded) return;
  pumpLoaded = true;

  document.getElementById('pump-refresh-btn')?.addEventListener('click', () => {
    pumpType === 'crypto' ? loadPumpCrypto() : loadPumpStocks();
  });
  document.getElementById('pump-filter')?.addEventListener('change', renderPumpResults);

  document.querySelectorAll('[data-pump-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      pumpType = btn.dataset.pumpType;
      document.querySelectorAll('[data-pump-type]').forEach(b =>
        b.classList.toggle('active', b.dataset.pumpType === pumpType));
      document.getElementById('pump-title').textContent =
        pumpType === 'crypto'
          ? 'Bugungi Eng Faol Kriptolar — AI Tahlili'
          : 'Bugungi Eng Faol Aksiyalar — AI Tahlili';
      pumpData = [];
      document.getElementById('pump-results').innerHTML =
        '<div class="pump-loading">Yangilash tugmasini bosing</div>';
      pumpType === 'crypto' ? loadPumpCrypto() : loadPumpStocks();
    });
  });

  loadPumpCrypto();
}

async function loadPumpCrypto() {
  const btn = document.getElementById('pump-refresh-btn');
  const el  = document.getElementById('pump-results');
  btn.disabled = true;
  btn.innerHTML = '<i class="ri-loader-4-line"></i> Yuklanmoqda...';
  el.innerHTML = '<div class="pump-loading">Binance dan top movers olinmoqda...</div>';

  try {
    const res = await fetch(`${PROXY_URL}/binance/api/v3/ticker/24hr`);
    if (!res.ok) throw new Error('Binance ' + res.status);
    const all = await res.json();

    const movers = all
      .filter(t => t.symbol.endsWith('USDT') && !t.symbol.includes('UPUSDT') && !t.symbol.includes('DOWNUSDT'))
      .filter(t => parseFloat(t.priceChangePercent) > 5)
      .filter(t => parseFloat(t.quoteVolume) > 500000)
      .map(t => ({
        symbol: t.symbol.replace('USDT', ''),
        price: parseFloat(t.lastPrice),
        change24h: parseFloat(t.priceChangePercent),
        volume: parseFloat(t.quoteVolume),
        trades: parseInt(t.count),
        high: parseFloat(t.highPrice),
        low: parseFloat(t.lowPrice),
        volumeScore: parseFloat(t.quoteVolume) / 1000000,
      }))
      .sort((a, b) => b.change24h - a.change24h)
      .slice(0, 15);

    if (!movers.length) {
      el.innerHTML = '<div class="pump-loading">Hozir kuchli harakat topilmadi.</div>';
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-refresh-line"></i> Yangilash';
      return;
    }

    el.innerHTML = '<div class="pump-loading">AI tahlil qilinmoqda... (~30 soniya)</div>';

    pumpData = movers.map(m => {
      let risk = 'medium';
      if (m.change24h > 50 || m.volume < 2000000) risk = 'high';
      else if (m.change24h < 15 && m.volume > 50000000) risk = 'low';
      return { ...m, risk };
    });

    // AI tushuntirish — top 8 uchun
    const aiPromises = pumpData.slice(0, 8).map(p =>
      getPumpExplanation(p).catch(() => ({
        explanation: p.symbol + " hajmi katta. AI tahlili yuklanmadi.",
        history: ""
      }))
    );

    const explanations = await Promise.all(aiPromises);
    pumpData.slice(0, 8).forEach((p, i) => {
      p.explanation = explanations[i]?.explanation || '';
      p.history = explanations[i]?.history || '';
    });

    // Qolganlar — template tushuntirish
    pumpData.slice(8).forEach(p => {
      p.explanation = p.symbol + " bugun +" + p.change24h.toFixed(1) + "% o'sayapti. Hajm: $" + formatBigNumber(p.volume) + ". Texnik tahlil qiling, FOMO emas.";
      p.history = '';
    });

    renderPumpResults();
  } catch(e) {
    el.innerHTML = '<div class="pump-loading">Xato: ' + e.message + '</div>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-refresh-line"></i> Yangilash';
  }
}

async function getPumpExplanation(p) {
  const prompt = `${p.symbol} kripto bugun +${p.change24h.toFixed(1)}% oshdi. 24 soat hajm: $${formatBigNumber(p.volume)}. Search the web for why this token is pumping today.

Return ONLY this JSON (no markdown):
{"explanation":"2-3 jumla o'zbek tilida nega o'sayapti","history":"1 jumla o'zbek tilida tarixiy o'xshashlik"}`;

  const res = await fetch(`${PROXY_URL}/claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) throw new Error('AI ' + res.status);
  const data = await res.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let json = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  const fb = json.indexOf('{'), lb = json.lastIndexOf('}');
  if (fb !== -1) json = json.substring(fb, lb + 1);
  return JSON.parse(json);
}

// Top 50 S&P 500 + popular stocks for pump scanning
const PUMP_STOCK_TICKERS = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AVGO','AMD','CRM',
  'NFLX','ORCL','INTC','QCOM','MU','MRVL','PLTR','SMCI','ARM','SNOW',
  'COIN','HOOD','RBLX','SHOP','UBER','LYFT','ABNB','DASH','SOFI','PYPL',
  'JPM','BAC','GS','XOM','CVX','BA','GE','CAT','DIS','NKE',
  'MCD','SBUX','WMT','TGT','HD','LOW','UNH','JNJ','PFE','LLY',
  'GILD','MRNA','BNTX','ROKU','SPOT','TWLO','DDOG','NET','ZS','OKTA'
];

async function loadPumpStocks() {
  const btn = document.getElementById('pump-refresh-btn');
  const el  = document.getElementById('pump-results');
  btn.disabled = true;
  btn.innerHTML = '<i class="ri-loader-4-line"></i> Yuklanmoqda...';
  el.innerHTML = '<div class="pump-loading">10,000+ aksiya skanerlanmoqda...</div>';

  try {
    // Grouped Daily Bars — Starter planda ishlaydi
    const psDaysAgo = n => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; };
    const date1 = psDaysAgo(3);
    const date2 = psDaysAgo(2);

    const [r1, r2] = await Promise.all([
      fetch(`${PROXY_URL}/polygon/v2/aggs/grouped/locale/us/market/stocks/${date1}?adjusted=true`),
      fetch(`${PROXY_URL}/polygon/v2/aggs/grouped/locale/us/market/stocks/${date2}?adjusted=true`),
    ]);

    if (!r1.ok || !r2.ok) throw new Error('Polygon ' + (r1.ok ? r2.status : r1.status));
    let d1 = await r1.json();
    let d2 = await r2.json();

    // Backup — agar dam olish kuni
    if (!d1.results || !d1.results.length) {
      const [b1, b2] = await Promise.all([
        fetch(`${PROXY_URL}/polygon/v2/aggs/grouped/locale/us/market/stocks/${psDaysAgo(6)}?adjusted=true`),
        fetch(`${PROXY_URL}/polygon/v2/aggs/grouped/locale/us/market/stocks/${psDaysAgo(5)}?adjusted=true`),
      ]);
      const bd1 = await b1.json();
      const bd2 = await b2.json();
      d1 = bd1; d2 = bd2;
      if (!d1.results) throw new Error('Bozor yopiq yoki Polygon xato');
    }
    if (!d2.results || !d2.results.length) d2.results = d1.results;

    const prevMap = {};
    (d1.results || []).forEach(r => { prevMap[r.T] = r.c; });

    const results = (d2.results || []).map(r => {
      const prevClose = prevMap[r.T] || r.o;
      const price = r.c;
      const change = prevClose ? ((price - prevClose) / prevClose * 100) : 0;
      return {
        symbol: r.T,
        price,
        change24h: change,
        high: r.h || 0,
        low: r.l || 0,
        prevClose,
        volume: r.v || 0,
      };
    }).filter(r => r.price > 1 && r.volume > 500000);

    // Faqat 3%+ o'sganlar, top 15 (highest gainers)
    const movers = results
      .filter(r => r.change24h >= 3)
      .sort((a, b) => b.change24h - a.change24h)
      .slice(0, 15);

    if (!movers.length) {
      el.innerHTML = '<div class="pump-loading">Bugun kuchli o\'sayotgan aksiya topilmadi (>3%).</div>';
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-refresh-line"></i> Yangilash';
      return;
    }

    el.innerHTML = '<div class="pump-loading">' + movers.length + ' ta aksiya topildi. AI tahlil qilinmoqda...</div>';

    // Risk: kichik o'zgarish + mega cap = past, katta o'zgarish = yuqori
    pumpData = movers.map(m => {
      let risk = 'medium';
      if (m.change24h > 15) risk = 'high';
      else if (m.change24h < 5) risk = 'low';
      // Volatillik
      const volatility = m.high && m.low ? ((m.high - m.low) / m.low * 100) : 0;
      return { ...m, risk, volume: 0, trades: 0, volatility };
    });

    // AI tushuntirish — top 8 uchun
    const aiPromises = pumpData.slice(0, 8).map(p =>
      getStockPumpExplanation(p).catch(() => ({
        explanation: p.symbol + " bugun +" + p.change24h.toFixed(2) + "% o'sayapti. AI tahlili yuklanmadi.",
        history: ""
      }))
    );

    const explanations = await Promise.all(aiPromises);
    pumpData.slice(0, 8).forEach((p, i) => {
      p.explanation = explanations[i]?.explanation || '';
      p.history = explanations[i]?.history || '';
    });

    pumpData.slice(8).forEach(p => {
      p.explanation = p.symbol + " bugun +" + p.change24h.toFixed(2) + "% o'sayapti. Earnings, analyst upgrade yoki bozor sentimentini tekshiring.";
      p.history = '';
    });

    renderPumpResults();
  } catch(e) {
    el.innerHTML = '<div class="pump-loading">Xato: ' + e.message + '</div>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-refresh-line"></i> Yangilash';
  }
}

async function getStockPumpExplanation(p) {
  const prompt = `${p.symbol} aksiya bugun +${p.change24h.toFixed(2)}% oshdi. Search the web for why this stock is up today. Look for: earnings beat, analyst upgrade, M&A news, FDA approval, AI announcement, partnership, or sector rotation.

Return ONLY this JSON (no markdown):
{"explanation":"2-3 jumla o'zbek tilida nega o'sayapti","history":"1 jumla o'zbek tilida — bu kompaniyaning so'nggi pump'lardan keyin qanday harakat qilganligi"}`;

  const res = await fetch(`${PROXY_URL}/claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) throw new Error('AI ' + res.status);
  const data = await res.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let json = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  const fb = json.indexOf('{'), lb = json.lastIndexOf('}');
  if (fb !== -1) json = json.substring(fb, lb + 1);
  return JSON.parse(json);
}

function renderPumpResults() {
  const filter = document.getElementById('pump-filter')?.value || 'all';
  const el = document.getElementById('pump-results');
  const cntEl = document.getElementById('pump-count');

  let items = [...pumpData];
  if (filter === 'top10')  items = items.slice(0, 10);
  if (filter === 'high')   items = items.filter(p => p.risk === 'high');
  if (filter === 'medium') items = items.filter(p => p.risk === 'medium');
  if (filter === 'low')    items = items.filter(p => p.risk === 'low');

  const label = pumpType === 'stock' ? 'aksiya' : 'kripto';
  if (cntEl) cntEl.textContent = items.length + ' ta ' + label;

  if (!items.length) {
    el.innerHTML = '<div class="pump-loading">Filtrga mos ' + label + ' topilmadi.</div>';
    return;
  }

  const isStock = pumpType === 'stock';

  const rows = items.map(p => {
    const riskCls  = p.risk === 'high' ? 'high-risk' : p.risk === 'medium' ? 'med-risk' : 'low-risk';
    const riskTag  = p.risk === 'high' ? 'high' : p.risk === 'medium' ? 'medium' : 'low';
    const riskIcon = p.risk === 'high' ? 'ri-alarm-warning-fill' : p.risk === 'medium' ? 'ri-error-warning-fill' : 'ri-shield-check-fill';
    const riskLbl  = p.risk === "high" ? "⚠ Yuqori" : p.risk === "medium" ? "▲ Orta" : "✓ Kam";
    const priceFmt = p.price < 0.01 ? p.price.toFixed(6) : p.price < 1 ? p.price.toFixed(4) : p.price.toFixed(2);

    const stat1 = isStock
      ? `Vol: ${((p.high-p.low)/p.low*100).toFixed(1)}%`
      : `Hajm: $${formatBigNumber(p.volume)}`;
    const stat2 = isStock
      ? `H: $${p.high?p.high.toFixed(2):'—'}`
      : `Trades: ${p.trades>1000?(p.trades/1000).toFixed(0)+'K':p.trades}`;

    const mType = pumpType === 'crypto' ? 'crypto' : 'stock';
    return `<div class="pump-list-item ${riskCls}" onclick="loadPumpToAnalyze('${p.symbol}')">
      <div>
        <div class="pump-list-sym">${p.symbol}</div>
        <div class="pump-list-price">$${priceFmt}</div>
      </div>
      <div class="pump-list-explain">
        ${p.explanation ? escapeHtml(p.explanation) : '<span style="color:var(--text-muted)">AI tahlili yuklanmoqda...</span>'}
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">
        <span class="pump-risk-tag ${riskTag}" style="font-size:9px;padding:2px 7px">
          <i class="ri ${riskIcon}"></i> ${riskLbl}
        </span>
        <div class="pump-list-stat">${stat1}</div>
        <div class="pump-list-stat">${stat2}</div>
      </div>
      <div class="pump-list-right">
        <div class="pump-list-change st-up">+${p.change24h.toFixed(2)}%</div>
        <i class="ri ri-arrow-right-s-line" style="color:var(--text-muted);font-size:16px"></i>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="pump-list-wrap">
      <div class="pump-list-header">
        <span>Ticker</span>
        <span>AI Tushuntirish</span>
        <span>Xavf / Statistika</span>
        <span style="text-align:right">Change%</span>
      </div>
      ${rows}
    </div>`;
}

function loadPumpToAnalyze(symbol) {
  showTickerPanel(symbol, pumpType === 'crypto' ? 'crypto' : 'stock');
}
