import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';

/**
 * Newsvendor Problem Engine (Week 24)
 *
 * Based on: Schweitzer & Cachon (2000) Management Science.
 * Classic operations/economics experiment.
 *
 * Each player is a newsstand manager who must decide how many newspapers
 * to order BEFORE knowing the actual demand. Unsold papers have low
 * salvage value; unmet demand means lost sales.
 *
 * Profit = Revenue from sales + Salvage from leftover - Cost of order
 *        = min(order, demand) × sellingPrice
 *          + max(0, order - demand) × salvageValue
 *          - order × unitCost
 *
 * The optimal order quantity (for uniform demand) is:
 *   Q* = demandMin + (demandMax - demandMin) × criticalRatio
 *   where criticalRatio = (sellingPrice - unitCost) / (sellingPrice - salvageValue)
 *
 * Behavioral finding: subjects consistently order too close to the demand mean
 * instead of the optimal quantity ("pull-to-center" effect).
 *
 * game_config: {
 *   unitCost: number,       // cost per unit ordered (default 5)
 *   sellingPrice: number,   // revenue per unit sold (default 10)
 *   salvageValue: number,   // value per unsold unit (default 1)
 *   demandMin: number,      // minimum possible demand (default 0)
 *   demandMax: number,      // maximum possible demand (default 100)
 * }
 */
export class NewsvendorEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'newsvendor';

  getUIConfig(): UIConfig {
    return {
      name: 'Newsvendor Problem',
      description:
        'Order inventory before demand is revealed. Balance overstocking costs vs. lost sales. Demonstrates the pull-to-center bias.',
      category: 'simultaneous',
      weekNumber: 24,
      roles: [
        { role: 'manager', label: 'Manager', description: 'Decide how many units to order' },
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
          description: 'Total number of newsstand managers',
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
          default: 45,
          min: 15,
          max: 180,
        },
        {
          name: 'unitCost',
          label: 'Unit Cost ($)',
          type: 'number',
          default: 5,
          min: 0,
          max: 100,
          step: 0.5,
          description: 'Cost per unit ordered (wholesale price)',
        },
        {
          name: 'sellingPrice',
          label: 'Selling Price ($)',
          type: 'number',
          default: 10,
          min: 1,
          max: 200,
          step: 0.5,
          description: 'Revenue per unit sold (retail price)',
        },
        {
          name: 'salvageValue',
          label: 'Salvage Value ($)',
          type: 'number',
          default: 1,
          min: 0,
          max: 100,
          step: 0.5,
          description: 'Value per unsold unit (returns/recycling)',
        },
        {
          name: 'demandMin',
          label: 'Minimum Demand',
          type: 'number',
          default: 0,
          min: 0,
          max: 500,
          step: 1,
          description: 'Minimum possible customer demand',
        },
        {
          name: 'demandMax',
          label: 'Maximum Demand',
          type: 'number',
          default: 100,
          min: 1,
          max: 1000,
          step: 1,
          description: 'Maximum possible customer demand',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const unitCost = config.unitCost ?? 5;
    const sellingPrice = config.sellingPrice ?? 10;
    const salvageValue = config.salvageValue ?? 1;
    const demandMin = config.demandMin ?? 0;
    const demandMax = config.demandMax ?? 100;

    if (sellingPrice <= unitCost) {
      return { valid: false, error: 'Selling price must exceed unit cost' };
    }
    if (salvageValue >= unitCost) {
      return { valid: false, error: 'Salvage value must be less than unit cost' };
    }
    if (salvageValue < 0) {
      return { valid: false, error: 'Salvage value cannot be negative' };
    }
    if (demandMin < 0) {
      return { valid: false, error: 'Minimum demand cannot be negative' };
    }
    if (demandMax <= demandMin) {
      return { valid: false, error: 'Maximum demand must exceed minimum demand' };
    }
    return { valid: true };
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    config: Record<string, any>
  ): string | null {
    const { orderQuantity } = action;

    if (orderQuantity === undefined || orderQuantity === null) {
      return 'Order quantity is required';
    }
    if (typeof orderQuantity !== 'number' || isNaN(orderQuantity)) {
      return 'Order quantity must be a valid number';
    }
    if (orderQuantity < 0) {
      return 'Order quantity cannot be negative';
    }
    if (!Number.isInteger(orderQuantity)) {
      return 'Order quantity must be a whole number';
    }
    const demandMax = config.demandMax ?? 100;
    if (orderQuantity > demandMax * 2) {
      return `Order quantity cannot exceed ${demandMax * 2}`;
    }
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    _allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const unitCost = config.unitCost ?? 5;
    const sellingPrice = config.sellingPrice ?? 10;
    const salvageValue = config.salvageValue ?? 1;
    const demandMin = config.demandMin ?? 0;
    const demandMax = config.demandMax ?? 100;

    // Generate a single demand realization for this round
    // All players face the SAME demand (shared market condition)
    const demand = Math.floor(demandMin + Math.random() * (demandMax - demandMin + 1));

    // Compute the theoretical optimal order quantity
    const criticalRatio = (sellingPrice - unitCost) / (sellingPrice - salvageValue);
    const optimalQuantity = Math.round(demandMin + (demandMax - demandMin) * criticalRatio);
    const demandMean = Math.round((demandMin + demandMax) / 2);

    return actions.map((a) => {
      const orderQuantity = a.action.orderQuantity as number;

      const unitsSold = Math.min(orderQuantity, demand);
      const leftover = Math.max(0, orderQuantity - demand);
      const revenue = unitsSold * sellingPrice;
      const salvageRevenue = leftover * salvageValue;
      const cost = orderQuantity * unitCost;
      const profit = revenue + salvageRevenue - cost;

      return {
        playerId: a.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          orderQuantity,
          demand,
          unitsSold,
          leftover,
          revenue: Math.round(revenue * 100) / 100,
          cost: Math.round(cost * 100) / 100,
          salvageRevenue: Math.round(salvageRevenue * 100) / 100,
          profit: Math.round(profit * 100) / 100,
          optimalQuantity,
          demandMean,
          unitCost,
          sellingPrice,
          salvageValue,
        },
      };
    });
  }
}
