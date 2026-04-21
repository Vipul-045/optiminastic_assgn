require('dotenv').config();
const { query } = require('../config/db');

async function seed() {
  // Create a sample client
  const { rows } = await query(`
    INSERT INTO clients (name, email)
    VALUES ('Alice', 'alice@example.com')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name, email
  `);
  const client = rows[0];

  // Create their wallet
  await query(`
    INSERT INTO wallets (client_id, balance)
    VALUES ($1, 0.00)
    ON CONFLICT (client_id) DO NOTHING
  `, [client.id]);

  console.log('✅ Seed complete');
  console.log(`   client_id : ${client.id}`);
  console.log(`   email     : ${client.email}`);
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });