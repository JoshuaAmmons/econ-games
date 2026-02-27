import type { Server } from 'socket.io';
import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';
import { PlayerModel } from '../../models/Player';
import { SessionModel } from '../../models/Session';
import { RoundModel } from '../../models/Round';
import { pool } from '../../config/database';

/**
 * Sponsored Search / GSP Auction Engine (Week 32 — Mankiw Ch. 17)
 *
 * Position auction (Google Ads style). Advertisers bid for K advertising
 * positions with declining click-through rates.
 *
 * Allocation: highest bidder → position 1, second → position 2, etc.
 * Generalized Second Price (GSP): position j pays the bid of position j+1.
 *
 * Profit = clicks[position] × (value_per_click - payment_per_click)
 *
 * GSP is NOT truthful — unlike VCG/second-price auctions,
 * optimal strategy involves bid-shading.
 *
 * game_config: {
 *   numPositions: number,       // number of ad positions (default 3)
 *   clickRates: number[],       // clicks per position (default [100, 70, 40])
 *   valueMin: number,           // min value per click (default 1)
 *   valueMax: number,           // max value per click (default 10)
 * }
 */
export class SponsoredSearchEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'sponsored_search';

  getUIConfig(): UIConfig {
    return {
      name: 'Sponsored Search (GSP) Auction',
      description: 'Bid for advertising positions with different click-through rates. Positions are allocated by bid rank; each pays the next-lower bid (Generalized Second Price).',
      category: 'simultaneous',
      weekNumber: 32,
      roles: [
        { role: 'advertiser', label: 'Advertiser', description: 'Bid for an advertising position to attract clicks' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Number of Advertisers',
          type: 'number',
          default: 5,
          min: 2,
          max: 20,
          description: 'Number of advertisers competing for positions',
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
          name: 'numPositions',
          label: 'Number of Ad Positions',
          type: 'number',
          default: 3,
          min: 1,
          max: 10,
          step: 1,
          description: 'Number of advertising slots available',
        },
        {
          name: 'valueMin',
          label: 'Minimum Value per Click ($)',
          type: 'number',
          default: 1,
          min: 0,
          max: 50,
          step: 0.5,
          description: 'Minimum advertiser value per click',
        },
        {
          name: 'valueMax',
          label: 'Maximum Value per Click ($)',
          type: 'number',
          default: 10,
          min: 0.5,
          max: 100,
          step: 0.5,
          description: 'Maximum advertiser value per click',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const numPositions = config.numPositions ?? 3;
    const valueMin = config.valueMin ?? 1;
    const valueMax = config.valueMax ?? 10;

    if (numPositions < 1) return { valid: false, error: 'Must have at least 1 position' };
    if (valueMin < 0) return { valid: false, error: 'Minimum value cannot be negative' };
    if (valueMax <= 0) return { valid: false, error: 'Maximum value must be positive' };
    if (valueMin >= valueMax) return { valid: false, error: 'Min value must be less than max value' };
    return { valid: true };
  }

  /**
   * Generate default click rates based on number of positions.
   * Position 1 gets 100 clicks, then decreasing.
   */
  private getClickRates(config: Record<string, any>): number[] {
    const numPositions = config.numPositions ?? 3;
    // If custom click rates provided, use them
    if (Array.isArray(config.clickRates) && config.clickRates.length >= numPositions) {
      return config.clickRates.slice(0, numPositions);
    }
    // Default: geometric decay starting at 100
    const rates: number[] = [];
    for (let i = 0; i < numPositions; i++) {
      rates.push(Math.round(100 * Math.pow(0.7, i)));
    }
    return rates;
  }

  /**
   * Assign each advertiser a private value per click.
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
    const valueMin = config.valueMin ?? 1;
    const valueMax = config.valueMax ?? 10;

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

    if (bid === undefined || bid === null) return 'Bid per click is required';
    if (typeof bid !== 'number' || isNaN(bid)) return 'Bid must be a valid number';
    if (bid < 0) return 'Bid cannot be negative';
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const clickRates = this.getClickRates(config);
    const numPositions = clickRates.length;

    // Build advertiser list with valuations
    const advertisers = actions.map((a) => {
      const player = allPlayers.find((p) => p.id === a.playerId);
      return {
        playerId: a.playerId,
        playerName: a.playerName,
        bid: a.action.bid as number,
        valuation: player?.valuation ?? 0,
      };
    });

    // Sort by bid descending (ties broken randomly)
    const sorted = [...advertisers].sort((a, b) => {
      if (b.bid !== a.bid) return b.bid - a.bid;
      return Math.random() - 0.5; // random tiebreaker
    });

    // Assign positions and compute GSP payments
    const positionAssignment = new Map<string, {
      position: number;
      clickRate: number;
      paymentPerClick: number;
    }>();

    for (let i = 0; i < Math.min(sorted.length, numPositions); i++) {
      const advertiser = sorted[i];
      const clickRate = clickRates[i];

      // GSP: pay the bid of the next-lower position (or 0 if last position)
      let paymentPerClick = 0;
      if (i + 1 < sorted.length) {
        paymentPerClick = sorted[i + 1].bid;
      }

      positionAssignment.set(advertiser.playerId, {
        position: i + 1,
        clickRate,
        paymentPerClick: Math.round(paymentPerClick * 100) / 100,
      });
    }

    return advertisers.map((advertiser) => {
      const assignment = positionAssignment.get(advertiser.playerId);
      const isWinner = !!assignment;

      let profit = 0;
      let totalPayment = 0;

      if (assignment) {
        totalPayment = assignment.clickRate * assignment.paymentPerClick;
        profit = assignment.clickRate * (advertiser.valuation - assignment.paymentPerClick);
      }

      return {
        playerId: advertiser.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          bid: advertiser.bid,
          valuation: advertiser.valuation,
          position: assignment?.position ?? null,
          clickRate: assignment?.clickRate ?? null,
          paymentPerClick: assignment?.paymentPerClick ?? null,
          totalPayment: isWinner ? Math.round(totalPayment * 100) / 100 : null,
          isWinner,
          numPositions,
          numAdvertisers: advertisers.length,
          clickRates,
        },
      };
    });
  }
}
