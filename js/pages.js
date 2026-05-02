// ============================================================================
// StockSage pages — per-page init/render logic for 10 sections
// Loaded as a plain <script>; relies on shared global scope.
//
// Depends on:
//   utils.js     — PROXY_URL, escapeHtml, safeParseJSON,
//                  formatPrice, formatBigNumber, timeAgo, daysAgo
//   screener.js  — filterScreenerBySector (lazy via heatmap onclick)
//   inline/main  — analyze, currentMarket, renderQuickPicks
//                  (lazy via loadCryptoFromMarket)
//
// Top-level addEventListener wiring lives in Section J (Insider).
// DOM nodes already exist when this script loads; Section J is
// intentionally placed LAST so listeners attach after all function
// declarations are in scope (hoisting handles the rest).
//
// Note: renderMBTechnical (Section F) references undeclared
// `confluence` and `mtfTrend` — orphan branches today, slated for
// step 13 wiring (see memory).
// ============================================================================

// ── A: MarketBeat-Style Panels (Analyst, Short, Institutional, Dividend, Earnings)
// ═══════════════════════════════════════════════════════════════════════════
// MARKETBEAT-STYLE PANELS (Analyst, Short, Institutional, Dividend, Earnings)
// ═══════════════════════════════════════════════════════════════════════════
async function loadMarketBeatPanels(ticker, isCrypto) {
  if (isCrypto) return; // Only for stocks

  // Show panels
  const panels = document.getElementById('mb-panels');
  const earningsCard = document.getElementById('mb-earnings-card');
  if (panels) panels.style.display = 'grid';
  if (earningsCard) earningsCard.style.display = 'block';

  // Parallel fetch all
  const [recRes, shortRes, instRes, divRes, earnRes] = await Promise.all([
    fetch(`${PROXY_URL}/api/recommendation?symbol=${ticker}`).catch(() => null),
    fetch(`${PROXY_URL}/api/stock/short-interest?symbol=${ticker}&from=${daysAgo(90)}&to=${daysAgo(0)}`).catch(() => null),
    fetch(`${PROXY_URL}/api/institutional/ownership?symbol=${ticker}&cusip=&limit=10`).catch(() => null),
    fetch(`${PROXY_URL}/api/stock/dividend2?symbol=${ticker}`).catch(() => null),
    fetch(`${PROXY_URL}/api/calendar/earnings?from=${daysAgo(365)}&to=${daysAgo(0)}&symbol=${ticker}`).catch(() => null)
  ]);

  renderMBTechnical(fastData).catch(()=>{});
  renderMBHalal(ticker);
  renderAnalyst(recRes);
  renderShortInterest(shortRes, ticker);
  renderInstitutional(instRes);
  renderDividend(divRes);
  renderEarningsHistory(earnRes);
}

// ── Analyst Ratings ────────────────────────────────────────────────────────
async function renderAnalyst(res) {
  const el = document.getElementById('mb-analyst');
  if (!el) return;
  try {
    if (!res || !res.ok) throw new Error('fetch failed');
    const data = await res.json();
    const rec = data[0];
    if (!rec) { el.innerHTML = '<div class="info-text">Ma&#39;lumot yo&#39;q.</div>'; return; }

    const total = rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell;
    const buyPct  = total ? ((rec.strongBuy + rec.buy) / total * 100) : 0;
    const holdPct = total ? (rec.hold / total * 100) : 0;
    const sellPct = total ? ((rec.sell + rec.strongSell) / total * 100) : 0;

    const label = buyPct >= 70 ? 'Strong Buy' : buyPct >= 50 ? 'Buy' :
                  sellPct >= 50 ? 'Sell' : 'Hold';
    const labelColor = buyPct >= 50 ? 'var(--bull)' : sellPct >= 50 ? 'var(--bear)' : 'var(--warn)';

    // Fetch individual analyst ratings
    const ratRes = await fetch(`${PROXY_URL}/api/stock/recommendation?symbol=${rec.symbol || ''}`).catch(() => null);
    const analysts = (ratRes && ratRes.ok) ? await ratRes.json() : [];

    el.innerHTML = `
      <div class="consensus-label" style="color:${labelColor}">${label}</div>
      <div class="consensus-bar">
        <div class="cb-buy"  style="width:${buyPct}%"></div>
        <div class="cb-hold" style="width:${holdPct}%"></div>
        <div class="cb-sell" style="width:${sellPct}%"></div>
      </div>
      <div class="consensus-counts">
        <span class="cc-buy"><i class="ri-arrow-up-fill"></i> ${rec.strongBuy + rec.buy} Buy</span>
        <span class="cc-hold">○ ${rec.hold} Hold</span>
        <span class="cc-sell"><i class="ri-arrow-down-fill"></i> ${rec.sell + rec.strongSell} Sell</span>
      </div>
      <div style="margin-top:8px">
        ${data.slice(0, 5).map(r => `
          <div class="analyst-row">
            <span class="analyst-firm">${escapeHtml(r.symbol || 'N/A')}</span>
            <span class="analyst-date">${r.period || ''}</span>
            <span class="rating-badge ${r.strongBuy+r.buy > r.sell+r.strongSell ? 'buy' : r.sell+r.strongSell > 0 ? 'sell' : 'hold'}">
              ${r.strongBuy+r.buy > r.sell+r.strongSell ? 'Buy' : r.sell+r.strongSell > 0 ? 'Sell' : 'Hold'}
            </span>
            <span class="analyst-target">${r.strongBuy} SB · ${r.buy} B</span>
          </div>
        `).join('')}
      </div>
    `;
  } catch(e) {
    el.innerHTML = '<div class="info-text">Analyst ma&#39;lumotlari yuklanmadi.</div>';
  }
}

// ── Short Interest ─────────────────────────────────────────────────────────
async function renderShortInterest(res, ticker) {
  const el = document.getElementById('mb-short');
  if (!el) return;
  try {
    if (!res || !res.ok) throw new Error('fetch');
    const data = await res.json();
    const items = (data.data || []).slice(-2);
    if (!items.length) { el.innerHTML = '<div class="info-text">Short interest ma&#39;lumoti yo&#39;q.</div>'; return; }

    const latest = items[items.length - 1];
    const prev   = items.length > 1 ? items[0] : null;
    const pct    = latest.shortInterest || 0;
    const color  = pct < 5 ? 'var(--bull)' : pct < 15 ? 'var(--warn)' : 'var(--bear)';
    const signal = pct < 5 ? 'Past — Bullish signal' : pct < 15 ? "O'rta — Neytral" : 'Yuqori — Squeeze riski!';
    const change = prev ? (pct - prev.shortInterest) : 0;

    el.innerHTML = `
      <div class="si-value" style="color:${color}">${pct.toFixed(1)}<span style="font-size:28px;color:var(--text-muted)">%</span></div>
      <div class="si-label">Short Interest</div>
      <div class="si-meter">
        <div class="si-bar-bg">
          <div class="si-bar-fill" style="width:${Math.min(pct*3,100)}%;background:${color}"></div>
        </div>
      </div>
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:12px">${signal}</div>
      <div class="si-info">
        <div class="si-cell">
          <div class="signal-label">O'zgarish</div>
          <div style="font-family:var(--mono);font-weight:700;color:${change>=0?'var(--bear)':'var(--bull)'}">
            ${change>=0?'+':''}${change.toFixed(2)}%
          </div>
        </div>
        <div class="si-cell">
          <div class="signal-label">Sana</div>
          <div style="font-family:var(--mono);font-size:12px">${latest.date || 'N/A'}</div>
        </div>
      </div>
    `;
  } catch(e) {
    el.innerHTML = '<div class="info-text">Short interest yuklanmadi.</div>';
  }
}

// ── Institutional Ownership ────────────────────────────────────────────────
async function renderInstitutional(res) {
  const el = document.getElementById('mb-institutional');
  if (!el) return;
  try {
    if (!res || !res.ok) throw new Error('fetch');
    const data = await res.json();
    const holders = (data.institutional || []).slice(0, 8);
    if (!holders.length) { el.innerHTML = '<div class="info-text">Institutional ma&#39;lumot yo&#39;q.</div>'; return; }

    el.innerHTML = holders.map(h => {
      const chg = h.change || 0;
      const chgPct = h.changePercent || 0;
      return `
        <div class="inst-row">
          <span class="inst-name">${escapeHtml(h.name || 'N/A')}</span>
          <span class="inst-shares">${h.shares ? (h.shares/1e6).toFixed(1)+'M' : 'N/A'}</span>
          <span class="inst-change ${chg>=0?'st-up':'st-down'}">
            ${chg>=0?'↑':'↓'} ${Math.abs(chgPct).toFixed(1)}%
          </span>
        </div>
      `;
    }).join('');
  } catch(e) {
    el.innerHTML = '<div class="info-text">Institutional yuklanmadi.</div>';
  }
}

