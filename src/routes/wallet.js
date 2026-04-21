const router = require('express').Router();
const { query } = require('../config/db');


router.get('/balance', async (req, res) => {
  const clientId = req.headers['client-id'];

  if (!clientId) return res.status(400).json({ error: 'client-id header is required' });

  const { rows } = await query(
    `SELECT balance, updated_at FROM wallets WHERE client_id = $1`,
    [clientId]
  );

  if (!rows.length) return res.status(404).json({ error: 'Wallet not found' });

  res.json({
    client_id:  clientId,
    balance:    parseFloat(rows[0].balance),
    updated_at: rows[0].updated_at,
  });
});

module.exports = router;