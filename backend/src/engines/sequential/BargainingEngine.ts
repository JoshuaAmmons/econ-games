import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SequentialBaseEngine } from './SequentialBaseEngine';

/**
 * Bargaining Game Engine (Week 5)
 *
 * Pairs: Proposer + Responder
 * Stage 1: Proposer proposes a split of a pie by stating the amount they want to keep
 *          (0 to pieSize). The responder would receive pieSize - keep.
 * Stage 2: Responder accepts or rejects.
 *   - Accept: proposer gets kept amount, responder gets pieSize - kept
 *   - Reject: both get $0
 *
 * Similar to ultimatum but framed around bargaining with a shrinking pie.
 * The discountFactor is displayed to students so they understand that in
 * repeated rounds the pie shrinks (instructors can reduce pieSize between
 * sessions, or students internalize the cost of delay).
 *
 * game_config: {
 *   pieSize: number,        // total pie to split (default 10)
 *   discountFactor: number, // pie shrinks by this factor each round (default 0.9)
 * }
 */
export class BargainingEngine extends SequentialBaseEngine {
  readonly gameType: GameType = 'bargaining';

  protected roles(): [string, string] {
    return ['proposer', 'responder'];
  }

  getUIConfig(): UIConfig {
    return {
      name: 'Bargaining Game',
      description: 'Proposer states how much of the pie to keep. Responder accepts or rejects. Rejection means both get nothing.',
      category: 'sequential',
      weekNumber: 5,
      roles: [
        { role: 'proposer', label: 'Proposer', description: 'Propose how to split the pie by choosing how much to keep' },
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
          default: 120,
          min: 30,
          max: 300,
        },
        {
          name: 'pieSize',
          label: 'Pie Size ($)',
          type: 'number',
          default: 10,
          min: 1,
          max: 100,
          step: 1,
          description: 'Total amount to be split',
        },
        {
          name: 'discountFactor',
          label: 'Discount Factor',
          type: 'number',
          default: 0.9,
          min: 0.1,
          max: 1,
          step: 0.05,
          description: 'Pie shrinks by this factor each round',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.pieSize !== undefined && config.pieSize <= 0) {
      return { valid: false, error: 'Pie size must be positive' };
    }
    if (config.discountFactor !== undefined && (config.discountFactor <= 0 || config.discountFactor > 1)) {
      return { valid: false, error: 'Discount factor must be between 0 (exclusive) and 1 (inclusive)' };
    }
    return { valid: true };
  }

  protected validateFirstMove(
    action: Record<string, any>,
    config: Record<string, any>
  ): string | null {
    const { keep } = action;
    const pieSize = config.pieSize ?? 10;

    if (keep === undefined || keep === null) return 'Amount to keep is required';
    if (typeof keep !== 'number' || isNaN(keep)) return 'Amount must be a valid number';
    if (keep < 0) return 'Amount cannot be negative';
    if (keep > pieSize) return `Amount cannot exceed the pie size of $${pieSize}`;
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
    const pieSize = config.pieSize ?? 10;
    const keep = firstMoveAction.keep as number;
    const offer = pieSize - keep;
    const accepted = secondMoveAction.accept as boolean;

    if (accepted) {
      return {
        firstMoverProfit: Math.round(keep * 100) / 100,
        secondMoverProfit: Math.round(offer * 100) / 100,
        firstMoverResultData: {
          role: 'proposer',
          keep,
          offer,
          accepted: true,
          pieSize,
        },
        secondMoverResultData: {
          role: 'responder',
          keep,
          offer,
          accepted: true,
          pieSize,
        },
      };
    } else {
      return {
        firstMoverProfit: 0,
        secondMoverProfit: 0,
        firstMoverResultData: {
          role: 'proposer',
          keep,
          offer,
          accepted: false,
          pieSize,
        },
        secondMoverResultData: {
          role: 'responder',
          keep,
          offer,
          accepted: false,
          pieSize,
        },
      };
    }
  }
}
