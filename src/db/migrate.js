require('dotenv').config();
const { query } = require('../config/db');

async function migrate() {
  // Clients table
  await query(`
    CREATE TABLE IF NOT EXISTS clients (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      email      TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Wallets table — one wallet per client
  await query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id  UUID UNIQUE NOT NULL REFERENCES clients(id),
      balance    NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Ledger — every credit/debit is recorded here
  await query(`
    CREATE TABLE IF NOT EXISTS ledger (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id      UUID NOT NULL REFERENCES clients(id),
      type           TEXT NOT NULL CHECK (type IN ('credit','debit')),
      amount         NUMERIC(12,2) NOT NULL,
      balance_before NUMERIC(12,2) NOT NULL,
      balance_after  NUMERIC(12,2) NOT NULL,
      note           TEXT,
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `);

  // Orders table
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id      UUID NOT NULL REFERENCES clients(id),
      amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','failed')),
      fulfillment_id TEXT,
      failure_reason TEXT,
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `);

  console.log('✅ Migration complete');
  process.exit(0);
}

migrate().catch((err) => { console.error(err); process.exit(1); });