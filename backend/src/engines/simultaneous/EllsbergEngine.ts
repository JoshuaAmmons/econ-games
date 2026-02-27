import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';

/**
 * Ellsberg Urn Choice Task Engine (Week 23)
 *
 * Based on: Ellsberg (1961), tested experimentally by Smith (1969) QJE.
 *
 * Players face two urns:
 *   - Known Urn: contains exactly 50 red and 50 black balls (known probabilities)
 *   - Ambiguous Urn: contains 100 red and black balls in unknown proportions
 *
 * Each player chooses:
 *   1. Which urn to draw from (known or ambiguous)
 *   2. Which color to bet on (red or black)
 *
 * If the drawn ball matches the chosen color, the player wins the prize.
 * The Ellsberg Paradox: most people prefer the known urn, revealing ambiguity aversion
 * even though the expected value is identical.
 *
 * game_config: {
 *   prize: number,       // reward for a correct guess (default 10)
 * }
 */
export class EllsbergEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'ellsberg';

  getUIConfig(): UIConfig {
    return {
      name: 'Ellsberg Urn Choice Task',
      description:
        'Choose between a known urn (50/50 red/black) and an ambiguous urn (unknown mix). Bet on a color — reveals ambiguity aversion.',
      category: 'simultaneous',
      weekNumber: 23,
      roles: [
        { role: 'chooser', label: 'Chooser', description: 'Pick an urn and a color to bet on' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Number of Players',
          type: 'number',
          default: 10,
          min: 1,
          max: 60,
          description: 'Total number of participants',
        },
        {
          name: 'num_rounds',
          label: 'Number of Rounds',
          type: 'number',
          default: 10,
          min: 1,
          max: 30,
        },
        {
          name: 'time_per_round',
          label: 'Time per Round (seconds)',
          type: 'number',
          default: 30,
          min: 10,
          max: 120,
        },
        {
          name: 'prize',
          label: 'Prize for Correct Guess ($)',
          type: 'number',
          default: 10,
          min: 1,
          max: 100,
          step: 1,
          description: 'Amount won if drawn ball matches chosen color',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.prize !== undefined && config.prize <= 0) {
      return { valid: false, error: 'Prize must be positive' };
    }
    return { valid: true };
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    _config: Record<string, any>
  ): string | null {
    const { urn, color } = action;

    if (!urn) return 'You must choose an urn';
    if (urn !== 'known' && urn !== 'ambiguous') {
      return 'Urn must be "known" or "ambiguous"';
    }

    if (!color) return 'You must choose a color';
    if (color !== 'red' && color !== 'black') {
      return 'Color must be "red" or "black"';
    }

    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    _allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const prize = config.prize ?? 10;

    // Generate the draws for this round
    // Known urn: exactly 50/50 → fair coin flip
    const knownDraw = Math.random() < 0.5 ? 'red' : 'black';

    // Ambiguous urn: first determine its composition randomly, then draw
    // Composition: random number of red balls from 0 to 100
    const ambiguousRedCount = Math.floor(Math.random() * 101); // 0–100
    const ambiguousDraw = Math.random() * 100 < ambiguousRedCount ? 'red' : 'black';

    // Track aggregate choices for instructor analytics
    let knownCount = 0;
    let ambiguousCount = 0;

    const results = actions.map((a) => {
      const urn = a.action.urn as string;
      const color = a.action.color as string;

      if (urn === 'known') knownCount++;
      else ambiguousCount++;

      const draw = urn === 'known' ? knownDraw : ambiguousDraw;
      const correct = draw === color;
      const profit = correct ? prize : 0;

      return {
        playerId: a.playerId,
        profit,
        resultData: {
          urn,
          color,
          draw,
          correct,
          prize: correct ? prize : 0,
          knownDraw,
          ambiguousDraw,
          ambiguousComposition: ambiguousRedCount,
          knownCount: 0,
          ambiguousCount: 0,
          totalPlayers: 0,
        },
      };
    });

    // Attach aggregate stats to each result
    for (const r of results) {
      r.resultData.knownCount = knownCount;
      r.resultData.ambiguousCount = ambiguousCount;
      r.resultData.totalPlayers = actions.length;
    }

    return results;
  }
}
