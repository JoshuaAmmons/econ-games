import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';

/**
 * Cournot Competition Engine (Week 18)
 *
 * N firms simultaneously choose output quantities.
 * Market price is determined by inverse demand: P = a - b × Q_total
 * Each firm's profit: π_i = P × q_i - c × q_i
 *
 * game_config: {
 *   demandIntercept: number,  // 'a' in P = a - bQ (default 100)
 *   demandSlope: number,      // 'b' in P = a - bQ (default 1)
 *   marginalCost: number,     // 'c' cost per unit (default 10)
 *   maxQuantity: number,      // max units a firm can produce (default 100)
 * }
 */
export class CournotEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'cournot';

  getUIConfig(): UIConfig {
    return {
      name: 'Cournot Competition',
      description: 'Firms simultaneously choose production quantities. Market price depends on total output.',
      category: 'simultaneous',
      weekNumber: 18,
      roles: [
        { role: 'firm', label: 'Firm', description: 'Choose a production quantity to maximize profit' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Number of Firms',
          type: 'number',
          default: 3,
          min: 2,
          max: 10,
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
          name: 'demandIntercept',
          label: 'Demand Intercept (a)',
          type: 'number',
          default: 100,
          min: 1,
          max: 10000,
          step: 1,
          description: 'Maximum willingness to pay when Q=0 (P = a - b×Q)',
        },
        {
          name: 'demandSlope',
          label: 'Demand Slope (b)',
          type: 'number',
          default: 1,
          min: 0.01,
          max: 100,
          step: 0.01,
          description: 'How much price drops per unit of total output',
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
          name: 'maxQuantity',
          label: 'Max Quantity',
          type: 'number',
          default: 100,
          min: 1,
          max: 10000,
          step: 1,
          description: 'Maximum units a firm can produce',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.demandIntercept !== undefined && config.demandIntercept <= 0) {
      return { valid: false, error: 'Demand intercept must be positive' };
    }
    if (config.demandSlope !== undefined && config.demandSlope <= 0) {
      return { valid: false, error: 'Demand slope must be positive' };
    }
    if (config.marginalCost !== undefined && config.marginalCost < 0) {
      return { valid: false, error: 'Marginal cost cannot be negative' };
    }
    return { valid: true };
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    config: Record<string, any>
  ): string | null {
    const { quantity } = action;
    if (quantity === undefined || quantity === null) {
      return 'Quantity is required';
    }
    if (typeof quantity !== 'number' || isNaN(quantity)) {
      return 'Quantity must be a valid number';
    }
    if (quantity < 0) {
      return 'Quantity cannot be negative';
    }
    const maxQuantity = config.maxQuantity ?? 100;
    if (quantity > maxQuantity) {
      return `Quantity cannot exceed ${maxQuantity} units`;
    }
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    _allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    const a = config.demandIntercept ?? 100;
    const b = config.demandSlope ?? 1;
    const c = config.marginalCost ?? 10;

    // Calculate total quantity
    const quantities = actions.map((act) => ({
      playerId: act.playerId,
      quantity: act.action.quantity as number,
    }));
    const totalQuantity = quantities.reduce((sum, q) => sum + q.quantity, 0);

    // Market price: P = a - b × Q (floored at 0)
    const marketPrice = Math.max(0, a - b * totalQuantity);

    return quantities.map((q) => {
      const revenue = marketPrice * q.quantity;
      const cost = c * q.quantity;
      const profit = revenue - cost;

      return {
        playerId: q.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          quantity: q.quantity,
          marketPrice: Math.round(marketPrice * 100) / 100,
          totalQuantity,
          revenue: Math.round(revenue * 100) / 100,
          cost: Math.round(cost * 100) / 100,
          demandIntercept: a,
          demandSlope: b,
          marginalCost: c,
          numFirms: actions.length,
        },
      };
    });
  }
}
