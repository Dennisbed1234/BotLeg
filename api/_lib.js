const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ADMINS = [
  { email: 'personalofficedesk@gmail.com', name: 'DaddyG Enterprise', password: 'Yalateef1$' },
  { email: 'dennisbed1234@gmail.com', name: 'Dennis Bedenbender', password: 'Yalateef1$' },
  { email: 'anawise1980@gmail.com', name: 'Ana Montoya', password: 'Yalateef1$' }
];

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}

function jwtSecret() {
  return process.env.JWT_SECRET || process.env.DATABASE_URL || 'mps-dev-secret-change-me';
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res, status, body) {
  cors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) reject(new Error('Body too large')); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, is_admin: !!user.is_admin, name: user.name },
    jwtSecret(),
    { expiresIn: '30d' }
  );
}

function authUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, jwtSecret());
  } catch (e) {
    return null;
  }
}

/** Always ensure admins exist with the correct password hash (fixes placeholder SQL hashes). */
async function ensureAdmins(db) {
  for (const a of ADMINS) {
    const hash = bcrypt.hashSync(a.password, 10);
    const rows = await db`SELECT id FROM users WHERE email = ${a.email} LIMIT 1`;
    if (rows.length === 0) {
      const created = await db`
        INSERT INTO users (email, password_hash, name, is_admin)
        VALUES (${a.email}, ${hash}, ${a.name}, TRUE)
        RETURNING id
      `;
      await db`INSERT INTO balances (user_id, amount_usd) VALUES (${created[0].id}, 0) ON CONFLICT (user_id) DO NOTHING`;
    } else {
      await db`
        UPDATE users
        SET is_admin = TRUE, name = ${a.name}, password_hash = ${hash}
        WHERE email = ${a.email}
      `;
      await db`INSERT INTO balances (user_id, amount_usd) VALUES (${rows[0].id}, 0) ON CONFLICT (user_id) DO NOTHING`;
    }
  }
}

async function getBalance(db, userId) {
  const rows = await db`SELECT amount_usd FROM balances WHERE user_id = ${userId} LIMIT 1`;
  if (!rows.length) {
    await db`INSERT INTO balances (user_id, amount_usd) VALUES (${userId}, 0) ON CONFLICT (user_id) DO NOTHING`;
    return 0;
  }
  return Number(rows[0].amount_usd) || 0;
}

async function setBalance(db, userId, amount) {
  const v = Math.max(0, Number(amount) || 0);
  await db`
    INSERT INTO balances (user_id, amount_usd, updated_at)
    VALUES (${userId}, ${v}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET amount_usd = ${v}, updated_at = NOW()
  `;
  return v;
}

async function addTx(db, userId, kind, label, amountUsd, meta = '') {
  await db`
    INSERT INTO transactions (user_id, kind, label, amount_usd, meta)
    VALUES (${userId}, ${kind}, ${label}, ${amountUsd}, ${meta})
  `;
}

async function sendAdminEmail({ subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('RESEND_API_KEY not set — skipping admin email');
    return { skipped: true };
  }
  const from = process.env.RESEND_FROM || 'BotLeg <onboarding@resend.dev>';
  let to = process.env.ADMIN_NOTIFY_EMAIL;
  if (to) {
    to = to.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    to = ADMINS.map((a) => a.email);
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to, subject, html })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('Resend error', res.status, t);
    throw new Error('Email failed');
  }
  return res.json().catch(() => ({ ok: true }));
}

module.exports = {
  sql, cors, json, readBody, signToken, authUser, ensureAdmins,
  getBalance, setBalance, addTx, bcrypt, ADMINS, sendAdminEmail
};
