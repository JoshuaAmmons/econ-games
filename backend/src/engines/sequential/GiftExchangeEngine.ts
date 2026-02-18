import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SequentialBaseEngine } from './SequentialBaseEngine';

/**
 * Gift Exchange Game Engine (Week 10)
 *
 * Pairs: Employer + Worker
 * Stage 1: Employer offers a wage
 * Stage 2: Worker chooses an effort level (costly to worker)
 *
 * Payoffs:
 *   Employer profit = effort × productivityMultiplier - wage
 *   Worker profit = wage - effortCost(effort)
 *
 * Effort cost is quadratic: cost = (effort / maxEffort)² × maxEffortCost
 *
 * game_config: {
 *   maxWage: number,              // max wage employer can offer (default 50)
 *   maxEffort: number,            // max effort level (default 10)
 *   productivityMultiplier: number, // output per unit effort (default 10)
 *   maxEffortCost: number,        // cost at maximum effort (default 20)
 * }
 */
export class GiftExchangeEngine extends SequentialBaseEngine {
  readonly gameType: GameType = 'gift_exchange';

  protected roles(): [string, string] {
    return ['employer', 'worker'];
  }

  getUIConfig(): UIConfig {
    return {
      name: 'Gift Exchange Game',
      description: 'Employer offers a wage, then worker chooses effort level. Tests reciprocity.',
      category: 'sequential',
      weekNumber: 10,
      roles: [
        { role: 'employer', label: 'Employer', description: 'Offer a wage to the worker' },
        { role: 'worker', label: 'Worker', description: 'Choose effort level after seeing wage offer' },
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
          description: 'Must be even (pairs of employer + worker)',
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
          name: 'maxWage',
          label: 'Maximum Wage ($)',
          type: 'number',
          default: 50,
          min: 1,
          max: 200,
          step: 1,
          description: 'Maximum wage an employer can offer',
        },
        {
          name: 'maxEffort',
          label: 'Maximum Effort Level',
          type: 'number',
          default: 10,
          min: 1,
          max: 20,
          step: 1,
          description: 'Maximum effort a worker can choose',
        },
        {
          name: 'productivityMultiplier',
          label: 'Productivity Multiplier',
          type: 'number',
          default: 10,
          min: 1,
          max: 50,
          step: 1,
          description: 'Revenue generated per unit of effort',
        },
        {
          name: 'maxEffortCost',
          label: 'Max Effort Cost ($)',
          type: 'number',
          default: 20,
          min: 0,
          max: 100,
          step: 1,
          description: 'Cost to worker at maximum effort (quadratic scale)',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.maxWage !== undefined && config.maxWage <= 0) {
      return { valid: false, error: 'Maximum wage must be positive' };
    }
    if (config.maxEffort !== undefined && config.maxEffort <= 0) {
      return { valid: false, error: 'Maximum effort must be positive' };
    }
    return { valid: true };
  }

  protected validateFirstMove(
    action: Record<string, any>,
    config: Record<string, any>
  ): string | null {
    const { wage } = action;
    const maxWage = config.maxWage ?? 50;

    if (wage === undefined || wage === null) return 'Wage is required';
    if (typeof wage !== 'number' || isNaN(wage)) return 'Wage must be a valid number';
    if (wage < 0) return 'Wage cannot be negative';
    if (wage > maxWage) return `Wage cannot exceed $${maxWage}`;
    return null;
  }

  protected validateSecondMove(
    action: Record<string, any>,
    _firstMoveAction: Record<string, any>,
    config: Record<string, any>
  ): string | null {
    const { effort } = action;
    const maxEffort = config.maxEffort ?? 10;

    if (effort === undefined || effort === null) return 'Effort level is required';
    if (typeof effort !== 'number' || isNaN(effort)) return 'Effort must be a valid number';
    if (!Number.isInteger(effort)) return 'Effort must be a whole number';
    if (effort < 1) return 'Minimum effort is 1';
    if (effort > maxEffort) return `Effort cannot exceed ${maxEffort}`;
    return null;
  }

  private effortCost(effort: number, maxEffort: number, maxEffortCost: number): number {
    const ratio = effort / maxEffort;
    return ratio * ratio * maxEffortCost;
  }

  protected calculatePairResult(
    firstMoveAction: Record<string, any>,
    secondMoveAction: Record<string, any>,
    config: Record<string, any>
  ) {
    const maxEffort = config.maxEffort ?? 10;
    const productivityMultiplier = config.productivityMultiplier ?? 10;
    const maxEffortCost = config.maxEffortCost ?? 20;

    const wage = firstMoveAction.wage as number;
    const effort = secondMoveAction.effort as number;
    const costOfEffort = this.effortCost(effort, maxEffort, maxEffortCost);

    const output = effort * productivityMultiplier;
    const employerProfit = output - wage;
    const workerProfit = wage - costOfEffort;

    return {
      firstMoverProfit: Math.round(employerProfit * 100) / 100,
      secondMoverProfit: Math.round(workerProfit * 100) / 100,
      firstMoverResultData: {
        role: 'employer',
        wage,
        effort,
        output,
        costOfEffort: Math.round(costOfEffort * 100) / 100,
        productivityMultiplier,
      },
      secondMoverResultData: {
        role: 'worker',
        wage,
        effort,
        output,
        costOfEffort: Math.round(costOfEffort * 100) / 100,
        productivityMultiplier,
      },
    };
  }
}