// ── Dividend ───────────────────────────────────────────────────────────────
async function renderDividend(res) {
  const el = document.getElementById('mb-dividend');
  const card = document.getElementById('mb-dividend-card');
  if (!el) return;
  try {
    if (!res || !res.ok) throw new Error('fetch');
    const data = await res.json();
    const divs = data.data || [];
    if (!divs.length) {
      el.innerHTML = '<div class="info-text">Bu aksiya dividend to&#39;lamaydi.</div>';
      return;
    }
    const latest = divs[0];
    const annual = divs.slice(0, 4).reduce((s, d) => s + (d.amount || 0), 0);

    el.innerHTML = `
      <div class="div-grid">
        <div class="div-cell">
          <div class="signal-label">Dividend miqdori</div>
          <div class="div-val">$${(latest.amount || 0).toFixed(2)}</div>
        </div>
        <div class="div-cell">
          <div class="signal-label">Yillik</div>
          <div class="div-val">$${annual.toFixed(2)}</div>
        </div>
        <div class="div-cell">
          <div class="signal-label">Ex-Dividend</div>
          <div style="font-family:var(--mono);font-size:13px">${latest.exDate || 'N/A'}</div>
        </div>
        <div class="div-cell">
          <div class="signal-label">To'lov sanasi</div>
          <div style="font-family:var(--mono);font-size:13px">${latest.payDate || 'N/A'}</div>
        </div>
      </div>
      <div style="margin-top:12px;font-size:12px;color:var(--text-muted)">
        So'nggi ${divs.length} ta dividend tarixi mavjud
      </div>
    `;
  } catch(e) {
    el.innerHTML = '<div class="info-text">Dividend ma&#39;lumoti yuklanmadi.</div>';
  }
}

// ── Earnings History ───────────────────────────────────────────────────────
async function renderEarningsHistory(res) {
  const el = document.getElementById('mb-earnings');
  if (!el) return;
  try {
    if (!res || !res.ok) throw new Error('fetch');
    const data = await res.json();
    const items = (data.earningsCalendar || []).filter(e => e.epsActual !== null).slice(-8).reverse();

    if (!items.length) { el.innerHTML = '<div class="info-text">Earnings tarixi yo&#39;q.</div>'; return; }

    el.innerHTML = `
      <div style="overflow-x:auto">
        <table class="screener-table" style="min-width:500px">
          <thead>
            <tr>
              <th>Sana</th>
              <th>Quarter</th>
              <th>EPS Prognoz</th>
              <th>EPS Haqiqiy</th>
              <th>Surprise</th>
              <th>Natija</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(e => {
              const est = e.epsEstimate || 0;
              const act = e.epsActual || 0;
              const surp = est !== 0 ? ((act - est) / Math.abs(est) * 100) : 0;
              const beat = act > est, meet = Math.abs(surp) < 1;
              const badgeCls = meet ? 'meet' : beat ? 'beat' : 'miss';
              const badgeTxt = meet ? 'Mos' : beat ? 'Beat' : 'Miss';
              return `
                <tr>
                  <td class="er-date">${e.date || ''}</td>
                  <td class="st-num">${e.quarter ? 'Q'+e.quarter+' '+e.year : 'N/A'}</td>
                  <td class="er-est">$${est.toFixed(2)}</td>
                  <td class="er-act ${beat?'st-up':'st-down'}">$${act.toFixed(2)}</td>
                  <td class="er-surp ${beat?'st-up':'st-down'}">${surp>=0?'+':''}${surp.toFixed(1)}%</td>
                  <td><span class="surprise-badge ${badgeCls}">${badgeTxt}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch(e) {
    el.innerHTML = '<div class="info-text">Earnings tarixi yuklanmadi.</div>';
  }
}



// ── B: Calendar Page (Earnings / Dividend / IPO / Pre-Market) ──
// ═══════════════════════════════════════════════════════════════════════════
// CALENDAR PAGE
// ═══════════════════════════════════════════════════════════════════════════
let calLoaded = {};

function initCalendarTabs() {
  document.querySelectorAll('.cal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.cal-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.cal-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById('cal-' + tab.dataset.cal);
      if (panel) panel.classList.add('active');
      if (!calLoaded[tab.dataset.cal]) loadCalPanel(tab.dataset.cal);
    });
  });
}

async function loadCalendarPage() {
  initCalendarTabs();
  initListTabs();
  if (!calLoaded.earnings) loadCalPanel('earnings');
}

async function loadCalPanel(type) {
  calLoaded[type] = true;
  const el = document.getElementById('cal-' + type);
  if (!el) return;
  el.innerHTML = '<div class="info-text">Yuklanmoqda...</div>';
  try {
    if (type === 'earnings') await loadEarningsCal(el);
    else if (type === 'dividend') await loadDividendCal(el);
    else if (type === 'ipo') await loadIPOCal(el);
    else if (type === 'premarket') await loadPreMarket(el);
  } catch(e) {
    el.innerHTML = '<div class="info-text">Yuklanmadi.</div>';
  }
}

async function loadEarningsCal(el) {
  const res = await fetch(`${PROXY_URL}/api/calendar/earnings?from=${daysAgo(-1)}&to=${daysAgo(-14)}`);
  if (!res.ok) throw new Error(res.status);
  const data = await res.json();
  const items = (data.earningsCalendar || []).slice(0, 30);
  if (!items.length) { el.innerHTML = '<div class="info-text">Yaqin earnings topilmadi.</div>'; return; }
  el.innerHTML = items.map(e => {
    const diff = Math.ceil((new Date(e.date) - new Date()) / 86400000);
    const cls = diff <= 0 ? 'today' : diff <= 2 ? 'soon' : 'week';
    const lbl = diff <= 0 ? 'Bugun' : diff === 1 ? 'Ertaga' : diff + ' kun';
    return `<div class="cal-row" style="grid-template-columns:auto 1fr auto auto" onclick="loadTickerFromScreener('${escapeHtml(e.symbol)}')">
      <span class="cal-ticker">${escapeHtml(e.symbol)}</span>
      <span class="cal-name">${escapeHtml(e.name||'')}</span>
      <span class="cal-date">${e.date}</span>
      <span class="cal-badge ${cls}">${lbl}</span>
    </div>`;
  }).join('');
}

async function loadDividendCal(el) {
  const res = await fetch(`${PROXY_URL}/api/calendar/dividend?from=${daysAgo(-1)}&to=${daysAgo(-21)}`);
  if (!res.ok) throw new Error(res.status);
  const data = await res.json();
  const items = (data.dividendCalendar || []).slice(0, 30);
  if (!items.length) { el.innerHTML = '<div class="info-text">Dividend topilmadi.</div>'; return; }
  el.innerHTML = items.map(d => {
    const diff = Math.ceil((new Date(d.exDate||d.date) - new Date()) / 86400000);
    const cls = diff <= 0 ? 'today' : diff <= 3 ? 'soon' : 'week';
    return `<div class="cal-row" style="grid-template-columns:auto 1fr auto auto auto" onclick="loadTickerFromScreener('${escapeHtml(d.symbol)}')">
      <span class="cal-ticker">${escapeHtml(d.symbol)}</span>
      <span class="cal-name">${escapeHtml(d.name||'')}</span>
      <span class="cal-date">Ex: ${d.exDate||'N/A'}</span>
      <span style="font-family:var(--mono);color:var(--bull);font-weight:700">$${(d.amount||0).toFixed(2)}</span>
      <span class="cal-badge ${cls}">${diff<=0?'Bugun':diff+' kun'}</span>
    </div>`;
  }).join('');
}

async function loadIPOCal(el) {
  const res = await fetch(`${PROXY_URL}/api/calendar/ipo?from=${daysAgo(-1)}&to=${daysAgo(-60)}`);
  if (!res.ok) throw new Error(res.status);
  const data = await res.json();
  const items = (data.ipoCalendar || []).slice(0, 20);
  if (!items.length) { el.innerHTML = '<div class="info-text">Yaqin IPO topilmadi.</div>'; return; }
  el.innerHTML = items.map(i => {
    const pr = i.priceRangeLow && i.priceRangeHigh ? `$${i.priceRangeLow}-${i.priceRangeHigh}` : 'N/A';
    return `<div class="cal-row" style="grid-template-columns:auto 1fr auto auto auto">
      <span class="cal-ticker">${escapeHtml(i.symbol||'N/A')}</span>
      <span class="cal-name">${escapeHtml(i.name||'')}</span>
      <span class="cal-date">${i.date||'N/A'}</span>
      <span style="font-family:var(--mono);color:var(--bull)">${pr}</span>
      <span class="cal-date">${escapeHtml(i.exchange||'')}</span>
    </div>`;
  }).join('');
}

async function loadPreMarket(el) {
  const syms = ['AAPL','MSFT','NVDA','TSLA','GOOGL','AMZN','META','AMD','NFLX','JPM'];
  const quotes = await Promise.all(syms.map(s =>
    fetch(`${PROXY_URL}/api/quote?symbol=${s}`)
      .then(r => r.ok ? r.json().then(q => ({s,q})) : null).catch(() => null)
  ));
  const results = quotes.filter(x=>x&&x.q&&x.q.c)
    .sort((a,b)=>Math.abs(b.q.dp)-Math.abs(a.q.dp));
  el.innerHTML = results.map(x => {
    const up = x.q.dp >= 0;
    return `<div class="pm-row" onclick="loadTickerFromScreener('${x.s}')">
      <span class="cal-ticker">${x.s}</span>
      <span style="font-family:var(--mono)">$${formatPrice(x.q.c)}</span>
      <span class="${up?'st-up':'st-down'}" style="font-family:var(--mono);font-weight:700">${up?'+':''}${x.q.dp.toFixed(2)}%</span>
    </div>`;
  }).join('');
}


