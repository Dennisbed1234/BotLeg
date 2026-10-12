const { sql, json, authUser, cors } = require('./_lib');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    const session = authUser(req);
    if (!session) return json(res, 401, { error: 'Not logged in' });

    const db = sql();
    const txs = await db`
      SELECT id, kind, label, amount_usd, meta, created_at
      FROM transactions
      WHERE user_id = ${session.sub}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    const trades = await db`
      SELECT id, coin, emoji, amount_usd, start_price, end_price, mult, pnl_usd, created_at
      FROM trades
      WHERE user_id = ${session.sub}
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return json(res, 200, {
      transactions: txs.map((t) => ({
        id: t.id,
        kind: t.kind,
        label: t.label,
        amount: Number(t.amount_usd),
        meta: t.meta,
        at: t.created_at
      })),
      trades: trades.map((t) => ({
        id: t.id,
        coin: t.coin,
        emoji: t.emoji,
        amount: Number(t.amount_usd),
        startPrice: Number(t.start_price),
        endPrice: Number(t.end_price),
        mult: Number(t.mult),
        pnl: Number(t.pnl_usd),
        at: t.created_at
      }))
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message || 'Server error' });
  }
};
