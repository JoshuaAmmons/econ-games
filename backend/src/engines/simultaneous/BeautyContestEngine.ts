import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';

/**
 * Beauty Contest Engine (Week 2)
 *
 * Also known as "Guess 2/3 of the Average". Players simultaneously
 * choose a number between 0 and maxNumber. The winner is the player(s)
 * whose guess is closest to a target fraction of the group average.
 *
 * Winner gets the prize; ties split it equally. Losers get 0.
 *
 * This game illustrates iterated dominance and level-k thinking.
 * The Nash equilibrium is for everyone to choose 0.
 *
 * game_config: {
 *   maxNumber: number,  // upper bound for guesses (default 100)
 *   fraction: number,   // target fraction of average (default 0.667)
 *   prize: number,      // prize for the winner(s) (default 10)
 * }
 */
export class BeautyContestEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'beauty_contest';

  getUIConfig(): UIConfig {
    return {
      name: 'Beauty Contest (Guess 2/3 of Average)',
      description: 'Choose a number. The winner is closest to a fraction of the group average.',
      category: 'simultaneous',
      weekNumber: 2,
      roles: [
        { role: 'player', label: 'Player', description: 'Choose a number between 0 and the maximum' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Number of Players',
          type: 'number',
          default: 8,
          min: 2,
          max: 40,
          description: 'Total number of players in the group',
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
          name: 'maxNumber',
          label: 'Maximum Number',
          type: 'number',
          default: 100,
          min: 1,
          max: 1000,
          step: 1,
          description: 'Upper bound for guesses (0 to this value)',
        },
        {
          name: 'fraction',
          label: 'Target Fraction',
          type: 'number',
          default: 0.667,
          min: 0.01,
          max: 1,
          step: 0.01,
          description: 'Fraction of the group average that determines the target',
        },
        {
          name: 'prize',
          label: 'Prize',
          type: 'number',
          default: 10,
          min: 1,
          max: 100,
          step: 1,
          description: 'Prize awarded to the winner (split if tied)',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.maxNumber !== undefined && config.maxNumber <= 0) {
      return { valid: false, error: 'Maximum number must be positive' };
    }
    if (config.fraction !== undefined && (config.fraction <= 0 || config.fraction > 1)) {
      return { valid: false, error: 'Fraction must be between 0 (exclusive) and 1 (inclusive)' };
    }
    if (config.prize !== undefined && config.prize <= 0) {
      return { valid: false, error: 'Prize must be positive' };
    }
    return { valid: true };
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    config: Record<string, any>
  ): string | null {
    const { number } = action;
    if (number === undefined || number === null) {
      return 'A number is required';
    }
    if (typeof number !== 'number' || isNaN(number)) {
      return 'Guess must be a valid number';
    }
    if (number < 0) {
      return 'Guess cannot be negative';
    }
    const maxNumber = config.maxNumber ?? 100;
    if (number > maxNumber) {
      return `Guess cannot exceed ${maxNumber}`;
    }
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    _allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const fraction = config.fraction ?? 0.667;
    const prize = config.prize ?? 10;

    const guesses = actions.map((a) => ({
      playerId: a.playerId,
      number: a.action.number as number,
    }));

    // Calculate the group average and target
    const groupAverage = guesses.reduce((sum, g) => sum + g.number, 0) / guesses.length;
    const target = fraction * groupAverage;

    // Find the minimum distance to the target
    const distances = guesses.map((g) => ({
      ...g,
      distance: Math.abs(g.number - target),
    }));
    const minDistance = Math.min(...distances.map((d) => d.distance));

    // Count winners (those at minimum distance) — use epsilon for floating-point comparison
    const epsilon = 1e-9;
    const winners = distances.filter((d) => Math.abs(d.distance - minDistance) < epsilon);
    const numWinners = winners.length;
    const prizePerWinner = prize / numWinners;

    return distances.map((d) => {
      const isWinner = Math.abs(d.distance - minDistance) < epsilon;
      const profit = isWinner ? prizePerWinner : 0;

      return {
        playerId: d.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          number: d.number,
          distance: Math.round(d.distance * 100) / 100,
          isWinner,
          target: Math.round(target * 100) / 100,
          groupAverage: Math.round(groupAverage * 100) / 100,
          numWinners,
          prizePerWinner: Math.round(prizePerWinner * 100) / 100,
          fraction,
          prize,
          groupSize: guesses.length,
        },
      };
    });
  }
}