// ── C: Congress Page (Quiver + Finnhub fallback) ──
// ═══════════════════════════════════════════════════════════════════════════
// CONGRESS PAGE
// ═══════════════════════════════════════════════════════════════════════════
let congressLoaded = false;

let allCongressData = []; // cache for real-time filter

async function loadCongressPage() {
  if (!congressLoaded) {
    congressLoaded = true;
    await fetchCongressData();
  }
  // Real-time filter listeners
  ['congress-type','congress-party'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._bound) {
      el._bound = true;
      el.addEventListener('change', () => renderCongressTable(allCongressData));
    }
  });
  const btn = document.getElementById('congress-load-btn');
  if (btn && !btn._bound) {
    btn._bound = true;
    btn.addEventListener('click', async () => {
      congressLoaded = false;
      allCongressData = [];
      await fetchCongressData();
    });
  }
}

async function fetchCongressData() {
  const el = document.getElementById('congress-results');
  if (!el) return;
  el.innerHTML = '<div class="info-text">Quiver Quantitative dan yuklanmoqda...</div>';
  try {
    // Quiver Quantitative — Congressional trades (bepul, real data)
    const res = await fetch(`${PROXY_URL}/quiver/live/congresstrading`);
    if (!res.ok) throw new Error('Quiver API: ' + res.status);
    const data = await res.json();
    allCongressData = Array.isArray(data) ? data : (data.data || []);
    renderCongressTable(allCongressData);
  } catch(e) {
    // Fallback: Finnhub
    try {
      const res2 = await fetch(`${PROXY_URL}/api/stock/congressional-trading?symbol=AAPL&from=${daysAgo(90)}&to=${daysAgo(0)}`);
      if (res2.ok) {
        const d = await res2.json();
        allCongressData = d.data || [];
        renderCongressTable(allCongressData);
      } else {
        el.innerHTML = '<div class="info-text">Congressional trades mavjud emas (API cheklovi).</div>';
      }
    } catch(e2) {
      el.innerHTML = '<div class="info-text">Congressional trades yuklanmadi.</div>';
    }
  }
}

function renderCongressTable(rawData) {
  const el = document.getElementById('congress-results');
  if (!el) return;

  const type  = document.getElementById('congress-type')?.value  || '';
  const party = document.getElementById('congress-party')?.value || '';

  let items = [...rawData];

  // Real-time filter
  if (type === 'buy')  items = items.filter(i =>
    (i.Transaction||i.transactionType||'').toLowerCase().includes('purchase') ||
    (i.Transaction||i.transactionType||'').toLowerCase() === 'buy');
  if (type === 'sell') items = items.filter(i =>
    (i.Transaction||i.transactionType||'').toLowerCase().includes('sale') ||
    (i.Transaction||i.transactionType||'').toLowerCase() === 'sell');
  if (party === 'D') items = items.filter(i =>
    (i.Party||i.representative||'').toUpperCase().includes('D'));
  if (party === 'R') items = items.filter(i =>
    (i.Party||i.representative||'').toUpperCase().includes('R'));

  items = items.slice(0, 50);

  if (!items.length) {
    el.innerHTML = '<div class="info-text">Filtr bo&#39;yicha topilmadi.</div>'; return;
  }

  el.innerHTML = `<div style="margin-bottom:12px;font-family:var(--mono);font-size:11px;color:var(--text-muted)">
    ${rawData.length} ta savdo topildi · ${items.length} ta ko'rsatilmoqda
  </div>
  <table class="screener-table">
    <thead><tr>
      <th>Senator/Kongress</th>
      <th>Partiya</th>
      <th>Aksiya</th>
      <th>Tur</th>
      <th>Miqdor</th>
      <th>Sana</th>
    </tr></thead>
    <tbody>${items.map(i => {
      // Support both Quiver and Finnhub response formats
      const name    = i.Representative || i.representative || 'N/A';
      const sym     = i.Ticker         || i.symbol         || 'N/A';
      const txType  = i.Transaction    || i.transactionType|| '';
      const amount  = i.Range          || i.amount         || 'N/A';
      const date    = i.TransactionDate|| i.transactionDate|| 'N/A';
      const party   = i.Party          || '';

      const isBuy   = txType.toLowerCase().includes('purchase') ||
                      txType.toLowerCase() === 'buy';
      const partyUp = party.toUpperCase();
      const pClass  = partyUp.includes('D') ? 'D' : partyUp.includes('R') ? 'R' : '';

      return `<tr onclick="loadTickerFromScreener('${escapeHtml(sym)}')">
        <td class="cong-name">${escapeHtml(name)}</td>
        <td>${pClass ? `<span class="cong-party ${pClass}">${pClass==='D'?'Dem':'Rep'}</span>` : '—'}</td>
        <td class="cal-ticker">${escapeHtml(sym)}</td>
        <td class="${isBuy?'st-up':'st-down'}" style="font-family:var(--mono);font-weight:700">
          ${isBuy ? '↑ Sotib oldi' : '↓ Sotdi'}
        </td>
        <td style="font-family:var(--mono);font-size:12px">${escapeHtml(String(amount))}</td>
        <td class="cal-date">${escapeHtml(date)}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;
}


// ── D: Lists Page (52-week, Aristocrats, Unusual options) ──
// ═══════════════════════════════════════════════════════════════════════════
// LISTS PAGE
// ═══════════════════════════════════════════════════════════════════════════
let listLoaded = {};

function initListTabs() {
  document.querySelectorAll('.list-tab').forEach(tab => {
    if (tab._listBound) return;
    tab._listBound = true;
    tab.addEventListener('click', () => {
      document.querySelectorAll('.list-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.list-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById('list-' + tab.dataset.list);
      if (panel) panel.classList.add('active');
      if (!listLoaded[tab.dataset.list]) loadListPanel(tab.dataset.list);
    });
  });
}

async function loadListPanel(type) {
  listLoaded[type] = true;
  const el = document.getElementById('list-' + type);
  if (!el) return;
  el.innerHTML = '<div class="info-text">Yuklanmoqda...</div>';
  try {
    if (type === 'highs' || type === 'lows') await load52Week(el, type === 'highs');
    else if (type === 'aristocrats') await loadAristocrats(el);
    else if (type === 'options') await loadUnusualOptions(el);
  } catch(e) { console.error('loadListPanel error:', type, e); el.innerHTML = '<div class="info-text">Xato: ' + e.message + '</div>'; }
}

// Batch fetch — Finnhub rate limit ga tushamaslik uchun 5 tadan
async function batchQuotes(syms, el) {
  const batchSize = 5;
  const results = [];
  for (let i = 0; i < syms.length; i += batchSize) {
    const chunk = syms.slice(i, i + batchSize);
    if (el) el.innerHTML = `<div class="info-text">Yuklanmoqda... ${Math.min(i+batchSize, syms.length)}/${syms.length}</div>`;
    const batch = await Promise.all(chunk.map(item => {
      const ticker = typeof item === 'object' ? item.s : item;
      const dAgoB=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.toISOString().split('T')[0];};
      return fetch(`${PROXY_URL}/polygon/v2/aggs/ticker/${ticker}/range/1/day/${dAgoB(5)}/${dAgoB(1)}?adjusted=true&sort=asc&limit=5`)
        .then(r=>r.ok?r.json().then(d=>{
          if(!d.results||!d.results.length) return null;
          const last=d.results[d.results.length-1],prev=d.results.length>=2?d.results[d.results.length-2]:last;
          const q={c:last.c,d:last.c-prev.c,dp:prev.c?((last.c-prev.c)/prev.c*100):0,h:last.h,l:last.l,pc:prev.c};
          return {item,ticker,q};
        }):null).catch(()=>null);
    }));
    results.push(...batch.filter(Boolean));
    if (i + batchSize < syms.length) await new Promise(r => setTimeout(r, 250));
  }
  return results;
}

