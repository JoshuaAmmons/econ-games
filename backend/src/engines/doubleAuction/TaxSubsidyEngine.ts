import type { Server } from 'socket.io';
import type { GameType, UIConfig, ValidationResult, ActionResult, RoundResult } from '../GameEngine';
import { DoubleAuctionEngine } from './DoubleAuctionEngine';
import { BidModel } from '../../models/Bid';
import { AskModel } from '../../models/Ask';
import { TradeModel } from '../../models/Trade';
import { PlayerModel } from '../../models/Player';
import { SessionModel } from '../../models/Session';
import { RoundModel } from '../../models/Round';
import { matchTrades } from '../../services/gameLogic';

/**
 * DA + Tax/Subsidy Engine (Week 2)
 *
 * Extends the standard double auction with a per-unit tax or subsidy.
 * - Tax on buyer: buyer pays trade_price + tax, profit = valuation - (price + tax)
 * - Tax on seller: seller receives trade_price - tax, profit = (price - tax) - cost
 * - Subsidy works the same but reduces effective price (negative tax)
 *
 * game_config: {
 *   taxType: 'buyer' | 'seller',
 *   taxAmount: number  // positive = tax, negative = subsidy
 * }
 */
export class TaxSubsidyEngine extends DoubleAuctionEngine {
  readonly gameType: GameType = 'double_auction_tax';

  getUIConfig(): UIConfig {
    const base = super.getUIConfig();
    return {
      ...base,
      name: 'Double Auction + Tax/Subsidy',
      description: 'Double auction with a per-unit tax or subsidy that creates a wedge between buyer and seller prices.',
      weekNumber: 2,
      configFields: [
        ...base.configFields,
        {
          name: 'taxType',
          label: 'Tax Applied To',
          type: 'select',
          default: 'buyer',
          options: [
            { value: 'buyer', label: 'Buyer (excise tax)' },
            { value: 'seller', label: 'Seller (production tax)' },
          ],
          description: 'Who pays the tax',
        },
        {
          name: 'taxAmount',
          label: 'Tax Amount ($)',
          type: 'number',
          default: 5,
          min: -50,
          max: 50,
          step: 1,
          description: 'Positive = tax, negative = subsidy',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const base = super.validateConfig(config);
    if (!base.valid) return base;

    if (config.taxAmount !== undefined && typeof config.taxAmount !== 'number') {
      return { valid: false, error: 'Tax amount must be a number' };
    }
    if (config.taxType && !['buyer', 'seller'].includes(config.taxType)) {
      return { valid: false, error: 'Tax type must be "buyer" or "seller"' };
    }
    return { valid: true };
  }

  /**
   * Override trade execution to apply tax/subsidy to profits.
   * The trade price in the order book is the same as standard DA,
   * but buyer/seller profits are adjusted by the tax.
   */
  protected async checkAndExecuteTrades(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<void> {
    try {
      // Get the session to read tax config
      const round = await RoundModel.findById(roundId);
      if (!round) return;
      const session = await SessionModel.findById(round.session_id);
      if (!session) return;

      const gameConfig = session.game_config || {};
      const taxType: string = gameConfig.taxType || 'buyer';
      const taxAmount: number = gameConfig.taxAmount || 0;

      // Get active bids and asks
      const bids = await BidModel.findActiveByRound(roundId);
      const asks = await AskModel.findActiveByRound(roundId);

      // Get players
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

      const validBids = bidsWithPlayers.filter((b) => b.player !== null) as any[];
      const validAsks = asksWithPlayers.filter((a) => a.player !== null) as any[];

      const matches = matchTrades(validBids, validAsks);

      for (const match of matches) {
        // Adjust profits based on tax
        let buyerProfit = match.buyerProfit;
        let sellerProfit = match.sellerProfit;

        if (taxType === 'buyer') {
          // Buyer pays the tax: their effective cost is price + tax
          buyerProfit = (match.bid.player.valuation || 0) - match.price - taxAmount;
        } else {
          // Seller pays the tax: their effective revenue is price - tax
          sellerProfit = match.price - taxAmount - (match.ask.player.production_cost || 0);
        }

        const trade = await TradeModel.create(
          roundId,
          match.bid.player_id,
          match.ask.player_id,
          match.price,
          buyerProfit,
          sellerProfit,
          match.bid.id,
          match.ask.id
        );

        await BidModel.markInactive(match.bid.id);
        await AskModel.markInactive(match.ask.id);

        await PlayerModel.updateProfit(match.bid.player_id, buyerProfit);
        await PlayerModel.updateProfit(match.ask.player_id, sellerProfit);

        io.to(`market-${sessionCode}`).emit('trade-executed', {
          trade,
          buyer: match.bid.player,
          seller: match.ask.player,
          taxInfo: { taxType, taxAmount },
        });
      }
    } catch (error) {
      console.error('Error checking trades (tax):', error);
    }
  }
}
