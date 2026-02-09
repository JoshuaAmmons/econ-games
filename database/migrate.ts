/**
 * Database Migration Runner
 * Reads and executes SQL migration files in order.
 * Usage: npx ts-node database/migrate.ts
 * Or via node: node -e "require('./database/migrate')"
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

async function migrate() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get already-executed migrations
    const executed = await pool.query('SELECT filename FROM _migrations ORDER BY filename');
    const executedSet = new Set(executed.rows.map((r: any) => r.filename));

    // Read migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    let ran = 0;
    for (const file of files) {
      if (executedSet.has(file)) {
        console.log(`  ⏭  ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      console.log(`  ▶  Running ${file}...`);

      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`  ✅ ${file} applied successfully`);
        ran++;
      } catch (err) {
        await pool.query('ROLLBACK');
        console.error(`  ❌ ${file} failed:`, err);
        throw err;
      }
    }

    console.log(`\nMigration complete. ${ran} new migration(s) applied.`);
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
