import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SequentialBaseEngine } from './SequentialBaseEngine';

/**
 * Ultimatum Game Engine (Week 9)
 *
 * Pairs: Proposer + Responder
 * Stage 1: Proposer offers a split of an endowment
 * Stage 2: Responder accepts or rejects
 *   - Accept: split as proposed
 *   - Reject: both get $0
 *
 * game_config: {
 *   endowment: number,    // total amount to split (default 10)
 *   minOffer: number,     // minimum allowed offer (default 0)
 * }
 */
export class UltimatumEngine extends SequentialBaseEngine {
  readonly gameType: GameType = 'ultimatum';

  protected roles(): [string, string] {
    return ['proposer', 'responder'];
  }

  getUIConfig(): UIConfig {
    return {
      name: 'Ultimatum Game',
      description: 'Proposer offers a split of an endowment. Responder accepts or rejects.',
      category: 'sequential',
      weekNumber: 9,
      roles: [
        { role: 'proposer', label: 'Proposer', description: 'Offer a split of the endowment' },
        { role: 'responder', label: 'Responder', description: 'Accept or reject the proposed split' },
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
          description: 'Must be even (pairs of proposer + responder)',
        },
        {
          name: 'num_rounds',
          label: 'Number of Rounds',
          type: 'number',
          default: 5,
          min: 1,
          max: 20,
        },
        {
          name: 'time_per_round',
          label: 'Time per Round (seconds)',
          type: 'number',
          default: 90,
          min: 30,
          max: 300,
        },
        {
          name: 'endowment',
          label: 'Endowment ($)',
          type: 'number',
          default: 10,
          min: 1,
          max: 100,
          step: 1,
          description: 'Total amount to be split',
        },
        {
          name: 'minOffer',
          label: 'Minimum Offer ($)',
          type: 'number',
          default: 0,
          min: 0,
          max: 50,
          step: 0.5,
          description: 'Minimum amount the proposer can offer',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.endowment !== undefined && config.endowment <= 0) {
      return { valid: false, error: 'Endowment must be positive' };
    }
    if (config.minOffer !== undefined && config.minOffer < 0) {
      return { valid: false, error: 'Minimum offer cannot be negative' };
    }
    if (config.minOffer !== undefined && config.endowment !== undefined
        && config.minOffer > config.endowment) {
      return { valid: false, error: 'Minimum offer cannot exceed the endowment' };
    }
    return { valid: true };
  }

  protected validateFirstMove(
    action: Record<string, any>,
    config: Record<string, any>
  ): string | null {
    const { offer } = action;
    const endowment = config.endowment ?? 10;
    const minOffer = config.minOffer ?? 0;

    if (offer === undefined || offer === null) return 'Offer amount is required';
    if (typeof offer !== 'number' || isNaN(offer)) return 'Offer must be a valid number';
    if (offer < minOffer) return `Offer must be at least $${minOffer}`;
    if (offer > endowment) return `Offer cannot exceed the endowment of $${endowment}`;
    return null;
  }

  protected validateSecondMove(
    action: Record<string, any>,
    _firstMoveAction: Record<string, any>,
    _config: Record<string, any>
  ): string | null {
    const { accept } = action;
    if (accept === undefined || accept === null) return 'Decision is required';
    if (typeof accept !== 'boolean') return 'Decision must be accept or reject';
    return null;
  }

  protected calculatePairResult(
    firstMoveAction: Record<string, any>,
    secondMoveAction: Record<string, any>,
    config: Record<string, any>
  ) {
    const endowment = config.endowment ?? 10;
    const offer = firstMoveAction.offer as number;
    const accepted = secondMoveAction.accept as boolean;

    if (accepted) {
      return {
        firstMoverProfit: Math.round((endowment - offer) * 100) / 100,
        secondMoverProfit: Math.round(offer * 100) / 100,
        firstMoverResultData: {
          role: 'proposer',
          offer,
          accepted: true,
          endowment,
          kept: endowment - offer,
        },
        secondMoverResultData: {
          role: 'responder',
          offer,
          accepted: true,
          endowment,
          received: offer,
        },
      };
    } else {
      return {
        firstMoverProfit: 0,
        secondMoverProfit: 0,
        firstMoverResultData: {
          role: 'proposer',
          offer,
          accepted: false,
          endowment,
          kept: 0,
        },
        secondMoverResultData: {
          role: 'responder',
          offer,
          accepted: false,
          endowment,
          received: 0,
        },
      };
    }
  }
}
