import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SequentialBaseEngine } from './SequentialBaseEngine';

/**
 * Principal-Agent Game Engine (Week 14)
 *
 * Pairs: Principal + Agent
 * Stage 1: Principal designs a contract (fixed wage + bonus for high output)
 * Stage 2: Agent chooses effort (high or low)
 *   - High effort: probability highEffortProb of high output, costs effortCost
 *   - Low effort: probability lowEffortProb of high output, costs 0
 * Output is then realized probabilistically.
 *
 * Payoffs:
 *   Principal: output - wage - bonus (if high output)
 *   Agent: wage + bonus (if high output) - effort cost
 *
 * game_config: {
 *   highOutput: number,       // output value if high (default 100)
 *   lowOutput: number,        // output value if low (default 30)
 *   highEffortProb: number,   // prob of high output with high effort (default 0.8)
 *   lowEffortProb: number,    // prob of high output with low effort (default 0.2)
 *   effortCost: number,       // cost of high effort to agent (default 10)
 *   maxWage: number,          // maximum fixed wage (default 50)
 *   maxBonus: number,         // maximum bonus (default 50)
 * }
 */
export class PrincipalAgentEngine extends SequentialBaseEngine {
  readonly gameType: GameType = 'principal_agent';

  protected roles(): [string, string] {
    return ['principal', 'agent'];
  }

  getUIConfig(): UIConfig {
    return {
      name: 'Principal-Agent Game',
      description: 'Principal designs a contract, agent chooses effort. Output depends on effort probabilistically.',
      category: 'sequential',
      weekNumber: 14,
      roles: [
        { role: 'principal', label: 'Principal', description: 'Design a compensation contract' },
        { role: 'agent', label: 'Agent', description: 'Choose effort level given the contract' },
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
          description: 'Must be even (pairs of principal + agent)',
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
          name: 'highOutput',
          label: 'High Output Value ($)',
          type: 'number',
          default: 100,
          min: 10,
          max: 500,
          step: 5,
        },
        {
          name: 'lowOutput',
          label: 'Low Output Value ($)',
          type: 'number',
          default: 30,
          min: 0,
          max: 200,
          step: 5,
        },
        {
          name: 'highEffortProb',
          label: 'High Effort → High Output Prob',
          type: 'number',
          default: 0.8,
          min: 0,
          max: 1,
          step: 0.05,
        },
        {
          name: 'lowEffortProb',
          label: 'Low Effort → High Output Prob',
          type: 'number',
          default: 0.2,
          min: 0,
          max: 1,
          step: 0.05,
        },
        {
          name: 'effortCost',
          label: 'High Effort Cost ($)',
          type: 'number',
          default: 10,
          min: 0,
          max: 50,
          step: 1,
        },
        {
          name: 'maxWage',
          label: 'Max Fixed Wage ($)',
          type: 'number',
          default: 50,
          min: 0,
          max: 200,
          step: 1,
        },
        {
          name: 'maxBonus',
          label: 'Max Bonus ($)',
          type: 'number',
          default: 50,
          min: 0,
          max: 200,
          step: 1,
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.highOutput !== undefined && config.highOutput <= 0) {
      return { valid: false, error: 'High output must be positive' };
    }
    if (config.lowOutput !== undefined && config.lowOutput < 0) {
      return { valid: false, error: 'Low output cannot be negative' };
    }
    if (config.highOutput !== undefined && config.lowOutput !== undefined
        && config.highOutput <= config.lowOutput) {
      return { valid: false, error: 'High output must be greater than low output' };
    }
    if (config.highEffortProb !== undefined
        && (config.highEffortProb < 0 || config.highEffortProb > 1)) {
      return { valid: false, error: 'High effort probability must be between 0 and 1' };
    }
    if (config.lowEffortProb !== undefined
        && (config.lowEffortProb < 0 || config.lowEffortProb > 1)) {
      return { valid: false, error: 'Low effort probability must be between 0 and 1' };
    }
    return { valid: true };
  }

  protected validateFirstMove(
    action: Record<string, any>,
    config: Record<string, any>
  ): string | null {
    const { fixedWage, bonus } = action;
    const maxWage = config.maxWage ?? 50;
    const maxBonus = config.maxBonus ?? 50;

    if (fixedWage === undefined) return 'Fixed wage is required';
    if (typeof fixedWage !== 'number' || isNaN(fixedWage)) return 'Fixed wage must be a number';
    if (fixedWage < 0) return 'Fixed wage cannot be negative';
    if (fixedWage > maxWage) return `Fixed wage cannot exceed $${maxWage}`;

    if (bonus === undefined) return 'Bonus is required';
    if (typeof bonus !== 'number' || isNaN(bonus)) return 'Bonus must be a number';
    if (bonus < 0) return 'Bonus cannot be negative';
    if (bonus > maxBonus) return `Bonus cannot exceed $${maxBonus}`;

    return null;
  }

  protected validateSecondMove(
    action: Record<string, any>,
    _firstMoveAction: Record<string, any>,
    _config: Record<string, any>
  ): string | null {
    const { highEffort } = action;
    if (highEffort === undefined) return 'Effort choice is required';
    if (typeof highEffort !== 'boolean') return 'Effort must be high or low';
    return null;
  }

  protected calculatePairResult(
    firstMoveAction: Record<string, any>,
    secondMoveAction: Record<string, any>,
    config: Record<string, any>
  ) {
    const highOutput = config.highOutput ?? 100;
    const lowOutput = config.lowOutput ?? 30;
    const highEffortProb = config.highEffortProb ?? 0.8;
    const lowEffortProb = config.lowEffortProb ?? 0.2;
    const effortCostAmount = config.effortCost ?? 10;

    const fixedWage = firstMoveAction.fixedWage as number;
    const bonus = firstMoveAction.bonus as number;
    const highEffort = secondMoveAction.highEffort as boolean;

    // Determine output probabilistically
    const prob = highEffort ? highEffortProb : lowEffortProb;
    const isHighOutput = Math.random() < prob;
    const output = isHighOutput ? highOutput : lowOutput;

    // Payoffs
    const bonusPaid = isHighOutput ? bonus : 0;
    const agentEffortCost = highEffort ? effortCostAmount : 0;

    const principalProfit = output - fixedWage - bonusPaid;
    const agentProfit = fixedWage + bonusPaid - agentEffortCost;

    return {
      firstMoverProfit: Math.round(principalProfit * 100) / 100,
      secondMoverProfit: Math.round(agentProfit * 100) / 100,
      firstMoverResultData: {
        role: 'principal',
        fixedWage,
        bonus,
        highEffort,
        isHighOutput,
        output,
        bonusPaid,
      },
      secondMoverResultData: {
        role: 'agent',
        fixedWage,
        bonus,
        highEffort,
        isHighOutput,
        output,
        bonusPaid,
        effortCost: agentEffortCost,
      },
    };
  }

  /**
   * Strip agent's effort choice from broadcast — the principal should only
   * observe the output (which is probabilistic), not the effort directly.
   * This preserves the moral hazard information asymmetry.
   */
  protected sanitizeSecondMoveForBroadcast(action: Record<string, any>): Record<string, any> {
    const { highEffort, ...safe } = action;
    return safe;
  }

  protected sanitizeResultDataForBroadcast(
    resultData: Record<string, any>,
    _role: 'firstMover' | 'secondMover'
  ): Record<string, any> {
    // Strip effort details from broadcast to all players
    const { highEffort, effortCost, ...safe } = resultData;
    return safe;
  }
}
