// ============================================================================
// StockSage screener — S&P 500 screener + Mega Screener (Polygon 10K+)
// Loaded as a plain <script>; relies on shared global scope.
//
// Depends on:
//   utils.js — PROXY_URL, daysAgo, escapeHtml, formatPrice, formatBigNumber
//   inline   — analyze, renderQuickPicks, currentMarket
//              (lazy via loadTickerFromScreener; fires on user click)
//              showTickerPanel
//              (lazy via loadMegaTicker; will move to gdp-panel.js)
//
// Top-level event listeners in Block A wire to screen-btn / filter
// selects / f-ticker / reset-btn at parse time. DOM nodes already
// exist when this script loads (script tags sit after <body>).
// ============================================================================

// ── Block A: Eski S&P 500 Screener ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// STOCK SCREENER
// ═══════════════════════════════════════════════════════════════════════════
// Predefined S&P 500 tickers for screening (top 60)
const SP500_TICKERS = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AVGO','JPM','LLY',
  'V','UNH','XOM','MA','JNJ','PG','HD','MRK','ABBV','CVX',
  'COST','ORCL','AMD','CRM','BAC','KO','WMT','PEP','TMO','ACN',
  'MCD','CSCO','ABT','LIN','TXN','DHR','VZ','NKE','NEE','INTC',
  'PM','DIS','UPS','BMY','RTX','QCOM','HON','IBM','AMGN','CAT',
  'GE','SBUX','T','LOW','DE','GS','AXP','BLK','MDT','SPGI'
];

let screenerData = [];
let sortCol = 'dp';
let sortAsc = false;

document.getElementById('screen-btn')?.addEventListener('click', runScreener);

// Real-time filter — select o'zgarganda qayta filter qilinsin
['f-sector','f-mcap','f-pe','f-52w','f-rating'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => {
    if (screenerData.length > 0) {
      const filtered = applyFilters(screenerData);
      document.getElementById('results-count').textContent = filtered.length + ' aksiya topildi';
      renderScreenerTable(filtered);
    }
  });
});

