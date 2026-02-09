import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import { RoundModel } from '../models/Round';
import { BidModel } from '../models/Bid';
import { AskModel } from '../models/Ask';
import { TradeModel } from '../models/Trade';
import { PlayerModel } from '../models/Player';
import { SessionModel } from '../models/Session';
import { matchTrades, validateBid, validateAsk } from '../services/gameLogic';

export function setupSocketHandlers(httpServer: HTTPServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

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

    // Submit bid
    socket.on('submit-bid', async (data: {
      roundId: string;
      playerId: string;
      price: number;
      sessionCode: string;
    }) => {
      try {
        const { roundId, playerId, price, sessionCode } = data;

        // Get player
        const player = await PlayerModel.findById(playerId);
        if (!player) throw new Error('Player not found');

        // Validate bid
        const validation = validateBid(price, player);
        if (!validation.valid) {
          socket.emit('error', { message: validation.error });
          return;
        }

        // Create bid
        const bid = await BidModel.create(roundId, playerId, price);

        // Broadcast to market
        io.to(`market-${sessionCode}`).emit('bid-submitted', {
          bid,
          player: {
            id: player.id,
            name: player.name,
            is_bot: player.is_bot,
          },
        });

        // Check for matches
        await checkAndExecuteTrades(roundId, sessionCode, io);

      } catch (error) {
        console.error('Error submitting bid:', error);
        socket.emit('error', { message: 'Failed to submit bid' });
      }
    });

    // Submit ask
    socket.on('submit-ask', async (data: {
      roundId: string;
      playerId: string;
      price: number;
      sessionCode: string;
    }) => {
      try {
        const { roundId, playerId, price, sessionCode } = data;

        // Get player
        const player = await PlayerModel.findById(playerId);
        if (!player) throw new Error('Player not found');

        // Validate ask
        const validation = validateAsk(price, player);
        if (!validation.valid) {
          socket.emit('error', { message: validation.error });
          return;
        }

        // Create ask
        const ask = await AskModel.create(roundId, playerId, price);

        // Broadcast to market
        io.to(`market-${sessionCode}`).emit('ask-submitted', {
          ask,
          player: {
            id: player.id,
            name: player.name,
            is_bot: player.is_bot,
          },
        });

        // Check for matches
        await checkAndExecuteTrades(roundId, sessionCode, io);

      } catch (error) {
        console.error('Error submitting ask:', error);
        socket.emit('error', { message: 'Failed to submit ask' });
      }
    });

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

        await RoundModel.end(roundId);
        await BidModel.deactivateAllForRound(roundId);
        await AskModel.deactivateAllForRound(roundId);

        const trades = await TradeModel.findByRound(roundId);

        io.to(`session-${sessionCode}`).emit('round-ended', {
          roundId,
          trades,
        });

        io.to(`market-${sessionCode}`).emit('round-ended', {
          roundId,
          trades,
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

    // Disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Helper function to check and execute trades
  async function checkAndExecuteTrades(roundId: string, sessionCode: string, ioServer: Server) {
    try {
      // Get active bids and asks
      const bids = await BidModel.findActiveByRound(roundId);
      const asks = await AskModel.findActiveByRound(roundId);

      // Get players for each bid/ask
      const bidsWithPlayers = await Promise.all(
        bids.map(async (bid) => ({
          ...bid,
          player: await PlayerModel.findById(bid.player_id),
        }))
      );

      const asksWithPlayers = await Promise.all(
        asks.map(async (ask) => ({
          ...ask,
          player: await PlayerModel.findById(ask.player_id),
        }))
      );

      // Filter out any with missing players and match trades
      const validBids = bidsWithPlayers.filter(b => b.player !== null) as any[];
      const validAsks = asksWithPlayers.filter(a => a.player !== null) as any[];

      const matches = matchTrades(validBids, validAsks);

      // Execute trades
      for (const match of matches) {
        // Create trade record
        const trade = await TradeModel.create(
          roundId,
          match.bid.player_id,
          match.ask.player_id,
          match.price,
          match.buyerProfit,
          match.sellerProfit,
          match.bid.id,
          match.ask.id
        );

        // Mark bid and ask as inactive
        await BidModel.markInactive(match.bid.id);
        await AskModel.markInactive(match.ask.id);

        // Update player profits
        await PlayerModel.updateProfit(match.bid.player_id, match.buyerProfit);
        await PlayerModel.updateProfit(match.ask.player_id, match.sellerProfit);

        // Broadcast trade
        ioServer.to(`market-${sessionCode}`).emit('trade-executed', {
          trade,
          buyer: match.bid.player,
          seller: match.ask.player,
        });
      }
    } catch (error) {
      console.error('Error checking trades:', error);
    }
  }

  return io;
}
