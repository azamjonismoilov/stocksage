// ============================================================================
// StockSage utils — proxy URL + formatters + DOM helpers
// Loaded as a plain <script>; relies on shared global scope.
// ============================================================================

const PROXY_URL = 'https://holy-lake-7c5dstocksage-proxy.azamismoilov96.workers.dev';

// ── Date helpers ──────────────────────────────────────────────────────────────
function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// ── JSON ──────────────────────────────────────────────────────────────────────
function safeParseJSON(text) {
  let s = text.trim().replace(/^```json\s*/i,"").replace(/^```\s*/,"").replace(/```\s*$/,"");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b !== -1) s = s.substring(a, b + 1);
  try { return JSON.parse(s); } catch(e) {
    console.error("JSON parse fail:", e, "raw:", text);
    return {};
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────
function formatPrice(p) {
  if (p == null || isNaN(p)) return '0';
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  if (p >= 0.0001) return p.toFixed(6);
  return p.toFixed(8);
}

function formatBigNumber(n) {
  if (n == null || isNaN(n)) return 'N/A';
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
  return '$' + n.toFixed(2);
}

function timeAgo(unix) {
  const seconds = Math.floor(Date.now() / 1000) - unix;
  if (seconds < 60) return 'hozir';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' daq';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' soat';
  return Math.floor(seconds / 86400) + ' kun';
}

// ── HTML escaping ─────────────────────────────────────────────────────────────
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Markdown-lite render (uses escapeHtml — declared above) ──────────────────
function formatExplanation(text) {
  if (!text) return '';
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p>${p}</p>`)
    .join('');
}

// ── Error UI ──────────────────────────────────────────────────────────────────
function showError(msg) {
  const box = document.getElementById('error-box');
  box.textContent = msg;
  box.classList.add('active');
}

function hideError() {
  document.getElementById('error-box').classList.remove('active');
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(html, type = 'default') {
  let toast = document.getElementById('ss-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ss-toast';
    document.body.appendChild(toast);
  }
  toast.className = 'toast' + (type === 'alert' ? ' alert-toast' : '');
  toast.innerHTML = html;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.remove(); }, 3500);
}