// Ticker input real-time
const fTicker = document.getElementById('f-ticker');
if (fTicker) fTicker.addEventListener('input', () => {
  if (screenerData.length > 0) {
    const filtered = applyFilters(screenerData);
    document.getElementById('results-count').textContent = filtered.length + ' aksiya topildi';
    renderScreenerTable(filtered);
  }
});
document.getElementById('reset-btn')?.addEventListener('click', () => {
  ['f-sector','f-mcap','f-pe','f-52w','f-rating'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-ticker').value = '';
  document.getElementById('results-count').textContent = '';
  document.getElementById('screener-results').innerHTML =
    '<div class="info-text" style="padding:40px">Filtrlarni tanlang va "Qidirish" bosing.</div>';
});

async function runScreener() {
  const btn = document.getElementById('screen-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ri-loader-4-line"></i> Yuklanmoqda...';
  document.getElementById('screener-results').innerHTML =
    '<div class="info-text" style="padding:40px">Yuklanmoqda...</div>';

  const tickerFilter = document.getElementById('f-ticker').value.trim().toUpperCase();
  const tickers = tickerFilter
    ? tickerFilter.split(/[,\s]+/).filter(Boolean)
    : SP500_TICKERS;

  try {
    // Fetch quotes in batches of 10
    const results = [];
    const batch = 10;
    for (let i = 0; i < Math.min(tickers.length, 60); i += batch) {
      const chunk = tickers.slice(i, i + batch);
      const quotes = await Promise.all(chunk.map(async t => {
        try {
          const [qRes, pRes, rRes] = await Promise.all([
            fetch(`${PROXY_URL}/polygon/v2/aggs/ticker/${t}/range/1/day/${(()=>{const d=new Date();d.setDate(d.getDate()-5);return d.toISOString().split('T')[0];})()}/${(()=>{const d=new Date();d.setDate(d.getDate()-1);return d.toISOString().split('T')[0];})()}?adjusted=true&sort=asc&limit=5`),
            fetch(`${PROXY_URL}/api/stock/profile2?symbol=${t}`),
            fetch(`${PROXY_URL}/api/recommendation?symbol=${t}`)
          ]);
          const q = qRes.ok ? await qRes.json() : {};
          const p = pRes.ok ? await pRes.json() : {};
          const r = rRes.ok ? await rRes.json() : [];
          const rec = r[0] || {};
          return {
            ticker: t,
            name: p.name || t,
            sector: p.finnhubIndustry || '',
            mcap: p.marketCapitalization || 0,
            price: q.c || 0,
            change: q.dp || 0,
            high52: q.h || 0,
            low52: q.l || 0,
            pe: p.peRatio || null,
            strongBuy: rec.strongBuy || 0,
            buy: rec.buy || 0,
            hold: rec.hold || 0,
            sell: rec.sell || 0,
            strongSell: rec.strongSell || 0,
          };
        } catch(e) { return null; }
      }));
      results.push(...quotes.filter(Boolean));
    }

    screenerData = applyFilters(results);
    document.getElementById('results-count').textContent = screenerData.length + ' aksiya topildi';
    renderScreenerTable(screenerData);
  } catch(e) {
    document.getElementById('screener-results').innerHTML =
      '<div class="info-text" style="padding:40px;color:var(--bear)">Xatolik: ' + e.message + '</div>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-search-2-line"></i> Qidirish';
  }
}

function applyFilters(data) {
  const sector  = document.getElementById('f-sector').value;
  const mcap    = document.getElementById('f-mcap').value;
  const pe      = document.getElementById('f-pe').value;
  const w52     = document.getElementById('f-52w').value;
  const rating  = document.getElementById('f-rating').value;
  const tickerQ = (document.getElementById('f-ticker').value || '').trim().toUpperCase();

  return data.filter(s => {
    if (sector && !s.sector.includes(sector)) return false;
    if (mcap) {
      const m = s.mcap * 1e6;
      if (mcap === 'mega' && m < 200e9) return false;
      if (mcap === 'large' && (m < 10e9 || m >= 200e9)) return false;
      if (mcap === 'mid' && (m < 2e9 || m >= 10e9)) return false;
      if (mcap === 'small' && (m < 300e6 || m >= 2e9)) return false;
    }
    if (pe && s.pe !== null) {
      if (pe === 'low' && (s.pe < 0 || s.pe > 15)) return false;
      if (pe === 'mid' && (s.pe <= 15 || s.pe > 30)) return false;
      if (pe === 'high' && s.pe <= 30) return false;
      if (pe === 'neg' && s.pe >= 0) return false;
    }
    if (rating) {
      const total = s.strongBuy + s.buy + s.hold + s.sell + s.strongSell;
      if (total === 0) return false;
      const topRating = ['strongBuy','buy','hold','sell','strongSell']
        .reduce((a,b) => s[a] > s[b] ? a : b);
      if (topRating !== rating) return false;
    }
    if (tickerQ && !s.ticker.includes(tickerQ) && !s.name.toUpperCase().includes(tickerQ)) return false;
    return true;
  });
}

function renderScreenerTable(data) {
  if (data.length === 0) {
    document.getElementById('screener-results').innerHTML =
      '<div class="info-text" style="padding:40px">Aksiya topilmadi.</div>';
    return;
  }

  const sorted = [...data].sort((a, b) => {
    const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0;
    return sortAsc ? av - bv : bv - av;
  });

  const getRating = s => {
    const map = {strongBuy:'buy',buy:'buy',hold:'hold',sell:'sell',strongSell:'sell'};
    const top = ['strongBuy','buy','hold','sell','strongSell']
      .reduce((a,b) => s[a] > s[b] ? a : b);
    const labels = {strongBuy:'Strong Buy',buy:'Buy',hold:'Hold',sell:'Sell',strongSell:'Strong Sell'};
    return `<span class="rating-badge ${map[top]}">${labels[top]}</span>`;
  };

  const sortIcon = col =>
    col === sortCol ? (sortAsc ? '<i class="ri-arrow-up-s-fill"></i>' : '<i class="ri-arrow-down-s-fill"></i>') : '';

  document.getElementById('screener-results').innerHTML = `
    <table class="screener-table">
      <thead>
        <tr>
          <th onclick="setSortCol('ticker')">Ticker ${sortIcon('ticker')}</th>
          <th>Kompaniya</th>
          <th onclick="setSortCol('price')">Narx ${sortIcon('price')}</th>
          <th onclick="setSortCol('change')">O'zgarish ${sortIcon('change')}</th>
          <th onclick="setSortCol('mcap')">Market Cap ${sortIcon('mcap')}</th>
          <th onclick="setSortCol('pe')">P/E ${sortIcon('pe')}</th>
          <th>Tavsiya</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(s => `
          <tr onclick="loadTickerFromScreener('${s.ticker}')">
            <td class="st-ticker">${s.ticker}</td>
            <td class="st-name">${escapeHtml(s.name)}</td>
            <td class="st-num">$${formatPrice(s.price)}</td>
            <td class="${s.change >= 0 ? 'st-up' : 'st-down'}">${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%</td>
            <td class="st-num">${s.mcap ? formatBigNumber(s.mcap * 1e6) : 'N/A'}</td>
            <td class="st-num">${s.pe ? s.pe.toFixed(1) : 'N/A'}</td>
            <td>${getRating(s)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function setSortCol(col) {
  if (sortCol === col) sortAsc = !sortAsc;
  else { sortCol = col; sortAsc = false; }
  if (screenerData.length) renderScreenerTable(screenerData);
}

function loadTickerFromScreener(ticker) {
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === 'home');
  });
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === 'page-home');
  });
  currentMarket = 'stock';
  document.querySelectorAll('.market-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.market === 'stock');
  });
  document.getElementById('search-box').classList.remove('crypto-mode');
  document.getElementById('analyze-btn').classList.remove('crypto-mode');
  document.getElementById('ticker-input').value = ticker;
  renderQuickPicks();
  analyze();
}


