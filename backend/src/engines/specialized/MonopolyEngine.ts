import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from '../simultaneous/SimultaneousBaseEngine';

/**
 * Monopoly Game Engine (Week 13)
 *
 * One player is the monopolist who sets a price (or quantity).
 * Demand is simulated: Q = max(0, (demandIntercept - P) / demandSlope)
 *
 * Profit = (P - MC) × Q - fixedCost
 *
 * In multi-player mode, each player acts as an independent monopolist
 * on their own market (to compare strategies).
 *
 * game_config: {
 *   demandIntercept: number,  // max price when Q=0 (default 100)
 *   demandSlope: number,      // slope of inverse demand (default 1)
 *   marginalCost: number,     // cost per unit (default 20)
 *   fixedCost: number,        // fixed cost (default 0)
 * }
 */
export class MonopolyEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'monopoly';

  getUIConfig(): UIConfig {
    return {
      name: 'Monopoly Game',
      description: 'Set price on a demand curve as a monopolist. Find the profit-maximizing quantity.',
      category: 'specialized',
      weekNumber: 13,
      roles: [
        { role: 'monopolist', label: 'Monopolist', description: 'Set price or quantity to maximize profit' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Number of Monopolists',
          type: 'number',
          default: 4,
          min: 1,
          max: 20,
          description: 'Each operates on an independent market',
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
          name: 'demandIntercept',
          label: 'Demand Intercept (a)',
          type: 'number',
          default: 100,
          min: 10,
          max: 1000,
          step: 5,
          description: 'Maximum willingness to pay (P = a - bQ)',
        },
        {
          name: 'demandSlope',
          label: 'Demand Slope (b)',
          type: 'number',
          default: 1,
          min: 0.01,
          max: 100,
          step: 0.1,
        },
        {
          name: 'marginalCost',
          label: 'Marginal Cost ($)',
          type: 'number',
          default: 20,
          min: 0,
          max: 500,
          step: 1,
        },
        {
          name: 'fixedCost',
          label: 'Fixed Cost ($)',
          type: 'number',
          default: 0,
          min: 0,
          max: 1000,
          step: 5,
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    // Use defaults so validation runs even when fields are omitted
    const demandIntercept = config.demandIntercept ?? 100;
    const demandSlope = config.demandSlope ?? 1;
    const marginalCost = config.marginalCost ?? 20;

    if (demandIntercept <= 0) {
      return { valid: false, error: 'Demand intercept must be positive' };
    }
    if (demandSlope <= 0) {
      return { valid: false, error: 'Demand slope must be positive' };
    }
    if (marginalCost >= demandIntercept) {
      return { valid: false, error: 'Marginal cost must be less than demand intercept' };
    }
    return { valid: true };
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    config: Record<string, any>
  ): string | null {
    const { price } = action;
    const demandIntercept = config.demandIntercept ?? 100;

    if (price === undefined || price === null) return 'Price is required';
    if (typeof price !== 'number' || isNaN(price)) return 'Price must be a valid number';
    if (price < 0) return 'Price cannot be negative';
    if (price > demandIntercept) return `Price cannot exceed $${demandIntercept}`;
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    _allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    const a = config.demandIntercept ?? 100;
    const b = config.demandSlope ?? 1;
    const mc = config.marginalCost ?? 20;
    const fc = config.fixedCost ?? 0;

    // Optimal monopoly price/quantity for reference
    const optimalQ = (a - mc) / (2 * b);
    const optimalP = a - b * optimalQ;
    const optimalProfit = (optimalP - mc) * optimalQ - fc;

    return actions.map((act) => {
      const price = act.action.price as number;
      // Quantity demanded at this price: Q = (a - P) / b
      const quantity = Math.max(0, (a - price) / b);
      const revenue = price * quantity;
      const totalCost = mc * quantity + fc;
      const profit = revenue - totalCost;

      // Consumer surplus = 0.5 × (a - P) × Q
      const consumerSurplus = 0.5 * (a - price) * quantity;
      // Deadweight loss triangle — under-production (P > MC) or over-production (P < MC)
      const competitiveQ = (a - mc) / b;
      let dwl: number;
      if (quantity < competitiveQ) {
        // Under-production: standard monopoly DWL
        dwl = 0.5 * (price - mc) * (competitiveQ - quantity);
      } else if (quantity > competitiveQ) {
        // Over-production: welfare loss from producing beyond efficient level
        dwl = 0.5 * (mc - price) * (quantity - competitiveQ);
      } else {
        dwl = 0;
      }

      return {
        playerId: act.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          price,
          quantity: Math.round(quantity * 100) / 100,
          revenue: Math.round(revenue * 100) / 100,
          totalCost: Math.round(totalCost * 100) / 100,
          consumerSurplus: Math.round(consumerSurplus * 100) / 100,
          deadweightLoss: Math.round(dwl * 100) / 100,
          optimalPrice: Math.round(optimalP * 100) / 100,
          optimalQuantity: Math.round(optimalQ * 100) / 100,
          optimalProfit: Math.round(optimalProfit * 100) / 100,
          marginalCost: mc,
          demandIntercept: a,
          demandSlope: b,
        },
      };
    });
  }
}
