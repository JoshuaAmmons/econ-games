import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from '../simultaneous/SimultaneousBaseEngine';

/**
 * Comparative Advantage Engine (Week 12)
 *
 * Each player represents a "country" with labor units to allocate
 * between producing two goods. Players decide how to allocate labor,
 * then can trade goods (simplified as choosing to specialize or not).
 *
 * Each country has different productivity for each good.
 * Payoff: total goods consumed (own production if autarky, or
 * specialized production minus trade cost if trading).
 *
 * Simplified: Players choose what fraction of labor to put into Good A.
 * Rest goes to Good B. Then results compare autarky vs trade outcomes.
 *
 * game_config: {
 *   laborUnits: number,          // total labor per country (default 100)
 *   good1Name: string,           // name of good 1 (default "Food")
 *   good2Name: string,           // name of good 2 (default "Clothing")
 *   productivityVariation: number, // how much productivities vary (default 2)
 * }
 */
export class ComparativeAdvantageEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'comparative_advantage';

  getUIConfig(): UIConfig {
    return {
      name: 'Comparative Advantage',
      description: 'Countries allocate labor between two goods. Discover gains from trade through specialization.',
      category: 'specialized',
      weekNumber: 12,
      roles: [
        { role: 'country', label: 'Country', description: 'Allocate labor between two goods' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Number of Countries',
          type: 'number',
          default: 4,
          min: 2,
          max: 10,
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
          min: 30,
          max: 300,
        },
        {
          name: 'laborUnits',
          label: 'Labor Units per Country',
          type: 'number',
          default: 100,
          min: 10,
          max: 1000,
          step: 10,
        },
        {
          name: 'good1Name',
          label: 'Good 1 Name',
          type: 'select',
          default: 'Food',
          options: [
            { value: 'Food', label: 'Food' },
            { value: 'Wheat', label: 'Wheat' },
            { value: 'Steel', label: 'Steel' },
          ],
        },
        {
          name: 'good2Name',
          label: 'Good 2 Name',
          type: 'select',
          default: 'Clothing',
          options: [
            { value: 'Clothing', label: 'Clothing' },
            { value: 'Wine', label: 'Wine' },
            { value: 'Cars', label: 'Cars' },
          ],
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.laborUnits !== undefined && config.laborUnits <= 0) {
      return { valid: false, error: 'Labor units must be positive' };
    }
    return { valid: true };
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    config: Record<string, any>
  ): string | null {
    const { laborGood1 } = action;
    const laborUnits = config.laborUnits ?? 100;

    if (laborGood1 === undefined || laborGood1 === null) {
      return 'Labor allocation is required';
    }
    if (typeof laborGood1 !== 'number' || isNaN(laborGood1)) {
      return 'Labor allocation must be a valid number';
    }
    if (laborGood1 < 0 || laborGood1 > laborUnits) {
      return `Labor must be between 0 and ${laborUnits}`;
    }
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    const laborUnits = config.laborUnits ?? 100;
    const good1Name = config.good1Name ?? 'Food';
    const good2Name = config.good2Name ?? 'Clothing';

    // Build a stable player index from ALL players (sorted by ID) so
    // productivity assignments don't shift when some players don't submit.
    const sortedAllPlayers = [...allPlayers].sort((a, b) => a.id.localeCompare(b.id));
    const playerIndexMap = new Map<string, number>();
    sortedAllPlayers.forEach((p, i) => playerIndexMap.set(p.id, i));

    const results = actions.map((a) => {
      const laborGood1 = a.action.laborGood1 as number;
      const laborGood2 = laborUnits - laborGood1;

      // Each country has different productivities based on stable player index
      // (uses allPlayers index, not actions index, so it doesn't shift)
      const stableIdx = playerIndexMap.get(a.playerId) ?? 0;
      const prod1 = stableIdx % 2 === 0 ? 2 : 1;    // Productivity for good 1
      const prod2 = stableIdx % 2 === 0 ? 1 : 2;    // Productivity for good 2

      const good1Produced = laborGood1 * prod1;
      const good2Produced = laborGood2 * prod2;

      // "Utility" = geometric mean of goods consumed (Cobb-Douglas-like)
      const utility = Math.sqrt(good1Produced * good2Produced);

      // Autarky optimal (equal split by value)
      const autarkyLabor1 = laborUnits / 2;
      const autarkyGood1 = autarkyLabor1 * prod1;
      const autarkyGood2 = (laborUnits - autarkyLabor1) * prod2;
      const autarkyUtility = Math.sqrt(autarkyGood1 * autarkyGood2);

      return {
        playerId: a.playerId,
        profit: Math.round(utility * 100) / 100,
        resultData: {
          laborGood1,
          laborGood2,
          good1Produced,
          good2Produced,
          utility: Math.round(utility * 100) / 100,
          productivity1: prod1,
          productivity2: prod2,
          autarkyUtility: Math.round(autarkyUtility * 100) / 100,
          good1Name,
          good2Name,
          laborUnits,
          comparativeAdvantage: prod1 > prod2 ? good1Name : good2Name,
        },
      };
    });

    return results;
  }
}
