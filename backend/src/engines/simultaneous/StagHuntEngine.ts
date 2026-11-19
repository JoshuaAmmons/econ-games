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
 * With stag_threshold = T set, "ALL" becomes "at least T": each stag hunter gets stagPayoff when
 * T or more players choose stag, and 0 otherwise. Unset, blank or 0 keeps the everyone rule.
 *
 * This creates a coordination game with two Nash equilibria:
 * - All-stag is payoff-dominant (higher total payoff)
 * - All-hare is risk-dominant (safe regardless of others' choices)
 *
 * game_config: {
 *   stagPayoff: number,  // payoff when all choose stag (default 5)
 *   harePayoff: number,  // payoff for choosing hare (default 3)
 *   stag_threshold?: number,  // stag hunters needed for stag to pay (unset/blank/0 = everyone)
 * }
 */

/** Stag hunters needed for stag to pay (game_config.stag_threshold), or null for everyone. */
export function stagThreshold(config: Record<string, any>): number | null {
  const raw = config?.stag_threshold;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

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
          description: 'Payoff to each stag hunter when ALL choose stag (or enough do, if Stag Hunters Needed is set)',
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
        {
          name: 'stag_threshold',
          label: 'Stag Hunters Needed',
          type: 'number',
          default: '',
          min: 0,
          max: 40,
          step: 1,
          description: 'Stag pays only when at least this many players hunt stag. Leave blank (or 0) for everyone, the classic rule.',
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
    const raw = config.stag_threshold;
    if (raw !== undefined && raw !== null && raw !== '' && Number(raw) !== 0) {
      const t = Number(raw);
      if (!Number.isInteger(t) || t < 2) {
        return { valid: false, error: 'Stag hunters needed must be a whole number of at least 2 (blank or 0 = everyone)' };
      }
      const groupSize = Number(config.market_size);
      if (Number.isFinite(groupSize) && groupSize > 0 && t > groupSize) {
        return { valid: false, error: `Stag hunters needed (${t}) cannot be more than the group size (${groupSize})` };
      }
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

    // Does the stag hunt succeed? Everyone (the classic rule), or at least stag_threshold hunters
    const threshold = stagThreshold(config);
    const stagSucceeded = threshold === null ? allChoseStag : stagCount >= threshold;

    return choices.map((c) => {
      let profit: number;
      if (c.choice === 'hare') {
        // Hare hunters always get harePayoff
        profit = harePayoff;
      } else {
        // Stag hunters get stagPayoff only if the hunt succeeds, otherwise 0
        profit = stagSucceeded ? stagPayoff : 0;
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
          // Only with a threshold, so a session without one records exactly what it did before
          ...(threshold === null ? {} : { stagThreshold: threshold, stagSucceeded }),
        },
      };
    });
  }
}
