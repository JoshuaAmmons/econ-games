import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';

/**
 * Public Goods Game Engine (Week 6)
 *
 * N players each receive an endowment and decide how much to contribute
 * to a public good. Contributions are multiplied by MPCR and shared equally.
 *
 * Payoff: π_i = (endowment - contribution_i) + MPCR × Σcontributions
 *
 * The social optimum is to contribute everything (if MPCR × N > 1),
 * but the individual incentive is to free-ride (contribute 0).
 *
 * game_config: {
 *   endowment: number,  // starting tokens per player (default 20)
 *   mpcr: number,       // marginal per-capita return (default 0.4)
 * }
 */
export class PublicGoodsEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'public_goods';

  getUIConfig(): UIConfig {
    return {
      name: 'Public Goods Game',
      description: 'Players decide how much of their endowment to contribute to a shared public good.',
      category: 'simultaneous',
      weekNumber: 6,
      roles: [
        { role: 'player', label: 'Player', description: 'Choose how much to contribute to the public good' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Group Size',
          type: 'number',
          default: 5,
          min: 2,
          max: 20,
          description: 'Number of players in the group',
        },
        {
          name: 'num_rounds',
          label: 'Number of Rounds',
          type: 'number',
          default: 10,
          min: 1,
          max: 50,
        },
        {
          name: 'time_per_round',
          label: 'Time per Round (seconds)',
          type: 'number',
          default: 45,
          min: 15,
          max: 300,
        },
        {
          name: 'endowment',
          label: 'Endowment (tokens)',
          type: 'number',
          default: 20,
          min: 1,
          max: 1000,
          step: 1,
          description: 'Starting tokens each player receives per round',
        },
        {
          name: 'mpcr',
          label: 'MPCR (multiplier)',
          type: 'number',
          default: 0.4,
          min: 0.01,
          max: 2,
          step: 0.05,
          description: 'Marginal per-capita return on public good contributions',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.endowment !== undefined && config.endowment <= 0) {
      return { valid: false, error: 'Endowment must be positive' };
    }
    if (config.mpcr !== undefined && config.mpcr <= 0) {
      return { valid: false, error: 'MPCR must be positive' };
    }
    return { valid: true };
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    config: Record<string, any>
  ): string | null {
    const { contribution } = action;
    if (contribution === undefined || contribution === null) {
      return 'Contribution amount is required';
    }
    if (typeof contribution !== 'number' || isNaN(contribution)) {
      return 'Contribution must be a valid number';
    }
    if (contribution < 0) {
      return 'Contribution cannot be negative';
    }
    const endowment = config.endowment || 20;
    if (contribution > endowment) {
      return `Contribution cannot exceed your endowment of ${endowment} tokens`;
    }
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    _allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    const endowment = config.endowment ?? 20;
    const mpcr = config.mpcr ?? 0.4;

    if (actions.length === 0) return [];

    const contributions = actions.map((a) => ({
      playerId: a.playerId,
      contribution: a.action.contribution as number,
    }));

    const totalContribution = contributions.reduce((sum, c) => sum + c.contribution, 0);
    const publicGoodReturn = mpcr * totalContribution;
    const groupSize = actions.length;
    const avgContribution = totalContribution / groupSize;

    return contributions.map((c) => {
      const kept = endowment - c.contribution;
      const profit = kept + publicGoodReturn;

      return {
        playerId: c.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          contribution: c.contribution,
          kept,
          publicGoodReturn: Math.round(publicGoodReturn * 100) / 100,
          totalContribution,
          avgContribution: Math.round(avgContribution * 100) / 100,
          groupSize,
          endowment,
          mpcr,
        },
      };
    });
  }
}
