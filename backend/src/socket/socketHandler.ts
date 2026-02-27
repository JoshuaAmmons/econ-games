import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import bcrypt from 'bcryptjs';
import { RoundModel } from '../models/Round';
import { TradeModel } from '../models/Trade';
import { SessionModel } from '../models/Session';
import { PlayerModel } from '../models/Player';
import { GameRegistry } from '../engines/GameRegistry';
import { BotService } from '../services/BotService';

// Delay between round end and auto-starting the next round (milliseconds)
const AUTO_ADVANCE_DELAY_MS = 5000;

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

  // Server-side round timers: auto-end rounds when time expires
  const roundEndTimers: Map<string, NodeJS.Timeout> = new Map();

  // Auto-advance timers: auto-start next round after a delay
  const autoAdvanceTimers: Map<string, NodeJS.Timeout> = new Map();

  async function getSessionGameType(sessionCode: string): Promise<string> {
    const cached = sessionGameTypeCache.get(sessionCode);
    if (cached) return cached;

    const session = await SessionModel.findByCode(sessionCode);
    if (!session) {
      // Don't cache the fallback for missing sessions — they may be created later
      return 'double_auction';
    }
    const gameType = session.game_type || 'double_auction';
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

  // =========================================================================
  // Server-side round auto-end timer
  // =========================================================================

  /**
   * Schedule a server-side timer to auto-end a round after its time expires.
   * For discovery_process, the engine handles its own internal phase timers
   * (production → move → end), so we skip the server timer for DP.
   */
  function scheduleRoundEndTimer(
    roundId: string,
    sessionCode: string,
    session: any,
    gameType: string
  ): void {
    // Cancel any existing timer for this round
    const existing = roundEndTimers.get(roundId);
    if (existing) clearTimeout(existing);

    // Discovery process manages its own internal timers (production + move phases)
    // so we don't need a separate server-side end timer for it
    if (gameType === 'discovery_process') return;

    const durationMs = (session.time_per_round || 90) * 1000;

    console.log(`[AutoTimer] Scheduling round end in ${durationMs}ms for ${sessionCode} round ${roundId}`);

    const timer = setTimeout(async () => {
      roundEndTimers.delete(roundId);

      // Guard against concurrent processing
      if (endingRounds.has(roundId)) return;
      endingRounds.add(roundId);

      try {
        const round = await RoundModel.findById(roundId);
        if (!round || round.status === 'completed') {
          console.log(`[AutoTimer] Round ${roundId} already ended, skipping`);
          return;
        }

        console.log(`[AutoTimer] Auto-ending round for ${sessionCode}`);

        // Clean up bot timers before ending the round
        BotService.getInstance().onRoundEnd(roundId);

        const engine = GameRegistry.get(gameType);
        const endedRound = await RoundModel.end(roundId);
        if (!endedRound) return;

        const roundResult = await engine.processRoundEnd(roundId, sessionCode, io);

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

        // Schedule auto-advance to next round
        scheduleAutoAdvance(sessionCode);
      } catch (err) {
        console.error(`[AutoTimer] Error auto-ending round:`, err);
      } finally {
        endingRounds.delete(roundId);
      }
    }, durationMs);

    roundEndTimers.set(roundId, timer);
  }

  // =========================================================================
  // Auto-advance: start next round after a delay
  // =========================================================================

  /**
   * Schedule auto-start of the next round for a session.
   * Called after any round ends (from timer, admin click, or engine internal).
   * Exported so the DiscoveryProcessEngine can also trigger it.
   */
  function scheduleAutoAdvance(sessionCode: string): void {
    // Cancel any existing auto-advance for this session
    const existing = autoAdvanceTimers.get(sessionCode);
    if (existing) clearTimeout(existing);

    console.log(`[AutoAdvance] Scheduling next round in ${AUTO_ADVANCE_DELAY_MS}ms for ${sessionCode}`);

    // Notify clients about the upcoming auto-advance
    io.to(`session-${sessionCode}`).emit('auto-advance-scheduled', {
      delayMs: AUTO_ADVANCE_DELAY_MS,
    });
    io.to(`market-${sessionCode}`).emit('auto-advance-scheduled', {
      delayMs: AUTO_ADVANCE_DELAY_MS,
    });

    const timer = setTimeout(async () => {
      autoAdvanceTimers.delete(sessionCode);

      try {
        const session = await SessionModel.findByCode(sessionCode);
        if (!session || session.status !== 'active') {
          console.log(`[AutoAdvance] Session ${sessionCode} not active, skipping`);
          return;
        }

        // Find next waiting round
        const rounds = await RoundModel.findBySession(session.id);
        const nextRound = rounds.find(r => r.status === 'waiting');

        if (!nextRound) {
          // No more rounds — end the session
          console.log(`[AutoAdvance] No more rounds for ${sessionCode}, ending session`);
          await SessionModel.end(session.id);
          io.to(`session-${sessionCode}`).emit('session-ended', {});
          io.to(`market-${sessionCode}`).emit('session-ended', {});
          return;
        }

        console.log(`[AutoAdvance] Auto-starting round ${nextRound.round_number} for ${sessionCode}`);

        const updatedRound = await RoundModel.start(nextRound.id);
        if (!updatedRound) {
          console.error(`[AutoAdvance] Failed to start round ${nextRound.id}`);
          return;
        }
        await SessionModel.updateCurrentRound(session.id, nextRound.round_number);

        const gameType = await getSessionGameType(sessionCode);
        const engine = GameRegistry.get(gameType);

        if (engine.onRoundStart) {
          await engine.onRoundStart(nextRound.id, sessionCode, io);
        }

        io.to(`session-${sessionCode}`).emit('round-started', {
          round: updatedRound,
          roundNumber: nextRound.round_number,
        });
        io.to(`market-${sessionCode}`).emit('round-started', {
          round: updatedRound,
          roundNumber: nextRound.round_number,
        });

        // Schedule server-side auto-end timer for this new round
        scheduleRoundEndTimer(nextRound.id, sessionCode, session, gameType);

        // Trigger bot actions for the new round
        if (session.bot_enabled) {
          BotService.getInstance().onRoundStart(nextRound.id, sessionCode, session, io)
            .catch(err => console.error('BotService auto-advance round start error:', err));
        }

        // Broadcast initial timer to players
        io.to(`market-${sessionCode}`).emit('timer-update', {
          seconds_remaining: session.time_per_round,
        });

        console.log(`[AutoAdvance] Round ${nextRound.round_number} started for ${sessionCode}`);
      } catch (err) {
        console.error(`[AutoAdvance] Error auto-starting next round:`, err);
      }
    }, AUTO_ADVANCE_DELAY_MS);

    autoAdvanceTimers.set(sessionCode, timer);
  }

  // Store io on BotService so sessionController can trigger round-1 bot actions
  BotService.getInstance().setIO(io);

  // Expose timer functions so sessionController can set up round-1 timers
  // (since it starts round 1 directly, the socket start-round handler never runs for it)
  (io as any).__scheduleRoundEndTimer = scheduleRoundEndTimer;

  // Expose scheduleAutoAdvance so engines (like DiscoveryProcess) can trigger it
  (io as any).__scheduleAutoAdvance = scheduleAutoAdvance;

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
        const { roundId, playerId, sessionCode, action } = data || {};
        if (!roundId || typeof roundId !== 'string' ||
            !playerId || typeof playerId !== 'string' ||
            !sessionCode || typeof sessionCode !== 'string' ||
            !action || typeof action !== 'object') {
          socket.emit('error', { message: 'Invalid action data' });
          return;
        }
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
        const { roundId, playerId, price, sessionCode } = data || {};
        if (!roundId || typeof roundId !== 'string' ||
            !playerId || typeof playerId !== 'string' ||
            !sessionCode || typeof sessionCode !== 'string') {
          socket.emit('error', { message: 'Invalid bid data' });
          return;
        }
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
        const { roundId, playerId, price, sessionCode } = data || {};
        if (!roundId || typeof roundId !== 'string' ||
            !playerId || typeof playerId !== 'string' ||
            !sessionCode || typeof sessionCode !== 'string') {
          socket.emit('error', { message: 'Invalid ask data' });
          return;
        }
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

        // Cache the verified plaintext password (NOT the bcrypt hash) so
        // timer-update can compare cheaply without bcrypt on every tick.
        adminAuthCache.set(sessionCode, { adminPassword: adminPassword || undefined });

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

        // On the first round, let the engine set up player-specific data
        // (e.g. auction private valuations) before gameplay begins.
        if (roundNumber === 1) {
          const activePlayers = await PlayerModel.findActiveBySession(session.id);
          await engine.setupPlayers(session.id, activePlayers.length, session.game_config || {});
        }

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

        // Schedule server-side auto-end timer for this round
        scheduleRoundEndTimer(round.id, sessionCode, session, gameType);

        // Trigger bot actions for this round
        if (session.bot_enabled) {
          BotService.getInstance().onRoundStart(round.id, sessionCode, session, io)
            .catch(err => console.error('BotService round start error:', err));
        }

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

        // Cache the verified plaintext password (NOT the bcrypt hash) so
        // timer-update can compare cheaply without bcrypt on every tick.
        adminAuthCache.set(sessionCode, { adminPassword: adminPassword || undefined });

        // Cancel server-side timer if admin manually ends the round
        const existingTimer = roundEndTimers.get(roundId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          roundEndTimers.delete(roundId);
        }

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

          // Clean up bot timers before ending the round
          BotService.getInstance().onRoundEnd(roundId);

          // Let the engine process end-of-round logic
          const gameType = await getSessionGameType(sessionCode);
          const engine = GameRegistry.get(gameType);

          const endedRound = await RoundModel.end(roundId);
          if (!endedRound) {
            console.log(`Round ${roundId} was not in active status, skipping processRoundEnd`);
            return;
          }
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

          // Schedule auto-advance to next round
          scheduleAutoAdvance(sessionCode);

          // Clear caches to prevent unbounded memory growth.
          // They will be re-populated on the next lookup if needed.
          sessionGameTypeCache.delete(sessionCode);
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
          // First time: do full DB check and cache the plaintext password
          const session = await verifyAdminAuth(data.sessionCode, data.adminPassword, socket);
          if (!session) return;
          adminAuthCache.set(data.sessionCode, { adminPassword: data.adminPassword || undefined });
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
        const { sessionCode, roundId, playerId } = data || {};
        if (!sessionCode || typeof sessionCode !== 'string' ||
            !roundId || typeof roundId !== 'string' ||
            !playerId || typeof playerId !== 'string') {
          socket.emit('error', { message: 'Invalid game state request' });
          return;
        }
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
