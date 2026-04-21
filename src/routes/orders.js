const router               = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { callFulfillmentAPI }     = require('../services/fulfillment');

// ─── POST /orders ─────────────────────────────────────────────────────────────
// Headers: client-id
// Body:    { amount }
//
// Flow:
//   1. Validate wallet balance
//   2. Deduct amount atomically (SELECT FOR UPDATE inside a transaction)
//   3. Create the order record (status = pending)
//   4. Call fulfillment API  ← outside the transaction (never hold locks over network calls)
//   5. Save fulfillment ID   → status = fulfilled
//   6. If fulfillment fails  → refund wallet, status = failed

router.post('/', async (req, res) => {
  const clientId = req.headers['client-id'];
  const { amount } = req.body;

  if (!clientId)              return res.status(400).json({ error: 'client-id header is required' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

  // ── Phase 1: Deduct balance + create order (one atomic transaction) ──────
  let order;

  await withTransaction(async (client) => {
    // Lock the wallet so no concurrent order can read the same balance
    const { rows: walletRows } = await client.query(
      `SELECT * FROM wallets WHERE client_id = $1 FOR UPDATE`,
      [clientId]
    );
    if (!walletRows.length) {
      return res.status(404).json({ error: 'Wallet not found for this client' });
    }

    const wallet        = walletRows[0];
    const balanceBefore = parseFloat(wallet.balance);

    if (balanceBefore < parseFloat(amount)) {
      return res.status(422).json({
        error: `Insufficient balance — available: $${balanceBefore}, required: $${amount}`,
      });
    }

    const balanceAfter = balanceBefore - parseFloat(amount);

    // Deduct from wallet
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE client_id = $2`,
      [balanceAfter, clientId]
    );

    // Write ledger entry
    await client.query(
      `INSERT INTO ledger (client_id, type, amount, balance_before, balance_after, note)
       VALUES ($1, 'debit', $2, $3, $4, 'Order deduction')`,
      [clientId, amount, balanceBefore, balanceAfter]
    );

    // Create the order as 'pending'
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (client_id, amount, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [clientId, amount]
    );

    order = orderRows[0];
    // ✅ Transaction commits here — balance deducted, order saved
  });

  // Stop here if we already sent an early error response
  if (res.headersSent) return;

  // ── Phase 2: Call fulfillment API (outside the transaction) ─────────────
  try {
    const fulfillmentId = await callFulfillmentAPI(order);

    // Save fulfillment ID and mark order as fulfilled
    const { rows } = await query(
      `UPDATE orders
       SET status = 'fulfilled', fulfillment_id = $1
       WHERE id = $2
       RETURNING *`,
      [fulfillmentId, order.id]
    );

    return res.status(201).json({ order: rows[0] });

  } catch (err) {
    // Fulfillment failed — refund the wallet and mark order as failed
    console.error(`[Orders] Fulfillment failed for order ${order.id}:`, err.message);

    // Refund wallet
    await withTransaction(async (client) => {
      const { rows: walletRows } = await client.query(
        `SELECT * FROM wallets WHERE client_id = $1 FOR UPDATE`,
        [clientId]
      );
      const wallet        = walletRows[0];
      const balanceBefore = parseFloat(wallet.balance);
      const balanceAfter  = balanceBefore + parseFloat(order.amount);

      await client.query(
        `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE client_id = $2`,
        [balanceAfter, clientId]
      );

      await client.query(
        `INSERT INTO ledger (client_id, type, amount, balance_before, balance_after, note)
         VALUES ($1, 'credit', $2, $3, $4, 'Refund: fulfillment failed')`,
        [clientId, order.amount, balanceBefore, balanceAfter]
      );
    });

    // Mark order as failed
    const { rows } = await query(
      `UPDATE orders SET status = 'failed', failure_reason = $1 WHERE id = $2 RETURNING *`,
      [err.message, order.id]
    );

    return res.status(502).json({
      error:  'Fulfillment failed. Your wallet has been refunded.',
      order:  rows[0],
    });
  }
});

// ─── GET /orders/:order_id ────────────────────────────────────────────────────
// Headers: client-id
// Returns order details including status and fulfillment_id.

router.get('/:order_id', async (req, res) => {
  const clientId = req.headers['client-id'];
  const { order_id } = req.params;

  if (!clientId) return res.status(400).json({ error: 'client-id header is required' });

  const { rows } = await query(
    `SELECT * FROM orders WHERE id = $1`,
    [order_id]
  );

  if (!rows.length) return res.status(404).json({ error: 'Order not found' });

  const order = rows[0];

  // Make sure the order belongs to this client
  if (order.client_id !== clientId) {
    return res.status(403).json({ error: 'This order does not belong to your account' });
  }

  res.json({ order });
});

module.exports = router;