// ── Block B: Mega Screener (Polygon Grouped Daily Bars) ─────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// MEGA SCREENER (10K+ aksiya orqali Polygon.io)
// ═══════════════════════════════════════════════════════════════════════════
let megaLoaded = false;
let megaData = [];
let megaFiltered = [];
let megaPage = 0;
const MEGA_PER_PAGE = 50;
let megaSortKey = 'change';
let megaSortDir = 'desc';

function initMegaPage() {
  if (megaLoaded) return;
  const refreshBtn = document.getElementById('mega-refresh-btn');
  if (!refreshBtn) {
    console.warn('Mega page elements not ready, retry in 100ms');
    setTimeout(initMegaPage, 100);
    return;
  }
  megaLoaded = true;
  refreshBtn.addEventListener('click', loadMegaData);

  // Filter listeners — debounced
  let filterTimer;
  const filterIds = ['mega-search', 'mega-min-price', 'mega-max-price', 'mega-min-change', 'mega-max-change', 'mega-min-volume', 'mega-type', 'mega-quick'];
  filterIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) { console.warn('Mega filter element not found:', id); return; }
    el.addEventListener('input', () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(applyMegaFilters, 200);
    });
    el.addEventListener('change', applyMegaFilters);
  });

  // Sort headers
  document.querySelectorAll('.mega-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (megaSortKey === key) {
        megaSortDir = megaSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        megaSortKey = key;
        megaSortDir = 'desc';
      }
      document.querySelectorAll('.mega-table th').forEach(t => t.classList.remove('active'));
      th.classList.add('active');
      th.querySelector('.sort-arrow').textContent = megaSortDir === 'desc' ? '▼' : '▲';
      applyMegaFilters();
    });
  });

  loadMegaData();
}

