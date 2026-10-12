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
function copyDepositAddress() {
  const msg = document.getElementById('depositMsg');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(SOLANA_DEPOSIT_ADDRESS).then(() => { msg.textContent = 'Address copied.'; msg.className = 'wallet-msg ok'; }).catch(() => { msg.textContent = 'Copy failed.'; msg.className = 'wallet-msg err'; });
  } else {
    document.getElementById('depositAddress').select();
    try { document.execCommand('copy'); msg.textContent = 'Address copied.'; msg.className = 'wallet-msg ok'; } catch(e) { msg.textContent = 'Copy failed.'; msg.className = 'wallet-msg err'; }
  }
}
async function confirmDeposit() {
  const msg = document.getElementById('depositMsg');
  if (!currentUser()) { msg.textContent = 'Log in first.'; msg.className = 'wallet-msg err'; showPage('auth'); return; }
  const amt = parseFloat(document.getElementById('depositAmount').value);
  if (!(amt > 0)) { msg.textContent = 'Enter a valid amount.'; msg.className = 'wallet-msg err'; return; }
  msg.textContent = 'Processing…'; msg.className = 'wallet-msg';
  try {
    const data = await api('/api/wallet', { method: 'POST', body: JSON.stringify({ action: 'deposit', amount: amt }) });
    setBalanceLocal(data.balance);
    document.getElementById('depositAmount').value = '';
    msg.textContent = data.message || 'Deposit credited.'; msg.className = 'wallet-msg ok';
    refreshWalletUI();
  } catch (e) { msg.textContent = e.message || 'Deposit failed'; msg.className = 'wallet-msg err'; }
}
async function doSwap() {
  const msg = document.getElementById('swapMsg');
  if (!currentUser()) { msg.textContent = 'Log in first.'; msg.className = 'wallet-msg err'; showPage('auth'); return; }
  const amt = parseFloat(document.getElementById('swapAmount').value);
  if (!(amt > 0)) { msg.textContent = 'Enter a valid amount.'; msg.className = 'wallet-msg err'; return; }
  const coinId = document.getElementById('swapCoin').value;
  const coin = COINS.find(c => c.id === coinId) || COINS[0];
  msg.textContent = 'Processing…'; msg.className = 'wallet-msg';
  try {
    const data = await api('/api/wallet', { method: 'POST', body: JSON.stringify({ action: 'swap', amount: amt, coin: coin.name }) });
    setBalanceLocal(data.balance);
    document.getElementById('amount').value = Math.round(amt);
    selectCoin(coin);
    msg.textContent = data.message || ('Swapped → ' + coin.name); msg.className = 'wallet-msg ok';
    refreshWalletUI();
    setTimeout(() => showPage('trade'), 600);
  } catch (e) { msg.textContent = e.message || 'Swap failed'; msg.className = 'wallet-msg err'; }
}
async function requestWithdraw() {
  const msg = document.getElementById('withdrawMsg');
  if (!currentUser()) { msg.textContent = 'Log in first.'; msg.className = 'wallet-msg err'; showPage('auth'); return; }
  const to = (document.getElementById('withdrawAddress').value || '').trim();
  const amt = parseFloat(document.getElementById('withdrawAmount').value);
  msg.textContent = 'Processing…'; msg.className = 'wallet-msg';
  try {
    const data = await api('/api/wallet', { method: 'POST', body: JSON.stringify({ action: 'withdraw', amount: amt, address: to }) });
    setBalanceLocal(data.balance);
    document.getElementById('withdrawAmount').value = '';
    msg.textContent = data.message || 'Withdraw requested.'; msg.className = 'wallet-msg ok';
    refreshWalletUI();
  } catch (e) { msg.textContent = e.message || 'Withdraw failed'; msg.className = 'wallet-msg err'; }
}
function generatePath(base) {
  const maxTicks = Math.ceil(TOTAL_MS / TICK_MS);
  const path = [base]; let p = base;
  for (let i = 1; i <= maxTicks; i++) {
    const elapsed = i * TICK_MS;
    if (elapsed < PHASE_MS * 2) {
      const vol = p * (0.018 + Math.random() * 0.022);
      p += (Math.random() - 0.42) * vol * 2;
      p = Math.max(base * 0.25, p);
      if (Math.random() < 0.08) p *= (Math.random() < 0.5 ? 0.96 + Math.random()*0.03 : 1.02 + Math.random()*0.04);
    } else if (elapsed < PHASE_MS * 3) {
      p += p * (0.006 + Math.random() * 0.008);
      p += (Math.random() - 0.45) * p * 0.006;
    } else {
      p += p * (0.002 + Math.random() * 0.0035);
      p += (Math.random() - 0.48) * p * 0.002;
    }
    if (p < base * 0.2) p = base * 0.2;
    path.push(p);
  }
  return { coinId: currentCoin.id, base, prices: path, endPrice: path[path.length-1], mult: path[path.length-1]/base };
}
function suggestedAmount(mult) {
  const min = 100, max = 1000000;
  const r = Math.random();
  let raw;
  if (r < 0.45) raw = min + Math.random() * 4900;
  else if (r < 0.75) raw = 5000 + Math.random() * 45000;
  else if (r < 0.92) raw = 50000 + Math.random() * 200000;
  else raw = 250000 + Math.random() * 750000;
  raw = raw * (0.85 + Math.min(mult, 20) * 0.02);
  raw = Math.max(min, Math.min(max, raw));
  if (raw < 1000) return Math.round(raw / 10) * 10;
  if (raw < 10000) return Math.round(raw / 50) * 50;
  if (raw < 100000) return Math.round(raw / 100) * 100;
  return Math.round(raw / 1000) * 1000;
}
function runBotAnalysis() {
  const base = getBasePrice();
  plannedPath = generatePath(base);
  const exitPrice = plannedPath.endPrice, mult = plannedPath.mult;
  const exitMcap = exitPrice * currentCoin.supply;
  const amount = suggestedAmount(mult);
  lastPrediction = { coinId: currentCoin.id, coinName: currentCoin.name, emoji: currentCoin.emoji, startPrice: base, exitPrice, exitMcap, mult, amount, confidence: 100, at: Date.now(), liveBase: base };
  document.getElementById('botCoinName').textContent = currentCoin.name;
  document.getElementById('predPrice').textContent = formatPrice(exitPrice);
  document.getElementById('predMcap').textContent = formatMcap(exitMcap);
  document.getElementById('predMult').textContent = mult.toFixed(2) + 'x';
  document.getElementById('predAmount').textContent = formatMoney(amount);
  document.getElementById('predConf').style.width = '100%';
  document.getElementById('predHint').innerHTML = 'Using <strong style="color:#fff">live market price</strong> ' + formatPrice(base) + ' as the start. Path locked — exit <strong style="color:var(--green)">' + formatPrice(exitPrice) + '</strong> (' + mult.toFixed(2) + 'x). Suggested <strong style="color:#fff">' + formatMoney(amount) + '</strong>.';
  renderCoinRecord();
}
function applyBotSuggestion() {
  if (!lastPrediction) runBotAnalysis();
  document.getElementById('amount').value = lastPrediction.amount;
  showPage('trade');
  const el = document.getElementById('amount');
  el.style.borderColor = 'var(--green)';
  setTimeout(() => { el.style.borderColor = ''; }, 1200);
}
function renderCoinRecord() {
  const el = document.getElementById('coinRecord'); if (!el) return;
  el.innerHTML = COINS.map(coin => {
    const price = livePriceCache[coin.id] || coin.startPrice;
    return '<div class="record-row"><div class="emoji">' + coin.emoji + '</div><div class="name">' + coin.name + '<div class="meta">Live</div></div><div class="right">' + formatPrice(price) + '<div class="meta">' + formatMcap(price * coin.supply) + '</div></div></div>';
  }).join('');
}
function renderTradeRecord() {
  const el = document.getElementById('tradeRecord'); if (!el) return;
  if (!tradeHistory.length) { el.innerHTML = '<div class="empty-msg">No trades yet — run a sim on Trade.</div>'; return; }
  el.innerHTML = tradeHistory.slice(0, 20).map(tr => {
    const pnlClass = tr.pnl >= 0 ? 'green' : 'red';
    const sign = tr.pnl >= 0 ? '+' : '';
    return '<div class="record-row"><div class="emoji">' + (tr.emoji || '🪙') + '</div><div class="name">' + tr.coin + '<div class="meta">' + new Date(tr.at).toLocaleString() + '</div></div><div class="right ' + pnlClass + '">' + sign + formatMoney(tr.pnl) + '<div class="meta">' + tr.mult.toFixed(2) + 'x · $' + tr.amount + '</div></div></div>';
  }).join('');
}
async function recordTrade(finalPrice) {
  if (!tokens || !startPrice) return;
  if (tradeSettled) return;
  tradeSettled = true;
  const posVal = tokens * finalPrice;
  const pnl = posVal - tradeAmount;
  const mult = startPrice > 0 ? finalPrice / startPrice : 1;
  if (currentUser()) {
    try {
      const data = await api('/api/trade', { method: 'POST', body: JSON.stringify({ action: 'settle', amount: tradeAmount, pos_value: posVal, pnl: pnl, coin: currentCoin.name, emoji: currentCoin.emoji, start_price: startPrice, end_price: finalPrice, mult: mult }) });
      setBalanceLocal(data.balance); refreshWalletUI();
    } catch (e) {
      console.error('settle failed', e);
      setBalanceLocal(getBalance() + posVal); refreshWalletUI();
    }
  }
  tradeHistory.unshift({ coin: currentCoin.name, emoji: currentCoin.emoji, amount: tradeAmount, startPrice, endPrice: finalPrice, mult, pnl, at: Date.now() });
  if (tradeHistory.length > 50) tradeHistory = tradeHistory.slice(0, 50);
  renderTradeRecord();
}
function updateUI() {
  const mcap = currentPrice * currentCoin.supply;
  const pct = startPrice > 0 ? ((currentPrice - startPrice) / startPrice) * 100 : 0;
  const posVal = tokens * currentPrice, pnl = posVal - tradeAmount, pnlPct = tradeAmount > 0 ? (pnl / tradeAmount) * 100 : 0;
  const priceEl = document.getElementById('price'), changeEl = document.getElementById('change');
  priceEl.textContent = formatPrice(currentPrice); changeEl.textContent = formatPct(pct);
  priceEl.className = 'price ' + (pct >= 0 ? 'green' : 'red');
  changeEl.className = 'change ' + (pct >= 0 ? 'green' : 'red');
  document.getElementById('mcap').textContent = formatMcap(mcap);
  document.getElementById('posValue').textContent = formatMoney(posVal || tradeAmount);
  document.getElementById('posTokens').textContent = tokens > 0 ? tokens.toLocaleString(undefined,{maximumFractionDigits:0}) + ' ' + currentCoin.name : '— ' + currentCoin.name;
  const pnlEl = document.getElementById('posPnl');
  if (tokens > 0) {
    pnlEl.textContent = (pnl>=0?'+':'') + formatMoney(pnl) + ' · ' + (pnlPct>=0?'▲ ':'▼ ') + Math.abs(pnlPct).toFixed(2) + '%';
    pnlEl.className = 'pos-pnl ' + (pnl>=0?'green':'red');
  } else { pnlEl.textContent = '+$0.00 · 0.00%'; pnlEl.className = 'pos-pnl green'; }
}
function drawChart() {
  ctx.clearRect(0,0,W,H); if (prices.length < 2) return;
  const padL=8, padR=88, padT=16, padB=20;
  const chartW=W-padL-padR, chartH=H-padT-padB;
  const minP=Math.min(...prices)*0.97, maxP=Math.max(...prices)*1.03, range=maxP-minP||1;
  ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=1;
  for(let i=0;i<=5;i++){ const y=padT+(chartH/5)*i; ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke(); }
  const len=prices.length, pts=[];
  for(let i=0;i<len;i++){ pts.push({x:padL+(i/(len-1))*chartW, y:padT+chartH-((prices[i]-minP)/range)*chartH}); }
  ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x,pts[i].y);
  ctx.lineTo(pts[pts.length-1].x,H-padB); ctx.lineTo(pts[0].x,H-padB); ctx.closePath();
  const grad=ctx.createLinearGradient(0,padT,0,H-padB);
  grad.addColorStop(0,'rgba(0,230,118,0.28)'); grad.addColorStop(0.6,'rgba(0,230,118,0.08)'); grad.addColorStop(1,'rgba(0,230,118,0)');
  ctx.fillStyle=grad; ctx.fill();
  ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x,pts[i].y);
  ctx.strokeStyle='#00e676'; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.stroke();
  const last=pts[pts.length-1];
  ctx.beginPath(); ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(255,255,255,0.22)'; ctx.lineWidth=1;
  ctx.moveTo(padL,last.y); ctx.lineTo(W-4,last.y); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(last.x,last.y,8,0,Math.PI*2); ctx.strokeStyle='rgba(0,230,118,0.35)'; ctx.lineWidth=2; ctx.stroke();
  ctx.beginPath(); ctx.arc(last.x,last.y,4,0,Math.PI*2); ctx.fillStyle='#00e676'; ctx.fill();
  ctx.beginPath(); ctx.arc(last.x,last.y,1.8,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
  const mcapLabel=formatMcap(currentPrice*currentCoin.supply);
  ctx.font='600 11px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  const textW=ctx.measureText(mcapLabel).width, bw=textW+14, bh=20, br=10;
  const bubbleX=last.x+12; let bubbleY=last.y-bh/2;
  if(bubbleY<padT+2) bubbleY=padT+2; if(bubbleY+bh>H-padB-2) bubbleY=H-padB-bh-2;
  ctx.beginPath(); ctx.moveTo(bubbleX+br,bubbleY); ctx.lineTo(bubbleX+bw-br,bubbleY);
  ctx.quadraticCurveTo(bubbleX+bw,bubbleY,bubbleX+bw,bubbleY+br); ctx.lineTo(bubbleX+bw,bubbleY+bh-br);
  ctx.quadraticCurveTo(bubbleX+bw,bubbleY+bh,bubbleX+bw-br,bubbleY+bh); ctx.lineTo(bubbleX+br,bubbleY+bh);
  ctx.quadraticCurveTo(bubbleX,bubbleY+bh,bubbleX,bubbleY+bh-br); ctx.lineTo(bubbleX,bubbleY+br);
  ctx.quadraticCurveTo(bubbleX,bubbleY,bubbleX+br,bubbleY); ctx.closePath();
  ctx.fillStyle='rgba(12,12,18,0.92)'; ctx.fill(); ctx.strokeStyle='rgba(0,230,118,0.5)'; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle='#00e676'; ctx.textBaseline='middle'; ctx.fillText(mcapLabel,bubbleX+7,bubbleY+bh/2);
}
function tickSim() {
  if (!running) return;
  const elapsed = performance.now() - simStartTime; tick++;
  if (elapsed >= TOTAL_MS || (plannedPath && tick >= plannedPath.prices.length - 1)) {
    if (plannedPath && plannedPath.prices.length) { currentPrice = plannedPath.endPrice; prices.push(currentPrice); }
    phase = 'done'; running = false;
    document.getElementById('startBtn').disabled = false;
    const stopBtn = document.getElementById('resetBtn');
    stopBtn.disabled = true; stopBtn.classList.remove('btn-stop-active');
    document.getElementById('amount').disabled = false;
    document.getElementById('customPrice').disabled = false;
    recordTrade(currentPrice); updateUI(); drawChart(); return;
  }
  if (plannedPath && plannedPath.prices.length > 1) {
    currentPrice = plannedPath.prices[Math.min(tick, plannedPath.prices.length - 1)];
  }
  prices.push(currentPrice);
  if (prices.length > 280) prices.shift();
  updateUI(); drawChart();
  if (running) animId = requestAnimationFrame(() => setTimeout(tickSim, TICK_MS));
}
async function startSim() {
  if (running) return;
  if (!currentUser()) { showPage('auth'); return; }
  tradeAmount = parseFloat(document.getElementById('amount').value) || 1000;
  if (tradeAmount < 1) tradeAmount = 1;
  try {
    const data = await api('/api/trade', { method: 'POST', body: JSON.stringify({ action: 'start', amount: tradeAmount }) });
    setBalanceLocal(data.balance); refreshWalletUI();
  } catch (e) {
    alert(e.message || 'Cannot start trade');
    if ((e.message || '').toLowerCase().includes('insufficient')) showPage('wallet');
    return;
  }
  tradeSettled = false;
  const base = getBasePrice();
  if (!plannedPath || plannedPath.coinId !== currentCoin.id || Math.abs(plannedPath.base - base)/base > 0.02) {
    plannedPath = generatePath(base);
    lastPrediction = { coinId: currentCoin.id, coinName: currentCoin.name, emoji: currentCoin.emoji, startPrice: base, exitPrice: plannedPath.endPrice, exitMcap: plannedPath.endPrice*currentCoin.supply, mult: plannedPath.mult, amount: tradeAmount, confidence: 100, at: Date.now(), liveBase: base };
  }
  currentPrice = plannedPath.prices[0]; startPrice = plannedPath.base;
  tokens = tradeAmount / startPrice; prices = [currentPrice]; tick = 0; phase = 'chop'; running = true;
  simStartTime = performance.now();
  document.getElementById('startBtn').disabled = true;
  const stopBtn = document.getElementById('resetBtn');
  stopBtn.disabled = false; stopBtn.classList.add('btn-stop-active'); stopBtn.textContent = 'Stop';
  document.getElementById('amount').disabled = true;
  updateUI(); drawChart(); tickSim();
}
function resetSim() {
  const wasRunning = running; running = false;
  if (animId) cancelAnimationFrame(animId); phase = 'done';
  document.getElementById('startBtn').disabled = false;
  const stopBtn = document.getElementById('resetBtn');
  stopBtn.disabled = true; stopBtn.classList.remove('btn-stop-active'); stopBtn.textContent = 'Stop';
  document.getElementById('amount').disabled = false;
  document.getElementById('customPrice').disabled = false;
  if (wasRunning && tokens > 0) recordTrade(currentPrice);
  updateUI(); drawChart();
}
function clearProgress() {
  running = false; if (animId) cancelAnimationFrame(animId); phase = 'idle'; plannedPath = null;
  const base = getBasePrice();
  currentPrice = base; startPrice = base; prices = [currentPrice]; tokens = 0;
  tradeAmount = parseFloat(document.getElementById('amount').value) || 1000;
  document.getElementById('startBtn').disabled = false;
  const stopBtn = document.getElementById('resetBtn');
  stopBtn.disabled = true; stopBtn.classList.remove('btn-stop-active');
  document.getElementById('amount').disabled = false;
  updateUI(); drawChart();
}
function renderCoinList() {
  const list = document.getElementById('coinList'); if (!list) return; list.innerHTML = '';
  COINS.forEach(coin => {
    const item = document.createElement('div');
    item.className = 'coin-item' + (coin.id === currentCoin.id ? ' active' : '');
    item.onclick = () => selectCoin(coin);
    const price = livePriceCache[coin.id] || coin.startPrice;
    item.innerHTML = '<div class="coin-avatar">'+coin.emoji+'</div><div class="coin-meta"><div class="coin-name">'+coin.name+(coin.live?'<span class="live-tag">LIVE</span>':'')+'</div><div class="coin-sub">'+coin.sub+'</div></div><div class="coin-price-side">'+formatPrice(price)+'</div>';
    list.appendChild(item);
  });
}
function selectCoin(coin) {
  if (running) return;
  currentCoin = coin;
  document.getElementById('tokenName').textContent = coin.name;
  document.getElementById('tokenSub').textContent = coin.sub;
  document.getElementById('avatar').textContent = coin.emoji;
  document.getElementById('customPrice').value = '';
  clearProgress(); lastPrediction = null; plannedPath = null;
  const botName = document.getElementById('botCoinName');
  if (botName) botName.textContent = coin.name;
  closeSidebar();
}
function openSidebar() { document.getElementById('sidebar').classList.add('open'); document.getElementById('overlayBg').classList.add('show'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlayBg').classList.remove('show'); }
async function fetchSwordcatPrice() {
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/5tCju6YNxHq5zrA6tGndr6F7TK42mpUFmeE31cSFpump');
    const data = await res.json();
    if (data.pairs && data.pairs.length && data.pairs[0].priceUsd) {
      const price = parseFloat(data.pairs[0].priceUsd);
      if (price > 0) {
        livePriceCache['swordcat'] = price;
        if (currentCoin.id === 'swordcat' && phase === 'idle') {
          const custom = parseFloat(document.getElementById('customPrice').value);
          if (!(custom > 0)) { currentPrice = price; startPrice = price; prices = [price]; document.getElementById('customPrice').placeholder = price.toString(); updateUI(); drawChart(); }
        }
      }
    }
  } catch (e) {}
}
async function fetchMajorPrices() {
  try {
    const ids = COINS.filter(c => c.cgId).map(c => c.cgId).join(',');
    if (!ids) return;
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd');
    const data = await res.json();
    COINS.forEach(coin => {
      if (coin.cgId && data[coin.cgId] && data[coin.cgId].usd > 0) {
        livePriceCache[coin.id] = data[coin.cgId].usd;
        if (currentCoin.id === coin.id && phase === 'idle') {
          const custom = parseFloat(document.getElementById('customPrice').value);
          if (!(custom > 0)) { currentPrice = data[coin.cgId].usd; startPrice = data[coin.cgId].usd; prices = [data[coin.cgId].usd]; document.getElementById('customPrice').placeholder = data[coin.cgId].usd.toString(); updateUI(); drawChart(); }
        }
      }
    });
  } catch (e) {}
}
async function fetchLivePrice() { await Promise.all([fetchSwordcatPrice(), fetchMajorPrices()]); renderCoinList(); renderCoinRecord(); }
if (document.getElementById('customPrice')) document.getElementById('customPrice').addEventListener('input', () => { clearProgress(); });
if (document.getElementById('amount')) document.getElementById('amount').addEventListener('input', () => { clearProgress(); });
renderCoinList(); updateUI(); drawChart();
fetchLivePrice(); setInterval(fetchLivePrice, 45000);
if (document.getElementById('depositAddress')) document.getElementById('depositAddress').value = SOLANA_DEPOSIT_ADDRESS;
(async function boot() {
  authToken = getToken();
  if (authToken) {
    try {
      const data = await api('/api/auth/me');
      cachedUser = data.user;
      cachedBalance = Number(data.user.balance) || 0;
      refreshAuthUI();
      await refreshWalletUI();
      showPage('trade');
      return;
    } catch (e) {
      setToken(null); cachedUser = null; cachedBalance = 0;
    }
  }
  refreshWalletUI();
  showPage('home');
})();
