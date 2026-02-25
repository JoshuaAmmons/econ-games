import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';

/**
 * Matching Pennies Game Engine (Week 24)
 *
 * N players simultaneously choose 'heads' or 'tails'. Players are divided
 * into two roles based on their stable sorted index:
 * - Even-indexed players (0, 2, 4, ...) are "matchers" — they win when choices match
 * - Odd-indexed players (1, 3, 5, ...) are "mismatchers" — they win when choices differ
 *
 * Each player's payoff is calculated against all opponents in the opposite role:
 * - Matcher vs mismatcher: if choices match, matcher gets +winPayoff, mismatcher gets -winPayoff
 * - Matcher vs mismatcher: if choices differ, mismatcher gets +winPayoff, matcher gets -winPayoff
 * - Payoff is averaged across all opponent pairings
 *
 * This is a zero-sum game with no pure-strategy Nash equilibrium.
 * The unique mixed-strategy equilibrium is 50/50 heads/tails for both roles.
 *
 * game_config: {
 *   winPayoff: number,  // payoff for winning a pairing (default 1)
 * }
 */
export class MatchingPenniesEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'matching_pennies';

  getUIConfig(): UIConfig {
    return {
      name: 'Matching Pennies',
      description: 'Matchers try to match their opponent\'s coin choice; mismatchers try to differ. A zero-sum game with no pure-strategy equilibrium.',
      category: 'simultaneous',
      weekNumber: 24,
      roles: [
        { role: 'player', label: 'Player', description: 'Choose heads or tails. Your role (matcher or mismatcher) is assigned by player index.' },
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
          step: 2,
          description: 'Number of players (even number recommended for balanced roles)',
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
          name: 'winPayoff',
          label: 'Win Payoff',
          type: 'number',
          default: 1,
          min: 0.5,
          max: 10,
          step: 0.5,
          description: 'Payoff for winning a pairing (loser gets negative of this)',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.winPayoff !== undefined && config.winPayoff <= 0) {
      return { valid: false, error: 'Win payoff must be positive' };
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
    if (choice !== 'heads' && choice !== 'tails') {
      return 'Choice must be either "heads" or "tails"';
    }
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const winPayoff = config.winPayoff ?? 1;

    // Build a stable player ordering from allPlayers sorted by id
    const sortedPlayerIds = [...allPlayers]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((p) => p.id);

    // Assign roles: even-indexed = matcher, odd-indexed = mismatcher
    const playerRoleMap = new Map<string, 'matcher' | 'mismatcher'>();
    for (let i = 0; i < sortedPlayerIds.length; i++) {
      playerRoleMap.set(sortedPlayerIds[i], i % 2 === 0 ? 'matcher' : 'mismatcher');
    }

    // Map actions by playerId for quick lookup
    const actionMap = new Map<string, 'heads' | 'tails'>();
    for (const a of actions) {
      actionMap.set(a.playerId, a.action.choice as 'heads' | 'tails');
    }

    // Separate submitting players into matchers and mismatchers
    const matchers = actions.filter((a) => playerRoleMap.get(a.playerId) === 'matcher');
    const mismatchers = actions.filter((a) => playerRoleMap.get(a.playerId) === 'mismatcher');

    // Calculate payoffs for each player
    return actions.map((a) => {
      const myChoice = a.action.choice as 'heads' | 'tails';
      const myRole = playerRoleMap.get(a.playerId) ?? 'matcher';
      const opponents = myRole === 'matcher' ? mismatchers : matchers;

      let totalPayoff = 0;
      const numOpponents = opponents.length;

      for (const opp of opponents) {
        const oppChoice = opp.action.choice as 'heads' | 'tails';
        const choicesMatch = myChoice === oppChoice;

        if (myRole === 'matcher') {
          // Matcher wins when choices match
          totalPayoff += choicesMatch ? winPayoff : -winPayoff;
        } else {
          // Mismatcher wins when choices differ
          totalPayoff += choicesMatch ? -winPayoff : winPayoff;
        }
      }

      // Average payoff across all pairings (avoid division by zero)
      const profit = numOpponents > 0 ? totalPayoff / numOpponents : 0;

      return {
        playerId: a.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          choice: myChoice,
          role: myRole,
          numOpponents,
          totalPayoff: Math.round(totalPayoff * 100) / 100,
          avgPayoff: Math.round(profit * 100) / 100,
          matcherCount: matchers.length,
          mismatcherCount: mismatchers.length,
          groupSize: actions.length,
          winPayoff,
        },
      };
    });
  }
}
