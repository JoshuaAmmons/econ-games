import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// PostgreSQL connection pool with recovery settings
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,                        // Maximum number of clients in pool
  idleTimeoutMillis: 30000,       // Close idle clients after 30s
  connectionTimeoutMillis: 5000,  // Wait up to 5s for a connection before erroring
  allowExitOnIdle: false,         // Keep pool alive even when all clients are idle
});

// Test connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err: Error) => {
  console.error('PostgreSQL pool error:', err);
  // Don't crash — allow non-DB endpoints (e.g. /api/game-types) to keep serving
});

/**
 * Execute a query with automatic retry on connection errors.
 * Retries up to 3 times with exponential backoff for transient failures
 * (connection refused, pool exhaustion, connection reset).
 */
const RETRYABLE_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
]);

async function queryWithRetry(text: string, params?: any[], maxRetries = 3) {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (err: any) {
      lastError = err;
      const code = err?.code || '';
      const msg = err?.message || '';
      const isRetryable =
        RETRYABLE_CODES.has(code) ||
        msg.includes('Connection terminated unexpectedly') ||
        msg.includes('sorry, too many clients') ||
        msg.includes('remaining connection slots are reserved');

      if (!isRetryable || attempt >= maxRetries) {
        throw err;
      }
      const delay = Math.min(100 * Math.pow(2, attempt), 2000);
      console.warn(
        `DB query retry ${attempt + 1}/${maxRetries} after ${delay}ms (${code || msg.substring(0, 60)})`
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Helper function to execute queries (with retry on transient failures)
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await queryWithRetry(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text: text.substring(0, 80), duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
};

export default pool;