async function loadMegaData() {
  const btn = document.getElementById('mega-refresh-btn');
  const tbody = document.getElementById('mega-tbody');
  btn.disabled = true;
  btn.innerHTML = '<i class="ri-loader-4-line"></i> Yuklanmoqda...';
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:60px;color:var(--text-muted)">10,000+ aksiya yuklanmoqda... (5-10 soniya)</td></tr>';

  try {
    // Grouped Daily Bars — Starter planda ishlaydi, barcha aksiyalar bir requestda
    // 2 kunlik ma'lumot kerak: bugungi narx + kechagi prevClose (change% uchun)
    const today = new Date();
    // Hafta oxiri yoki bayram bo'lsa, oxirgi ish kunini topamiz
    let date1, date2;
    function daysAgo(n) {
      const d = new Date(today);
      d.setDate(d.getDate() - n);
      return d.toISOString().split('T')[0];
    }
    // Bugundan 1-3 kun oldin (dam olish kunlari uchun)
    // Polygon Starter — 15 daqiqa delay, shuning uchun bugun 4PM EST gacha kechagi data oladi
    date1 = daysAgo(2); // prev close
    date2 = daysAgo(1); // current close

    const [r1, r2] = await Promise.all([
      fetch(`${PROXY_URL}/polygon/v2/aggs/grouped/locale/us/market/stocks/${date1}?adjusted=true`),
      fetch(`${PROXY_URL}/polygon/v2/aggs/grouped/locale/us/market/stocks/${date2}?adjusted=true`),
    ]);

    if (!r1.ok || !r2.ok) throw new Error('Polygon ' + (r1.status || r2.status) + ' (Starter plan tekshirilsin)');
    const d1 = await r1.json();
    const d2 = await r2.json();

    // Agar dam olish kuni bo'lsa, qiyinroq sanaga o'tamiz
    if (!d1.results || !d1.results.length) {
      // Backup — 5 va 6 kun oldin
      const [b1, b2] = await Promise.all([
        fetch(`${PROXY_URL}/polygon/v2/aggs/grouped/locale/us/market/stocks/${daysAgo(5)}?adjusted=true`),
        fetch(`${PROXY_URL}/polygon/v2/aggs/grouped/locale/us/market/stocks/${daysAgo(4)}?adjusted=true`),
      ]);
      const bd1 = await b1.json();
      const bd2 = await b2.json();
      if (!bd1.results) throw new Error('Bozor yopiq edi. Polygon ma\'lumot beraolmadi.');
      d1.results = bd1.results;
      d2.results = bd2.results;
    }
    if (!d2.results || !d2.results.length) d2.results = d1.results;

    // Map: prevClose qidirish uchun
    const prevMap = {};
    (d1.results || []).forEach(r => { prevMap[r.T] = r.c; });

    megaData = (d2.results || []).map(r => {
      const prevClose = prevMap[r.T] || r.o;  // agar prev yo'q bo'lsa, open
      const price = r.c;
      const change = prevClose ? ((price - prevClose) / prevClose * 100) : 0;
      const volume = r.v || 0;
      return {
        ticker: r.T,
        name: r.T,
        price,
        prevClose,
        change,
        volume,
        dollarVolume: (r.vw || price) * volume,
        high: r.h || 0,
        low: r.l || 0,
        open: r.o || 0,
      };
    }).filter(t => t.price > 0);

    // Stats
    updateMegaStats();
    applyMegaFilters();

  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:60px;color:var(--bear)">Xato: ' + e.message + '</td></tr>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-refresh-line"></i> Yangilash';
  }
}

function updateMegaStats() {
  document.getElementById('mega-total').textContent = formatBigNumber(megaData.length).replace('$','');
  const gainers = megaData.filter(t => t.change > 0).length;
  const losers  = megaData.filter(t => t.change < 0).length;
  const totalVol = megaData.reduce((s, t) => s + t.dollarVolume, 0);
  document.getElementById('mega-gainers').textContent = formatBigNumber(gainers).replace('$','');
  document.getElementById('mega-losers').textContent  = formatBigNumber(losers).replace('$','');
  document.getElementById('mega-volume').textContent  = '$' + formatBigNumber(totalVol);
}

