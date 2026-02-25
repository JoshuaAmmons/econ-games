import type { Server } from 'socket.io';
import type {
  GameEngine,
  GameType,
  UIConfig,
  ValidationResult,
  ActionResult,
  RoundResult,
} from '../GameEngine';
import { BidModel } from '../../models/Bid';
import { AskModel } from '../../models/Ask';
import { TradeModel } from '../../models/Trade';
import { PlayerModel } from '../../models/Player';
import { RoundModel } from '../../models/Round';
import {
  validateBid,
  validateAsk,
  matchTrades,
} from '../../services/gameLogic';

/**
 * Double Auction Engine — wraps the existing DA game logic.
 * This is the original game type, used for Week 4.
 */
export class DoubleAuctionEngine implements GameEngine {
  readonly gameType: GameType = 'double_auction';

  /** Serialize trade matching per round to prevent duplicate trades */
  protected tradeMatchLocks = new Map<string, Promise<void>>();

  getUIConfig(): UIConfig {
    return {
      name: 'Double Auction',
      description: 'Buyers and sellers trade in a continuous double auction market.',
      category: 'continuous_trading',
      weekNumber: 4,
      roles: [
        { role: 'buyer', label: 'Buyer', description: 'Submits bids to purchase goods' },
        { role: 'seller', label: 'Seller', description: 'Submits asks to sell goods' },
      ],
      usesOrderBook: true,
      usesValuationCost: true,
      configFields: [
        {
          name: 'market_size',
          label: 'Market Size',
          type: 'number',
          default: 10,
          min: 2,
          max: 100,
          description: 'Total number of participants',
        },
        {
          name: 'num_rounds',
          label: 'Number of Rounds',
          type: 'number',
          default: 5,
          min: 1,
          max: 50,
        },
        {
          name: 'time_per_round',
          label: 'Time per Round (seconds)',
          type: 'number',
          default: 180,
          min: 30,
          max: 600,
        },
        {
          name: 'valuation_min',
          label: 'Buyer Valuation Min',
          type: 'number',
          default: 20,
          daOnly: true,
        },
        {
          name: 'valuation_max',
          label: 'Buyer Valuation Max',
          type: 'number',
          default: 60,
          daOnly: true,
        },
        {
          name: 'valuation_increments',
          label: 'Valuation Increments',
          type: 'number',
          default: 10,
          daOnly: true,
        },
        {
          name: 'cost_min',
          label: 'Seller Cost Min',
          type: 'number',
          default: 15,
          daOnly: true,
        },
        {
          name: 'cost_max',
          label: 'Seller Cost Max',
          type: 'number',
          default: 55,
          daOnly: true,
        },
        {
          name: 'cost_increments',
          label: 'Cost Increments',
          type: 'number',
          default: 10,
          daOnly: true,
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.market_size !== undefined && config.market_size < 2) {
      return { valid: false, error: 'Market size must be at least 2' };
    }
    return { valid: true };
  }

  async setupPlayers(
    sessionId: string,
    playerCount: number,
    config: Record<string, any>
  ): Promise<void> {
    // DA uses the existing player creation logic in the join flow
    // Players are assigned roles and valuations/costs when they join
    // This is handled by the session controller's join logic
  }

  async handleAction(
    roundId: string,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    const { type } = action;
    const price = Number(action.price);

    // Validate price is a finite positive number (socket path has no type checking)
    if (!Number.isFinite(price) || price <= 0) {
      return { success: false, error: 'Price must be a positive number' };
    }

    // Guard: only accept bids/asks while the round is active
    const round = await RoundModel.findById(roundId);
    if (!round || round.status !== 'active') {
      return { success: false, error: 'Round is not active' };
    }

    // Get player
    const player = await PlayerModel.findById(playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    if (type === 'bid') {
      // Validate bid
      const validation = validateBid(price, player);
      if (!validation.valid) {
        return { success: false, error: validation.error };
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

      // Check for trade matches
      await this.checkAndExecuteTrades(roundId, sessionCode, io);

      return { success: true };
    } else if (type === 'ask') {
      // Validate ask
      const validation = validateAsk(price, player);
      if (!validation.valid) {
        return { success: false, error: validation.error };
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

      // Check for trade matches
      await this.checkAndExecuteTrades(roundId, sessionCode, io);

      return { success: true };
    }

    return { success: false, error: `Unknown action type: ${type}` };
  }

  async processRoundEnd(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<RoundResult> {
    // Clean up trade match lock for this round to prevent memory leak
    this.tradeMatchLocks.delete(roundId);

    // Deactivate all remaining bids and asks
    await BidModel.deactivateAllForRound(roundId);
    await AskModel.deactivateAllForRound(roundId);

    // Get trades for summary
    const trades = await TradeModel.findByRound(roundId);

    const playerResults = trades.flatMap((trade) => [
      {
        playerId: trade.buyer_id,
        profit: Number(trade.buyer_profit),
        resultData: { role: 'buyer', tradePrice: Number(trade.price) },
      },
      {
        playerId: trade.seller_id,
        profit: Number(trade.seller_profit),
        resultData: { role: 'seller', tradePrice: Number(trade.price) },
      },
    ]);

    // Normalize DECIMAL fields (pg driver returns strings)
    const normalizedTrades = trades.map(t => ({
      ...t,
      price: Number(t.price),
      buyer_profit: Number(t.buyer_profit),
      seller_profit: Number(t.seller_profit),
    }));

    return {
      playerResults,
      summary: {
        totalTrades: normalizedTrades.length,
        averagePrice:
          normalizedTrades.length > 0
            ? normalizedTrades.reduce((sum, t) => sum + t.price, 0) / normalizedTrades.length
            : 0,
        trades: normalizedTrades,
      },
    };
  }

  async getGameState(
    roundId: string,
    playerId?: string
  ): Promise<Record<string, any>> {
    const bids = await BidModel.findActiveByRound(roundId);
    const asks = await AskModel.findActiveByRound(roundId);
    const rawTrades = await TradeModel.findByRound(roundId);

    // Normalize DECIMAL fields
    const trades = rawTrades.map(t => ({
      ...t,
      price: Number(t.price),
      buyer_profit: Number(t.buyer_profit),
      seller_profit: Number(t.seller_profit),
    }));

    return {
      bids: bids.map(b => ({ ...b, price: Number(b.price) })),
      asks: asks.map(a => ({ ...a, price: Number(a.price) })),
      trades,
    };
  }

  /**
   * Check for matching bids/asks and execute trades.
   * This is the core DA matching logic, extracted from the old socketHandler.
   */
  protected async checkAndExecuteTrades(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<void> {
    // Serialize: wait for any in-flight match to finish before starting a new one
    const prevLock = this.tradeMatchLocks.get(roundId) || Promise.resolve();
    const currentLock = prevLock.then(() => this.executeTradeMatching(roundId, sessionCode, io));
    this.tradeMatchLocks.set(roundId, currentLock.catch(() => {}));
    await currentLock;
  }

  private async executeTradeMatching(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<void> {
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

      // Filter out any with missing players
      const validBids = bidsWithPlayers.filter((b) => b.player !== null) as any[];
      const validAsks = asksWithPlayers.filter((a) => a.player !== null) as any[];

      const matches = matchTrades(validBids, validAsks);

      // Execute trades
      for (const match of matches) {
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

        // Broadcast trade — sanitize player objects to prevent leaking private valuations/costs
        io.to(`market-${sessionCode}`).emit('trade-executed', {
          trade,
          buyer: { id: match.bid.player.id, name: match.bid.player.name, is_bot: match.bid.player.is_bot },
          seller: { id: match.ask.player.id, name: match.ask.player.name, is_bot: match.ask.player.is_bot },
        });
      }
    } catch (error) {
      console.error('Error checking trades:', error);
    }
  }
}
