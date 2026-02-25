import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SequentialBaseEngine } from './SequentialBaseEngine';

/**
 * Trust Game Engine (Week 20)
 *
 * Pairs: Sender + Receiver
 * Stage 1: Sender decides how much of their endowment to send (0 to endowment).
 *          The amount sent is multiplied by a multiplier (default 3).
 * Stage 2: Receiver sees the tripled amount and decides how much to return
 *          (0 to the tripled amount).
 *
 * Payoffs:
 *   Sender profit  = endowment - amountSent + amountReturned
 *   Receiver profit = amountSent * multiplier - amountReturned
 *
 * game_config: {
 *   endowment: number,   // starting amount for sender (default 10)
 *   multiplier: number,   // multiplication factor for sent amount (default 3)
 * }
 */
export class TrustGameEngine extends SequentialBaseEngine {
  readonly gameType: GameType = 'trust_game';

  protected roles(): [string, string] {
    return ['sender', 'receiver'];
  }

  getUIConfig(): UIConfig {
    return {
      name: 'Trust Game',
      description: 'Sender sends money (which is multiplied), then receiver decides how much to return. Tests trust and reciprocity.',
      category: 'sequential',
      weekNumber: 20,
      roles: [
        { role: 'sender', label: 'Sender', description: 'Decide how much of your endowment to send' },
        { role: 'receiver', label: 'Receiver', description: 'Decide how much of the received (tripled) amount to return' },
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
          description: 'Must be even (pairs of sender + receiver)',
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
          name: 'endowment',
          label: 'Endowment ($)',
          type: 'number',
          default: 10,
          min: 1,
          max: 100,
          step: 1,
          description: 'Starting amount for the sender',
        },
        {
          name: 'multiplier',
          label: 'Multiplier',
          type: 'number',
          default: 3,
          min: 1,
          max: 5,
          step: 0.5,
          description: 'Amount sent is multiplied by this factor',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.endowment !== undefined && config.endowment <= 0) {
      return { valid: false, error: 'Endowment must be positive' };
    }
    if (config.multiplier !== undefined && config.multiplier < 1) {
      return { valid: false, error: 'Multiplier must be at least 1' };
    }
    return { valid: true };
  }

  protected validateFirstMove(
    action: Record<string, any>,
    config: Record<string, any>
  ): string | null {
    const { amountSent } = action;
    const endowment = config.endowment ?? 10;

    if (amountSent === undefined || amountSent === null) return 'Amount to send is required';
    if (typeof amountSent !== 'number' || isNaN(amountSent)) return 'Amount must be a valid number';
    if (amountSent < 0) return 'Amount cannot be negative';
    if (amountSent > endowment) return `Amount cannot exceed your endowment of $${endowment}`;
    return null;
  }

  protected validateSecondMove(
    action: Record<string, any>,
    firstMoveAction: Record<string, any>,
    config: Record<string, any>
  ): string | null {
    const { amountReturned } = action;
    const multiplier = config.multiplier ?? 3;
    const amountSent = firstMoveAction.amountSent as number;
    const tripledAmount = amountSent * multiplier;

    if (amountReturned === undefined || amountReturned === null) return 'Amount to return is required';
    if (typeof amountReturned !== 'number' || isNaN(amountReturned)) return 'Amount must be a valid number';
    if (amountReturned < 0) return 'Amount cannot be negative';
    if (amountReturned > tripledAmount) return `Amount cannot exceed the received amount of $${tripledAmount}`;
    return null;
  }

  protected calculatePairResult(
    firstMoveAction: Record<string, any>,
    secondMoveAction: Record<string, any>,
    config: Record<string, any>
  ) {
    const endowment = config.endowment ?? 10;
    const multiplier = config.multiplier ?? 3;
    const amountSent = firstMoveAction.amountSent as number;
    const amountReturned = secondMoveAction.amountReturned as number;

    const tripledAmount = amountSent * multiplier;
    const senderProfit = endowment - amountSent + amountReturned;
    const receiverProfit = tripledAmount - amountReturned;

    return {
      firstMoverProfit: Math.round(senderProfit * 100) / 100,
      secondMoverProfit: Math.round(receiverProfit * 100) / 100,
      firstMoverResultData: {
        role: 'sender',
        amountSent,
        amountReturned,
        tripledAmount,
        endowment,
        multiplier,
      },
      secondMoverResultData: {
        role: 'receiver',
        amountSent,
        amountReturned,
        tripledAmount,
        endowment,
        multiplier,
      },
    };
  }
}
