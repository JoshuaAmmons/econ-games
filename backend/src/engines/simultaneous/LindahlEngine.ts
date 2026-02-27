import type { Server } from 'socket.io';
import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';
import { PlayerModel } from '../../models/Player';
import { SessionModel } from '../../models/Session';
import { RoundModel } from '../../models/Round';
import { pool } from '../../config/database';

/**
 * Lindahl Mechanism Engine (Week 29 — Mankiw Ch. 6)
 *
 * Inspired by the Lindahl pricing concept (Erik Lindahl, 1919) and the
 * Samuelson condition for efficient public goods provision.
 *
 * Note: Vernon Smith (1980, AER) tested an iterative "Smith Auction" mechanism
 * for public good decisions — a multi-trial tatonnement where subjects submit
 * (bid, quantity) pairs, pay residual costs (unit cost minus others' bids), and
 * must reach unanimous agreement. That mechanism is architecturally complex
 * (iterative sub-rounds, unanimity voting). This engine implements a simplified
 * one-shot Lindahl pricing game that captures the core free-riding incentive
 * and Samuelson efficiency condition for classroom use.
 *
 * Each player has a private per-unit value v_i for the public good.
 * Players report their willingness-to-pay (WTP) per unit.
 *
 * Provision level: G = min(Σw_i / c, maxQuantity)
 * Payment: payment_i = w_i × G
 * Profit: v_i × G - payment_i
 *
 * Efficient outcome (Samuelson condition): Σv_i = c → G* = Σv_i / c
 * But players have incentive to free-ride by under-reporting w_i < v_i.
 *
 * game_config: {
 *   marginalCostPG: number,   // cost per unit of public good (default 10)
 *   valueMin: number,         // minimum private value per unit (default 2)
 *   valueMax: number,         // maximum private value per unit (default 20)
 *   maxQuantity: number,      // maximum provision level (default 50)
 * }
 */
