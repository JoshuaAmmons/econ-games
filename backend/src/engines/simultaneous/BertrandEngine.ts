import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';

/**
 * Bertrand Competition Engine (Week 4)
 *
 * N firms simultaneously set prices. The firm(s) with the lowest price
 * capture the entire market demand. Ties split the market equally.
 *
 * Payoff: profit = (price - marginalCost) × (marketDemand / numWinners)
 *         Firms that don't have the lowest price earn 0.
 *
 * game_config: {
 *   marginalCost: number,     // cost per unit (default 10)
 *   marketDemand: number,     // total units demanded (default 100)
 *   maxPrice: number,         // maximum allowed price (default 100)
 * }
 */
export class BertrandEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'bertrand';

  getUIConfig(): UIConfig {
    return {
      name: 'Bertrand Competition',
      description: 'Firms simultaneously set prices. The lowest price captures the entire market.',
      category: 'simultaneous',
      weekNumber: 4,
      roles: [
        { role: 'firm', label: 'Firm', description: 'Set a price to compete for market demand' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Number of Firms',
          type: 'number',
          default: 4,
          min: 2,
          max: 20,
          description: 'Total number of competing firms',
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
          name: 'marginalCost',
          label: 'Marginal Cost ($)',
          type: 'number',
          default: 10,
          min: 0,
          max: 500,
          step: 1,
          description: 'Cost per unit for all firms',
        },
        {
          name: 'marketDemand',
          label: 'Market Demand (units)',
          type: 'number',
          default: 100,
          min: 1,
          max: 10000,
          step: 1,
          description: 'Total units demanded at the lowest price',
        },
        {
          name: 'maxPrice',
          label: 'Maximum Price ($)',
          type: 'number',
          default: 100,
          min: 1,
          max: 1000,
          step: 1,
          description: 'Maximum price a firm can set',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.marginalCost !== undefined && config.marginalCost < 0) {
      return { valid: false, error: 'Marginal cost cannot be negative' };
    }
    if (config.marketDemand !== undefined && config.marketDemand <= 0) {
      return { valid: false, error: 'Market demand must be positive' };
    }
    return { valid: true };
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    config: Record<string, any>
  ): string | null {
    const { price } = action;
    if (price === undefined || price === null) {
      return 'Price is required';
    }
    if (typeof price !== 'number' || isNaN(price)) {
      return 'Price must be a valid number';
    }
    if (price < 0) {
      return 'Price cannot be negative';
    }
    const maxPrice = config.maxPrice ?? 100;
    if (price > maxPrice) {
      return `Price cannot exceed $${maxPrice}`;
    }
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    _allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const marginalCost = config.marginalCost ?? 10;
    const marketDemand = config.marketDemand ?? 100;

    // Find the minimum price
    const prices = actions.map((a) => ({ playerId: a.playerId, price: a.action.price as number }));
    const minPrice = Math.min(...prices.map((p) => p.price));

    // Count how many firms set the minimum price
    const winners = prices.filter((p) => p.price === minPrice);
    const numWinners = winners.length;

    return prices.map((p) => {
      const isWinner = p.price === minPrice;
      const quantity = isWinner ? marketDemand / numWinners : 0;
      const revenue = p.price * quantity;
      const cost = marginalCost * quantity;
      const profit = revenue - cost;

      return {
        playerId: p.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          price: p.price,
          isWinner,
          quantity: Math.round(quantity * 100) / 100,
          revenue: Math.round(revenue * 100) / 100,
          cost: Math.round(cost * 100) / 100,
          minPrice,
          numWinners,
          marginalCost,
          marketDemand,
        },
      };
    });
  }
}
