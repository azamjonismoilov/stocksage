// ============================================================================
// StockSage halal — AAOIFI screening + static catalog + Polygon mega mode
// Loaded as a plain <script>; relies on shared global scope.
//
// Depends on:
//   utils.js — PROXY_URL, safeParseJSON, escapeHtml
//   inline   — currentMarket, navigateTo, renderQuickPicks
//              (lazy-resolved — only used inside goToFullAnalysis,
//               which fires on user click after inline script is loaded)
// ============================================================================

// ── Block A: Halol Screening core ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// HALOL SCREENING
// ═══════════════════════════════════════════════════════════════════════════
let halalLoaded = false;
let halalBatchCache = {};
let halalBatchResults = [];

function initHalalPage() {
  if (halalLoaded) return;
  halalLoaded = true;

  document.getElementById('halal-check-btn')?.addEventListener('click', () => {
    const t = document.getElementById('halal-input').value.trim().toUpperCase();
    if (!t) return;
    checkHalalSingle(t, document.getElementById('halal-single-result'));
  });

  document.getElementById('halal-input')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('halal-check-btn').click();
  });

  initHalalBatch();
}

async function getHalalAnalysis(ticker) {
  if (halalBatchCache[ticker]) return halalBatchCache[ticker];

  const prompt = `You are an Islamic finance scholar. Analyze ${ticker} stock for Shariah compliance based on AAOIFI standards. Search the web to verify the company business model.

Return ONLY this JSON (no markdown, no backticks):
{"ticker":"${ticker}","company":"full name","verdict":"HALOL or SHUBHALI or HARAM","grade":"A or B or C or D or F","score":85,"business_halal":true,"primary_business":"asosiy biznes o'zbek tilida","haram_revenue_pct":2.1,"debt_ratio_ok":true,"interest_debt_pct":15,"criteria":[{"name":"Biznes faoliyati","status":"pass","detail":"o'zbek tilida"},{"name":"Haram daromad ulushi","status":"pass","detail":"o'zbek tilida"},{"name":"Qarz nisbati (Riba)","status":"warn","detail":"o'zbek tilida"},{"name":"Likvidlik nisbati","status":"pass","detail":"o'zbek tilida"},{"name":"Sarmoya yo'nalishi","status":"pass","detail":"o'zbek tilida"}],"purification_pct":2.1,"summary":"2-3 jumla o'zbek tilida xulosa.","source_note":"AAOIFI standartlari asosida"}

Rules: HALOL if haram_revenue<5% AND debt ok. SHUBHALI if borderline. HARAM if alcohol/tobacco/gambling/weapons/porn/conventional banking. JSON only.`;

  const res = await fetch(`${PROXY_URL}/claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    if (res.status === 400 || res.status === 402) throw new Error("Claude API kredit tugagan. console.anthropic.com da to'ldiring.");
    if (res.status === 401) throw new Error("Claude API key noto'g'ri.");
    throw new Error('API ' + res.status);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let json = text.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'');
  const fb = json.indexOf('{'), lb = json.lastIndexOf('}');
  if (fb !== -1) json = json.substring(fb, lb+1);
  const result = JSON.parse(json);
  halalBatchCache[ticker] = result;
  return result;
}

function renderHalalCard(r) {
  const vCls = r.verdict === 'HALOL' ? 'halal' : r.verdict === 'SHUBHALI' ? 'doubtful' : 'haram';
  const vIcon = r.verdict === 'HALOL' ? 'ri-checkbox-circle-fill' : r.verdict === 'SHUBHALI' ? 'ri-error-warning-fill' : 'ri-close-circle-fill';
  const scoreColor = (r.score||0) >= 70 ? 'var(--bull)' : (r.score||0) >= 40 ? 'var(--warn)' : 'var(--bear)';
  const gradeCls = 'grade-' + (r.grade || 'C');

  const criteria = (r.criteria || []).map(c => {
    const cls  = c.status === 'pass' ? 'hc-pass' : c.status === 'fail' ? 'hc-fail' : 'hc-warn';
    const icon = c.status === 'pass' ? 'ri-checkbox-circle-fill' : c.status === 'fail' ? 'ri-close-circle-fill' : 'ri-error-warning-fill';
    return `<li><i class="hc-icon ri ${icon} ${cls}"></i>
      <div class="hc-text"><strong>${escapeHtml(c.name)}</strong> — ${escapeHtml(c.detail)}</div></li>`;
  }).join('');

  const purify = r.purification_pct > 0 ? `
    <div class="purify-box">
      <strong><i class="ri-hand-heart-fill"></i> Tozalash:</strong>
      Foydangizning <strong>${(r.purification_pct||0).toFixed(2)}%</strong>ini sadaqa qilishingiz tavsiya etiladi.
    </div>` : '';

  return `
    <div class="halal-score-wrap">
      <div class="halal-score-ring" style="color:${scoreColor};border-color:${scoreColor}">${r.score||0}</div>
      <div>
        <div style="margin-bottom:8px">
          <span class="halal-badge ${vCls}"><i class="ri ${vIcon}"></i> ${r.verdict||'N/A'}</span>
          <span class="${gradeCls}" style="display:inline-grid;place-items:center;width:36px;height:36px;border-radius:8px;font-family:var(--mono);font-weight:800;font-size:16px;margin-left:8px">${r.grade||'?'}</span>
        </div>
        <div style="font-size:13px;color:var(--text-dim)">${escapeHtml(r.company||r.ticker)}</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-muted);margin-top:4px">
          Haram: ${(r.haram_revenue_pct||0).toFixed(1)}% | Faiz qarz: ${(r.interest_debt_pct||0).toFixed(1)}%
        </div>
      </div>
    </div>
    <div style="font-size:14px;color:var(--text-dim);line-height:1.6;margin-bottom:16px;padding:14px;background:var(--bg-card);border-radius:10px;border-left:3px solid ${scoreColor}">
      ${escapeHtml(r.summary||'')}
    </div>
    <ul class="halal-criteria">${criteria}</ul>
    ${purify}
    <div style="margin-top:12px;font-family:var(--mono);font-size:10px;color:var(--text-muted)">
      <i class="ri-information-line"></i> ${escapeHtml(r.source_note||'AAOIFI standartlari asosida')}
    </div>`;
}

async function checkHalalSingle(ticker, el) {
  el.innerHTML = '<div class="info-text">Tahlil qilinmoqda...</div>';
  try {
    const r = await getHalalAnalysis(ticker);
    el.innerHTML = renderHalalCard(r);
  } catch(e) {
    el.innerHTML = '<div class="info-text">Xato: ' + e.message + '</div>';
  }
}

async function renderMBHalal(ticker) {
  const el = document.getElementById('mb-halal');
  if (!el) return;
  if (currentMarket !== 'stock') {
    el.innerHTML = '<div class="info-text">Faqat aksiyalar uchun.</div>'; return;
  }
  el.innerHTML = '<div class="info-text">Halollik tekshirilmoqda...</div>';
  try {
    const r = await getHalalAnalysis(ticker);
    el.innerHTML = renderHalalCard(r);
  } catch(e) {
    el.innerHTML = '<div class="info-text">Halol tahlil amalga oshmadi.</div>';
  }
}

// S&P 500 to'liq halollik ma'lumotlari — AAOIFI standartlari asosida
const HALAL_STATIC = [
  // TECHNOLOGY
  {ticker:"AAPL",  company:"Apple Inc.",                  sector:"Technology",  verdict:"HALOL",    grade:"A",score:90,haram_revenue_pct:0.5, interest_debt_pct:12},
  {ticker:"MSFT",  company:"Microsoft Corp.",              sector:"Technology",  verdict:"HALOL",    grade:"A",score:88,haram_revenue_pct:0.8, interest_debt_pct:14},
  {ticker:"NVDA",  company:"NVIDIA Corp.",                 sector:"Technology",  verdict:"HALOL",    grade:"A",score:92,haram_revenue_pct:0.2, interest_debt_pct:8},
  {ticker:"GOOGL", company:"Alphabet Inc.",                sector:"Technology",  verdict:"SHUBHALI", grade:"C",score:55,haram_revenue_pct:4.2, interest_debt_pct:5},
  {ticker:"META",  company:"Meta Platforms",               sector:"Technology",  verdict:"SHUBHALI", grade:"D",score:42,haram_revenue_pct:8.5, interest_debt_pct:4},
  {ticker:"AVGO",  company:"Broadcom Inc.",                sector:"Technology",  verdict:"HALOL",    grade:"A",score:85,haram_revenue_pct:0.4, interest_debt_pct:16},
  {ticker:"ORCL",  company:"Oracle Corp.",                 sector:"Technology",  verdict:"HALOL",    grade:"A",score:89,haram_revenue_pct:0.3, interest_debt_pct:18},
  {ticker:"AMD",   company:"Advanced Micro Devices",       sector:"Technology",  verdict:"HALOL",    grade:"A",score:91,haram_revenue_pct:0.2, interest_debt_pct:7},
  {ticker:"CRM",   company:"Salesforce Inc.",              sector:"Technology",  verdict:"HALOL",    grade:"A",score:86,haram_revenue_pct:0.4, interest_debt_pct:11},
  {ticker:"CSCO",  company:"Cisco Systems Inc.",           sector:"Technology",  verdict:"HALOL",    grade:"A",score:87,haram_revenue_pct:0.5, interest_debt_pct:10},
  {ticker:"INTC",  company:"Intel Corp.",                  sector:"Technology",  verdict:"HALOL",    grade:"B",score:80,haram_revenue_pct:0.6, interest_debt_pct:20},
  {ticker:"QCOM",  company:"Qualcomm Inc.",                sector:"Technology",  verdict:"HALOL",    grade:"A",score:84,haram_revenue_pct:0.5, interest_debt_pct:13},
  {ticker:"IBM",   company:"IBM Corp.",                    sector:"Technology",  verdict:"HALOL",    grade:"B",score:76,haram_revenue_pct:1.2, interest_debt_pct:22},
  {ticker:"NOW",   company:"ServiceNow Inc.",              sector:"Technology",  verdict:"HALOL",    grade:"A",score:88,haram_revenue_pct:0.3, interest_debt_pct:9},
  {ticker:"ADBE",  company:"Adobe Inc.",                   sector:"Technology",  verdict:"HALOL",    grade:"A",score:87,haram_revenue_pct:0.4, interest_debt_pct:11},
  {ticker:"INTU",  company:"Intuit Inc.",                  sector:"Technology",  verdict:"SHUBHALI", grade:"C",score:58,haram_revenue_pct:3.5, interest_debt_pct:18},
  {ticker:"AMAT",  company:"Applied Materials",            sector:"Technology",  verdict:"HALOL",    grade:"A",score:86,haram_revenue_pct:0.3, interest_debt_pct:14},
  {ticker:"MU",    company:"Micron Technology",            sector:"Technology",  verdict:"HALOL",    grade:"A",score:85,haram_revenue_pct:0.4, interest_debt_pct:12},
  {ticker:"LRCX",  company:"Lam Research Corp.",           sector:"Technology",  verdict:"HALOL",    grade:"A",score:87,haram_revenue_pct:0.2, interest_debt_pct:13},
  {ticker:"KLAC",  company:"KLA Corp.",                    sector:"Technology",  verdict:"HALOL",    grade:"A",score:86,haram_revenue_pct:0.3, interest_debt_pct:15},
  {ticker:"MRVL",  company:"Marvell Technology",           sector:"Technology",  verdict:"HALOL",    grade:"A",score:84,haram_revenue_pct:0.4, interest_debt_pct:14},
  {ticker:"CDNS",  company:"Cadence Design Systems",       sector:"Technology",  verdict:"HALOL",    grade:"A",score:88,haram_revenue_pct:0.3, interest_debt_pct:10},
  {ticker:"SNPS",  company:"Synopsys Inc.",                sector:"Technology",  verdict:"HALOL",    grade:"A",score:87,haram_revenue_pct:0.3, interest_debt_pct:9},
  {ticker:"FTNT",  company:"Fortinet Inc.",                sector:"Technology",  verdict:"HALOL",    grade:"A",score:86,haram_revenue_pct:0.4, interest_debt_pct:11},
  {ticker:"PANW",  company:"Palo Alto Networks",           sector:"Technology",  verdict:"HALOL",    grade:"A",score:85,haram_revenue_pct:0.5, interest_debt_pct:12},
  {ticker:"CRWD",  company:"CrowdStrike Holdings",         sector:"Technology",  verdict:"HALOL",    grade:"A",score:86,haram_revenue_pct:0.4, interest_debt_pct:13},
  {ticker:"ANSS",  company:"ANSYS Inc.",                   sector:"Technology",  verdict:"HALOL",    grade:"A",score:87,haram_revenue_pct:0.3, interest_debt_pct:8},
  {ticker:"TXN",   company:"Texas Instruments",            sector:"Technology",  verdict:"HALOL",    grade:"A",score:85,haram_revenue_pct:0.5, interest_debt_pct:14},
  {ticker:"ADI",   company:"Analog Devices Inc.",          sector:"Technology",  verdict:"HALOL",    grade:"A",score:84,haram_revenue_pct:0.6, interest_debt_pct:15},
  {ticker:"NXPI",  company:"NXP Semiconductors",          sector:"Technology",  verdict:"HALOL",    grade:"A",score:83,haram_revenue_pct:0.7, interest_debt_pct:16},
  // HEALTHCARE
  {ticker:"UNH",   company:"UnitedHealth Group",           sector:"Healthcare",  verdict:"SHUBHALI", grade:"C",score:52,haram_revenue_pct:5.5, interest_debt_pct:28},
  {ticker:"JNJ",   company:"Johnson & Johnson",            sector:"Healthcare",  verdict:"HALOL",    grade:"A",score:87,haram_revenue_pct:0.8, interest_debt_pct:11},
  {ticker:"ABBV",  company:"AbbVie Inc.",                  sector:"Healthcare",  verdict:"HALOL",    grade:"B",score:75,haram_revenue_pct:0.6, interest_debt_pct:25},
  {ticker:"MRK",   company:"Merck & Co.",                  sector:"Healthcare",  verdict:"HALOL",    grade:"A",score:85,haram_revenue_pct:0.5, interest_debt_pct:12},
  {ticker:"TMO",   company:"Thermo Fisher Scientific",     sector:"Healthcare",  verdict:"HALOL",    grade:"A",score:88,haram_revenue_pct:0.4, interest_debt_pct:14},
  {ticker:"PFE",   company:"Pfizer Inc.",                  sector:"Healthcare",  verdict:"HALOL",    grade:"B",score:78,haram_revenue_pct:0.7, interest_debt_pct:20},
  {ticker:"LLY",   company:"Eli Lilly & Co.",              sector:"Healthcare",  verdict:"HALOL",    grade:"A",score:86,haram_revenue_pct:0.5, interest_debt_pct:15},
  {ticker:"GILD",  company:"Gilead Sciences",              sector:"Healthcare",  verdict:"HALOL",    grade:"A",score:84,haram_revenue_pct:0.4, interest_debt_pct:16},
  {ticker:"REGN",  company:"Regeneron Pharmaceuticals",    sector:"Healthcare",  verdict:"HALOL",    grade:"A",score:87,haram_revenue_pct:0.3, interest_debt_pct:8},
  {ticker:"ISRG",  company:"Intuitive Surgical",           sector:"Healthcare",  verdict:"HALOL",    grade:"A",score:91,haram_revenue_pct:0.2, interest_debt_pct:5},
  {ticker:"BSX",   company:"Boston Scientific",            sector:"Healthcare",  verdict:"HALOL",    grade:"A",score:86,haram_revenue_pct:0.5, interest_debt_pct:18},
  {ticker:"MDT",   company:"Medtronic plc",                sector:"Healthcare",  verdict:"HALOL",    grade:"A",score:85,haram_revenue_pct:0.6, interest_debt_pct:16},
  {ticker:"SYK",   company:"Stryker Corp.",                sector:"Healthcare",  verdict:"HALOL",    grade:"A",score:86,haram_revenue_pct:0.5, interest_debt_pct:14},
  {ticker:"ELV",   company:"Elevance Health",              sector:"Healthcare",  verdict:"SHUBHALI", grade:"C",score:50,haram_revenue_pct:6.0, interest_debt_pct:25},
  {ticker:"CI",    company:"Cigna Group",                  sector:"Healthcare",  verdict:"SHUBHALI", grade:"C",score:48,haram_revenue_pct:6.5, interest_debt_pct:28},
  {ticker:"HCA",   company:"HCA Healthcare",               sector:"Healthcare",  verdict:"SHUBHALI", grade:"C",score:52,haram_revenue_pct:5.0, interest_debt_pct:30},
  {ticker:"DHR",   company:"Danaher Corp.",                sector:"Healthcare",  verdict:"HALOL",    grade:"A",score:85,haram_revenue_pct:0.5, interest_debt_pct:15},
  {ticker:"ZBH",   company:"Zimmer Biomet",                sector:"Healthcare",  verdict:"HALOL",    grade:"B",score:80,haram_revenue_pct:0.8, interest_debt_pct:20},
  {ticker:"BAX",   company:"Baxter International",         sector:"Healthcare",  verdict:"HALOL",    grade:"B",score:78,haram_revenue_pct:0.9, interest_debt_pct:22},
  {ticker:"BDX",   company:"Becton Dickinson",             sector:"Healthcare",  verdict:"HALOL",    grade:"A",score:83,haram_revenue_pct:0.7, interest_debt_pct:18},
  // FINANCE (mostly HARAM)
  {ticker:"JPM",   company:"JPMorgan Chase",               sector:"Finance",     verdict:"HARAM",    grade:"F",score:15,haram_revenue_pct:95.0,interest_debt_pct:90},
  {ticker:"BAC",   company:"Bank of America",              sector:"Finance",     verdict:"HARAM",    grade:"F",score:12,haram_revenue_pct:96.0,interest_debt_pct:92},
  {ticker:"WFC",   company:"Wells Fargo & Co.",            sector:"Finance",     verdict:"HARAM",    grade:"F",score:10,haram_revenue_pct:97.0,interest_debt_pct:93},
  {ticker:"GS",    company:"Goldman Sachs",                sector:"Finance",     verdict:"HARAM",    grade:"F",score:18,haram_revenue_pct:90.0,interest_debt_pct:85},
  {ticker:"MS",    company:"Morgan Stanley",               sector:"Finance",     verdict:"HARAM",    grade:"F",score:16,haram_revenue_pct:88.0,interest_debt_pct:84},
  {ticker:"C",     company:"Citigroup Inc.",               sector:"Finance",     verdict:"HARAM",    grade:"F",score:11,haram_revenue_pct:96.0,interest_debt_pct:91},
  {ticker:"V",     company:"Visa Inc.",                    sector:"Finance",     verdict:"SHUBHALI", grade:"D",score:38,haram_revenue_pct:15.0,interest_debt_pct:35},
  {ticker:"MA",    company:"Mastercard Inc.",              sector:"Finance",     verdict:"SHUBHALI", grade:"D",score:35,haram_revenue_pct:18.0,interest_debt_pct:38},
  {ticker:"AXP",   company:"American Express",             sector:"Finance",     verdict:"HARAM",    grade:"F",score:20,haram_revenue_pct:75.0,interest_debt_pct:70},
  {ticker:"BLK",   company:"BlackRock Inc.",               sector:"Finance",     verdict:"SHUBHALI", grade:"D",score:35,haram_revenue_pct:20.0,interest_debt_pct:25},
  {ticker:"SCHW",  company:"Charles Schwab",               sector:"Finance",     verdict:"HARAM",    grade:"F",score:22,haram_revenue_pct:65.0,interest_debt_pct:60},
  {ticker:"SPGI",  company:"S&P Global Inc.",              sector:"Finance",     verdict:"SHUBHALI", grade:"C",score:48,haram_revenue_pct:10.0,interest_debt_pct:30},
  {ticker:"COF",   company:"Capital One Financial",        sector:"Finance",     verdict:"HARAM",    grade:"F",score:14,haram_revenue_pct:94.0,interest_debt_pct:88},
  {ticker:"PGR",   company:"Progressive Corp.",            sector:"Finance",     verdict:"SHUBHALI", grade:"C",score:45,haram_revenue_pct:8.0, interest_debt_pct:20},
  {ticker:"AON",   company:"Aon plc",                      sector:"Finance",     verdict:"SHUBHALI", grade:"C",score:48,haram_revenue_pct:7.5, interest_debt_pct:25},
  {ticker:"MMC",   company:"Marsh & McLennan",             sector:"Finance",     verdict:"SHUBHALI", grade:"C",score:47,haram_revenue_pct:8.0, interest_debt_pct:26},
  {ticker:"CB",    company:"Chubb Limited",                sector:"Finance",     verdict:"SHUBHALI", grade:"C",score:46,haram_revenue_pct:8.5, interest_debt_pct:22},
  {ticker:"ICE",   company:"Intercontinental Exchange",    sector:"Finance",     verdict:"SHUBHALI", grade:"C",score:45,haram_revenue_pct:10.0,interest_debt_pct:28},
  {ticker:"CME",   company:"CME Group Inc.",               sector:"Finance",     verdict:"SHUBHALI", grade:"D",score:38,haram_revenue_pct:15.0,interest_debt_pct:20},
  {ticker:"MCO",   company:"Moodys Corp.",                 sector:"Finance",     verdict:"SHUBHALI", grade:"C",score:46,haram_revenue_pct:9.0, interest_debt_pct:25},
  // ENERGY
  {ticker:"XOM",   company:"ExxonMobil Corp.",             sector:"Energy",      verdict:"HALOL",    grade:"B",score:74,haram_revenue_pct:1.2, interest_debt_pct:15},
  {ticker:"CVX",   company:"Chevron Corp.",                sector:"Energy",      verdict:"HALOL",    grade:"B",score:74,haram_revenue_pct:1.5, interest_debt_pct:13},
  {ticker:"COP",   company:"ConocoPhillips",               sector:"Energy",      verdict:"HALOL",    grade:"B",score:73,haram_revenue_pct:1.3, interest_debt_pct:14},
  {ticker:"SLB",   company:"SLB (Schlumberger)",           sector:"Energy",      verdict:"HALOL",    grade:"B",score:75,haram_revenue_pct:1.0, interest_debt_pct:16},
  {ticker:"EOG",   company:"EOG Resources",                sector:"Energy",      verdict:"HALOL",    grade:"B",score:76,haram_revenue_pct:0.8, interest_debt_pct:12},
  {ticker:"PSX",   company:"Phillips 66",                  sector:"Energy",      verdict:"HALOL",    grade:"B",score:72,haram_revenue_pct:1.8, interest_debt_pct:18},
  {ticker:"MPC",   company:"Marathon Petroleum",           sector:"Energy",      verdict:"HALOL",    grade:"B",score:70,haram_revenue_pct:2.0, interest_debt_pct:20},
  {ticker:"VLO",   company:"Valero Energy",                sector:"Energy",      verdict:"HALOL",    grade:"B",score:71,haram_revenue_pct:1.9, interest_debt_pct:18},
  {ticker:"HAL",   company:"Halliburton Co.",              sector:"Energy",      verdict:"HALOL",    grade:"B",score:73,haram_revenue_pct:1.2, interest_debt_pct:17},
  {ticker:"OXY",   company:"Occidental Petroleum",         sector:"Energy",      verdict:"HALOL",    grade:"B",score:70,haram_revenue_pct:1.5, interest_debt_pct:22},
  // CONSUMER
  {ticker:"AMZN",  company:"Amazon.com Inc.",              sector:"Consumer",    verdict:"SHUBHALI", grade:"C",score:58,haram_revenue_pct:3.1, interest_debt_pct:18},
  {ticker:"TSLA",  company:"Tesla Inc.",                   sector:"Consumer",    verdict:"HALOL",    grade:"B",score:78,haram_revenue_pct:0.3, interest_debt_pct:22},
  {ticker:"HD",    company:"Home Depot Inc.",              sector:"Consumer",    verdict:"HALOL",    grade:"B",score:80,haram_revenue_pct:1.0, interest_debt_pct:20},
  {ticker:"WMT",   company:"Walmart Inc.",                 sector:"Consumer",    verdict:"SHUBHALI", grade:"C",score:58,haram_revenue_pct:5.2, interest_debt_pct:17},
  {ticker:"COST",  company:"Costco Wholesale",             sector:"Consumer",    verdict:"SHUBHALI", grade:"C",score:60,haram_revenue_pct:4.8, interest_debt_pct:9},
  {ticker:"TGT",   company:"Target Corp.",                 sector:"Consumer",    verdict:"SHUBHALI", grade:"C",score:55,haram_revenue_pct:6.0, interest_debt_pct:18},
  {ticker:"LOW",   company:"Lowes Companies",              sector:"Consumer",    verdict:"HALOL",    grade:"B",score:78,haram_revenue_pct:1.2, interest_debt_pct:22},
  {ticker:"NKE",   company:"Nike Inc.",                    sector:"Consumer",    verdict:"HALOL",    grade:"B",score:76,haram_revenue_pct:1.5, interest_debt_pct:14},
  {ticker:"SBUX",  company:"Starbucks Corp.",              sector:"Consumer",    verdict:"SHUBHALI", grade:"C",score:52,haram_revenue_pct:8.0, interest_debt_pct:25},
  {ticker:"MCD",   company:"McDonalds Corp.",              sector:"Consumer",    verdict:"SHUBHALI", grade:"D",score:40,haram_revenue_pct:12.0,interest_debt_pct:30},
  {ticker:"PG",    company:"Procter & Gamble",             sector:"Consumer",    verdict:"HALOL",    grade:"A",score:88,haram_revenue_pct:0.5, interest_debt_pct:10},
  {ticker:"KO",    company:"Coca-Cola Co.",                sector:"Consumer",    verdict:"SHUBHALI", grade:"C",score:62,haram_revenue_pct:3.5, interest_debt_pct:15},
  {ticker:"PEP",   company:"PepsiCo Inc.",                 sector:"Consumer",    verdict:"SHUBHALI", grade:"C",score:61,haram_revenue_pct:3.8, interest_debt_pct:16},
  {ticker:"PM",    company:"Philip Morris Intl.",          sector:"Consumer",    verdict:"HARAM",    grade:"F",score:5, haram_revenue_pct:100.0,interest_debt_pct:40},
  {ticker:"MO",    company:"Altria Group",                 sector:"Consumer",    verdict:"HARAM",    grade:"F",score:5, haram_revenue_pct:100.0,interest_debt_pct:45},
  {ticker:"CL",    company:"Colgate-Palmolive",            sector:"Consumer",    verdict:"HALOL",    grade:"A",score:85,haram_revenue_pct:0.6, interest_debt_pct:15},
  {ticker:"KMB",   company:"Kimberly-Clark",               sector:"Consumer",    verdict:"HALOL",    grade:"A",score:84,haram_revenue_pct:0.7, interest_debt_pct:18},
  {ticker:"GIS",   company:"General Mills",                sector:"Consumer",    verdict:"SHUBHALI", grade:"C",score:60,haram_revenue_pct:4.5, interest_debt_pct:20},
  {ticker:"KHC",   company:"Kraft Heinz Co.",              sector:"Consumer",    verdict:"SHUBHALI", grade:"C",score:58,haram_revenue_pct:4.0, interest_debt_pct:22},
  {ticker:"CPB",   company:"Campbell Soup Co.",            sector:"Consumer",    verdict:"SHUBHALI", grade:"C",score:60,haram_revenue_pct:3.5, interest_debt_pct:20},
  // INDUSTRIAL
  {ticker:"CAT",   company:"Caterpillar Inc.",             sector:"Industrial",  verdict:"HALOL",    grade:"B",score:74,haram_revenue_pct:1.5, interest_debt_pct:22},
  {ticker:"GE",    company:"GE Aerospace",                 sector:"Industrial",  verdict:"SHUBHALI", grade:"C",score:55,haram_revenue_pct:5.0, interest_debt_pct:28},
  {ticker:"HON",   company:"Honeywell Intl.",              sector:"Industrial",  verdict:"SHUBHALI", grade:"C",score:52,haram_revenue_pct:6.5, interest_debt_pct:25},
  {ticker:"MMM",   company:"3M Co.",                       sector:"Industrial",  verdict:"HALOL",    grade:"B",score:72,haram_revenue_pct:2.0, interest_debt_pct:20},
  {ticker:"UPS",   company:"UPS",                          sector:"Industrial",  verdict:"HALOL",    grade:"B",score:78,haram_revenue_pct:1.0, interest_debt_pct:20},
  {ticker:"FDX",   company:"FedEx Corp.",                  sector:"Industrial",  verdict:"HALOL",    grade:"B",score:76,haram_revenue_pct:1.2, interest_debt_pct:22},
  {ticker:"DE",    company:"Deere & Co.",                  sector:"Industrial",  verdict:"HALOL",    grade:"B",score:73,haram_revenue_pct:1.8, interest_debt_pct:25},
  {ticker:"EMR",   company:"Emerson Electric",             sector:"Industrial",  verdict:"HALOL",    grade:"B",score:74,haram_revenue_pct:1.5, interest_debt_pct:20},
  {ticker:"ETN",   company:"Eaton Corp.",                  sector:"Industrial",  verdict:"HALOL",    grade:"B",score:75,haram_revenue_pct:1.3, interest_debt_pct:18},
  {ticker:"PH",    company:"Parker-Hannifin",              sector:"Industrial",  verdict:"HALOL",    grade:"B",score:74,haram_revenue_pct:1.5, interest_debt_pct:22},
  {ticker:"ROK",   company:"Rockwell Automation",          sector:"Industrial",  verdict:"HALOL",    grade:"A",score:82,haram_revenue_pct:0.8, interest_debt_pct:16},
  {ticker:"DOV",   company:"Dover Corp.",                  sector:"Industrial",  verdict:"HALOL",    grade:"B",score:78,haram_revenue_pct:1.2, interest_debt_pct:18},
  {ticker:"GWW",   company:"W.W. Grainger Inc.",           sector:"Industrial",  verdict:"HALOL",    grade:"A",score:82,haram_revenue_pct:0.8, interest_debt_pct:15},
  {ticker:"FAST",  company:"Fastenal Co.",                 sector:"Industrial",  verdict:"HALOL",    grade:"A",score:85,haram_revenue_pct:0.5, interest_debt_pct:8},
  {ticker:"CHRW",  company:"C.H. Robinson",                sector:"Industrial",  verdict:"HALOL",    grade:"B",score:76,haram_revenue_pct:1.5, interest_debt_pct:18},
  // TELECOM
  {ticker:"T",     company:"AT&T Inc.",                    sector:"Telecom",     verdict:"HALOL",    grade:"B",score:70,haram_revenue_pct:2.0, interest_debt_pct:30},
  {ticker:"VZ",    company:"Verizon Comm.",                sector:"Telecom",     verdict:"HALOL",    grade:"B",score:71,haram_revenue_pct:1.8, interest_debt_pct:28},
  {ticker:"TMUS",  company:"T-Mobile US",                  sector:"Telecom",     verdict:"HALOL",    grade:"B",score:74,haram_revenue_pct:1.5, interest_debt_pct:22},
  // MEDIA
  {ticker:"NFLX",  company:"Netflix Inc.",                 sector:"Media",       verdict:"HARAM",    grade:"F",score:20,haram_revenue_pct:35.0,interest_debt_pct:25},
  {ticker:"DIS",   company:"Walt Disney Co.",              sector:"Media",       verdict:"SHUBHALI", grade:"D",score:38,haram_revenue_pct:20.0,interest_debt_pct:28},
  {ticker:"CMCSA", company:"Comcast Corp.",                sector:"Media",       verdict:"SHUBHALI", grade:"D",score:35,haram_revenue_pct:22.0,interest_debt_pct:30},
  {ticker:"WBD",   company:"Warner Bros Discovery",        sector:"Media",       verdict:"HARAM",    grade:"F",score:22,haram_revenue_pct:40.0,interest_debt_pct:35},
  {ticker:"PARA",  company:"Paramount Global",             sector:"Media",       verdict:"HARAM",    grade:"F",score:25,haram_revenue_pct:30.0,interest_debt_pct:32},
  {ticker:"LYV",   company:"Live Nation Entertainment",    sector:"Media",       verdict:"SHUBHALI", grade:"C",score:50,haram_revenue_pct:8.0, interest_debt_pct:28},
  // DEFENSE
  {ticker:"RTX",   company:"RTX Corp.",                    sector:"Defense",     verdict:"HARAM",    grade:"F",score:20,haram_revenue_pct:60.0,interest_debt_pct:30},
  {ticker:"LMT",   company:"Lockheed Martin",              sector:"Defense",     verdict:"HARAM",    grade:"F",score:18,haram_revenue_pct:95.0,interest_debt_pct:35},
  {ticker:"BA",    company:"Boeing Co.",                   sector:"Defense",     verdict:"SHUBHALI", grade:"D",score:42,haram_revenue_pct:25.0,interest_debt_pct:40},
  {ticker:"NOC",   company:"Northrop Grumman",             sector:"Defense",     verdict:"HARAM",    grade:"F",score:15,haram_revenue_pct:92.0,interest_debt_pct:32},
  {ticker:"GD",    company:"General Dynamics",             sector:"Defense",     verdict:"HARAM",    grade:"F",score:17,haram_revenue_pct:85.0,interest_debt_pct:28},
  {ticker:"LHX",   company:"L3Harris Technologies",        sector:"Defense",     verdict:"HARAM",    grade:"F",score:16,haram_revenue_pct:90.0,interest_debt_pct:30},
  // UTILITIES
  {ticker:"NEE",   company:"NextEra Energy",               sector:"Utilities",   verdict:"HALOL",    grade:"A",score:82,haram_revenue_pct:0.5, interest_debt_pct:20},
  {ticker:"DUK",   company:"Duke Energy Corp.",            sector:"Utilities",   verdict:"HALOL",    grade:"B",score:76,haram_revenue_pct:0.8, interest_debt_pct:25},
  {ticker:"SO",    company:"Southern Co.",                 sector:"Utilities",   verdict:"HALOL",    grade:"B",score:75,haram_revenue_pct:0.9, interest_debt_pct:26},
  {ticker:"AEP",   company:"American Electric Power",      sector:"Utilities",   verdict:"HALOL",    grade:"B",score:74,haram_revenue_pct:1.0, interest_debt_pct:27},
  {ticker:"EXC",   company:"Exelon Corp.",                 sector:"Utilities",   verdict:"HALOL",    grade:"B",score:73,haram_revenue_pct:1.1, interest_debt_pct:28},
  {ticker:"XEL",   company:"Xcel Energy",                  sector:"Utilities",   verdict:"HALOL",    grade:"B",score:75,haram_revenue_pct:0.9, interest_debt_pct:24},
  // MATERIALS
  {ticker:"LIN",   company:"Linde plc",                    sector:"Materials",   verdict:"HALOL",    grade:"A",score:84,haram_revenue_pct:0.8, interest_debt_pct:15},
  {ticker:"APD",   company:"Air Products",                 sector:"Materials",   verdict:"HALOL",    grade:"A",score:83,haram_revenue_pct:0.9, interest_debt_pct:16},
  {ticker:"FCX",   company:"Freeport-McMoRan",             sector:"Materials",   verdict:"HALOL",    grade:"B",score:75,haram_revenue_pct:1.5, interest_debt_pct:20},
  {ticker:"NEM",   company:"Newmont Corp.",                sector:"Materials",   verdict:"HALOL",    grade:"B",score:76,haram_revenue_pct:1.2, interest_debt_pct:18},
  {ticker:"SHW",   company:"Sherwin-Williams",             sector:"Materials",   verdict:"HALOL",    grade:"A",score:82,haram_revenue_pct:0.8, interest_debt_pct:16},
  {ticker:"ECL",   company:"Ecolab Inc.",                  sector:"Materials",   verdict:"HALOL",    grade:"A",score:83,haram_revenue_pct:0.7, interest_debt_pct:15},
];

let halalPage = 0;
const HALAL_PER_PAGE = 20;
let halalCurrentSector = '';

function initHalalBatch() {
  const filterEl = document.getElementById('halal-filter');
  const searchEl = document.getElementById('halal-search');
  const sectorTabs = document.querySelectorAll('#halal-sector-tabs .cal-tab');

  if (!filterEl || !searchEl || !sectorTabs.length) {
    console.warn('Halal page elements not ready');
    return;
  }

  // Mode toggle: 142 vs 10K+
  document.querySelectorAll('[data-halal-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      halalMode = btn.dataset.halalMode;
      document.querySelectorAll('[data-halal-mode]').forEach(b =>
        b.classList.toggle('active', b.dataset.halalMode === halalMode));
      halalPage = 0;
      if (halalMode === 'mega') {
        if (!halalMegaData) {
          loadHalalMegaData();
        } else {
          halalBatchResults = halalMegaData.map(s => ({
            ...s,
            purification_pct: s.haram_revenue_pct || 0,
            criteria: [
              {name:'Biznes faoliyati',     status: (s.haram_revenue_pct||0) < 5 && s.verdict !== 'HARAM' ? 'pass' : 'fail', detail: s.summary},
              {name:'Haram daromad ulushi', status: (s.haram_revenue_pct||0) < 5 ? 'pass' : 'fail', detail: `Haram: ${s.haram_revenue_pct||0}%`},
              {name:'Qarz nisbati',         status: (s.interest_debt_pct||0) < 30 ? 'pass' : 'warn', detail: `Foiz qarz: ${s.interest_debt_pct||0}%`},
            ],
            source_note: 'Polygon + AAOIFI logika'
          }));
          renderHalalBatch(filterEl.value);
        }
      } else {
        // Static 142
        halalBatchResults = HALAL_STATIC.map(s => ({
          ...s,
          purification_pct: s.haram_revenue_pct,
          criteria: [
            {name:'Biznes faoliyati',     status: s.haram_revenue_pct < 5 && s.verdict !== 'HARAM' ? 'pass' : 'fail', detail: s.summary},
            {name:'Haram daromad ulushi', status: s.haram_revenue_pct < 5 ? 'pass' : 'fail', detail: `Haram: ${s.haram_revenue_pct}%`},
            {name:'Qarz nisbati',         status: s.interest_debt_pct < 30 ? 'pass' : 'warn', detail: `Foiz qarz: ${s.interest_debt_pct}%`},
          ],
          source_note: 'AAOIFI standartlari'
        }));
        renderHalalBatch(filterEl.value);
      }
    });
  });

  // Sector tabs
  sectorTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sectorTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      halalCurrentSector = tab.dataset.sector;
      halalPage = 0;
      renderHalalBatch(filterEl.value);
    });
  });

  filterEl.addEventListener('change', () => {
    halalPage = 0;
    renderHalalBatch(filterEl.value);
  });

  searchEl.addEventListener('input', () => {
    halalPage = 0;
    renderHalalBatch(filterEl.value);
  });
  // Load data immediately
  halalBatchResults = HALAL_STATIC.map(s => ({
    ...s,
    purification_pct: s.haram_revenue_pct,
    criteria: [
      {name:'Biznes faoliyati',     status: s.haram_revenue_pct < 5 && s.verdict !== 'HARAM' ? 'pass' : 'fail', detail: s.summary},
      {name:'Haram daromad ulushi', status: s.haram_revenue_pct < 5 ? 'pass' : s.haram_revenue_pct < 10 ? 'warn' : 'fail', detail: `Haram daromad: ${s.haram_revenue_pct}%`},
      {name:'Qarz nisbati (Riba)',  status: s.interest_debt_pct < 30 ? 'pass' : s.interest_debt_pct < 50 ? 'warn' : 'fail', detail: `Foizli qarz: ${s.interest_debt_pct}%`},
    ],
    source_note: "AAOIFI standartlari asosida. Aniqroq tahlil uchun yuqorida Tekshirish tugmasini bosing."
  }));

  renderHalalBatch('');
}

function runHalalBatch() { initHalalBatch(); }

function renderHalalBatch(filter) {
  const el   = document.getElementById('halal-batch-result');
  const pgEl = document.getElementById('halal-pagination');
  const cntEl = document.getElementById('halal-count');
  if (!halalBatchResults.length) return;

  const search = (document.getElementById('halal-search')?.value || '').toUpperCase();
  let items = [...halalBatchResults];
  if (filter === 'halal')    items = items.filter(r => r.verdict === 'HALOL');
  if (filter === 'doubtful') items = items.filter(r => r.verdict === 'SHUBHALI');
  if (filter === 'haram')    items = items.filter(r => r.verdict === 'HARAM');
  if (halalCurrentSector) {
    items = items.filter(r => {
      if (!r.sector || r.sector === 'Other') return false;
      return r.sector.toLowerCase().includes(halalCurrentSector.toLowerCase());
    });
  }
  if (search) items = items.filter(r =>
    r.ticker.includes(search) || (r.company||'').toUpperCase().includes(search));

  items.sort((a,b) => (b.score||0) - (a.score||0));

  const total = items.length;
  const pages = Math.ceil(total / HALAL_PER_PAGE);
  if (halalPage >= pages) halalPage = 0;
  const pageItems = items.slice(halalPage * HALAL_PER_PAGE, (halalPage+1) * HALAL_PER_PAGE);

  if (cntEl) cntEl.textContent = total + ' ta aksiya';

  const vIcon = v => v === 'HALOL' ? 'ri-checkbox-circle-fill' : v === 'SHUBHALI' ? 'ri-error-warning-fill' : 'ri-close-circle-fill';

  el.innerHTML = pageItems.map(r => {
    const vCls = r.verdict === 'HALOL' ? 'halal' : r.verdict === 'SHUBHALI' ? 'doubtful' : 'haram';
    const gradeCls = 'grade-' + (r.grade || 'C');
    return `<div class="halal-result-row" onclick="showHalalDetail('${r.ticker}')" style="cursor:pointer">
      <div class="${gradeCls} halal-grade">${r.grade||'?'}</div>
      <div style="min-width:0">
        <div style="font-family:var(--mono);font-weight:700;font-size:13px">${r.ticker}</div>
        <div style="font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.company||'')}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text-muted)">${r.sector||''}</div>
      </div>
      <span class="halal-badge ${vCls}" style="padding:5px 12px;font-size:11px">
        <i class="ri ${vIcon(r.verdict)}"></i> ${r.verdict}
      </span>
      <div style="text-align:right;flex-shrink:0;display:flex;align-items:center;gap:10px">
        <div>
          <div style="font-family:var(--mono);font-weight:700;font-size:15px">${r.score||0}%</div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text-muted)">Haram: ${r.haram_revenue_pct||0}%</div>
        </div>
        <i class="ri ri-arrow-right-s-line" style="color:var(--text-muted);font-size:18px"></i>
      </div>
    </div>`;
  }).join('') || '<div class="info-text">Topilmadi.</div>';

  // Pagination
  if (pgEl && pages > 1) {
    pgEl.innerHTML = Array.from({length: pages}, (_, i) => `
      <button onclick="halalGoPage(${i})" style="
        background:${i===halalPage?'var(--accent)':'var(--bg-card)'};
        color:${i===halalPage?'#000':'var(--text-muted)'};
        border:1px solid var(--border);padding:6px 12px;border-radius:6px;
        font-family:var(--mono);font-size:11px;cursor:pointer;min-width:36px">
        ${i+1}
      </button>`).join('');
  } else if (pgEl) {
    pgEl.innerHTML = '';
  }
}

function halalGoPage(page) {
  halalPage = page;
  renderHalalBatch(document.getElementById('halal-filter')?.value || '');
  document.getElementById('halal-batch-result')?.scrollIntoView({behavior:'smooth',block:'start'});
}



// ── Halol detail modal ────────────────────────────────────────────────────
function showHalalDetail(ticker) {
  const r = halalBatchResults.find(x => x.ticker === ticker);

  // Overlay yaratamiz
  const overlay = document.createElement('div');
  overlay.className = 'halal-detail-overlay';
  overlay.id = 'halal-overlay';

  const vCls = r ? (r.verdict === 'HALOL' ? 'halal' : r.verdict === 'SHUBHALI' ? 'doubtful' : 'haram') : 'neutral';
  const scoreColor = r ? ((r.score||0) >= 70 ? 'var(--bull)' : (r.score||0) >= 40 ? 'var(--warn)' : 'var(--bear)') : 'var(--text)';

  overlay.innerHTML = `
    <div class="halal-detail-panel" id="halal-detail-panel">
      <div class="halal-panel-header">
        <div style="display:flex;align-items:center;gap:14px">
          <span class="halal-panel-ticker">${ticker}</span>
          ${r ? `<span class="halal-badge ${vCls}" style="font-size:12px">${r.verdict}</span>` : ''}
        </div>
        <button class="halal-panel-close" onclick="closeHalalDetail()">
          <i class="ri ri-close-line"></i>
        </button>
      </div>

      <!-- Static info -->
      ${r ? `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap">
        <div class="halal-score-ring" style="color:${scoreColor};border-color:${scoreColor};width:64px;height:64px;font-size:22px">
          ${r.score||0}
        </div>
        <div>
          <div style="font-size:14px;color:var(--text-dim);margin-bottom:6px">${escapeHtml(r.company||'')}</div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--text-muted)">
            Sektor: ${r.sector||'N/A'} &nbsp;|&nbsp;
            Haram daromad: ${r.haram_revenue_pct||0}% &nbsp;|&nbsp;
            Faiz qarz: ${r.interest_debt_pct||0}%
          </div>
        </div>
      </div>
      <div style="font-size:14px;color:var(--text-dim);line-height:1.6;padding:14px;background:var(--bg-card);border-radius:10px;border-left:3px solid ${scoreColor};margin-bottom:16px">
        ${escapeHtml(r.summary||'')}
      </div>
      ${r.purification_pct > 0 ? `
      <div class="purify-box" style="margin-bottom:16px">
        <strong><i class="ri ri-hand-heart-fill"></i> Tozalash:</strong>
        Foydangizning <strong>${r.purification_pct.toFixed(2)}%</strong>ini sadaqa qilishingiz tavsiya etiladi.
      </div>` : ''}
      ` : `<div class="info-text">Ma'lumot yuklanmoqda...</div>`}

      <!-- AI deep analysis button -->
      <div id="halal-ai-result-${ticker}">
        <button class="screen-btn" onclick="runHalalAI('${ticker}')" style="width:100%;justify-content:center;margin-bottom:4px">
          <i class="ri ri-sparkling-2-fill"></i> AI bilan chuqurroq tahlil qilish
        </button>
        <div style="text-align:center;font-family:var(--mono);font-size:10px;color:var(--text-muted)">
          Claude AI web search orqali real-time tahlil qiladi
        </div>
      </div>

      <!-- Navigation -->
      <div class="halal-panel-nav">
        <button class="halal-nav-btn" onclick="closeHalalDetail()">
          <i class="ri ri-arrow-left-line"></i> Ro'yxatga qaytish
        </button>
        <button class="halal-nav-btn primary" onclick="goToFullAnalysis('${ticker}')">
          <i class="ri ri-bar-chart-fill"></i> To'liq tahlil
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Overlay background click — yopish
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeHalalDetail();
  });

  // ESC bilan yopish
  document.addEventListener('keydown', halalEscHandler);
}