async function load52Week(el, isHigh) {
  const syms = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AVGO','JPM',
    'V','UNH','XOM','MA','JNJ','PG','HD','ABBV','MRK','CVX','COST',
    'ORCL','AMD','CRM','BAC','KO','WMT','PEP','TMO','MCD','CSCO'];

  const raw = await batchQuotes(syms, el);
  console.log('52W raw results:', raw.length, raw[0]);

  const results = raw
    .filter(x => x && x.q && x.q.c && x.q.h)
    .map(x => {
      const s = x.ticker;
      const pct = x.q.h > x.q.l ? (x.q.c - x.q.l) / (x.q.h - x.q.l) * 100 : 50;
      return { s, price: x.q.c, change: x.q.dp||0, h52: x.q.h, l52: x.q.l, pct };
    })
    .sort((a,b) => isHigh ? b.pct - a.pct : a.pct - b.pct)
    .slice(0, 15);

  console.log('52W filtered results:', results.length);

  if (!results.length) {
    el.innerHTML = '<div class="info-text">Ma&#39;lumot kelmadi. (raw=' + raw.length + ')</div>'; return;
  }

  el.innerHTML = results.map((r,i) => `
    <div class="hl-row" onclick="loadTickerFromScreener('${r.s}')">
      <span class="hl-rank">#${i+1}</span>
      <span class="cal-ticker">${r.s}</span>
      <span style="font-family:var(--mono)">$${formatPrice(r.price)}</span>
      <span class="${r.change>=0?'st-up':'st-down'}" style="font-family:var(--mono);font-weight:700">
        ${r.change>=0?'+':''}${r.change.toFixed(2)}%
      </span>
      <span class="hl-vol" style="font-family:var(--mono);font-size:11px;color:var(--text-muted)">
        ${isHigh?'52W High: $'+formatPrice(r.h52):'52W Low: $'+formatPrice(r.l52)}
      </span>
    </div>`).join('');
}

const ARISTOCRATS = [
  {s:'JNJ',y:61},{s:'PG',y:67},{s:'KO',y:62},{s:'MMM',y:65},{s:'CL',y:60},
  {s:'GPC',y:67},{s:'LOW',y:60},{s:'ABT',y:52},{s:'ADP',y:49},{s:'AFL',y:41},
  {s:'APD',y:41},{s:'BDX',y:52},{s:'CAT',y:29},{s:'CB',y:31},{s:'CINF',y:63},
  {s:'CLX',y:46},{s:'CVX',y:36},{s:'DOV',y:67},{s:'ECL',y:31},{s:'EMR',y:47}
];

async function loadAristocrats(el) {
  // Fetch one by one with metadata preserved
  el.innerHTML = '<div class="info-text">Yuklanmoqda... 0/' + ARISTOCRATS.length + '</div>';
  const results = [];

  for (let i = 0; i < ARISTOCRATS.length; i++) {
    const a = ARISTOCRATS[i];
    if (i % 5 === 0) {
      el.innerHTML = '<div class="info-text">Yuklanmoqda... ' + i + '/' + ARISTOCRATS.length + '</div>';
      if (i > 0) await new Promise(r => setTimeout(r, 250));
    }
    try {
      const res = await fetch(`${PROXY_URL}/api/quote?symbol=${a.s}`);
      if (res.ok) {
        const q = await res.json();
        if (q.c) results.push({ s: a.s, y: a.y, q });
      }
    } catch(e) {}
  }

  if (!results.length) {
    el.innerHTML = '<div class="info-text">Ma&#39;lumot kelmadi.</div>'; return;
  }

  el.innerHTML = results.map(r => `
    <div class="aristocrat-row" onclick="loadTickerFromScreener('${r.s}')">
      <span class="cal-ticker">${r.s}</span>
      <span style="font-family:var(--mono)">$${formatPrice(r.q.c)}</span>
      <span class="${r.q.dp>=0?'st-up':'st-down'}" style="font-family:var(--mono);font-weight:700">
        ${r.q.dp>=0?'+':''}${(r.q.dp||0).toFixed(2)}%
      </span>
      <span class="years-badge">${r.y} yil</span>
    </div>`).join('');
}

async function loadUnusualOptions(el) {
  el.innerHTML = '<div class="info-text">AI orqali unusual options yuklanmoqda...</div>';
  try {
    const res = await fetch(`${PROXY_URL}/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search for today's top unusual options activity in the stock market. Find 10-15 notable unusual options trades (large call/put volume, high open interest). Return ONLY this JSON array, no markdown:
[{"sym":"AAPL","type":"CALL","strike":200,"expiry":"2025-05-16","oi":50000,"note":"Large call sweep"},...]`
        }]
      })
    });

    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const json = text.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'');
    const fb = json.indexOf('['), lb = json.lastIndexOf(']');
    const items = JSON.parse(fb !== -1 ? json.substring(fb, lb+1) : json);

    if (!items.length) throw new Error('empty');

    el.innerHTML = `
      <div style="margin-bottom:12px;font-family:var(--mono);font-size:11px;color:var(--text-muted)">
        AI web search orqali topilgan bugungi unusual options
      </div>
      ${items.map(o => `
      <div class="options-row" onclick="loadTickerFromScreener('${escapeHtml(o.sym||'')}')">
        <span class="opt-type ${(o.type||'call').toLowerCase()}">${(o.type||'CALL').toUpperCase()}</span>
        <span class="cal-ticker">${escapeHtml(o.sym||'')}</span>
        <span style="font-family:var(--mono);font-size:12px">Strike: $${o.strike||'N/A'}</span>
        <span style="font-family:var(--mono);font-size:12px">OI: ${o.oi ? Number(o.oi).toLocaleString() : 'N/A'}</span>
        <span class="cal-date">${escapeHtml(o.expiry||'N/A')}</span>
      </div>`).join('')}
    `;
  } catch(e) {
    el.innerHTML = '<div class="info-text">Unusual options yuklanmadi: ' + e.message + '</div>';
  }
}




// ── E: Futures Page (Commodities, Forex, Bonds, Indices) ──
// ═══════════════════════════════════════════════════════════════════════════
// FUTURES PAGE
// ═══════════════════════════════════════════════════════════════════════════
let futuresLoaded = false;

async function loadFuturesPage() {
  if (futuresLoaded) return;
  futuresLoaded = true;
  await Promise.all([
    loadCommodities(),
    loadForex(),
    loadBonds(),
    loadIndices()
  ]);
}

// Reusable: fetch quote via Polygon (Finnhub fallback)
async function fq(symbol) {
  try {
    const dAgo = n => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; };
    const r = await fetch(`${PROXY_URL}/polygon/v2/aggs/ticker/${symbol}/range/1/day/${dAgo(5)}/${dAgo(1)}?adjusted=true&sort=asc&limit=5`);
    if (!r.ok) throw new Error('poly ' + r.status);
    const d = await r.json();
    if (!d.results || d.results.length < 2) throw new Error('no data');
    const last = d.results[d.results.length-1];
    const prev = d.results[d.results.length-2];
    const changePct = ((last.c - prev.c) / prev.c * 100);
    return { symbol, price: last.c, change: last.c-prev.c, changePct, high: last.h, low: last.l };
  } catch(e) {
    // Finnhub fallback
    try {
      const r2 = await fetch(`${PROXY_URL}/api/quote?symbol=${symbol}`);
      if (!r2.ok) return null;
      const q = await r2.json();
      if (!q.c) return null;
      return { symbol, price: q.c, change: q.d||0, changePct: q.dp||0, high: q.h, low: q.l };
    } catch(e2) { return null; }
  }
}

function futRow(d, label, unit='$', note='') {
  if (!d) return '';
  const up = d.changePct >= 0;
  const price = d.price >= 100
    ? d.price.toLocaleString('en-US', {maximumFractionDigits: 2})
    : formatPrice(d.price);
  return `
    <div class="cal-row" style="grid-template-columns:auto 1fr auto auto auto"
      onclick="showTickerPanel('${d.symbol}','stock')">
      <span class="cal-ticker">${d.symbol}</span>
      <span class="cal-name">${label}${note ? ' <span style=\'font-size:10px;color:var(--text-muted)\'>('+note+')</span>' : ''}</span>
      <span style="font-family:var(--mono);font-weight:600">${unit}${price}</span>
      <span class="${up?'st-up':'st-down'}" style="font-family:var(--mono);font-weight:700">
        ${up?'+':''}${d.changePct.toFixed(2)}%
      </span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--text-muted)">
        H: ${unit}${formatPrice(d.high)} L: ${unit}${formatPrice(d.low)}
      </span>
    </div>`;
}

async function loadCommodities() {
  const el = document.getElementById('fut-commodities');
  if (!el) return;

  const COMMODITIES = [
    { sym: 'GLD',  label: 'Oltin (Gold)',          note: 'GLD ETF' },
    { sym: 'SLV',  label: 'Kumush (Silver)',        note: 'SLV ETF' },
    { sym: 'USO',  label: 'Neft (WTI Crude Oil)',   note: 'USO ETF' },
    { sym: 'UNG',  label: 'Tabiiy Gaz',             note: 'UNG ETF' },
    { sym: 'CORN', label: 'Makkajoxori (Corn)',   note: 'CORN ETF' },
    { sym: 'WEAT', label: 'Bugdoy (Wheat)',       note: 'WEAT ETF' },
    { sym: 'SOYB', label: 'Soya',                  note: 'SOYB ETF' },
    { sym: 'CPER', label: 'Mis (Copper)',           note: 'CPER ETF' },
    { sym: 'PALL', label: 'Palladiy',               note: 'PALL ETF' },
    { sym: 'PPLT', label: 'Platina',                note: 'PPLT ETF' },
  ];

  el.innerHTML = '<div class="info-text">Yuklanmoqda...</div>';

  // Batch: 5 ta bir vaqtda
  const results = [];
  for (let i = 0; i < COMMODITIES.length; i += 5) {
    const chunk = COMMODITIES.slice(i, i + 5);
    const batch = await Promise.all(chunk.map(c => fq(c.sym).then(d => ({ ...c, d }))));
    results.push(...batch);
    if (i + 5 < COMMODITIES.length) await new Promise(r => setTimeout(r, 200));
  }

  const html = results.map(r => futRow(r.d, r.label, '$', r.note)).filter(Boolean).join('');
  el.innerHTML = html || '<div class="info-text">Ma&#39;lumot kelmadi.</div>';
}

