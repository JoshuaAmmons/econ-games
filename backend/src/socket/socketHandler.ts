import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import bcrypt from 'bcryptjs';
import { RoundModel } from '../models/Round';
import { TradeModel } from '../models/Trade';
import { SessionModel } from '../models/Session';
import { GameRegistry } from '../engines/GameRegistry';

export function setupSocketHandlers(httpServer: HTTPServer) {
  const allowedOrigins = [
    'http://localhost:5173',
    process.env.FRONTEND_URL,
    'https://econ-games.vercel.app',
    'https://econ-games.joshuadammons.com',
  ].filter(Boolean) as string[];

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Cache session game types to avoid repeated DB lookups
  const sessionGameTypeCache: Map<string, string> = new Map();

  // Cache verified admin sessions to avoid DB lookups on every timer tick (~1/sec)
  const adminAuthCache: Map<string, { adminPassword: string | undefined }> = new Map();

  // Guard against concurrent end-round processing (timer + manual click race)
  const endingRounds = new Set<string>();

  async function getSessionGameType(sessionCode: string): Promise<string> {
    const cached = sessionGameTypeCache.get(sessionCode);
    if (cached) return cached;

    const session = await SessionModel.findByCode(sessionCode);
    const gameType = session?.game_type || 'double_auction';
    sessionGameTypeCache.set(sessionCode, gameType);
    return gameType;
  }

  /**
   * Verify that the caller is authorized to perform admin actions on a session.
   * If the session has an admin_password set, the provided password must match.
   * If no admin_password is configured, the action is allowed (open access).
   * Returns the session on success, or null if authorization fails.
   */
  async function verifyAdminAuth(
    sessionCode: string,
    adminPassword: string | undefined,
    socket: Socket
  ): Promise<import('../types').Session | null> {
    const session = await SessionModel.findByCode(sessionCode);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return null;
    }

    // If the session has an admin password, validate it
    if (session.admin_password) {
      if (!adminPassword) {
        console.warn(`Unauthorized admin action on session ${sessionCode} from socket ${socket.id}`);
        socket.emit('error', { message: 'Unauthorized: invalid admin password' });
        return null;
      }

      // Support both bcrypt hash and legacy plaintext passwords
      let isValid = false;
      if (session.admin_password.startsWith('$2a$') || session.admin_password.startsWith('$2b$')) {
        isValid = await bcrypt.compare(adminPassword, session.admin_password);
      } else {
        isValid = adminPassword === session.admin_password;
      }

      if (!isValid) {
        console.warn(`Unauthorized admin action on session ${sessionCode} from socket ${socket.id}`);
        socket.emit('error', { message: 'Unauthorized: invalid admin password' });
        return null;
      }
    }

    return session;
  }

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    // Join session room
    socket.on('join-session', async (data: { sessionCode: string; playerId: string }) => {
      try {
        const { sessionCode, playerId } = data || {};
        if (!sessionCode || !playerId) return;
        socket.join(`session-${sessionCode}`);

        // Emit player joined event
        io.to(`session-${sessionCode}`).emit('player-joined', {
          playerId,
          timestamp: new Date().toISOString(),
        });

        console.log(`Player ${playerId} joined session ${sessionCode}`);
      } catch (error) {
        console.error('Error joining session:', error);
      }
    });

    // Join market room
    socket.on('join-market', async (data: { sessionCode: string; playerId: string }) => {
      try {
        const { sessionCode, playerId } = data || {};
        if (!sessionCode || !playerId) return;
        socket.join(`market-${sessionCode}`);
        socket.join(`player-${playerId}`);
        console.log(`Player ${playerId} joined market ${sessionCode}`);
      } catch (error) {
        console.error('Error joining market:', error);
      }
    });

    // =========================================================================
    // Generic game action handler — delegates to the appropriate engine
    // =========================================================================
    socket.on('submit-action', async (data: {
      roundId: string;
      playerId: string;
      sessionCode: string;
      action: Record<string, any>;
    }) => {
      try {
        const { roundId, playerId, sessionCode, action } = data;
        const gameType = await getSessionGameType(sessionCode);
        const engine = GameRegistry.get(gameType);

        const result = await engine.handleAction(roundId, playerId, action, sessionCode, io);

        if (!result.success) {
          socket.emit('error', { message: result.error });
        }

        if (result.reply) {
          socket.emit(result.reply.event, result.reply.data);
        }
        // Broadcasts are handled inside the engine via io parameter

      } catch (error) {
        console.error('Error handling action:', error);
        socket.emit('error', { message: 'Failed to process action' });
      }
    });

    // =========================================================================
    // Backward-compatible DA events — map to engine actions
    // =========================================================================
    socket.on('submit-bid', async (data: {
      roundId: string;
      playerId: string;
      price: number;
      sessionCode: string;
    }) => {
      try {
        const { roundId, playerId, price, sessionCode } = data;
        const gameType = await getSessionGameType(sessionCode);
        const engine = GameRegistry.get(gameType);

        const result = await engine.handleAction(
          roundId,
          playerId,
          { type: 'bid', price },
          sessionCode,
          io
        );

        if (!result.success) {
          socket.emit('error', { message: result.error });
        }
      } catch (error) {
        console.error('Error submitting bid:', error);
        socket.emit('error', { message: 'Failed to submit bid' });
      }
    });

    socket.on('submit-ask', async (data: {
      roundId: string;
      playerId: string;
      price: number;
      sessionCode: string;
    }) => {
      try {
        const { roundId, playerId, price, sessionCode } = data;
        const gameType = await getSessionGameType(sessionCode);
        const engine = GameRegistry.get(gameType);

        const result = await engine.handleAction(
          roundId,
          playerId,
          { type: 'ask', price },
          sessionCode,
          io
        );

        if (!result.success) {
          socket.emit('error', { message: result.error });
        }
      } catch (error) {
        console.error('Error submitting ask:', error);
        socket.emit('error', { message: 'Failed to submit ask' });
      }
    });

    // =========================================================================
    // Round management — works for all game types
    // =========================================================================

    // Start round (admin only)
    socket.on('start-round', async (data: { sessionCode: string; roundNumber: number; adminPassword?: string }) => {
      try {
        const { sessionCode, roundNumber, adminPassword } = data;

        // Verify admin authorization
        const session = await verifyAdminAuth(sessionCode, adminPassword, socket);
        if (!session) return;

        // Cache the admin password so timer-update can skip DB lookups
        adminAuthCache.set(sessionCode, { adminPassword: session.admin_password || undefined });

        const round = await RoundModel.findBySessionAndNumber(session.id, roundNumber);
        if (!round) throw new Error('Round not found');

        const updatedRound = await RoundModel.start(round.id);
        if (!updatedRound) {
          socket.emit('error', { message: 'Failed to start round' });
          return;
        }
        await SessionModel.updateCurrentRound(session.id, roundNumber);

        // Let the engine initialize round state (timers, inventories, etc.)
        const gameType = await getSessionGameType(sessionCode);
        const engine = GameRegistry.get(gameType);
        if (engine.onRoundStart) {
          await engine.onRoundStart(round.id, sessionCode, io);
        }

        io.to(`session-${sessionCode}`).emit('round-started', {
          round: updatedRound,
          roundNumber,
        });

        io.to(`market-${sessionCode}`).emit('round-started', {
          round: updatedRound,
          roundNumber,
        });

        console.log(`Round ${roundNumber} started for session ${sessionCode}`);
      } catch (error) {
        console.error('Error starting round:', error);
        socket.emit('error', { message: 'Failed to start round' });
      }
    });

    // End round (admin or timer)
    socket.on('end-round', async (data: { sessionCode: string; roundId: string; adminPassword?: string }) => {
      try {
        const { sessionCode, roundId, adminPassword } = data;

        // Verify admin authorization
        const session = await verifyAdminAuth(sessionCode, adminPassword, socket);
        if (!session) return;

        // Cache the admin password so timer-update can skip DB lookups
        adminAuthCache.set(sessionCode, { adminPassword: session.admin_password || undefined });

        // Guard against concurrent end-round processing (timer + manual click race)
        if (endingRounds.has(roundId)) {
          console.log(`Round ${roundId} already being processed, skipping`);
          return;
        }
        endingRounds.add(roundId);

        try {
          // Guard against double-ending (timer auto-end + manual click)
          const round = await RoundModel.findById(roundId);
          if (!round || round.status === 'completed') {
            console.log(`Round ${roundId} already ended, skipping duplicate end-round`);
            return;
          }

          // Let the engine process end-of-round logic
          const gameType = await getSessionGameType(sessionCode);
          const engine = GameRegistry.get(gameType);

          await RoundModel.end(roundId);
          const roundResult = await engine.processRoundEnd(roundId, sessionCode, io);

          // Get trades for DA games (backward compat) — normalize DECIMAL strings
          const rawTrades = await TradeModel.findByRound(roundId);
          const trades = rawTrades.map(t => ({
            ...t,
            price: Number(t.price),
            buyer_profit: Number(t.buyer_profit),
            seller_profit: Number(t.seller_profit),
          }));

          io.to(`session-${sessionCode}`).emit('round-ended', {
            roundId,
            trades,
            results: roundResult,
          });

          io.to(`market-${sessionCode}`).emit('round-ended', {
            roundId,
            trades,
            results: roundResult,
          });

          console.log(`Round ended for session ${sessionCode}`);

          // Clear caches to prevent unbounded memory growth.
          // They will be re-populated on the next lookup if needed.
          sessionGameTypeCache.delete(sessionCode);
          adminAuthCache.delete(sessionCode);
        } finally {
          endingRounds.delete(roundId);
        }
      } catch (error) {
        console.error('Error ending round:', error);
        socket.emit('error', { message: 'Failed to end round' });
      }
    });

    // Timer update (admin only)
    socket.on('timer-update', async (data: { sessionCode: string; secondsRemaining: number; adminPassword?: string }) => {
      try {
        if (!data?.sessionCode || data.secondsRemaining == null) return;

        // Lightweight admin auth check using cache (avoid DB query every second)
        const cached = adminAuthCache.get(data.sessionCode);
        if (cached) {
          // Verify password matches cached value
          if (cached.adminPassword && (!data.adminPassword || data.adminPassword !== cached.adminPassword)) {
            socket.emit('error', { message: 'Unauthorized: invalid admin password' });
            return;
          }
        } else {
          // First time: do full DB check and cache the result
          const session = await verifyAdminAuth(data.sessionCode, data.adminPassword, socket);
          if (!session) return;
          adminAuthCache.set(data.sessionCode, { adminPassword: session.admin_password || undefined });
        }

        io.to(`market-${data.sessionCode}`).emit('timer-update', {
          seconds_remaining: data.secondsRemaining,
        });
      } catch (error) {
        console.error('Error in timer-update:', error);
      }
    });

    // Get game state (for reconnection/page load)
    socket.on('get-game-state', async (data: {
      sessionCode: string;
      roundId: string;
      playerId: string;
    }) => {
      try {
        const { sessionCode, roundId, playerId } = data;
        const gameType = await getSessionGameType(sessionCode);
        const engine = GameRegistry.get(gameType);

        const state = await engine.getGameState(roundId, playerId);
        socket.emit('game-state', state);
      } catch (error) {
        console.error('Error getting game state:', error);
        socket.emit('error', { message: 'Failed to get game state' });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}
