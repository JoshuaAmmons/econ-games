import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';

/**
 * Common Pool Resource Engine (Week 12)
 *
 * Players simultaneously choose how many units to extract from a shared
 * resource pool. Each extracted unit earns extractionValue. However, if
 * total extraction exceeds the pool size, everyone's extraction is
 * proportionally scaled down. The remaining pool generates a regeneration
 * bonus that is shared equally among all players.
 *
 * Payoff: extractedUnits * extractionValue + sharedBonus
 * Where:
 *   - If totalExtraction > poolSize, each player's extraction is scaled:
 *     actualExtraction_i = extraction_i * (poolSize / totalExtraction)
 *   - sharedBonus = max(0, poolSize - totalActualExtraction) * regenerationRate / N
 *
 * This game illustrates the tragedy of the commons.
 *
 * game_config: {
 *   poolSize: number,          // total resource pool (default 100)
 *   maxExtraction: number,     // max units a player can extract (default 25)
 *   extractionValue: number,   // value per unit extracted (default 1)
 *   regenerationRate: number,  // regeneration multiplier on remaining pool (default 0.5)
 * }
 */
export class CommonPoolResourceEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'common_pool_resource';

  getUIConfig(): UIConfig {
    return {
      name: 'Common Pool Resource',
      description: 'Players choose how much to extract from a shared resource. Over-extraction depletes the pool for everyone.',
      category: 'simultaneous',
      weekNumber: 12,
      roles: [
        { role: 'player', label: 'Player', description: 'Choose how many units to extract from the shared pool' },
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
          description: 'Total number of players sharing the resource',
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
          name: 'poolSize',
          label: 'Pool Size (units)',
          type: 'number',
          default: 100,
          min: 1,
          max: 10000,
          step: 1,
          description: 'Total units available in the shared resource pool',
        },
        {
          name: 'maxExtraction',
          label: 'Max Extraction per Player',
          type: 'number',
          default: 25,
          min: 1,
          max: 1000,
          step: 1,
          description: 'Maximum units a single player can attempt to extract',
        },
        {
          name: 'extractionValue',
          label: 'Value per Unit ($)',
          type: 'number',
          default: 1,
          min: 0.01,
          max: 100,
          step: 0.01,
          description: 'Dollar value earned per unit extracted',
        },
        {
          name: 'regenerationRate',
          label: 'Regeneration Rate',
          type: 'number',
          default: 0.5,
          min: 0,
          max: 5,
          step: 0.05,
          description: 'Multiplier applied to remaining pool to compute shared bonus',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.poolSize !== undefined && config.poolSize <= 0) {
      return { valid: false, error: 'Pool size must be positive' };
    }
    if (config.maxExtraction !== undefined && config.maxExtraction <= 0) {
      return { valid: false, error: 'Max extraction must be positive' };
    }
    if (config.extractionValue !== undefined && config.extractionValue <= 0) {
      return { valid: false, error: 'Extraction value must be positive' };
    }
    if (config.regenerationRate !== undefined && config.regenerationRate < 0) {
      return { valid: false, error: 'Regeneration rate cannot be negative' };
    }
    return { valid: true };
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    config: Record<string, any>
  ): string | null {
    const { extraction } = action;
    if (extraction === undefined || extraction === null) {
      return 'Extraction amount is required';
    }
    if (typeof extraction !== 'number' || isNaN(extraction)) {
      return 'Extraction must be a valid number';
    }
    if (extraction < 0) {
      return 'Extraction cannot be negative';
    }
    const maxExtraction = config.maxExtraction ?? 25;
    if (extraction > maxExtraction) {
      return `Extraction cannot exceed ${maxExtraction} units`;
    }
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    _allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const poolSize = config.poolSize ?? 100;
    const extractionValue = config.extractionValue ?? 1;
    const regenerationRate = config.regenerationRate ?? 0.5;

    const extractions = actions.map((a) => ({
      playerId: a.playerId,
      extraction: a.action.extraction as number,
    }));

    const totalRequested = extractions.reduce((sum, e) => sum + e.extraction, 0);
    const numPlayers = extractions.length;

    // If total extraction exceeds pool, scale proportionally
    const scalingFactor = totalRequested > poolSize ? poolSize / totalRequested : 1;
    const totalActualExtraction = Math.min(totalRequested, poolSize);

    // Shared bonus from remaining pool
    const remaining = Math.max(0, poolSize - totalActualExtraction);
    const sharedBonus = (remaining * regenerationRate) / numPlayers;

    return extractions.map((e) => {
      const actualExtraction = e.extraction * scalingFactor;
      const extractionEarnings = actualExtraction * extractionValue;
      const profit = extractionEarnings + sharedBonus;

      return {
        playerId: e.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          requestedExtraction: e.extraction,
          actualExtraction: Math.round(actualExtraction * 100) / 100,
          extractionEarnings: Math.round(extractionEarnings * 100) / 100,
          sharedBonus: Math.round(sharedBonus * 100) / 100,
          scalingFactor: Math.round(scalingFactor * 1000) / 1000,
          totalRequested: Math.round(totalRequested * 100) / 100,
          totalActualExtraction: Math.round(totalActualExtraction * 100) / 100,
          remaining: Math.round(remaining * 100) / 100,
          poolSize,
          extractionValue,
          regenerationRate,
          numPlayers,
        },
      };
    });
  }
}