async function loadForex() {
  const el = document.getElementById('fut-forex');
  if (!el) return;

  // Finnhub forex quotes
  const FOREX = [
    { sym: 'UUP',  label: 'USD Index',    note: 'UUP ETF' },
    { sym: 'FXE',  label: 'EUR/USD',      note: 'FXE ETF' },
    { sym: 'FXY',  label: 'USD/JPY',      note: 'FXY ETF' },
    { sym: 'FXB',  label: 'GBP/USD',      note: 'FXB ETF' },
    { sym: 'FXC',  label: 'USD/CAD',      note: 'FXC ETF' },
    { sym: 'FXA',  label: 'AUD/USD',      note: 'FXA ETF' },
    { sym: 'CYB',  label: 'CNY/USD',      note: 'CYB ETF' },
  ];

  const results = [];
  for (let i = 0; i < FOREX.length; i += 5) {
    const chunk = FOREX.slice(i, i + 5);
    const batch = await Promise.all(chunk.map(c => fq(c.sym).then(d => ({ ...c, d }))));
    results.push(...batch);
    if (i + 5 < FOREX.length) await new Promise(r => setTimeout(r, 200));
  }

  const html = results.map(r => futRow(r.d, r.label, '$', r.note)).filter(Boolean).join('');
  el.innerHTML = html || '<div class="info-text">Ma&#39;lumot kelmadi.</div>';
}

async function loadBonds() {
  const el = document.getElementById('fut-bonds');
  if (!el) return;

  const BONDS = [
    { sym: 'TLT',  label: '20+ Yillik Treasury',  note: 'TLT ETF' },
    { sym: 'IEF',  label: '10 Yillik Treasury',    note: 'IEF ETF' },
    { sym: 'SHY',  label: '1-3 Yillik Treasury',   note: 'SHY ETF' },
    { sym: 'LQD',  label: 'Korporativ Obligatsiya', note: 'LQD ETF' },
    { sym: 'HYG',  label: 'High Yield Bonds',       note: 'HYG ETF' },
    { sym: 'EMB',  label: 'Emerging Market Bonds',  note: 'EMB ETF' },
  ];

  const results = [];
  for (let i = 0; i < BONDS.length; i += 5) {
    const chunk = BONDS.slice(i, i + 5);
    const batch = await Promise.all(chunk.map(c => fq(c.sym).then(d => ({ ...c, d }))));
    results.push(...batch);
    if (i + 5 < BONDS.length) await new Promise(r => setTimeout(r, 200));
  }

  const html = results.map(r => futRow(r.d, r.label, '$', r.note)).filter(Boolean).join('');
  el.innerHTML = html || '<div class="info-text">Ma&#39;lumot kelmadi.</div>';
}

async function loadIndices() {
  const el = document.getElementById('fut-indices');
  if (!el) return;

  const INDICES = [
    { sym: 'SPY',  label: 'S&P 500 ETF',          note: 'SPY' },
    { sym: 'QQQ',  label: 'NASDAQ 100 ETF',         note: 'QQQ' },
    { sym: 'DIA',  label: 'Dow Jones ETF',           note: 'DIA' },
    { sym: 'IWM',  label: 'Russell 2000 (Small Cap)',note: 'IWM' },
    { sym: 'VXX',  label: 'VIX Futures (Qorquv)', note: 'VXX' },
    { sym: 'EEM',  label: 'Emerging Markets',        note: 'EEM' },
    { sym: 'EFA',  label: 'Xalqaro bozorlar',        note: 'EFA' },
    { sym: 'GDX',  label: 'Oltin Konchilari',        note: 'GDX' },
    { sym: 'XLE',  label: 'Energetika Sektori',      note: 'XLE' },
    { sym: 'XLF',  label: 'Moliya Sektori',          note: 'XLF' },
  ];

  const results = [];
  for (let i = 0; i < INDICES.length; i += 5) {
    const chunk = INDICES.slice(i, i + 5);
    const batch = await Promise.all(chunk.map(c => fq(c.sym).then(d => ({ ...c, d }))));
    results.push(...batch);
    if (i + 5 < INDICES.length) await new Promise(r => setTimeout(r, 200));
  }

  const html = results.map(r => futRow(r.d, r.label, '$', r.note)).filter(Boolean).join('');
  el.innerHTML = html || '<div class="info-text">Ma&#39;lumot kelmadi.</div>';
}
















// ── F: Pulse / Sanalar sub-tabs + renderMBTechnical ──
// ═══════════════════════════════════════════════════════════════════════════
// BOZOR PULSI & SANALAR — sub-tabs orqali eski page'larni ko'rsatish
// ═══════════════════════════════════════════════════════════════════════════
let pulseInited = false, datesInited = false;
// Eski page elementlarining asl joyini eslab qolamiz, keyin qaytarish uchun
const originalPageParents = {};

function showSubPage(parentId, pageId) {
  const parent = document.getElementById(parentId);
  const page = document.getElementById('page-' + pageId);
  if (!parent || !page) return;

  // Avvalgi sub-content'ni asl joyiga qaytaramiz
  Array.from(parent.children).forEach(child => {
    if (child.classList && child.classList.contains('page')) {
      const origParent = originalPageParents[child.id];
      if (origParent) origParent.appendChild(child);
    }
  });

  // Asl joyini eslab qolamiz (agar hali eslab qolinmagan bo'lsa)
  if (!originalPageParents[page.id]) {
    originalPageParents[page.id] = page.parentNode;
  }

  // Page'ni Pulse/Dates ichiga ko'chiramiz
  parent.appendChild(page);
  page.classList.add('active');
  page.style.display = 'block';

  // Page ichidagi mini-hero ni yashiramiz (chunki Pulse/Dates da bor)
  const heroEl = page.querySelector('.page-mini-hero');
  if (heroEl) heroEl.style.display = 'none';
}

function initPulsePage() {
  // Sub-tab tugmalari
  document.querySelectorAll('[data-pulse-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-pulse-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.pulseTab;
      showSubPage('pulse-content', tab);
      // Trigger init for the tab
      if (tab === 'heatmap' && !heatmapLoaded) loadHeatmap();
      if (tab === 'lists') {
        initListTabs();
        if (!listLoaded.highs) loadListPanel('highs');
      }
      if (tab === 'insider' && !insiderLoaded) {
        insiderLoaded = true;
        const el = document.getElementById('insider-results');
        if (el) el.innerHTML = '<div class="info-text" style="padding:40px">Ticker kiriting va qidiring.</div>';
      }
    });
  });

  if (!pulseInited) {
    pulseInited = true;
    // Default: heatmap
    showSubPage('pulse-content', 'heatmap');
    if (!heatmapLoaded) loadHeatmap();
  }
}

function initDatesPage() {
  document.querySelectorAll('[data-dates-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-dates-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.datesTab;
      showSubPage('dates-content', tab);
      if (tab === 'calendar' && !calLoaded.earnings) loadCalendarPage();
      if (tab === 'congress' && !congressLoaded) loadCongressPage();
    });
  });

  if (!datesInited) {
    datesInited = true;
    showSubPage('dates-content', 'calendar');
    if (!calLoaded.earnings) loadCalendarPage();
  }
}





