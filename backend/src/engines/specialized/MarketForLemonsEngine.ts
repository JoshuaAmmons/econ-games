import type { Server } from 'socket.io';
import type {
  GameType,
  UIConfig,
  ValidationResult,
  ActionResult,
  RoundResult,
} from '../GameEngine';
import { SequentialBaseEngine } from '../sequential/SequentialBaseEngine';

/**
 * Market for Lemons Engine (Week 14)
 *
 * Sellers have goods of varying quality. Buyers can't observe quality.
 * Seller sets a price knowing their quality. Buyer decides to buy or not
 * based only on the price (and expected quality).
 *
 * Adverse selection: high-quality sellers drop out because buyers
 * won't pay enough, causing market to unravel.
 *
 * Pairs: Seller (knows quality) + Buyer (doesn't know quality)
 * Stage 1: Seller sees quality and sets price
 * Stage 2: Buyer sees price (NOT quality) and accepts or rejects
 *
 * Payoffs:
 *   Trade: Seller profit = price - sellerCost(quality)
 *          Buyer profit = buyerValue(quality) - price
 *   No trade: both get 0
 *
 * game_config: {
 *   qualities: number[],        // possible quality levels (default [10, 30, 50, 70, 90])
 *   sellerCostFraction: number, // seller's cost as fraction of quality (default 0.5)
 *   buyerValueFraction: number, // buyer's value as fraction of quality (default 1.5)
 * }
 */
export class MarketForLemonsEngine extends SequentialBaseEngine {
  readonly gameType: GameType = 'market_for_lemons';

  protected roles(): [string, string] {
    return ['seller', 'buyer'];
  }

  getUIConfig(): UIConfig {
    return {
      name: 'Market for Lemons',
      description: 'Sellers know product quality, buyers do not. Explore adverse selection and market unraveling.',
      category: 'specialized',
      weekNumber: 14,
      roles: [
        { role: 'seller', label: 'Seller', description: 'Set price knowing the true quality' },
        { role: 'buyer', label: 'Buyer', description: 'Accept or reject based on price (quality unknown)' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Number of Players',
          type: 'number',
          default: 6,
          min: 2,
          max: 40,
          step: 2,
          description: 'Must be even (pairs of seller + buyer)',
        },
        {
          name: 'num_rounds',
          label: 'Number of Rounds',
          type: 'number',
          default: 8,
          min: 1,
          max: 20,
        },
        {
          name: 'time_per_round',
          label: 'Time per Round (seconds)',
          type: 'number',
          default: 60,
          min: 30,
          max: 300,
        },
        {
          name: 'sellerCostFraction',
          label: 'Seller Cost Fraction',
          type: 'number',
          default: 0.5,
          min: 0.1,
          max: 1.5,
          step: 0.1,
          description: 'Seller cost = quality × this fraction',
        },
        {
          name: 'buyerValueFraction',
          label: 'Buyer Value Fraction',
          type: 'number',
          default: 1.5,
          min: 0.5,
          max: 3,
          step: 0.1,
          description: 'Buyer value = quality × this fraction',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.sellerCostFraction !== undefined && config.sellerCostFraction <= 0) {
      return { valid: false, error: 'Seller cost fraction must be positive' };
    }
    if (config.buyerValueFraction !== undefined && config.buyerValueFraction <= 0) {
      return { valid: false, error: 'Buyer value fraction must be positive' };
    }
    return { valid: true };
  }

  protected validateFirstMove(
    action: Record<string, any>,
    _config: Record<string, any>
  ): string | null {
    const { price } = action;
    if (price === undefined || price === null) return 'Price is required';
    if (typeof price !== 'number' || isNaN(price)) return 'Price must be a valid number';
    if (price < 0) return 'Price cannot be negative';
    return null;
  }

  protected validateSecondMove(
    action: Record<string, any>,
    _firstMoveAction: Record<string, any>,
    _config: Record<string, any>
  ): string | null {
    const { accept } = action;
    if (accept === undefined || accept === null) return 'Decision is required';
    if (typeof accept !== 'boolean') return 'Decision must be buy or pass';
    return null;
  }

  /**
   * Override handleAction to validate seller-submitted quality.
   */
  async handleAction(
    roundId: string,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    // Use the quality submitted by the seller (assigned on the frontend).
    // Only assign a random fallback if the submitted quality is invalid.
    if (action.type === 'first_move') {
      const qualities = [10, 20, 30, 40, 50, 60, 70, 80, 90];
      if (!action.quality || !qualities.includes(action.quality)) {
        action.quality = qualities[Math.floor(Math.random() * qualities.length)];
      }
    }

    return super.handleAction(roundId, playerId, action, sessionCode, io);
  }

  protected calculatePairResult(
    firstMoveAction: Record<string, any>,
    secondMoveAction: Record<string, any>,
    config: Record<string, any>
  ) {
    const sellerCostFraction = config.sellerCostFraction ?? 0.5;
    const buyerValueFraction = config.buyerValueFraction ?? 1.5;

    const quality = firstMoveAction.quality as number;
    const price = firstMoveAction.price as number;
    const accepted = secondMoveAction.accept as boolean;

    const sellerCost = quality * sellerCostFraction;
    const buyerValue = quality * buyerValueFraction;

    if (accepted) {
      const sellerProfit = price - sellerCost;
      const buyerProfit = buyerValue - price;

      return {
        firstMoverProfit: Math.round(sellerProfit * 100) / 100,
        secondMoverProfit: Math.round(buyerProfit * 100) / 100,
        firstMoverResultData: {
          role: 'seller',
          quality,
          price,
          sellerCost: Math.round(sellerCost * 100) / 100,
          accepted: true,
          buyerValue: Math.round(buyerValue * 100) / 100,
        },
        secondMoverResultData: {
          role: 'buyer',
          quality,
          price,
          buyerValue: Math.round(buyerValue * 100) / 100,
          accepted: true,
          sellerCost: Math.round(sellerCost * 100) / 100,
        },
      };
    } else {
      return {
        firstMoverProfit: 0,
        secondMoverProfit: 0,
        firstMoverResultData: {
          role: 'seller',
          quality,
          price,
          sellerCost: Math.round(sellerCost * 100) / 100,
          accepted: false,
          buyerValue: Math.round(buyerValue * 100) / 100,
        },
        secondMoverResultData: {
          role: 'buyer',
          quality: null, // buyer doesn't learn quality if rejected
          price,
          buyerValue: null,
          accepted: false,
          sellerCost: null,
        },
      };
    }
  }
}
