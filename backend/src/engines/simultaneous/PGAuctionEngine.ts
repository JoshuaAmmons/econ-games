import type { Server } from 'socket.io';
import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';
import { PlayerModel } from '../../models/Player';
import { SessionModel } from '../../models/Session';
import { RoundModel } from '../../models/Round';
import { pool } from '../../config/database';

/**
 * Auction Mechanism for Public Goods Engine (Week 30 — Mankiw Ch. 11)
 *
 * Provision point mechanism for a binary public good.
 * Each player has a private value v_i for the public good.
 * Players bid their contribution amount.
 *
 * If total bids ≥ provision cost: PG provided, each pays their bid.
 *   Profit = v_i - bid_i
 *
 * If total bids < provision cost:
 *   money_back: bids refunded, profit = 0
 *   no_refund: bids lost, profit = -bid_i
 *
 * game_config: {
 *   provisionCost: number,    // total cost to provide the public good (default 100)
 *   valueMin: number,         // minimum private value (default 10)
 *   valueMax: number,         // maximum private value (default 40)
 *   refundRule: string,       // 'money_back' or 'no_refund' (default 'money_back')
 * }
 */
export class PGAuctionEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'pg_auction';

  getUIConfig(): UIConfig {
    return {
      name: 'Public Goods Auction',
      description: 'Bid to fund a public project. If total bids meet the cost, the project is funded and everyone benefits.',
      category: 'simultaneous',
      weekNumber: 30,
      roles: [
        { role: 'voter', label: 'Voter', description: 'Bid your contribution toward the public good' },
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
          name: 'provisionCost',
          label: 'Provision Cost ($)',
          type: 'number',
          default: 100,
          min: 10,
          max: 1000,
          step: 10,
          description: 'Total cost to provide the public good',
        },
        {
          name: 'valueMin',
          label: 'Minimum Private Value ($)',
          type: 'number',
          default: 10,
          min: 0,
          max: 200,
          step: 1,
          description: 'Minimum value a player can have for the public good',
        },
        {
          name: 'valueMax',
          label: 'Maximum Private Value ($)',
          type: 'number',
          default: 40,
          min: 1,
          max: 500,
          step: 1,
          description: 'Maximum value a player can have for the public good',
        },
        {
          name: 'refundRule',
          label: 'Refund Rule',
          type: 'select',
          default: 'money_back',
          options: [
            { value: 'money_back', label: 'Money Back (bids refunded if not provided)' },
            { value: 'no_refund', label: 'No Refund (bids lost even if not provided)' },
          ],
          description: 'What happens to bids if the public good is not provided',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const valueMin = config.valueMin ?? 10;
    const valueMax = config.valueMax ?? 40;
    const provisionCost = config.provisionCost ?? 100;

    if (provisionCost <= 0) {
      return { valid: false, error: 'Provision cost must be positive' };
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
    if (config.refundRule && config.refundRule !== 'money_back' && config.refundRule !== 'no_refund') {
      return { valid: false, error: 'Refund rule must be "money_back" or "no_refund"' };
    }
    return { valid: true };
  }

  /**
   * Assign each voter a private value for the public good.
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
    const valueMin = config.valueMin ?? 10;
    const valueMax = config.valueMax ?? 40;

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
    _config: Record<string, any>
  ): string | null {
    const { bid } = action;

    if (bid === undefined || bid === null) return 'Bid amount is required';
    if (typeof bid !== 'number' || isNaN(bid)) return 'Bid must be a valid number';
    if (bid < 0) return 'Bid cannot be negative';
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    const provisionCost = config.provisionCost ?? 100;
    const refundRule = config.refundRule ?? 'money_back';

    if (actions.length === 0) return [];

    // Build bid list with valuations
    const voters = actions.map((a) => {
      const player = allPlayers.find((p) => p.id === a.playerId);
      return {
        playerId: a.playerId,
        playerName: a.playerName,
        bid: a.action.bid as number,
        valuation: player?.valuation ?? 0,
      };
    });

    const totalBids = voters.reduce((sum, v) => sum + v.bid, 0);
    const isProvided = totalBids >= provisionCost;
    const shortfall = isProvided ? 0 : provisionCost - totalBids;
    const groupSize = voters.length;
    const avgBid = totalBids / groupSize;

    return voters.map((voter) => {
      let payment: number;
      let profit: number;

      if (isProvided) {
        // PG provided: each pays their bid
        payment = voter.bid;
        profit = voter.valuation - payment;
      } else if (refundRule === 'money_back') {
        // Not provided, money back: no payment
        payment = 0;
        profit = 0;
      } else {
        // Not provided, no refund: lose your bid
        payment = voter.bid;
        profit = -payment;
      }

      return {
        playerId: voter.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          bid: voter.bid,
          valuation: voter.valuation,
          totalBids: Math.round(totalBids * 100) / 100,
          avgBid: Math.round(avgBid * 100) / 100,
          provisionCost,
          isProvided,
          payment: Math.round(payment * 100) / 100,
          shortfall: Math.round(shortfall * 100) / 100,
          refundRule,
          groupSize,
        },
      };
    });
  }
}