// ── Texnik Tahlil panelini render qilish ────────────────────────────────────
function renderMBTechnical(data) {
  const el = document.getElementById('mb-technical');
  if (!el) return;
  const sig = data?.preSignals;
  if (!sig || !sig.entry) {
    el.innerHTML = '<div class="info-text">Candle ma\'lumoti yetarli emas (min 14 kun kerak).</div>';
    return;
  }

  const entry = sig.entry;
  const price = sig.lastClose;
  const fmt = v => v ? (v < 1 ? v.toFixed(4) : v.toFixed(2)) : '—';
  const fmtPct = v => v ? (v >= 0 ? '+' : '') + v.toFixed(2) + '%' : '—';

  const sigColor = entry.signal === 'SOTIB_OL' ? 'var(--bull)' : entry.signal === 'SOTING' ? 'var(--bear)' : 'var(--warn)';
  const sigIcon  = entry.signal === 'SOTIB_OL' ? 'ri-arrow-up-circle-fill' : entry.signal === 'SOTING' ? 'ri-arrow-down-circle-fill' : 'ri-pause-circle-fill';
  const confColor = entry.confidence >= 65 ? 'var(--bull)' : entry.confidence <= 35 ? 'var(--bear)' : 'var(--warn)';
  const rsiColor = sig.rsi >= 70 ? 'var(--bear)' : sig.rsi <= 30 ? 'var(--bull)' : 'var(--text)';
  const macd = sig.macd;
  const macdColor = macd?.histogram > 0 ? 'var(--bull)' : 'var(--bear)';
  const bb = sig.bb;
  const bbPosColor = bb ? (bb.bPos > 80 ? 'var(--bear)' : bb.bPos < 20 ? 'var(--bull)' : 'var(--text)') : 'var(--text)';
  const slPct = price ? ((entry.stopLoss - price) / price * 100) : 0;
  const tp1Pct = price ? ((entry.tp1 - price) / price * 100) : 0;
  const tp2Pct = price ? ((entry.tp2 - price) / price * 100) : 0;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:56px;height:56px;border-radius:14px;background:${sigColor}20;border:2px solid ${sigColor};display:grid;place-items:center;font-size:26px;color:${sigColor}">
          <i class="ri ${sigIcon}"></i>
        </div>
        <div>
          <div style="font-family:var(--mono);font-weight:800;font-size:20px;color:${sigColor};letter-spacing:-0.02em">${entry.signal}</div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text-muted);margin-top:2px">Ishonch: ${entry.confidence}%</div>
        </div>
      </div>
      <div style="flex:1;min-width:140px;max-width:220px">
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${entry.confidence}%;background:${confColor};border-radius:3px"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:9px;color:var(--text-muted);margin-top:3px">
          <span>SOTING</span><span>KUTING</span><span>SOTIB_OL</span>
        </div>
      </div>
    </div>

    <div style="margin-bottom:16px">
      ${entry.reasons.map(r => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--text-dim)">
          <i class="ri ri-checkbox-circle-fill" style="color:${sigColor};flex-shrink:0"></i>${r}
        </div>`).join('')}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px">
        <div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Kirish nuqtasi</div>
        <div style="font-family:var(--mono);font-weight:700;font-size:16px">$${fmt(entry.entry)}</div>
        <div style="font-size:10px;color:var(--text-muted)">Hozirgi narx</div>
      </div>
      <div style="background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.3);border-radius:10px;padding:12px">
        <div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;color:var(--bear);margin-bottom:4px">Stop-Loss</div>
        <div style="font-family:var(--mono);font-weight:700;font-size:16px;color:var(--bear)">$${fmt(entry.stopLoss)}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--bear)">${fmtPct(slPct)}</div>
      </div>
      <div style="background:rgba(0,217,126,0.08);border:1px solid rgba(0,217,126,0.3);border-radius:10px;padding:12px">
        <div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;color:var(--bull);margin-bottom:4px">Take-Profit 1</div>
        <div style="font-family:var(--mono);font-weight:700;font-size:16px;color:var(--bull)">$${fmt(entry.tp1)}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--bull)">${fmtPct(tp1Pct)}</div>
      </div>
      <div style="background:rgba(0,217,126,0.05);border:1px solid rgba(0,217,126,0.2);border-radius:10px;padding:12px">
        <div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;color:var(--bull);margin-bottom:4px">Take-Profit 2</div>
        <div style="font-family:var(--mono);font-weight:700;font-size:16px;color:var(--bull)">$${fmt(entry.tp2)}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--bull)">${fmtPct(tp2Pct)}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-bottom:14px">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:var(--mono);font-size:9px;color:var(--text-muted)">RISK/REWARD</div>
        <div style="font-family:var(--mono);font-weight:700;font-size:14px">1:${entry.riskReward}</div>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:var(--mono);font-size:9px;color:var(--text-muted)">RSI(14)</div>
        <div style="font-family:var(--mono);font-weight:700;font-size:14px;color:${rsiColor}">${sig.rsi.toFixed(1)}</div>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:var(--mono);font-size:9px;color:var(--text-muted)">MACD</div>
        <div style="font-family:var(--mono);font-weight:700;font-size:13px;color:${macdColor}">${macd ? (macd.histogram>0?'+':'') + macd.histogram.toFixed(3) : '—'}</div>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:var(--mono);font-size:9px;color:var(--text-muted)">BB %B</div>
        <div style="font-family:var(--mono);font-weight:700;font-size:14px;color:${bbPosColor}">${bb ? bb.bPos.toFixed(0) + '%' : '—'}</div>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:var(--mono);font-size:9px;color:var(--text-muted)">ATR(14)</div>
        <div style="font-family:var(--mono);font-weight:700;font-size:13px">$${sig.atr ? sig.atr.toFixed(2) : '—'}</div>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:var(--mono);font-size:9px;color:var(--text-muted)">TREND</div>
        <div style="font-family:var(--mono);font-weight:700;font-size:11px;color:${sig.trend==='bullish'?'var(--bull)':sig.trend==='bearish'?'var(--bear)':'var(--warn)'}">
          ${sig.trend==='bullish'?'↑ YUQORI':sig.trend==='bearish'?'↓ PASTGA':'→ NEYTRAL'}
        </div>
      </div>
    </div>


    <!-- ═══ CONFLUENCE SCORE ═══ -->
    <div style="margin-top:24px;padding:18px;background:linear-gradient(135deg, var(--bg-card), var(--bg-elevated));border:2px solid ${confluence.color};border-radius:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:0.15em;color:var(--text-muted);margin-bottom:4px">
            <i class="ri ri-focus-3-fill"></i> Confluence Score — Barcha signallar birga
          </div>
          <div style="font-family:var(--display);font-weight:700;font-size:24px;color:${confluence.color};letter-spacing:-0.02em">
            ${confluence.verdict}
          </div>
        </div>
        <div style="display:flex;gap:14px;align-items:center">
          <div style="text-align:center">
            <div style="font-family:var(--mono);font-weight:800;font-size:28px;color:var(--bull);line-height:1">${confluence.bullishScore}</div>
            <div style="font-family:var(--mono);font-size:9px;color:var(--bull);margin-top:2px">↑ BULLISH</div>
          </div>
          <div style="width:1px;height:40px;background:var(--border)"></div>
          <div style="text-align:center">
            <div style="font-family:var(--mono);font-weight:800;font-size:28px;color:var(--bear);line-height:1">${confluence.bearishScore}</div>
            <div style="font-family:var(--mono);font-size:9px;color:var(--bear);margin-top:2px">↓ BEARISH</div>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${confluence.factors.map(f => {
          const fc = f.signal === 'bullish' ? 'var(--bull)' : f.signal === 'bearish' ? 'var(--bear)' : 'var(--warn)';
          const ic = f.signal === 'bullish' ? 'ri-arrow-up-s-line' : f.signal === 'bearish' ? 'ri-arrow-down-s-line' : 'ri-pause-line';
          return `<div title="${f.detail}" style="
            display:inline-flex;align-items:center;gap:5px;padding:5px 10px;
            background:${fc}15;border:1px solid ${fc}40;border-radius:6px;
            font-family:var(--mono);font-size:10px;color:${fc};font-weight:600;cursor:help">
            <i class="ri ${ic}" style="font-size:11px"></i>
            ${f.name} +${f.points}
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- ═══ MULTI-TIMEFRAME ═══ -->
    ${mtfTrend ? `
    <div style="margin-top:14px">
      <div style="font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:8px">
        <i class="ri ri-time-line"></i> Multi-Timeframe Trend
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        ${[['Kunlik', mtfTrend.daily], ['4-soatlik', mtfTrend.h4], ['Soatlik', mtfTrend.h1]].map(([label, trend]) => {
          const tc = trend === 'bullish' ? 'var(--bull)' : trend === 'bearish' ? 'var(--bear)' : 'var(--warn)';
          const ti = trend === 'bullish' ? '↑' : trend === 'bearish' ? '↓' : '→';
          const tl = trend === 'bullish' ? 'BULLISH' : trend === 'bearish' ? 'BEARISH' : 'NEYTRAL';
          return `<div style="background:var(--bg-card);border:1px solid ${tc}40;border-left:3px solid ${tc};border-radius:8px;padding:10px 12px">
            <div style="font-family:var(--mono);font-size:9px;color:var(--text-muted);margin-bottom:3px">${label}</div>
            <div style="font-family:var(--mono);font-weight:700;font-size:14px;color:${tc}">${ti} ${tl}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <!-- ═══ CANDLESTICK PATTERNS ═══ -->
    ${patterns.length ? `
    <div style="margin-top:14px;padding:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px">
      <div style="font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:10px">
        <i class="ri ri-bar-chart-grouped-fill"></i> Candlestick Patterns
      </div>
      ${patterns.map(p => {
        const pc = p.signal === 'bullish' ? 'var(--bull)' : p.signal === 'bearish' ? 'var(--bear)' : 'var(--warn)';
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
          <span style="font-family:var(--mono);font-weight:700;color:${pc};min-width:140px">${p.name}</span>
          <span style="color:var(--text-dim);flex:1">${p.desc}</span>
          <span style="font-family:var(--mono);font-size:10px;color:var(--text-muted)">${p.strength}%</span>
        </div>`;
      }).join('')}
    </div>` : ''}

    <div style="padding:10px 14px;background:rgba(255,165,2,0.08);border:1px solid rgba(255,165,2,0.2);border-radius:8px;font-size:12px;color:var(--text-muted)">
      <i class="ri ri-error-warning-line" style="color:var(--warn)"></i>
      Texnik tahlil — investitsiya maslahati emas. Faqat ma'lumot uchun.
    </div>
  `;
}


