const { sql, json, readBody, signToken, ensureAdmins, bcrypt, cors } = require('../_lib');

async function ensureProfileColumns(db) {
  try {
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT`;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS dob TEXT`;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line TEXT`;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT`;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code TEXT`;
  } catch (e) {
    console.warn('profile columns', e.message);
  }
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const confirm = String(body.confirm_password || body.confirmPassword || '');
    const name = String(body.name || '').trim() || email.split('@')[0];
    const phone = String(body.phone || '').trim();
    const country = String(body.country || '').trim();
    const dob = String(body.dob || '').trim();
    const address = String(body.address || body.address_line || '').trim();
    const city = String(body.city || '').trim();
    const postal = String(body.postal_code || body.postalCode || '').trim();

    if (!email || !password) return json(res, 400, { error: 'Email and password required' });
    if (password.length < 4) return json(res, 400, { error: 'Password must be at least 4 characters' });
    if (confirm && confirm !== password) return json(res, 400, { error: 'Passwords do not match' });

    const db = sql();
    await ensureAdmins(db);
    await ensureProfileColumns(db);

    const existing = await db`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    if (existing.length) {
      return json(res, 409, { error: 'This email is already registered. Use Log in instead.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    let user;
    try {
      const rows = await db`
        INSERT INTO users (email, password_hash, name, is_admin, phone, country, dob, address_line, city, postal_code)
        VALUES (${email}, ${hash}, ${name}, FALSE, ${phone || null}, ${country || null}, ${dob || null}, ${address || null}, ${city || null}, ${postal || null})
        RETURNING id, email, name, is_admin
      `;
      user = rows[0];
    } catch (e) {
      const rows = await db`
        INSERT INTO users (email, password_hash, name, is_admin)
        VALUES (${email}, ${hash}, ${name}, FALSE)
        RETURNING id, email, name, is_admin
      `;
      user = rows[0];
    }
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
