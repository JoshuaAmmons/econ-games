import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';

/**
 * Negative Externality Game Engine (Week 8)
 *
 * N firms choose production levels. Higher production creates negative
 * externalities (pollution, etc.) that impose social costs on everyone.
 *
 * Private profit: revenue_per_unit × q_i - cost_per_unit × q_i
 * Social damage: damageRate × Q_total², shared equally among all
 * Net payoff (without tax): private_profit - damage_share
 * Net payoff (with Pigouvian tax): private_profit - tax × q_i
 *   (tax revenue redistributed equally)
 *
 * game_config: {
 *   revenuePerUnit: number,  // revenue per unit produced (default 20)
 *   costPerUnit: number,     // private cost per unit (default 5)
 *   damageRate: number,      // externality damage coefficient (default 0.1)
 *   maxProduction: number,   // max units per firm (default 50)
 *   taxEnabled: boolean,     // whether Pigouvian tax is active (default false)
 *   taxRate: number,         // per-unit tax (default 0)
 * }
 */
export class NegativeExternalityEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'negative_externality';

  getUIConfig(): UIConfig {
    return {
      name: 'Negative Externality Game',
      description: 'Firms choose production levels that create negative externalities. Explore the effect of Pigouvian taxes.',
      category: 'simultaneous',
      weekNumber: 8,
      roles: [
        { role: 'firm', label: 'Firm', description: 'Choose production level balancing private profit against social cost' },
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
          description: 'Total number of firms',
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
          name: 'revenuePerUnit',
          label: 'Revenue per Unit ($)',
          type: 'number',
          default: 20,
          min: 1,
          max: 1000,
          step: 1,
          description: 'Revenue earned per unit produced',
        },
        {
          name: 'costPerUnit',
          label: 'Private Cost per Unit ($)',
          type: 'number',
          default: 5,
          min: 0,
          max: 500,
          step: 1,
          description: 'Private production cost per unit',
        },
        {
          name: 'damageRate',
          label: 'Damage Rate',
          type: 'number',
          default: 0.1,
          min: 0.001,
          max: 10,
          step: 0.01,
          description: 'Social damage coefficient (damage = rate × Q²)',
        },
        {
          name: 'maxProduction',
          label: 'Max Production',
          type: 'number',
          default: 50,
          min: 1,
          max: 1000,
          step: 1,
          description: 'Maximum units a firm can produce',
        },
        {
          name: 'taxEnabled',
          label: 'Enable Pigouvian Tax',
          type: 'checkbox',
          default: false,
          description: 'Apply a per-unit tax on production',
        },
        {
          name: 'taxRate',
          label: 'Tax Rate ($/unit)',
          type: 'number',
          default: 0,
          min: 0,
          max: 100,
          step: 0.5,
          description: 'Per-unit Pigouvian tax (revenue redistributed equally)',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.revenuePerUnit !== undefined && config.revenuePerUnit <= 0) {
      return { valid: false, error: 'Revenue per unit must be positive' };
    }
    if (config.costPerUnit !== undefined && config.costPerUnit < 0) {
      return { valid: false, error: 'Cost per unit cannot be negative' };
    }
    if (config.damageRate !== undefined && config.damageRate < 0) {
      return { valid: false, error: 'Damage rate cannot be negative' };
    }
    return { valid: true };
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    config: Record<string, any>
  ): string | null {
    const { production } = action;
    if (production === undefined || production === null) {
      return 'Production level is required';
    }
    if (typeof production !== 'number' || isNaN(production)) {
      return 'Production must be a valid number';
    }
    if (production < 0) {
      return 'Production cannot be negative';
    }
    const maxProduction = config.maxProduction || 50;
    if (production > maxProduction) {
      return `Production cannot exceed ${maxProduction} units`;
    }
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    _allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const revenuePerUnit = config.revenuePerUnit ?? 20;
    const costPerUnit = config.costPerUnit ?? 5;
    const damageRate = config.damageRate ?? 0.1;
    const taxEnabled = config.taxEnabled ?? false;
    const taxRate = config.taxRate ?? 0;
    const numFirms = actions.length;

    const productions = actions.map((a) => ({
      playerId: a.playerId,
      production: a.action.production as number,
    }));

    const totalProduction = productions.reduce((sum, p) => sum + p.production, 0);
    const totalDamage = damageRate * totalProduction * totalProduction;
    const damagePerFirm = totalDamage / numFirms;

    // Tax revenue redistributed equally
    const totalTaxRevenue = taxEnabled ? taxRate * totalProduction : 0;
    const taxRedistribution = totalTaxRevenue / numFirms;

    return productions.map((p) => {
      const revenue = revenuePerUnit * p.production;
      const privateCost = costPerUnit * p.production;
      const privateProfit = revenue - privateCost;

      // Tax paid by this firm
      const taxPaid = taxEnabled ? taxRate * p.production : 0;

      // Net profit = private profit - damage share - tax paid + tax redistribution
      const profit = privateProfit - damagePerFirm - taxPaid + taxRedistribution;

      return {
        playerId: p.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          production: p.production,
          revenue: Math.round(revenue * 100) / 100,
          privateCost: Math.round(privateCost * 100) / 100,
          privateProfit: Math.round(privateProfit * 100) / 100,
          totalProduction,
          totalDamage: Math.round(totalDamage * 100) / 100,
          damagePerFirm: Math.round(damagePerFirm * 100) / 100,
          taxPaid: Math.round(taxPaid * 100) / 100,
          taxRedistribution: Math.round(taxRedistribution * 100) / 100,
          taxEnabled,
          taxRate,
          numFirms,
          revenuePerUnit,
          costPerUnit,
          damageRate,
        },
      };
    });
  }
}
