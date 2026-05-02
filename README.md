# StockSage

Bozor sizga tushunarli tilda. O'zbek tilidagi moliya bozori tahlil platformasi —
aksiyalar, kripto va fyuchers (ETFlar) bo'yicha real-time narx, texnik
indikatorlar va Claude AI tomonidan yaratilgan tushuntirishlar.

Ilova **vanilla JS** bilan yozilgan — build tool, npm package, framework yo'q.
Brauzer'da to'g'ridan-to'g'ri ishga tushadi.

---

## Stack

- **Frontend:** HTML + CSS + 9 ta plain `<script>` JS modul (ES modules emas,
  global scope orqali bog'lanadi)
- **API qatlami:** [Cloudflare Worker proxy](https://holy-lake-7c5dstocksage-proxy.azamismoilov96.workers.dev) — barcha
  tashqi API kalitlari worker'da
- **Data manbalari (proxy orqali):**
  - Polygon.io (10K+ NYSE/NASDAQ aksiya, real-time)
  - Finnhub (analyst ratings, short interest, institutional, dividend, earnings, congressional trading)
  - CoinGecko (kripto data)
  - Binance (kripto ticker)
  - Quiver Quantitative (congress trading)
  - Anthropic Claude API (`claude-sonnet-4-20250514` + web_search tool)
- **Persistence:** Faqat `localStorage` (watchlist, narx ogohlantirishlari, oxirgi sahifa)

---

## Loyiha tuzilishi

```
stocksage/
├── index.html          # Skeleton + 9 ta <script src> (~756 qator)
├── css/
│   └── main.css        # Barcha stillar (~3 614 qator)
└── js/
    ├── utils.js        # PROXY_URL + formatter va DOM helper'lar
    ├── technical.js    # 11 ta texnik indikator (RSI, MACD, BB, ATR, ...)
    ├── api.js          # Cloudflare proxy fetch'lari (Polygon, Finnhub, ...)
    ├── halal.js        # AAOIFI screening + Mega Mode (Polygon 10K+)
    ├── pump.js         # Pump Signal sahifasi (kripto + aksiyalar)
    ├── screener.js     # S&P 500 + Mega Screener
    ├── gdp-panel.js    # Cross-page ticker detail modal
    ├── pages.js        # 10 ta sahifa logikasi (MarketBeat, Calendar, ...)
    └── main.js         # Orkestratsiya: analyze, watchlist, alerts, navigation
```

### Modul javobgarliklari

| Modul | Mas'uliyat | Asosiy eksportlar |
|-------|-----------|-------------------|
| `utils.js` | Konfiguratsiya va helper'lar | `PROXY_URL`, `formatPrice`, `formatBigNumber`, `escapeHtml`, `safeParseJSON`, `showToast`, `showError`/`hideError` |
| `technical.js` | Texnik tahlil | `computeTechnicalSignals`, `calculateRSI/SMA/EMA/MACD`, `calculateBollingerBands`, `calculateATR`, `computeEntryPoints`, `detectCandlePatterns`*, `computeConfluenceScore`*, `fetchMultiTimeframeTrend`* |
| `api.js` | Tashqi data fetch'lari | `fetchFastData` (router), `fetchPolygonStock`, `fetchFastCrypto`, `fetchFinnhubStock`, `fetchClaudeStock`, `fetchAIExplanation`, `CGIDS` |
| `halal.js` | AAOIFI halol skrining | `initHalalPage`, `getHalalAnalysis`, `loadHalalMegaData`, `classifyHalal`, `HALAL_STATIC` katalog |
| `pump.js` | Pump signal | `initPumpPage`, `loadPumpCrypto`, `loadPumpStocks`, `getStockPumpExplanation` |
| `screener.js` | Aksiya skrini | `runScreener`, `applyFilters`, `loadMegaData`, `applyMegaFilters`, `filterScreenerBySector` |
| `gdp-panel.js` | Universal ticker modal | `showTickerPanel`, `closeTickerPanel`, `loadGdpData`, `loadGdpAI`, `loadGdpHalal` |
| `pages.js` | Sahifa init/render | 45+ funksiya 10 ta bo'limda (A: MarketBeat, B: Calendar, C: Congress, D: Lists, E: Futures, F: Pulse/Sanalar, G: Global Stats, H: Crypto Market, I: Heat Map, J: Insider) |
| `main.js` | Orkestratsiya | `analyze`, `renderResults`, `navigateTo`, `initNav`, watchlist/alerts mantig'i, bootstrap |

\* Hozirda yetim — kelajakdagi bosqichda `renderMBTechnical` bilan ulanadi.

### Yuklanish tartibi (muhim)

`index.html` da skript taglari **aniq tartibda** yuklanishi kerak — har bir
modul oldingilarning global'larini ishlatadi:

```html
<script src="js/utils.js"></script>      <!-- 1. PROXY_URL, format helpers -->
<script src="js/technical.js"></script>  <!-- 2. ← utils -->
<script src="js/api.js"></script>        <!-- 3. ← utils, technical -->
<script src="js/halal.js"></script>      <!-- 4. ← utils -->
<script src="js/pump.js"></script>       <!-- 5. ← utils -->
<script src="js/screener.js"></script>   <!-- 6. ← utils -->
<script src="js/gdp-panel.js"></script>  <!-- 7. ← utils, halal -->
<script src="js/pages.js"></script>      <!-- 8. ← utils, screener -->
<script src="js/main.js"></script>       <!-- 9. ← hammasi -->
```

ES module emas — barcha skriptlar global scope baham ko'radi. `<script>` tag'lari
sinxron yuklanadi va parse'dan oldin oldingisi to'liq bajariladi, shuning
uchun bog'liqliklar avtomatik resolve qilinadi.

---

## Lokal ishga tushirish

```sh
# Repo'ni klon qilish
git clone https://github.com/azamjonismoilov/stocksage.git
cd stocksage

# Lokal HTTP server (Python 3 kerak)
python3 -m http.server 8000

# Brauzer'da: http://localhost:8000/
```

`file://` protokolida ham ochiladi, lekin `localhost` orqali ochish ko'proq
real-world senariyga mos.

---

## Asosiy oqim

```
User input (NVDA)
    ↓
analyze()  (main.js)
    ↓ parallel
    ├─ fetchFastData()           (api.js — Polygon → Finnhub → Claude fallback)
    │     └─ computeTechnicalSignals()  (technical.js — RSI, MACD, BB, ATR, entry)
    │           └─ patchSkeletonPrice() (main.js — UI update)
    └─ fetchAIExplanation()       (api.js — Claude API + web_search)
    ↓
renderResults()  (main.js — to'liq UI render)
    ↓
loadMarketBeatPanels()  (pages.js — analyst, short, dividend, earnings)
```

---

## Sahifalar (8 ta asosiy)

1. **Tahlil** (`home`) — Ticker tahlili (asosiy oqim)
2. **Screener** — 10K+ aksiya filtri (Polygon Grouped Daily Bars)
3. **Bozor Pulsi** — Calendar, Congress, Lists, Heat Map sub-tablar
4. **Kripto** — Crypto market overview (Trending, Gainers/Losers, New listings)
5. **Fyuchers** — Commodities, Forex, Bonds, Indices
6. **Pump Signal** — Yuqori volatillik signallari
7. **Halol** — AAOIFI skrining (155+ statik ticker + Mega Mode)
8. **Sanalar** — Earnings/Dividend/IPO/Pre-Market kalendar

---

## Cloudflare Worker proxy

Loyiha to'g'ridan-to'g'ri tashqi API'larga emas, balki o'zining Cloudflare
Worker'iga so'rov yuboradi. Worker `/polygon/*`, `/api/*` (Finnhub),
`/cg/*` (CoinGecko), `/binance/*`, `/quiver/*`, `/claude` route'larini
front qiladi va kerakli API kalitlarini qo'shadi.

API kalitlar **frontend'da yo'q**. CORS'siz client'dan to'g'ridan-to'g'ri
chaqirish ham mumkin emas — proxy talab qilinadi.

---

## Refactor tarixi

Loyiha 2026-05-03'da bitta 9 746-qatorli `index.html` dan modular tuzilishga
ko'chirilgan. Refactor 11 bosqichda bajarilgan, har birida brauzer testi.
Pre-refactor versiya `f37176b` commit'ida saqlangan.

```sh
# Pre-refactor index.html ko'rish:
git show f37176b:index.html | head
```

---

## Litsenziya

Shaxsiy/o'quv loyihasi.
