const { sql, json, readBody, signToken, ensureAdmins, bcrypt, cors } = require('../_lib');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim() || email.split('@')[0];

    if (!email || !password) return json(res, 400, { error: 'Email and password required' });
    if (password.length < 4) return json(res, 400, { error: 'Password must be at least 4 characters' });

    const db = sql();
    await ensureAdmins(db);

    const existing = await db`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    if (existing.length) return json(res, 409, { error: 'Account already exists. Log in instead.' });

    const hash = bcrypt.hashSync(password, 10);
    const rows = await db`
      INSERT INTO users (email, password_hash, name, is_admin)
      VALUES (${email}, ${hash}, ${name}, FALSE)
      RETURNING id, email, name, is_admin
    `;
    const user = rows[0];
    await db`INSERT INTO balances (user_id, amount_usd) VALUES (${user.id}, 0) ON CONFLICT (user_id) DO NOTHING`;

    const token = signToken(user);
    return json(res, 200, {
      token,
      user: { id: user.id, email: user.email, name: user.name, is_admin: user.is_admin, balance: 0 }
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message || 'Server error' });
  }
};
