require('dotenv').config();
require('express-async-errors');

const express = require('express');
const app = express();

app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/admin',  require('./routes/admin'));   // POST /admin/wallet/credit
                                                 // POST /admin/wallet/debit
app.use('/orders', require('./routes/orders'));  // POST /orders
                                                 // GET  /orders/:order_id
app.use('/wallet', require('./routes/wallet'));  // GET  /wallet/balance

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

app.use((err, req, res, next) => {
  console.error(err.message);
  // PostgreSQL: balance CHECK constraint violated (balance < 0)
  if (err.code === '23514') {
    return res.status(422).json({ error: 'Insufficient balance' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  POST /admin/wallet/credit    body: { client_id, amount }');
  console.log('  POST /admin/wallet/debit     body: { client_id, amount }');
  console.log('  POST /orders                 header: client-id | body: { amount }');
  console.log('  GET  /orders/:order_id       header: client-id');
  console.log('  GET  /wallet/balance         header: client-id');
});