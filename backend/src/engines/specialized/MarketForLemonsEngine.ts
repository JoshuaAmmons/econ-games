import type { Server } from 'socket.io';
import type {
  GameType,
  UIConfig,
  ValidationResult,
  ActionResult,
  RoundResult,
} from '../GameEngine';
import { SequentialBaseEngine } from '../sequential/SequentialBaseEngine';

/** In-memory cache of server-assigned quality per seller per round. */
const sellerQualities = new Map<string, number>(); // key: `${roundId}:${playerId}`

const DEFAULT_QUALITIES = [10, 20, 30, 40, 50, 60, 70, 80, 90];

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
   * Get the server-assigned quality for a seller in a given round.
   * Generates and caches a random quality on first call per seller per round.
   */
  private getSellerQuality(roundId: string, playerId: string): number {
    const key = `${roundId}:${playerId}`;
    let quality = sellerQualities.get(key);
    if (quality === undefined) {
      quality = DEFAULT_QUALITIES[Math.floor(Math.random() * DEFAULT_QUALITIES.length)];
      sellerQualities.set(key, quality);
    }
    return quality;
  }

  /**
   * Override handleAction to assign quality SERVER-SIDE.
   * The client no longer controls quality — it's assigned from the
   * server's per-round cache to prevent sellers from spoofing.
   */
  async handleAction(
    roundId: string,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    // Look up the player's actual DB role to prevent a buyer from sending
    // {type: 'first_move'} to bypass role checks and inject quality.
    const { PlayerModel } = await import('../../models/Player');
    const player = await PlayerModel.findById(playerId);
    if (player?.role === 'seller' && action.type === 'first_move') {
      // Use the server-cached quality; ignore any client-submitted value
      action.quality = this.getSellerQuality(roundId, playerId);
    }

    return super.handleAction(roundId, playerId, action, sessionCode, io);
  }

  /**
   * Override getGameState to include server-assigned quality for sellers.
   * This lets sellers see their quality before choosing a price.
   */
  async getGameState(
    roundId: string,
    playerId?: string
  ): Promise<Record<string, any>> {
    const base = await super.getGameState(roundId, playerId);

    // If this is a seller who hasn't submitted yet, include their assigned quality
    if (playerId && base.myRole === 'seller' && !base.myAction) {
      base.assignedQuality = this.getSellerQuality(roundId, playerId);
    }

    return base;
  }

  /**
   * Strip quality from the broadcast so buyers can't see it via socket events.
   */
  protected sanitizeFirstMoveForBroadcast(action: Record<string, any>): Record<string, any> {
    const { quality, ...safe } = action;
    return safe;
  }

  /**
   * Strip quality-related info from result data broadcast to ALL players.
   * Seller result data contains quality, sellerCost, buyerValue — these
   * should not be visible to buyers in other pairs via the broadcast.
   * The buyer's own result correctly shows quality only if they accepted.
   */
  protected sanitizeResultDataForBroadcast(
    resultData: Record<string, any>,
    role: 'firstMover' | 'secondMover'
  ): Record<string, any> {
    if (role === 'firstMover') {
      // Strip seller-specific cost/value details from broadcast
      const { sellerCost, buyerValue, ...safe } = resultData;
      return safe;
    }
    return resultData;
  }

  /**
   * Clean up the sellerQualities cache for this round to prevent memory leaks.
   */
  async processRoundEnd(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<RoundResult> {
    const result = await super.processRoundEnd(roundId, sessionCode, io);

    // Clean up quality cache for this round
    for (const key of sellerQualities.keys()) {
      if (key.startsWith(`${roundId}:`)) {
        sellerQualities.delete(key);
      }
    }

    return result;
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
