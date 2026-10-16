const COINS = [
  { id: 'swordcat', name: 'SWORDCAT', sub: 'cat wif sword', emoji: '⚔️', ca: '5tCju6YNxHq5zrA6tGndr6F7TK42mpUFmeE31cSFpump', supply: 960_000_000, live: true, startPrice: 0.0034, cgId: null },
  { id: 'bonk', name: 'BONK', sub: 'the first dog coin on Solana', emoji: '🐕', ca: null, supply: 88_000_000_000_000, live: true, startPrice: 0.000022, cgId: 'bonk' },
  { id: 'wif', name: 'WIF', sub: 'dogwifhat', emoji: '🎩', ca: null, supply: 998_000_000, live: true, startPrice: 1.85, cgId: 'dogwifcoin' },
  { id: 'popcat', name: 'POPCAT', sub: 'popcat the cat', emoji: '😺', ca: null, supply: 980_000_000, live: true, startPrice: 0.85, cgId: 'popcat' },
  { id: 'mew', name: 'MEW', sub: 'cat in a dogs world', emoji: '🐱', ca: null, supply: 88_000_000_000, live: true, startPrice: 0.0045, cgId: 'cat-in-a-dogs-world' },
  { id: 'pepe', name: 'PEPE', sub: 'pepe the frog', emoji: '🐸', ca: null, supply: 420_690_000_000_000, live: true, startPrice: 0.0000095, cgId: 'pepe' },
  { id: 'mog', name: 'MOG', sub: 'mog coin', emoji: '🗿', ca: null, supply: 390_000_000_000_000, live: true, startPrice: 0.0000012, cgId: 'mog-coin' },
  { id: 'fartcoin', name: 'FARTCOIN', sub: 'fartcoin', emoji: '💨', ca: null, supply: 1_000_000_000, live: true, startPrice: 0.65, cgId: 'fartcoin' }
];
let currentCoin = COINS[0];
let livePriceCache = {};
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
let W, H;
function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); W = rect.width; H = rect.height;
}
window.addEventListener('resize', () => { resize(); drawChart(); });
resize();
let running = false, prices = [], currentPrice = 0.0034, startPrice = 0.0034;
let tradeAmount = 1000, tokens = 0, phase = 'idle', tick = 0, animId = null, simStartTime = 0;
const TOTAL_MS = 20000, PHASE_MS = 5000, TICK_MS = 40;
let tradeHistory = [];
let lastPrediction = null;
let plannedPath = null;
let tradeSettled = false;
const SOLANA_DEPOSIT_ADDRESS = '44vABSx14hrUmkAoV5PwxJeMrNwCHBzrn6RrYx5W4tg2';
const API = '';
let authToken = null;
let cachedUser = null;
let cachedBalance = 0;
function getToken() { try { return localStorage.getItem('mps_token') || null; } catch (e) { return null; } }
function setToken(t) {
  authToken = t;
  try { if (t) localStorage.setItem('mps_token', t); else localStorage.removeItem('mps_token'); } catch (e) {}
}
async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  const tok = authToken || getToken();
  if (tok) headers.Authorization = 'Bearer ' + tok;
  const res = await fetch(API + path, Object.assign({}, opts, { headers }));
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error(data.error || ('Request failed ' + res.status));
    err.status = res.status; err.data = data; throw err;
  }
  return data;
}
function formatPrice(p) {
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return '$' + p.toFixed(4);
  if (p >= 0.01) return '$' + p.toFixed(5);
  if (p >= 0.0001) return '$' + p.toFixed(6);
  if (p >= 0.000001) return '$' + p.toFixed(8);
  return '$' + p.toExponential(3);
}
function formatMcap(m) {
  if (m >= 1e12) return '$' + (m / 1e12).toFixed(2) + 'T';
  if (m >= 1e9) return '$' + (m / 1e9).toFixed(2) + 'B';
  if (m >= 1e6) return '$' + (m / 1e6).toFixed(2) + 'M';
  if (m >= 1e3) return '$' + (m / 1e3).toFixed(1) + 'K';
  return '$' + m.toFixed(0);
}
function formatMoney(v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatPct(p) { return (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p).toFixed(2) + '%'; }
function getBasePrice() {
  const custom = parseFloat(document.getElementById('customPrice').value);
  if (custom > 0) return custom;
  return livePriceCache[currentCoin.id] || currentCoin.startPrice;
}
function showPage(name) {
  if (name !== 'auth' && name !== 'home' && !currentUser()) {
    name = 'auth';
    setTimeout(() => {
      const msg = document.getElementById('authMsg');
      if (msg) { msg.textContent = 'Sign in or create an account to continue.'; msg.className = 'auth-msg err'; }
    }, 0);
  }
  const pages = ['home', 'trade', 'bot', 'wallet', 'tx', 'auth'];
  pages.forEach(p => {
    const el = document.getElementById('page' + p.charAt(0).toUpperCase() + p.slice(1));
    if (el) el.classList.toggle('active', name === p);
    const tab = document.getElementById('tab' + p.charAt(0).toUpperCase() + p.slice(1));
    if (tab) tab.classList.toggle('active', name === p);
  });
  if (name === 'bot') {
    document.getElementById('botCoinName').textContent = currentCoin.name;
    renderCoinRecord(); renderTradeRecord();
    if (!lastPrediction || lastPrediction.coinId !== currentCoin.id) runBotAnalysis();
  }
  if (name === 'wallet') refreshWalletUI();
  if (name === 'tx') renderTxPage();
  if (name === 'auth') refreshAuthUI();
  closeSidebar();
}
function currentUser() { return cachedUser; }
function isAdmin(u) { return !!(u && (u.is_admin || u.isAdmin)); }
function getBalance() { return cachedBalance; }
function setBalanceLocal(n) { cachedBalance = Math.max(0, Number(n) || 0); }
async function refreshBalanceFromServer() {
  if (!getToken() && !authToken) { cachedBalance = 0; return 0; }
  try {
    const data = await api('/api/wallet');
    cachedBalance = Number(data.balance) || 0;
    if (cachedUser) { cachedUser.balance = cachedBalance; cachedUser.is_admin = !!data.is_admin; }
    return cachedBalance;
  } catch (e) {
    if (e.status === 401) { setToken(null); cachedUser = null; cachedBalance = 0; }
    return cachedBalance;
  }
}
async function renderTxPage() {
  const el = document.getElementById('txList');
  if (!el) return;
  if (!currentUser()) { el.innerHTML = '<div class="empty-msg">Log in to see transactions.</div>'; return; }
  el.innerHTML = '<div class="empty-msg">Loading…</div>';
  try {
    const data = await api('/api/transactions');
    const items = (data.transactions || []).map(t => ({ at: t.at, kind: t.kind, label: t.label, amount: t.amount, meta: t.meta || '' }));
    items.sort((a, b) => new Date(b.at) - new Date(a.at));
    if (!items.length) { el.innerHTML = '<div class="empty-msg">No transactions yet.</div>'; return; }
    el.innerHTML = items.slice(0, 50).map(t => {
      const cls = (t.kind === 'deposit' || (t.kind === 'trade' && t.amount >= 0)) ? 'green' : ((t.kind === 'withdraw' || t.kind === 'swap' || (t.kind === 'trade' && t.amount < 0)) ? 'red' : '');
      const sign = t.amount >= 0 && t.kind !== 'swap' ? '+' : '';
      const amtStr = t.kind === 'swap' ? formatMoney(Math.abs(t.amount)) : (sign + formatMoney(t.amount));
      const emoji = t.kind === 'deposit' ? '⬇️' : t.kind === 'withdraw' ? '⬆️' : t.kind === 'swap' ? '🔄' : '📈';
      return '<div class="record-row"><div class="emoji">' + emoji + '</div><div class="name">' + t.label +
        '<div class="meta">' + new Date(t.at).toLocaleString() + (t.meta ? ' · ' + t.meta : '') + '</div></div>' +
        '<div class="right ' + cls + '">' + amtStr + '</div></div>';
    }).join('');
    if (data.trades && data.trades.length) {
      tradeHistory = data.trades.map(t => ({ coin: t.coin, emoji: t.emoji, amount: t.amount, startPrice: t.startPrice, endPrice: t.endPrice, mult: t.mult, pnl: t.pnl, at: new Date(t.at).getTime() }));
      renderTradeRecord();
    }
  } catch (e) {
    el.innerHTML = '<div class="empty-msg">' + (e.message || 'Failed to load') + '</div>';
  }
}
function clearTxHistory() { alert('History is stored on the server and cannot be cleared from the app.'); }
let authMode = 'login';
function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('authTabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('authTabSignup').classList.toggle('active', mode === 'signup');
  document.getElementById('signupNameGroup').style.display = mode === 'signup' ? 'flex' : 'none';
  const extra = document.getElementById('signupExtra');
  if (extra) extra.classList.toggle('show', mode === 'signup');
  document.getElementById('authTitle').textContent = mode === 'login' ? 'Log in' : 'Sign up';
  document.getElementById('authSub').textContent = mode === 'login' ? 'Access your wallet and trade history' : 'Create your Meme Pump account';
  document.getElementById('authSubmitBtn').textContent = mode === 'login' ? 'Log in' : 'Create account';
  document.getElementById('authMsg').textContent = '';
  document.getElementById('authMsg').className = 'auth-msg';
  const pw = document.getElementById('authPassword');
  if (pw) pw.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
}
function togglePassword(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  if (el.type === 'password') { el.type = 'text'; btn.textContent = 'Hide'; }
  else { el.type = 'password'; btn.textContent = 'Show'; }
}
function refreshAuthUI() {
  const u = currentUser();
  const forms = document.getElementById('authForms');
  const logged = document.getElementById('authLogged');
  if (u) {
    document.getElementById('authTitle').textContent = 'Account';
    document.getElementById('authSub').textContent = 'You are signed in';
    forms.classList.remove('show'); logged.classList.add('show');
    document.getElementById('authWhoName').textContent = u.name || u.email.split('@')[0];
    document.getElementById('authWhoEmail').textContent = u.email;
  } else {
    document.getElementById('authTitle').textContent = authMode === 'login' ? 'Log in' : 'Sign up';
    forms.classList.add('show'); logged.classList.remove('show');
    setAuthMode(authMode);
  }
}
async function submitAuth() {
  const email = (document.getElementById('authEmail').value || '').trim().toLowerCase();
  const password = document.getElementById('authPassword').value || '';
  const msg = document.getElementById('authMsg');
  if (!email || !password) { msg.textContent = 'Email and password required.'; msg.className = 'auth-msg err'; return; }
  if (password.length < 4) { msg.textContent = 'Password must be at least 4 characters.'; msg.className = 'auth-msg err'; return; }
  msg.textContent = 'Please wait…'; msg.className = 'auth-msg';
  try {
    if (authMode === 'signup') {
      const confirm = (document.getElementById('authPassword2') || {}).value || '';
      if (confirm !== password) { msg.textContent = 'Passwords do not match.'; msg.className = 'auth-msg err'; return; }
      const name = (document.getElementById('authName').value || '').trim() || email.split('@')[0];
      const payload = {
        email, password, confirm_password: confirm, name,
        country: (document.getElementById('authCountry') || {}).value || '',
        phone: (document.getElementById('authPhone') || {}).value || '',
        dob: (document.getElementById('authDob') || {}).value || '',
        address: (document.getElementById('authAddress') || {}).value || '',
        city: (document.getElementById('authCity') || {}).value || '',
        postal_code: (document.getElementById('authPostal') || {}).value || ''
      };
      const data = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
      setToken(data.token);
      cachedUser = data.user;
      cachedBalance = Number(data.user.balance) || 0;
      msg.textContent = 'Account created.'; msg.className = 'auth-msg ok';
    } else {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setToken(data.token);
      cachedUser = data.user;
      cachedBalance = Number(data.user.balance) || 0;
      msg.textContent = 'Welcome back, ' + (data.user.name || email) + '.'; msg.className = 'auth-msg ok';
    }
    refreshAuthUI(); refreshWalletUI(); showPage('trade');
  } catch (e) {
    msg.textContent = e.message || 'Auth failed'; msg.className = 'auth-msg err';
  }
}
function logoutUser() {
  setToken(null); cachedUser = null; cachedBalance = 0;
  refreshAuthUI(); refreshWalletUI(); showPage('home');
  const msg = document.getElementById('authMsg');
  if (msg) { msg.textContent = 'Logged out.'; msg.className = 'auth-msg'; }
}
async function refreshWalletUI() {
  const addr = document.getElementById('depositAddress');
  if (addr) addr.value = SOLANA_DEPOSIT_ADDRESS;
  if (currentUser()) { try { await refreshBalanceFromServer(); } catch (e) {} }
  const bal = document.getElementById('walletBalance');
  if (bal) bal.textContent = formatMoney(getBalance());
  const u = currentUser();
  const adminGroup = document.getElementById('adminDepositGroup');
  const depositBtn = document.getElementById('depositBtn');
  if (adminGroup) adminGroup.style.display = isAdmin(u) ? 'flex' : 'none';
  if (depositBtn) {
    depositBtn.textContent = isAdmin(u) ? 'Confirm deposit' : 'Waiting for on-chain deposit';
    depositBtn.disabled = !isAdmin(u);
  }
  const sel = document.getElementById('swapCoin');
  if (sel && !sel.options.length) {
    COINS.forEach(c => { const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.emoji + ' ' + c.name; sel.appendChild(opt); });
  }
  drawDepositQR();
}
function drawDepositQR() {
  const canvas = document.getElementById('qrCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = 160, addr = SOLANA_DEPOSIT_ADDRESS;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() { ctx.fillStyle = '#fff'; ctx.fillRect(0,0,size,size); ctx.drawImage(img,0,0,size,size); };
  img.onerror = function() {
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,size,size);
    const modules = 25, cell = Math.floor(size/modules), pad = Math.floor((size-cell*modules)/2);
    function hash(i,j) { let h=0; const s=addr+':'+i+','+j; for(let k=0;k<s.length;k++) h=((h<<5)-h+s.charCodeAt(k))|0; return Math.abs(h)%3!==0; }
    ctx.fillStyle = '#000';
    for (let i=0;i<modules;i++) for (let j=0;j<modules;j++) {
      const finder = (i<7&&j<7)||(i<7&&j>=modules-7)||(i>=modules-7&&j<7);
      if (finder) { const edge=i===0||i===6||j===0||j===6||(i>=2&&i<=4&&j>=2&&j<=4); if(edge) ctx.fillRect(pad+j*cell,pad+i*cell,cell,cell); }
      else if (hash(i,j)) ctx.fillRect(pad+j*cell,pad+i*cell,cell,cell);
    }
  };
  img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent(addr);
}
function flashWalletMsg(el, text, ok) {
  if (!el) return;
  el.textContent = text || '';
  el.className = 'wallet-msg' + (text ? (ok ? ' ok' : ' err') : '');
  if (el._flashTimer) clearTimeout(el._flashTimer);
  if (!text) return;
  const ms = ok ? 1200 : 4000;
  el._flashTimer = setTimeout(function () {
    el.textContent = '';
    el.className = 'wallet-msg';
  }, ms);
}
function copyDepositAddress() {
  const msg = document.getElementById('depositMsg');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(SOLANA_DEPOSIT_ADDRESS).then(() => { flashWalletMsg(msg, 'Address copied.', true); }).catch(() => { flashWalletMsg(msg, 'Copy failed.', false); });
  } else {
    document.getElementById('depositAddress').select();
    try { document.execCommand('copy'); flashWalletMsg(msg, 'Address copied.', true); } catch(e) { flashWalletMsg(msg, 'Copy failed.', false); }
  }
}
async function confirmDeposit() {
  const msg = document.getElementById('depositMsg');
  if (!currentUser()) { flashWalletMsg(msg, 'Log in first.', false); showPage('auth'); return; }
  const amt = parseFloat(document.getElementById('depositAmount').value);
  if (!(amt > 0)) { flashWalletMsg(msg, 'Enter a valid amount.', false); return; }
  flashWalletMsg(msg, 'Processing…', true);
  try {
    const data = await api('/api/wallet', { method: 'POST', body: JSON.stringify({ action: 'deposit', amount: amt }) });
    setBalanceLocal(data.balance);
    document.getElementById('depositAmount').value = '';
    flashWalletMsg(msg, data.message || 'Deposit completed.', true);
    refreshWalletUI();
  } catch (e) { flashWalletMsg(msg, e.message || 'Deposit failed', false); }
}
async function doSwap() {
  const msg = document.getElementById('swapMsg');
  if (!currentUser()) { flashWalletMsg(msg, 'Log in first.', false); showPage('auth'); return; }
  const amt = parseFloat(document.getElementById('swapAmount').value);
  if (!(amt > 0)) { flashWalletMsg(msg, 'Enter a valid amount.', false); return; }
  const coinId = document.getElementById('swapCoin').value;
  const coin = COINS.find(c => c.id === coinId) || COINS[0];
  flashWalletMsg(msg, 'Processing…', true);
  try {
    const data = await api('/api/wallet', { method: 'POST', body: JSON.stringify({ action: 'swap', amount: amt, coin: coin.name }) });
    setBalanceLocal(data.balance);
    document.getElementById('amount').value = Math.round(amt);
    selectCoin(coin);
    flashWalletMsg(msg, data.message || ('Swapped → ' + coin.name), true);
    refreshWalletUI();
    setTimeout(() => showPage('trade'), 600);
  } catch (e) { flashWalletMsg(msg, e.message || 'Swap failed', false); }
}
async function requestWithdraw() {
  const msg = document.getElementById('withdrawMsg');
  if (!currentUser()) { flashWalletMsg(msg, 'Log in first.', false); showPage('auth'); return; }
  const to = (document.getElementById('withdrawAddress').value || '').trim();
  const amt = parseFloat(document.getElementById('withdrawAmount').value);
  flashWalletMsg(msg, 'Processing…', true);
  try {
    const data = await api('/api/wallet', { method: 'POST', body: JSON.stringify({ action: 'withdraw', amount: amt, address: to }) });
    setBalanceLocal(data.balance);
    document.getElementById('withdrawAmount').value = '';
    flashWalletMsg(msg, data.message || 'Withdraw submitted.', true);
    refreshWalletUI();
  } catch (e) { flashWalletMsg(msg, e.message || 'Withdraw failed', false); }
}
