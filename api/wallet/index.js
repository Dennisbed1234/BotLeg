const { sql, json, readBody, authUser, getBalance, setBalance, addTx, cors } = require('../_lib');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  try {
    const session = authUser(req);
    if (!session) return json(res, 401, { error: 'Not logged in' });

    const db = sql();
    const userRows = await db`SELECT id, email, is_admin FROM users WHERE id = ${session.sub} LIMIT 1`;
    if (!userRows.length) return json(res, 401, { error: 'User not found' });
    const user = userRows[0];

    if (req.method === 'GET') {
      const balance = await getBalance(db, user.id);
      return json(res, 200, { balance, is_admin: !!user.is_admin });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const body = await readBody(req);
    const action = String(body.action || '').toLowerCase();

    if (action === 'deposit') {
      if (!user.is_admin) {
        return json(res, 403, { error: 'Only admins can credit balances manually. Send SOL/USDC to the deposit address.' });
      }
      const amt = Number(body.amount);
      if (!(amt > 0)) return json(res, 400, { error: 'Enter a valid amount' });
      const bal = await getBalance(db, user.id);
      const next = await setBalance(db, user.id, bal + amt);
      await addTx(db, user.id, 'deposit', 'Deposit', amt, '');
      return json(res, 200, { balance: next, message: 'Deposit $' + amt.toFixed(2) + ' added.' });
    }

    if (action === 'withdraw') {
      const amt = Number(body.amount);
      const to = String(body.address || '').trim();
      if (to.length < 32) return json(res, 400, { error: 'Enter a valid Solana address' });
      if (!(amt > 0)) return json(res, 400, { error: 'Enter a valid amount' });
      const bal = await getBalance(db, user.id);
      if (amt > bal) return json(res, 400, { error: 'Insufficient balance' });
      const next = await setBalance(db, user.id, bal - amt);
      await addTx(db, user.id, 'withdraw', 'Withdraw', -amt, to.slice(0, 4) + '…' + to.slice(-4));
      return json(res, 200, { balance: next, message: 'Withdraw $' + amt.toFixed(2) + ' requested.' });
    }

    if (action === 'swap') {
      const amt = Number(body.amount);
      const coin = String(body.coin || 'SWORDCAT');
      if (!(amt > 0)) return json(res, 400, { error: 'Enter a valid amount' });
      const bal = await getBalance(db, user.id);
      if (amt > bal) return json(res, 400, { error: 'Insufficient balance' });
      const next = await setBalance(db, user.id, bal - amt);
      await addTx(db, user.id, 'swap', 'Swap → ' + coin, -amt, coin);
      return json(res, 200, { balance: next, message: 'Swapped $' + amt.toFixed(2) + ' → ' + coin });
    }

    return json(res, 400, { error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message || 'Server error' });
  }
};
