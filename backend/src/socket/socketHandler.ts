import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
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

  async function getSessionGameType(sessionCode: string): Promise<string> {
    const cached = sessionGameTypeCache.get(sessionCode);
    if (cached) return cached;

    const session = await SessionModel.findByCode(sessionCode);
    const gameType = session?.game_type || 'double_auction';
    sessionGameTypeCache.set(sessionCode, gameType);
    return gameType;
  }

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    // Join session room
    socket.on('join-session', async (data: { sessionCode: string; playerId: string }) => {
      const { sessionCode, playerId } = data;
      socket.join(`session-${sessionCode}`);

      // Emit player joined event
      io.to(`session-${sessionCode}`).emit('player-joined', {
        playerId,
        timestamp: new Date().toISOString(),
      });

      console.log(`Player ${playerId} joined session ${sessionCode}`);
    });

    // Join market room
    socket.on('join-market', async (data: { sessionCode: string; playerId: string }) => {
      const { sessionCode, playerId } = data;
      socket.join(`market-${sessionCode}`);
      console.log(`Player ${playerId} joined market ${sessionCode}`);
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
    socket.on('start-round', async (data: { sessionCode: string; roundNumber: number }) => {
      try {
        const { sessionCode, roundNumber } = data;

        const session = await SessionModel.findByCode(sessionCode);
        if (!session) throw new Error('Session not found');

        const round = await RoundModel.findBySessionAndNumber(session.id, roundNumber);
        if (!round) throw new Error('Round not found');

        await RoundModel.start(round.id);
        await SessionModel.updateCurrentRound(session.id, roundNumber);

        io.to(`session-${sessionCode}`).emit('round-started', {
          round: { ...round, status: 'active' },
          roundNumber,
        });

        io.to(`market-${sessionCode}`).emit('round-started', {
          round: { ...round, status: 'active' },
          roundNumber,
        });

        console.log(`Round ${roundNumber} started for session ${sessionCode}`);
      } catch (error) {
        console.error('Error starting round:', error);
        socket.emit('error', { message: 'Failed to start round' });
      }
    });

    // End round (admin or timer)
    socket.on('end-round', async (data: { sessionCode: string; roundId: string }) => {
      try {
        const { sessionCode, roundId } = data;

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

        // Get trades for DA games (backward compat)
        const trades = await TradeModel.findByRound(roundId);

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
      } catch (error) {
        console.error('Error ending round:', error);
        socket.emit('error', { message: 'Failed to end round' });
      }
    });

    // Timer update
    socket.on('timer-update', (data: { sessionCode: string; secondsRemaining: number }) => {
      io.to(`market-${data.sessionCode}`).emit('timer-update', {
        seconds_remaining: data.secondsRemaining,
      });
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
