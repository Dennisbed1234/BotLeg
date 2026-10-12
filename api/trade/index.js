const { sql, json, readBody, authUser, getBalance, setBalance, addTx, cors } = require('../_lib');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const session = authUser(req);
    if (!session) return json(res, 401, { error: 'Not logged in' });

    const db = sql();
    const userRows = await db`SELECT id FROM users WHERE id = ${session.sub} LIMIT 1`;
    if (!userRows.length) return json(res, 401, { error: 'User not found' });
    const userId = userRows[0].id;

    const body = await readBody(req);
    const action = String(body.action || '').toLowerCase();

    if (action === 'start') {
      const amount = Number(body.amount);
      if (!(amount >= 1)) return json(res, 400, { error: 'Invalid trade amount' });
      const bal = await getBalance(db, userId);
      if (bal < amount) {
        return json(res, 400, {
          error: 'Insufficient balance. You have $' + bal.toFixed(2) + ' but need $' + amount.toFixed(2)
        });
      }
      const next = await setBalance(db, userId, bal - amount);
      return json(res, 200, { balance: next, locked: amount });
    }

    if (action === 'settle') {
      const amount = Number(body.amount);
      const posVal = Number(body.pos_value);
      const pnl = Number(body.pnl);
      const coin = String(body.coin || 'TOKEN');
      const emoji = String(body.emoji || '');
      const startPrice = Number(body.start_price) || 0;
      const endPrice = Number(body.end_price) || 0;
      const mult = Number(body.mult) || 1;

      if (!(posVal >= 0) || !(amount >= 0)) {
        return json(res, 400, { error: 'Invalid settle amounts' });
      }

      const bal = await getBalance(db, userId);
      const next = await setBalance(db, userId, bal + posVal);

      // Keep preferred history style: "Trade POPCAT (profit)"
      const label = 'Trade ' + coin + (pnl >= 0 ? ' (profit)' : ' (loss)');
      const meta = mult.toFixed(2) + 'x · size $' + amount;

      await addTx(db, userId, 'trade', label, pnl, meta);

      await db`
        INSERT INTO trades (user_id, coin, emoji, amount_usd, start_price, end_price, mult, pnl_usd)
        VALUES (${userId}, ${coin}, ${emoji}, ${amount}, ${startPrice}, ${endPrice}, ${mult}, ${pnl})
      `;

      return json(res, 200, { balance: next, pnl });
    }

    return json(res, 400, { error: 'Unknown action. Use start or settle.' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message || 'Server error' });
  }
};