function halalEscHandler(e) {
  if (e.key === 'Escape') closeHalalDetail();
}

function closeHalalDetail() {
  const overlay = document.getElementById('halal-overlay');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', halalEscHandler);
}

async function runHalalAI(ticker) {
  const el = document.getElementById('halal-ai-result-' + ticker);
  if (!el) return;
  el.innerHTML = '<div class="info-text">AI tahlil qilinmoqda...</div>';
  try {
    const r = await getHalalAnalysis(ticker);
    // Cache ni yangilaymiz
    const idx = halalBatchResults.findIndex(x => x.ticker === ticker);
    if (idx !== -1) {
      halalBatchResults[idx] = { ...halalBatchResults[idx], ...r, _aiChecked: true };
    }
    el.innerHTML = renderHalalCard(r);
  } catch(e) {
    el.innerHTML = '<div class="info-text">AI tahlil amalga oshmadi: ' + e.message + '</div>';
  }
}

function goToFullAnalysis(ticker) {
  closeHalalDetail();
  currentMarket = 'stock';
  document.querySelectorAll('.market-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.market === 'stock'));
  document.getElementById('search-box').classList.remove('crypto-mode');
  document.getElementById('analyze-btn').classList.remove('crypto-mode');
  document.getElementById('analyze-btn').style.background = '';
  document.getElementById('analyze-btn').style.color = '';
  renderQuickPicks();
  document.getElementById('ticker-input').value = ticker;
  navigateTo('home');
  // Foydalanuvchi o'zi "Tahlil qilish" tugmasini bosadi
}

// ── Block B: Halol Mega Mode — Polygon orqali 10K+ aksiya ───────────────────
// ── Halol Mega Mode — Polygon orqali 10K+ aksiya ─────────────────────────────
let halalMode = 'static'; // 'static' yoki 'mega'
let halalMegaData = null;

// SIC code -> Sektor mapping (AAOIFI logic uchun)
const SIC_HARAM_KEYWORDS = {
  'BANK': { verdict: 'HARAM', grade: 'F', score: 12, haram_pct: 95, summary: 'Annaviy bank — foiz (riba) asosidagi faoliyat tufayli haram.', sector: 'Finance' },
  'INSURANCE': { verdict: 'SHUBHALI', grade: 'D', score: 38, haram_pct: 15, summary: 'Annaviy sugurta. Takaful emas — shubhali.', sector: 'Finance' },
  'TOBACCO': { verdict: 'HARAM', grade: 'F', score: 5, haram_pct: 100, summary: 'Tamaki — haram mahsulot.', sector: 'Consumer' },
  'CIGAR': { verdict: 'HARAM', grade: 'F', score: 5, haram_pct: 100, summary: 'Tamaki mahsulotlari — haram.', sector: 'Consumer' },
  'BREWER': { verdict: 'HARAM', grade: 'F', score: 5, haram_pct: 100, summary: 'Pivo ishlab chiqarish — haram.', sector: 'Consumer' },
  'WINE': { verdict: 'HARAM', grade: 'F', score: 5, haram_pct: 100, summary: 'Vino ishlab chiqarish — haram.', sector: 'Consumer' },
  'DISTILL': { verdict: 'HARAM', grade: 'F', score: 5, haram_pct: 100, summary: 'Spirtli ichimliklar — haram.', sector: 'Consumer' },
  'ALCOHOL': { verdict: 'HARAM', grade: 'F', score: 5, haram_pct: 100, summary: 'Alkogol — haram.', sector: 'Consumer' },
  'CASINO': { verdict: 'HARAM', grade: 'F', score: 5, haram_pct: 100, summary: 'Qimor — haram.', sector: 'Gambling' },
  'GAMBLING': { verdict: 'HARAM', grade: 'F', score: 5, haram_pct: 100, summary: 'Qimor — haram.', sector: 'Gambling' },
  'BETTING': { verdict: 'HARAM', grade: 'F', score: 5, haram_pct: 100, summary: 'Qimor — haram.', sector: 'Gambling' },
  'WEAPON': { verdict: 'HARAM', grade: 'F', score: 18, haram_pct: 90, summary: 'Qurol-yarogcha — harbiy, shubhali.', sector: 'Defense' },
  'AMMUNITION': { verdict: 'HARAM', grade: 'F', score: 18, haram_pct: 90, summary: 'O\'q-dorilar — harbiy.', sector: 'Defense' },
  'ARMS': { verdict: 'HARAM', grade: 'F', score: 18, haram_pct: 90, summary: 'Qurol-yarogcha sanoati.', sector: 'Defense' },
  'DEFENSE': { verdict: 'HARAM', grade: 'F', score: 18, haram_pct: 90, summary: 'Mudofaa — harbiy qurollar.', sector: 'Defense' },
  'CREDIT': { verdict: 'SHUBHALI', grade: 'D', score: 35, haram_pct: 30, summary: 'Kredit kompaniyasi — foizli faoliyat.', sector: 'Finance' },
  'LOAN': { verdict: 'HARAM', grade: 'F', score: 15, haram_pct: 90, summary: 'Foizli qarz beruvchi — riba.', sector: 'Finance' },
  'MORTGAGE': { verdict: 'HARAM', grade: 'F', score: 15, haram_pct: 90, summary: 'Annaviy ipoteka — riba.', sector: 'Finance' },
};

const SIC_HALAL_KEYWORDS = {
  'COMPUTER': 'Technology',
  'SOFTWARE': 'Technology',
  'SERVICES-COMPUTER': 'Technology',
  'SEMICONDUCTOR': 'Technology',
  'ELECTRONIC': 'Technology',
  'PHARMA': 'Healthcare',
  'BIOLOGICAL': 'Healthcare',
  'MEDICAL': 'Healthcare',
  'HEALTH': 'Healthcare',
  'PETROLEUM': 'Energy',
  'OIL': 'Energy',
  'GAS': 'Energy',
  'MINING': 'Materials',
  'METAL': 'Materials',
  'CHEMICAL': 'Materials',
  'CONSTRUCTION': 'Industrial',
  'MACHINERY': 'Industrial',
  'TRANSPORT': 'Industrial',
  'TELEPHONE': 'Telecom',
  'COMMUNICATION': 'Telecom',
  'RETAIL': 'Retail',
};

function classifyHalal(ticker, name, sicDescription) {
  const sic = (sicDescription || '').toUpperCase();
  const nameUp = (name || '').toUpperCase();

  // 1. Haram so'zlar (eng birinchi tekshirish)
  for (const kw in SIC_HARAM_KEYWORDS) {
    if (sic.includes(kw) || nameUp.includes(kw)) {
      const cfg = SIC_HARAM_KEYWORDS[kw];
      return {
        ticker, company: name || ticker, sector: cfg.sector,
        verdict: cfg.verdict, grade: cfg.grade, score: cfg.score,
        haram_revenue_pct: cfg.haram_pct, interest_debt_pct: 50,
        summary: cfg.summary,
      };
    }
  }

  // 2. Halol sektorlar
  let sector = 'Other';
  for (const kw in SIC_HALAL_KEYWORDS) {
    if (sic.includes(kw)) { sector = SIC_HALAL_KEYWORDS[kw]; break; }
  }

  // 3. Default — halol (texnologiya, sanoat va h.k.)
  return {
    ticker, company: name || ticker, sector,
    verdict: 'HALOL', grade: 'B', score: 75,
    haram_revenue_pct: 1.0, interest_debt_pct: 18,
    summary: `${sector} sektoridagi kompaniya. Asosiy biznes halol bo'lishi ehtimoli yuqori. Aniq tekshirish uchun individual tahlil qiling.`,
  };
}

async function loadHalalMegaData() {
  const el = document.getElementById('halal-batch-result');
  el.innerHTML = '<div class="info-text">Polygon dan aksiyalar yuklanmoqda...</div>';

  try {
    // Yechim: Grouped Daily Bars — 1 requestda barcha aksiyalar narxi
    // + reference/tickers faqat 1 marta (sektor/nom uchun)
    function daysAgoStr(n) {
      const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0];
    }

    const [barsRes, refRes] = await Promise.all([
      fetch(`${PROXY_URL}/polygon/v2/aggs/grouped/locale/us/market/stocks/${daysAgoStr(2)}?adjusted=true`),
      fetch(`${PROXY_URL}/polygon/v3/reference/tickers?market=stocks&active=true&type=CS&limit=1000`),
    ]);

    if (!barsRes.ok) throw new Error('Polygon ' + barsRes.status);
    const barsData = await barsRes.json();
    let bars = barsData.results || [];

    // Backup — dam olish kuni
    if (!bars.length) {
      const res2 = await fetch(`${PROXY_URL}/polygon/v2/aggs/grouped/locale/us/market/stocks/${daysAgoStr(5)}?adjusted=true`);
      const d2 = await res2.json();
      bars = d2.results || [];
    }

    // Reference ma'lumotlar (nom, sektor) — 1000 ta
    const refMap = {};
    if (refRes.ok) {
      const refData = await refRes.json();
      (refData.results || []).forEach(r => {
        refMap[r.ticker] = { name: r.name, sic: r.sic_description };
      });
    }

    el.innerHTML = `<div class="info-text">${bars.length} ta aksiya tahlil qilinmoqda...</div>`;

    // AAOIFI logic — har biriga
    const allTickers = bars.map(b => ({
      ticker: b.T,
      name: refMap[b.T]?.name || b.T,
      sic_description: refMap[b.T]?.sic || '',
    }));

    halalMegaData = allTickers.map(t =>
      classifyHalal(t.ticker, t.name, t.sic_description)
    );

    // Add static data — ular aniqroq, ustun keladi
    const staticTickers = new Set(HALAL_STATIC.map(s => s.ticker));
    halalMegaData = halalMegaData.filter(m => !staticTickers.has(m.ticker));
    halalMegaData = [...HALAL_STATIC, ...halalMegaData];

    // halalBatchResults ni yangilash
    halalBatchResults = halalMegaData.map(s => ({
      ...s,
      purification_pct: s.haram_revenue_pct || 0,
      criteria: [
        {name:'Biznes faoliyati',     status: (s.haram_revenue_pct||0) < 5 && s.verdict !== 'HARAM' ? 'pass' : 'fail', detail: s.summary},
        {name:'Haram daromad ulushi', status: (s.haram_revenue_pct||0) < 5 ? 'pass' : (s.haram_revenue_pct||0) < 10 ? 'warn' : 'fail', detail: `Haram: ${s.haram_revenue_pct||0}%`},
        {name:'Qarz nisbati (Riba)',  status: (s.interest_debt_pct||0) < 30 ? 'pass' : (s.interest_debt_pct||0) < 50 ? 'warn' : 'fail', detail: `Foizli qarz: ${s.interest_debt_pct||0}%`},
      ],
      source_note: 'Polygon.io kompaniya ma\'lumoti + AAOIFI logika'
    }));

    renderHalalBatch(document.getElementById('halal-filter')?.value || '');

  } catch(e) {
    el.innerHTML = '<div class="info-text">Xato: ' + e.message + '</div>';
  }
}