function applyMegaFilters() {
  const getVal = id => document.getElementById(id)?.value || '';
  const search   = getVal('mega-search').trim().toUpperCase();
  const minPrice = parseFloat(getVal('mega-min-price')) || 0;
  const maxPrice = parseFloat(getVal('mega-max-price')) || Infinity;
  const minCh    = parseFloat(getVal('mega-min-change'));
  const maxCh    = parseFloat(getVal('mega-max-change'));
  const minVol   = parseFloat(getVal('mega-min-volume')) || 0;
  const quick    = getVal('mega-quick');

  let items = [...megaData];

  if (search)  items = items.filter(t => t.ticker.includes(search));
  if (minPrice) items = items.filter(t => t.price >= minPrice);
  if (maxPrice !== Infinity) items = items.filter(t => t.price <= maxPrice);
  if (!isNaN(minCh)) items = items.filter(t => t.change >= minCh);
  if (!isNaN(maxCh)) items = items.filter(t => t.change <= maxCh);
  if (minVol)  items = items.filter(t => t.volume >= minVol);

  // Quick filters
  if (quick === 'top-gainers')  items = items.filter(t => t.change > 0);
  if (quick === 'top-losers')   items = items.filter(t => t.change < 0);
  if (quick === 'most-active') {
    // Already filtered, just sort by volume
    megaSortKey = 'volume';
    megaSortDir = 'desc';
  }

  // Sort
  items.sort((a, b) => {
    let av = a[megaSortKey], bv = b[megaSortKey];
    if (megaSortKey === 'ticker') {
      return megaSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return megaSortDir === 'desc' ? bv - av : av - bv;
  });

  megaFiltered = items;
  megaPage = 0;
  renderMegaTable();
}

function renderMegaTable() {
  const tbody = document.getElementById('mega-tbody');
  const cntEl = document.getElementById('mega-count');
  const pgEl  = document.getElementById('mega-pagination');

  if (cntEl) cntEl.textContent = megaFiltered.length + ' ta topildi';

  if (!megaFiltered.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:60px;color:var(--text-muted)">Hech narsa topilmadi</td></tr>';
    pgEl.innerHTML = '';
    return;
  }

  const start = megaPage * MEGA_PER_PAGE;
  const items = megaFiltered.slice(start, start + MEGA_PER_PAGE);
  const pages = Math.ceil(megaFiltered.length / MEGA_PER_PAGE);

  tbody.innerHTML = items.map(t => {
    const chCls = t.change > 0 ? 'pos' : t.change < 0 ? 'neg' : '';
    const chSign = t.change > 0 ? '+' : '';
    return `<tr onclick="loadMegaTicker('${t.ticker}')">
      <td><span class="mega-ticker">${t.ticker}</span></td>
      <td>$${t.price < 1 ? t.price.toFixed(4) : t.price.toFixed(2)}</td>
      <td class="${chCls}">${chSign}${t.change.toFixed(2)}%</td>
      <td>${formatBigNumber(t.volume).replace('$','')}</td>
      <td>$${formatBigNumber(t.dollarVolume)}</td>
    </tr>`;
  }).join('');

  // Pagination — max 7 ta tugma + first/last
  if (pages > 1) {
    let html = '';
    const maxBtns = 7;
    let startPage = Math.max(0, megaPage - 3);
    let endPage = Math.min(pages, startPage + maxBtns);
    if (endPage - startPage < maxBtns) startPage = Math.max(0, endPage - maxBtns);

    if (startPage > 0) html += `<button class="mega-page-btn" onclick="megaGoPage(0)">1</button>`;
    if (startPage > 1) html += '<span style="color:var(--text-muted);align-self:center">...</span>';

    for (let i = startPage; i < endPage; i++) {
      html += `<button class="mega-page-btn ${i===megaPage?'active':''}" onclick="megaGoPage(${i})">${i+1}</button>`;
    }

    if (endPage < pages - 1) html += '<span style="color:var(--text-muted);align-self:center">...</span>';
    if (endPage < pages) html += `<button class="mega-page-btn" onclick="megaGoPage(${pages-1})">${pages}</button>`;

    pgEl.innerHTML = html;
  } else {
    pgEl.innerHTML = '';
  }
}

function megaGoPage(page) {
  megaPage = page;
  renderMegaTable();
  document.querySelector('.mega-table-wrap')?.scrollIntoView({behavior:'smooth', block:'start'});
}

function loadMegaTicker(ticker) {
  showTickerPanel(ticker, 'stock');
}

// ── Block C: Sector filter helper (chaqirilad heatmap onclick'idan) ─────────
function filterScreenerBySector(sector) {
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === 'screener');
  });
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === 'page-screener');
  });
  document.getElementById('f-sector').value = sector;
  runScreener();
}

