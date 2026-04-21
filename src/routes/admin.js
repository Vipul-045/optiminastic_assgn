const router  = require('express').Router();
const { query, withTransaction } = require('../config/db');

router.post('/wallet/credit', async (req, res) => {
  const { client_id, amount } = req.body;

  if (!client_id || !amount || amount <= 0) {
    return res.status(400).json({ error: 'client_id and a positive amount are required' });
  }

  const result = await withTransaction(async (client) => {
    // Lock the wallet row so no other request can modify it at the same time
    const { rows } = await client.query(
      `SELECT * FROM wallets WHERE client_id = $1 FOR UPDATE`,
      [client_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Wallet not found' });

    const wallet        = rows[0];
    const balanceBefore = parseFloat(wallet.balance);
    const balanceAfter  = balanceBefore + parseFloat(amount);

    // Update wallet balance
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE client_id = $2`,
      [balanceAfter, client_id]
    );

    // Write ledger entry
    await client.query(
      `INSERT INTO ledger (client_id, type, amount, balance_before, balance_after, note)
       VALUES ($1, 'credit', $2, $3, $4, 'Admin credit')`,
      [client_id, amount, balanceBefore, balanceAfter]
    );

    return { client_id, credited: amount, balance: balanceAfter };
  });

  res.json({ message: 'Wallet credited successfully', data: result });
});


router.post('/wallet/debit', async (req, res) => {
  const { client_id, amount } = req.body;

  if (!client_id || !amount || amount <= 0) {
    return res.status(400).json({ error: 'client_id and a positive amount are required' });
  }

  const result = await withTransaction(async (client) => {
    // Lock the wallet row
    const { rows } = await client.query(
      `SELECT * FROM wallets WHERE client_id = $1 FOR UPDATE`,
      [client_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Wallet not found' });

    const wallet        = rows[0];
    const balanceBefore = parseFloat(wallet.balance);

    // Check sufficient balance
    if (balanceBefore < parseFloat(amount)) {
      return res.status(422).json({
        error: `Insufficient balance — available: $${balanceBefore}, requested: $${amount}`,
      });
    }

    const balanceAfter = balanceBefore - parseFloat(amount);

    // Update wallet balance
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE client_id = $2`,
      [balanceAfter, client_id]
    );

    // Write ledger entry
    await client.query(
      `INSERT INTO ledger (client_id, type, amount, balance_before, balance_after, note)
       VALUES ($1, 'debit', $2, $3, $4, 'Admin debit')`,
      [client_id, amount, balanceBefore, balanceAfter]
    );

    return { client_id, debited: amount, balance: balanceAfter };
  });

  if (!res.headersSent) {
    res.json({ message: 'Wallet debited successfully', data: result });
  }
});

module.exports = router;