export class LindahlEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'lindahl';

  getUIConfig(): UIConfig {
    return {
      name: 'Lindahl Mechanism',
      description: 'Report your willingness-to-pay for a public good. The provision level depends on total reported WTP.',
      category: 'simultaneous',
      weekNumber: 29,
      roles: [
        { role: 'voter', label: 'Voter', description: 'Report your willingness-to-pay per unit of the public good' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Group Size',
          type: 'number',
          default: 5,
          min: 2,
          max: 20,
          description: 'Number of voters',
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
          default: 60,
          min: 15,
          max: 300,
        },
        {
          name: 'marginalCostPG',
          label: 'Marginal Cost of Public Good ($)',
          type: 'number',
          default: 10,
          min: 1,
          max: 100,
          step: 1,
          description: 'Cost per unit of public good provision',
        },
        {
          name: 'valueMin',
          label: 'Minimum Value per Unit ($)',
          type: 'number',
          default: 2,
          min: 0,
          max: 50,
          step: 1,
          description: 'Minimum private value per unit of the public good',
        },
        {
          name: 'valueMax',
          label: 'Maximum Value per Unit ($)',
          type: 'number',
          default: 20,
          min: 1,
          max: 100,
          step: 1,
          description: 'Maximum private value per unit of the public good',
        },
        {
          name: 'maxQuantity',
          label: 'Maximum Provision Level',
          type: 'number',
          default: 50,
          min: 1,
          max: 200,
          step: 1,
          description: 'Maximum units of public good that can be provided',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const valueMin = config.valueMin ?? 2;
    const valueMax = config.valueMax ?? 20;
    const marginalCostPG = config.marginalCostPG ?? 10;

    if (marginalCostPG <= 0) {
      return { valid: false, error: 'Marginal cost must be positive' };
    }
    if (valueMin < 0) {
      return { valid: false, error: 'Minimum value cannot be negative' };
    }
    if (valueMax <= 0) {
      return { valid: false, error: 'Maximum value must be positive' };
    }
    if (valueMin >= valueMax) {
      return { valid: false, error: 'Minimum value must be less than maximum value' };
    }
    return { valid: true };
  }

  /**
   * Assign each voter a private per-unit value for the public good.
   */
  async setupPlayers(
    sessionId: string,
    _playerCount: number,
    config: Record<string, any>
  ): Promise<void> {
    await this.assignValuations(sessionId, config);
  }

  /**
   * Reassign valuations at the start of each round.
   */
  async onRoundStart(
    roundId: string,
    _sessionCode: string,
    _io: Server
  ): Promise<void> {
    const round = await RoundModel.findById(roundId);
    if (!round) return;
    const session = await SessionModel.findById(round.session_id);
    if (!session) return;
    await this.assignValuations(session.id, session.game_config || {});
  }

  private async assignValuations(
    sessionId: string,
    config: Record<string, any>
  ): Promise<void> {
    const valueMin = config.valueMin ?? 2;
    const valueMax = config.valueMax ?? 20;

    const players = await PlayerModel.findBySession(sessionId);
    for (const player of players) {
      const valuation = Math.round(valueMin + Math.random() * (valueMax - valueMin));
      await pool.query(
        'UPDATE players SET valuation = $1 WHERE id = $2',
        [valuation, player.id]
      );
    }
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    config: Record<string, any>
  ): string | null {
    const { willingnessToPay } = action;

    if (willingnessToPay === undefined || willingnessToPay === null) {
      return 'Willingness-to-pay is required';
    }
    if (typeof willingnessToPay !== 'number' || isNaN(willingnessToPay)) {
      return 'Willingness-to-pay must be a valid number';
    }
    if (willingnessToPay < 0) {
      return 'Willingness-to-pay cannot be negative';
    }
    const valueMax = config.valueMax ?? 20;
    if (willingnessToPay > valueMax * 2) {
      return `Willingness-to-pay seems too high (max value is $${valueMax})`;
    }
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    const marginalCostPG = config.marginalCostPG ?? 10;
    const maxQuantity = config.maxQuantity ?? 50;

    if (actions.length === 0) return [];

    // Build WTP list with valuations from player records
    const voters = actions.map((a) => {
      const player = allPlayers.find((p) => p.id === a.playerId);
      return {
        playerId: a.playerId,
        playerName: a.playerName,
        willingnessToPay: a.action.willingnessToPay as number,
        valuation: player?.valuation ?? 0,
      };
    });

    const totalWTP = voters.reduce((sum, v) => sum + v.willingnessToPay, 0);
    const totalTrueValue = voters.reduce((sum, v) => sum + v.valuation, 0);

    // Provision level: G = min(totalWTP / c, maxQuantity)
    const provisionLevel = Math.min(totalWTP / marginalCostPG, maxQuantity);
    const roundedProvision = Math.round(provisionLevel * 100) / 100;

    // Efficient level: G* = totalTrueValue / c (Samuelson condition)
    const efficientLevel = Math.min(totalTrueValue / marginalCostPG, maxQuantity);

    const groupSize = voters.length;
    const avgWTP = totalWTP / groupSize;

    return voters.map((voter) => {
      const payment = voter.willingnessToPay * roundedProvision;
      const benefit = voter.valuation * roundedProvision;
      const profit = benefit - payment;

      return {
        playerId: voter.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          willingnessToPay: voter.willingnessToPay,
          valuation: voter.valuation,
          provisionLevel: roundedProvision,
          payment: Math.round(payment * 100) / 100,
          benefit: Math.round(benefit * 100) / 100,
          totalWTP: Math.round(totalWTP * 100) / 100,
          avgWTP: Math.round(avgWTP * 100) / 100,
          efficientLevel: Math.round(efficientLevel * 100) / 100,
          groupSize,
          marginalCostPG,
          maxQuantity,
        },
      };
    });
  }
}
