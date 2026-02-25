import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';

/**
 * Stag Hunt Game Engine (Week 15)
 *
 * N players simultaneously choose 'stag' or 'hare'.
 *
 * Payoff rules:
 * - If ALL players choose stag: each gets stagPayoff (default 5)
 * - If a player chooses hare: they get harePayoff (default 3), regardless of others
 * - If a player chooses stag but not all others did: they get 0 (the hunt fails)
 *
 * This creates a coordination game with two Nash equilibria:
 * - All-stag is payoff-dominant (higher total payoff)
 * - All-hare is risk-dominant (safe regardless of others' choices)
 *
 * game_config: {
 *   stagPayoff: number,  // payoff when all choose stag (default 5)
 *   harePayoff: number,  // payoff for choosing hare (default 3)
 * }
 */
export class StagHuntEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'stag_hunt';

  getUIConfig(): UIConfig {
    return {
      name: 'Stag Hunt',
      description: 'Players simultaneously choose to hunt stag (risky, high reward if all cooperate) or hare (safe, moderate reward).',
      category: 'simultaneous',
      weekNumber: 15,
      roles: [
        { role: 'player', label: 'Player', description: 'Choose to hunt stag or hare' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Group Size',
          type: 'number',
          default: 6,
          min: 2,
          max: 40,
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
          default: 60,
          min: 15,
          max: 300,
        },
        {
          name: 'stagPayoff',
          label: 'Stag Payoff',
          type: 'number',
          default: 5,
          min: 1,
          max: 100,
          step: 1,
          description: 'Payoff to each player when ALL choose stag',
        },
        {
          name: 'harePayoff',
          label: 'Hare Payoff',
          type: 'number',
          default: 3,
          min: 1,
          max: 100,
          step: 1,
          description: 'Payoff for choosing hare (regardless of others)',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.stagPayoff !== undefined && config.stagPayoff <= 0) {
      return { valid: false, error: 'Stag payoff must be positive' };
    }
    if (config.harePayoff !== undefined && config.harePayoff <= 0) {
      return { valid: false, error: 'Hare payoff must be positive' };
    }
    if (
      config.stagPayoff !== undefined &&
      config.harePayoff !== undefined &&
      config.stagPayoff <= config.harePayoff
    ) {
      return { valid: false, error: 'Stag payoff should be greater than hare payoff for a meaningful coordination game' };
    }
    return { valid: true };
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    _config: Record<string, any>
  ): string | null {
    const { choice } = action;
    if (choice === undefined || choice === null) {
      return 'Choice is required';
    }
    if (choice !== 'stag' && choice !== 'hare') {
      return 'Choice must be either "stag" or "hare"';
    }
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const stagPayoff = config.stagPayoff ?? 5;
    const harePayoff = config.harePayoff ?? 3;

    const choices = actions.map((a) => ({
      playerId: a.playerId,
      choice: a.action.choice as 'stag' | 'hare',
    }));

    const stagCount = choices.filter((c) => c.choice === 'stag').length;
    const hareCount = choices.filter((c) => c.choice === 'hare').length;
    const allChoseStag = stagCount === actions.length && actions.length === allPlayers.length;
    const groupSize = actions.length;

    return choices.map((c) => {
      let profit: number;
      if (c.choice === 'hare') {
        // Hare hunters always get harePayoff
        profit = harePayoff;
      } else {
        // Stag hunters get stagPayoff only if ALL chose stag, otherwise 0
        profit = allChoseStag ? stagPayoff : 0;
      }

      return {
        playerId: c.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          choice: c.choice,
          stagCount,
          hareCount,
          allChoseStag,
          groupSize,
          stagPayoff,
          harePayoff,
        },
      };
    });
  }
}
