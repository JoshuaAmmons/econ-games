import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';

/**
 * Dictator Game Engine (Week 21)
 *
 * Each player acts as a "dictator" who receives an endowment and decides
 * how much to give away (0 to endowment). The key behavioral insight is
 * measuring generosity when the other party has no ability to punish.
 *
 * Payoff: profit = endowment - amountGiven
 *
 * In the simultaneous version, there is no actual receiver pairing.
 * Each player independently decides how much to give, and we record
 * giving patterns to reveal generosity norms and other-regarding preferences.
 *
 * game_config: {
 *   endowment: number,  // tokens each player receives (default 10)
 * }
 */
export class DictatorEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'dictator';

  getUIConfig(): UIConfig {
    return {
      name: 'Dictator Game',
      description: 'Each player decides how much of their endowment to give away. Measures generosity when the recipient cannot punish.',
      category: 'simultaneous',
      weekNumber: 21,
      roles: [
        { role: 'player', label: 'Player', description: 'Decide how much of your endowment to give away' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Group Size',
          type: 'number',
          default: 8,
          min: 2,
          max: 40,
          description: 'Number of players in the group',
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
          default: 60,
          min: 15,
          max: 300,
        },
        {
          name: 'endowment',
          label: 'Endowment (tokens)',
          type: 'number',
          default: 10,
          min: 1,
          max: 100,
          step: 1,
          description: 'Tokens each player receives per round',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.endowment !== undefined && config.endowment <= 0) {
      return { valid: false, error: 'Endowment must be positive' };
    }
    return { valid: true };
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    config: Record<string, any>
  ): string | null {
    const { give } = action;
    if (give === undefined || give === null) {
      return 'Give amount is required';
    }
    if (typeof give !== 'number' || isNaN(give)) {
      return 'Give amount must be a valid number';
    }
    if (give < 0) {
      return 'Give amount cannot be negative';
    }
    const endowment = config.endowment ?? 10;
    if (give > endowment) {
      return `Give amount cannot exceed your endowment of ${endowment} tokens`;
    }
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    _allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const endowment = config.endowment ?? 10;

    const gives = actions.map((a) => ({
      playerId: a.playerId,
      give: a.action.give as number,
    }));

    const totalGive = gives.reduce((sum, g) => sum + g.give, 0);
    const avgGive = totalGive / actions.length;

    return gives.map((g) => {
      const keep = endowment - g.give;
      const profit = keep;
      const percentGiven = Math.round((g.give / endowment) * 10000) / 100;

      return {
        playerId: g.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          give: g.give,
          keep,
          endowment,
          avgGive: Math.round(avgGive * 100) / 100,
          percentGiven,
          totalGive: Math.round(totalGive * 100) / 100,
          groupSize: actions.length,
        },
      };
    });
  }
}