// ── G: Global Market Stats Bar (top ticker tape) ──
// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL MARKET STATS BAR
// ═══════════════════════════════════════════════════════════════════════════
function setTV(id, text, cls) {
  [id, id+'2'].forEach(sid => {
    const el = document.getElementById(sid);
    if (!el) return;
    el.textContent = text;
    if (cls) el.className = 'mstat-val ' + cls;
  });
}

function setTH(id, html) {
  [id, id+'2'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.innerHTML = html;
  });
}

async function loadGlobalStats() {
  await new Promise(r => setTimeout(r, 400));
  try {
    // Parallel fetch all macro data
    const [
      spyRes, diaRes, qqqRes, vixRes,
      bondRes, dxyRes, goldRes, oilRes,
      fearRes
    ] = await Promise.all([
      fetch(`${PROXY_URL}/api/quote?symbol=SPY`).catch(()=>null),
      fetch(`${PROXY_URL}/api/quote?symbol=DIA`).catch(()=>null),
      fetch(`${PROXY_URL}/api/quote?symbol=QQQ`).catch(()=>null),
      fetch(`${PROXY_URL}/api/quote?symbol=VXX`).catch(()=>null),
      fetch(`${PROXY_URL}/api/quote?symbol=TLT`).catch(()=>null),
      fetch(`${PROXY_URL}/api/quote?symbol=UUP`).catch(()=>null),
      fetch(`${PROXY_URL}/api/quote?symbol=GLD`).catch(()=>null),
      fetch(`${PROXY_URL}/api/quote?symbol=USO`).catch(()=>null),
      fetch(`${PROXY_URL}/fear`).catch(()=>null)
    ]);

    // Helper: parse quote and set ticker
    const qs = async (res, id, label, multiplier=1) => {
      if (!res || !res.ok) return;
      const q = await res.json();
      if (!q.c) return;
      const val = q.c * multiplier;
      const up  = q.dp >= 0;
      // For indices show index-level number (SPY*10 ≈ S&P 500)
      setTV(id, val >= 1000
        ? val.toLocaleString('en-US', {maximumFractionDigits:0}) + ' ' + (up?'+':'') + (q.dp||0).toFixed(2)+'%'
        : '$' + formatPrice(val) + ' ' + (up?'+':'') + (q.dp||0).toFixed(2)+'%',
        up ? 'up' : 'down');
    };

    // S&P 500 (SPY ≈ S&P/10), DOW (DIA ≈ DOW/100)
    await Promise.all([
      qs(spyRes,  'ms-spy',  'S&P 500', 10),
      qs(diaRes,  'ms-dia',  'DOW',     100),
      qs(qqqRes,  'ms-qqq',  'NASDAQ',  40),
      qs(vixRes,  'ms-vix',  'VIX',     1),
      qs(bondRes, 'ms-bond', '10Y',     1),
      qs(dxyRes,  'ms-dxy',  'USD Idx', 1),
      qs(goldRes, 'ms-gold', 'Gold',    1),
      qs(oilRes,  'ms-oil',  'Oil',     1),
    ]);

    // Crypto — Binance public API (cheksiz bepul, real-time)
    try {
      const PAIRS = [
        { sym: 'BTCUSDT', id: 'ms-btc' },
        { sym: 'ETHUSDT', id: 'ms-eth' },
        { sym: 'SOLUSDT', id: 'ms-sol' },
        { sym: 'BNBUSDT', id: 'ms-bnb' },
      ];

      const binanceRes = await fetch(
        `${PROXY_URL}/binance/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT"]`
      ).catch(() => null);

      if (binanceRes && binanceRes.ok) {
        const tickers = await binanceRes.json();
        if (Array.isArray(tickers)) {
          tickers.forEach(t => {
            const pair = PAIRS.find(p => p.sym === t.symbol);
            if (!pair) return;
            const price = parseFloat(t.lastPrice);
            const pct   = parseFloat(t.priceChangePercent);
            const up    = pct >= 0;
            setTV(pair.id, `$${formatPrice(price)} ${up?'+':''}${pct.toFixed(2)}%`, up?'up':'down');
          });

          // BTC dominance — rough from volumes
          const btcTicker = tickers.find(t => t.symbol === 'BTCUSDT');
          if (btcTicker) {
            // Use known approximate dominance
            setTV('ms-btcdom', '~54%', 'up');
          }
        }
      }
    } catch(e) { console.warn('Binance ticker error:', e); }

    // Fear & Greed
    if (fearRes && fearRes.ok) {
      const f   = await fearRes.json();
      const val = parseInt(f.data?.[0]?.value || 50);
      const cls = val<=25?'extreme-fear':val<=45?'fear':val<=55?'neutral':val<=75?'greed':'extreme-greed';
      const lbl = val<=25?'Qo&#39;rquv':val<=45?'Qo&#39;rquv':val<=55?'Neytral':val<=75?'Ochko&#39;zlik':'Haddan oshgan';
      setTH('ms-fear', `<span class="fg-badge ${cls}">${val} ${lbl}</span>`);
      renderFearDetail(val, cls, lbl, f.data?.[0]?.value_classification);
    }

    // Animation speed fixed in CSS — no dynamic adjustment needed

  } catch(e) { /* silent */ }
}


function renderFearDetail(val, cls, label, classification) {
  const el = document.getElementById('fear-detail');
  if (!el) return;
  const color = val<=25?'var(--bear)':val<=45?'var(--warn)':val<=55?'var(--text-dim)':val<=75?'var(--bull)':'#00ff99';
  const desc = val<=25?'Bozor qattiq qo&#39;rquvda. Tarixan aksiya olish uchun qulay vaqt.':
               val<=45?'Investorlar ehtiyotkor. Bozor tushishi mumkin.':
               val<=55?'Bozor muvozanatda. Aniq trend yo&#39;q.':
               val<=75?'Investorlar ochko&#39;z. Narxlar tez ko&#39;tarilmoqda.':
               'Haddan oshgan ochko&#39;zlik. Tuzatish bo&#39;lishi mumkin.';
  el.innerHTML = `
    <div style="text-align:center;padding:20px 0">
      <div style="font-family:var(--display);font-weight:800;font-size:80px;letter-spacing:-0.04em;line-height:1;color:${color}">${val}</div>
      <div style="font-family:var(--mono);font-size:12px;text-transform:uppercase;letter-spacing:0.2em;color:var(--text-muted);margin-top:8px">${classification||label}</div>
      <div style="margin:20px auto;max-width:280px">
        <div style="height:8px;background:var(--bg-card);border-radius:100px;overflow:hidden;position:relative">
          <div style="position:absolute;inset:0;background:linear-gradient(90deg,var(--bear),var(--warn),var(--bull));border-radius:100px"></div>
          <div style="position:absolute;top:-3px;left:calc(${val}% - 7px);width:14px;height:14px;background:#fff;border-radius:50%;border:2px solid var(--bg);box-shadow:0 0 8px rgba(0,0,0,.5)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-family:var(--mono);font-size:9px;color:var(--text-muted);text-transform:uppercase">
          <span>Qo&#39;rquv</span><span>Neytral</span><span>Ochko&#39;zlik</span>
        </div>
      </div>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.5;max-width:280px;margin:0 auto">${desc}</div>
    </div>`;
}


// ── H: Crypto Market Page (Trending, Gainers/Losers, New listings) ──
// ═══════════════════════════════════════════════════════════════════════════
// CRYPTO MARKET PAGE
// ═══════════════════════════════════════════════════════════════════════════
let cryptoMarketLoaded = false;

async function loadCryptoMarket() {
  cryptoMarketLoaded = true;
  await Promise.all([loadTrending(), loadGainersLosers(), loadNewListings()]);
}

