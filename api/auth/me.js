const { sql, json, authUser, getBalance, cors } = require('../_lib');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    const session = authUser(req);
    if (!session) return json(res, 401, { error: 'Not logged in' });

    const db = sql();
    const rows = await db`
      SELECT id, email, name, is_admin FROM users WHERE id = ${session.sub} LIMIT 1
    `;
    if (!rows.length) return json(res, 401, { error: 'User not found' });

    const user = rows[0];
    const balance = await getBalance(db, user.id);
    return json(res, 200, {
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
