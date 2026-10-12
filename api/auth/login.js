const { sql, json, readBody, signToken, ensureAdmins, getBalance, bcrypt, cors } = require('../_lib');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return json(res, 400, { error: 'Email and password required' });

    const db = sql();
    await ensureAdmins(db);

    const rows = await db`
      SELECT id, email, name, is_admin, password_hash
      FROM users WHERE email = ${email} LIMIT 1
    `;
    if (!rows.length) return json(res, 401, { error: 'Invalid email or password' });

    const user = rows[0];
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return json(res, 401, { error: 'Invalid email or password' });
    }

    const balance = await getBalance(db, user.id);
    const token = signToken(user);
    return json(res, 200, {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        is_admin: !!user.is_admin,
        balance
      }
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message || 'Server error' });
  }
};