async function loadTrending() {
  const el = document.getElementById('trending-list');
  try {
    const res = await fetch(`${PROXY_URL}/cg/search/trending`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    el.innerHTML = (data.coins||[]).slice(0,10).map((c,i) => {
      const coin = c.item;
      const chg = coin.data?.price_change_percentage_24h?.usd || 0;
      return `<div class="trending-item" onclick="loadCryptoFromMarket('${escapeHtml(coin.symbol.toUpperCase())}')">
        <span class="trending-rank">#${i+1}</span>
        <div class="trending-info">
          <div class="trending-name">${escapeHtml(coin.name)}</div>
          <div class="trending-symbol">${escapeHtml(coin.symbol.toUpperCase())}</div>
        </div>
        <div class="trending-change ${chg>=0?'st-up':'st-down'}">${chg>=0?'+':''}${chg.toFixed(2)}%</div>
      </div>`;
    }).join('');
  } catch(e) { console.error('loadListPanel error:', type, e); el.innerHTML = '<div class="info-text">Xato: ' + e.message + '</div>'; }
}

async function loadGainersLosers() {
  const gEl = document.getElementById('gainers-list');
  const lEl = document.getElementById('losers-list');
  try {
    const res = await fetch(`${PROXY_URL}/cg/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false`);
    if (!res.ok) throw new Error(res.status);
    const coins = await res.json();
    const sorted = [...coins].sort((a,b)=>(b.price_change_percentage_24h||0)-(a.price_change_percentage_24h||0));
    const gainers = sorted.filter(c=>c.price_change_percentage_24h>0).slice(0,8);
    const losers  = sorted.filter(c=>c.price_change_percentage_24h<0).reverse().slice(0,8);
    const row = (c, isG) => `
      <div class="${isG?'gainer-item':'loser-item'}" onclick="loadCryptoFromMarket('${escapeHtml(c.symbol.toUpperCase())}')">
        <span class="gl-ticker">${escapeHtml(c.symbol.toUpperCase())}</span>
        <span class="gl-name">${escapeHtml(c.name)}</span>
        <span class="gl-price">$${formatPrice(c.current_price)}</span>
        <span class="gl-change ${isG?'st-up':'st-down'}">${isG?'+':''}${(c.price_change_percentage_24h||0).toFixed(2)}%</span>
      </div>`;
    gEl.innerHTML = gainers.map(c=>row(c,true)).join('') || '<div class="info-text">Topilmadi</div>';
    lEl.innerHTML = losers.map(c=>row(c,false)).join('') || '<div class="info-text">Topilmadi</div>';
  } catch(e) { gEl.innerHTML = lEl.innerHTML = '<div class="info-text">Yuklanmadi.</div>'; }
}

async function loadNewListings() {
  const el = document.getElementById('new-listings');
  try {
    const res = await fetch(`${PROXY_URL}/cg/coins/list/new`);
    if (!res.ok) throw new Error(res.status);
    const coins = await res.json();
    el.innerHTML = `<table class="screener-table">
      <thead><tr><th>Nomi</th><th>Symbol</th><th>Sana</th></tr></thead>
      <tbody>${coins.slice(0,10).map(c=>`
        <tr onclick="loadCryptoFromMarket('${escapeHtml((c.symbol||'').toUpperCase())}')">
          <td class="st-ticker">${escapeHtml(c.name||'N/A')}</td>
          <td class="st-num">${escapeHtml((c.symbol||'').toUpperCase()||'N/A')}</td>
          <td class="insider-role">${c.activated_at?new Date(c.activated_at*1000).toLocaleDateString():'N/A'}</td>
        </tr>`).join('')}
      </tbody></table>`;
  } catch(e) { console.error('loadListPanel error:', type, e); el.innerHTML = '<div class="info-text">Xato: ' + e.message + '</div>'; }
}

function loadCryptoFromMarket(symbol) {
  if (!symbol || symbol==='N/A') return;
  currentMarket = 'crypto';
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.page==='home'));
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active', p.id==='page-home'));
  document.getElementById('search-box').classList.add('crypto-mode');
  document.getElementById('analyze-btn').classList.add('crypto-mode');
  document.querySelectorAll('.market-btn').forEach(b=>b.classList.toggle('active', b.dataset.market==='crypto'));
  renderQuickPicks();
  document.getElementById('ticker-input').value = symbol;
  analyze();
}



// ── I: Heat Map (Sectors → ETFs) ──
// ═══════════════════════════════════════════════════════════════════════════
// HEAT MAP
// ═══════════════════════════════════════════════════════════════════════════
let heatmapLoaded = false;

const SECTORS = [
  { name: 'Technology',     etf: 'XLK',  tickers: ['AAPL','MSFT','NVDA','AVGO','ORCL'] },
  { name: 'Healthcare',     etf: 'XLV',  tickers: ['UNH','JNJ','LLY','ABBV','MRK'] },
  { name: 'Finance',        etf: 'XLF',  tickers: ['JPM','BAC','V','MA','GS'] },
  { name: 'Energy',         etf: 'XLE',  tickers: ['XOM','CVX','COP','EOG','SLB'] },
  { name: 'Consumer',       etf: 'XLY',  tickers: ['AMZN','TSLA','HD','MCD','NKE'] },
  { name: 'Communication',  etf: 'XLC',  tickers: ['GOOGL','META','VZ','T','DIS'] },
  { name: 'Industrials',    etf: 'XLI',  tickers: ['GE','CAT','RTX','UPS','HON'] },
  { name: 'Utilities',      etf: 'XLU',  tickers: ['NEE','DUK','SO','D','AEP'] },
  { name: 'Real Estate',    etf: 'XLRE', tickers: ['AMT','PLD','CCI','EQIX','PSA'] },
  { name: 'Materials',      etf: 'XLB',  tickers: ['LIN','APD','SHW','FCX','NEM'] },
  { name: 'Staples',        etf: 'XLP',  tickers: ['PG','KO','PEP','WMT','COST'] },
];

function heatColor(pct) {
  const capped = Math.max(-5, Math.min(5, pct));
  if (capped > 0) {
    const g = Math.round(50 + (capped / 5) * 169);
    return `rgba(0, ${g}, 80, 0.85)`;
  } else {
    const r = Math.round(150 + (Math.abs(capped) / 5) * 105);
    return `rgba(${r}, 30, 40, 0.85)`;
  }
}

async function loadHeatmap() {
  heatmapLoaded = true;
  const grid = document.getElementById('heatmap-grid');
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(140px, 1fr))';
  grid.innerHTML = SECTORS.map(() =>
    `<div class="sector-block skel" style="min-height:80px"></div>`
  ).join('');

  try {
    const quotes = await Promise.all(SECTORS.map(async s => {
      const res = await fetch(`${PROXY_URL}/api/quote?symbol=${s.etf}`);
      const q = res.ok ? await res.json() : {};
      return { ...s, change: q.dp || 0, price: q.c || 0 };
    }));

    quotes.sort((a, b) => b.change - a.change);

    grid.innerHTML = quotes.map(s => `
      <div class="sector-block" style="background:${heatColor(s.change)}"
        onclick="filterScreenerBySector('${s.name}')">
        <div class="sector-name">${s.name}</div>
        <div class="sector-change" style="color:#fff">
          ${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%
        </div>
      </div>
    `).join('');
  } catch(e) {
    grid.innerHTML = '<div class="info-text" style="padding:40px">Heat map yuklanmadi.</div>';
  }
}


// ── J: Insider Trading (top-level addEventListener wiring) ──
// ═══════════════════════════════════════════════════════════════════════════
// INSIDER TRADING
// ═══════════════════════════════════════════════════════════════════════════
let insiderLoaded = false;

document.getElementById('insider-search-btn')?.addEventListener('click', loadInsider);
document.getElementById('insider-ticker')?.addEventListener('keypress', e => {
  if (e.key === 'Enter') loadInsider();
});

async function loadInsider() {
  const ticker = document.getElementById('insider-ticker').value.trim().toUpperCase();
  const type   = document.getElementById('insider-type').value;
  const wrap   = document.getElementById('insider-results');

  if (!ticker) {
    showToast('<i class="ri-error-warning-fill"></i> Ticker kiriting!', 'warn');
    return;
  }

  wrap.innerHTML = '<div class="info-text" style="padding:40px">Yuklanmoqda...</div>';

  try {
    const from = daysAgo(90), to = daysAgo(0);
    const res  = await fetch(`${PROXY_URL}/api/stock/insider-transactions?symbol=${ticker}&from=${from}&to=${to}`);
    if (!res.ok) throw new Error('Fetch failed ' + res.status);
    const data = await res.json();

    let txns = (data.data || []);
    if (type) txns = txns.filter(t => t.transactionType === type);
    txns = txns.slice(0, 30);

    if (txns.length === 0) {
      wrap.innerHTML = '<div class="info-text" style="padding:40px">Insider tranzaksiya topilmadi.</div>';
      return;
    }

    wrap.innerHTML = `
      <table class="insider-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Insider</th>
            <th>Lavozim</th>
            <th>Tur</th>
            <th>Miqdor</th>
            <th>Narx</th>
            <th>Sana</th>
          </tr>
        </thead>
        <tbody>
          ${txns.map(t => `
            <tr>
              <td class="insider-ticker" onclick="loadTickerFromScreener('${escapeHtml(t.symbol)}')">${escapeHtml(t.symbol || ticker)}</td>
              <td class="insider-name">${escapeHtml(t.name || 'N/A')}</td>
              <td class="insider-role">${escapeHtml(t.filingUrl ? 'Executive' : t.share > 100000 ? 'Director' : 'Officer')}</td>
              <td class="${t.transactionType === 'P' ? 'insider-buy' : 'insider-sell'}">
                ${t.transactionType === 'P' ? '↑ Sotib oldi' : '↓ Sotdi'}
              </td>
              <td class="insider-amount">${t.share ? t.share.toLocaleString() : 'N/A'}</td>
              <td class="st-num">${t.transactionPrice ? '$' + formatPrice(t.transactionPrice) : 'N/A'}</td>
              <td class="insider-role">${t.transactionDate || 'N/A'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch(e) {
    wrap.innerHTML = `<div class="info-text" style="padding:40px;color:var(--bear)">Xatolik: ${e.message}</div>`;
  }
}

