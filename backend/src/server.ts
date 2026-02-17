import http from 'http';
import app from './app';
import { pool } from './config/database';
import { redisClient } from './config/redis';
import { setupSocketHandlers } from './socket/socketHandler';

const PORT = process.env.PORT || 3000;

// Auto-apply database constraint updates on startup
async function applyConstraintUpdates() {
  try {
    // Ensure game_type_check includes all game types
    await pool.query(`ALTER TABLE sessions DROP CONSTRAINT IF EXISTS game_type_check`);
    await pool.query(`ALTER TABLE sessions ADD CONSTRAINT game_type_check CHECK (game_type IN (
      'double_auction', 'double_auction_tax', 'double_auction_price_controls',
      'bertrand', 'cournot', 'public_goods', 'negative_externality',
      'ultimatum', 'gift_exchange', 'principal_agent',
      'comparative_advantage', 'monopoly', 'market_for_lemons',
      'discovery_process'
    ))`);

    // Ensure role_check includes all roles
    await pool.query(`ALTER TABLE players DROP CONSTRAINT IF EXISTS role_check`);
    await pool.query(`ALTER TABLE players ADD CONSTRAINT role_check CHECK (role IN (
      'buyer', 'seller', 'player', 'firm',
      'proposer', 'responder', 'employer', 'worker',
      'principal', 'agent', 'country', 'monopolist',
      'producer'
    ))`);

    // Ensure passcode column exists on sessions table
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS passcode VARCHAR(20) DEFAULT NULL`);

    // Ensure admin_password column exists on sessions table
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS admin_password VARCHAR(50) DEFAULT NULL`);

    console.log('Database constraints updated successfully');
  } catch (err) {
    console.error('Error updating database constraints:', err);
  }
}

// Create HTTP server
const server = http.createServer(app);

// Setup Socket.io
const io = setupSocketHandlers(server);

// Start server
server.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  await applyConstraintUpdates();
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down gracefully...');

  // Close socket connections
  io.close(() => {
    console.log('WebSocket connections closed');
  });

  // Close server
  server.close(() => {
    console.log('HTTP server closed');
  });

  // Close database connections
  try {
    await pool.end();
    console.log('Database connection closed');
  } catch (err) {
    console.error('Error closing database:', err);
  }

  try {
    await redisClient.quit();
    console.log('Redis connection closed');
  } catch (err) {
    console.error('Error closing Redis:', err);
  }

  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
