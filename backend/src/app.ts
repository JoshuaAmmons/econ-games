import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sessionRoutes from './routes/sessions';
import playerRoutes from './routes/players';
import gameRoutes from './routes/game';
import exportRoutes from './routes/export';

// Initialize all game engines (must be imported before routes/sockets)
import './engines';

dotenv.config();

const app = express();

// Middleware - CORS with multiple origins support
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
  'https://econ-games.vercel.app',
  'https://econ-games.joshuadammons.com',
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like curl, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: 'v6-constraints',
  });
});

// Debug: check database constraints
app.get('/api/debug/constraints', async (_req, res) => {
  try {
    const { pool } = require('./config/database');
    const result = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'sessions'::regclass
      ORDER BY conname
    `);
    res.json({ constraints: result.rows });
  } catch (err: any) {
    res.json({ error: err.message });
  }
});

// Debug endpoint for bot diagnostics
app.get('/api/debug/bots', (_req, res) => {
  try {
    const { BotStrategyRegistry } = require('./services/botStrategies');
    const strategies = BotStrategyRegistry.listAll();
    const daStrat = BotStrategyRegistry.get('double_auction');

    // Test actual DA action generation
    const fakeBuyer = { role: 'buyer', valuation: 40 } as any;
    const fakeSeller = { role: 'seller', production_cost: 25 } as any;
    let buyerAction = null, sellerAction = null, actionError = null;
    try {
      buyerAction = daStrat?.getDAAction?.(fakeBuyer, { time_per_round: 60 }, {}, 10);
      sellerAction = daStrat?.getDAAction?.(fakeSeller, { time_per_round: 60 }, {}, 10);
    } catch (e: any) {
      actionError = e.message;
    }

    // Test BotService singleton
    const { BotService } = require('./services/BotService');
    const botService = BotService.getInstance();
    const roundTimerCount = botService['roundTimers'].size;
    const roundStartTimeCount = botService['roundStartTimes'].size;

    res.json({
      version: 'v5-logs',
      registeredStrategies: strategies,
      daStrategyExists: !!daStrat,
      daHasGetDAAction: !!daStrat?.getDAAction,
      testBuyerAction: buyerAction,
      testSellerAction: sellerAction,
      actionError,
      botServiceState: { roundTimerCount, roundStartTimeCount },
      recentLogs: botService.getRecentLogs(),
    });
  } catch (err: any) {
    res.json({ error: err.message, stack: err.stack });
  }
});

// Game types discovery endpoint
app.get('/api/game-types', (_req, res) => {
  const { GameRegistry } = require('./engines');
  const gameTypes = GameRegistry.listWithConfigs();
  res.json({
    success: true,
    data: gameTypes
  });
});

// API Routes
app.use('/api/sessions', sessionRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/sessions', exportRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

export default app;
