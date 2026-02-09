import type { Server } from 'socket.io';
import type { GameType, UIConfig, ValidationResult, ActionResult } from '../GameEngine';
import { DoubleAuctionEngine } from './DoubleAuctionEngine';
import { PlayerModel } from '../../models/Player';
import { SessionModel } from '../../models/Session';
import { RoundModel } from '../../models/Round';
import { validateBid, validateAsk } from '../../services/gameLogic';
import { BidModel } from '../../models/Bid';
import { AskModel } from '../../models/Ask';

/**
 * DA + Price Controls Engine (Week 3)
 *
 * Extends the standard double auction with a price floor or ceiling.
 * - Price ceiling: bids and asks above the ceiling are rejected
 * - Price floor: bids and asks below the floor are rejected
 *
 * game_config: {
 *   controlType: 'floor' | 'ceiling',
 *   controlPrice: number
 * }
 */
export class PriceControlsEngine extends DoubleAuctionEngine {
  readonly gameType: GameType = 'double_auction_price_controls';

  getUIConfig(): UIConfig {
    const base = super.getUIConfig();
    return {
      ...base,
      name: 'Double Auction + Price Controls',
      description: 'Double auction with an enforced price floor or ceiling that constrains trading prices.',
      weekNumber: 3,
      configFields: [
        ...base.configFields,
        {
          name: 'controlType',
          label: 'Control Type',
          type: 'select',
          default: 'ceiling',
          options: [
            { value: 'ceiling', label: 'Price Ceiling (max price)' },
            { value: 'floor', label: 'Price Floor (min price)' },
          ],
          description: 'Type of price control',
        },
        {
          name: 'controlPrice',
          label: 'Control Price ($)',
          type: 'number',
          default: 35,
          min: 1,
          max: 500,
          step: 1,
          description: 'The enforced price limit',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const base = super.validateConfig(config);
    if (!base.valid) return base;

    if (config.controlPrice !== undefined && config.controlPrice <= 0) {
      return { valid: false, error: 'Control price must be positive' };
    }
    if (config.controlType && !['floor', 'ceiling'].includes(config.controlType)) {
      return { valid: false, error: 'Control type must be "floor" or "ceiling"' };
    }
    return { valid: true };
  }

  /**
   * Override handleAction to enforce price controls on bids and asks.
   */
  async handleAction(
    roundId: string,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    const { type, price } = action;

    // Get session config for price controls
    const round = await RoundModel.findById(roundId);
    if (!round) return { success: false, error: 'Round not found' };
    const session = await SessionModel.findById(round.session_id);
    if (!session) return { success: false, error: 'Session not found' };

    const gameConfig = session.game_config || {};
    const controlType: string = gameConfig.controlType || 'ceiling';
    const controlPrice: number = gameConfig.controlPrice || 35;

    // Enforce price controls
    if (controlType === 'ceiling' && price > controlPrice) {
      return {
        success: false,
        error: `Price $${price.toFixed(2)} exceeds the price ceiling of $${controlPrice.toFixed(2)}`,
      };
    }
    if (controlType === 'floor' && price < controlPrice) {
      return {
        success: false,
        error: `Price $${price.toFixed(2)} is below the price floor of $${controlPrice.toFixed(2)}`,
      };
    }

    // Delegate to base DA engine for the rest
    return super.handleAction(roundId, playerId, action, sessionCode, io);
  }

  /**
   * Include price control info in game state for the UI.
   */
  async getGameState(
    roundId: string,
    playerId?: string
  ): Promise<Record<string, any>> {
    const baseState = await super.getGameState(roundId, playerId);

    const round = await RoundModel.findById(roundId);
    if (round) {
      const session = await SessionModel.findById(round.session_id);
      if (session) {
        const gameConfig = session.game_config || {};
        baseState.priceControl = {
          controlType: gameConfig.controlType || 'ceiling',
          controlPrice: gameConfig.controlPrice || 35,
        };
      }
    }

    return baseState;
  }
}
