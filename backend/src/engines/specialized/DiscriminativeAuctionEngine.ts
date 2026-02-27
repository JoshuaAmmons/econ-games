import type { Server } from 'socket.io';
import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from '../simultaneous/SimultaneousBaseEngine';
import { PlayerModel } from '../../models/Player';
import { SessionModel } from '../../models/Session';
import { RoundModel } from '../../models/Round';
import { pool } from '../../config/database';

/**
 * Discriminative (Pay-As-Bid) Multi-Unit Auction Engine (Week 27)
 *
 * Based on: Cox, Smith & Walker (1984) Journal of Finance.
 *
 * Multiple identical units are for sale. Each bidder submits a sealed bid
 * for one unit. The top N bidders (N = numUnits) each win one unit and
 * pay their OWN bid (discriminative pricing / pay-as-bid).
 *
 * This contrasts with a uniform-price auction where all winners pay the
 * same market-clearing price. The discriminative format encourages bid
 * shading (bidding below valuation) because you pay what you bid.
 *
 * game_config: {
 *   valueMin: number,   // minimum private valuation (default 10)
 *   valueMax: number,   // maximum private valuation (default 100)
 *   numUnits: number,   // number of units available (default 3)
 * }
 */
export class DiscriminativeAuctionEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'discriminative_auction';

  getUIConfig(): UIConfig {
    return {
      name: 'Discriminative Multi-Unit Auction',
      description:
        'Multiple units for sale. Top bidders each win one unit and pay their own bid (pay-as-bid). Encourages strategic bid shading.',
      category: 'simultaneous',
      weekNumber: 27,
      roles: [
        { role: 'bidder', label: 'Bidder', description: 'Submit a sealed bid for one unit' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Number of Bidders',
          type: 'number',
          default: 6,
          min: 2,
          max: 30,
          description: 'Number of bidders in the auction',
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
          name: 'numUnits',
          label: 'Units Available',
          type: 'number',
          default: 3,
          min: 1,
          max: 20,
          step: 1,
          description: 'Number of identical units for sale each round',
        },
        {
          name: 'valueMin',
          label: 'Minimum Valuation ($)',
          type: 'number',
          default: 10,
          min: 0,
          max: 500,
          step: 1,
          description: 'Minimum possible private value for bidders',
        },
        {
          name: 'valueMax',
          label: 'Maximum Valuation ($)',
          type: 'number',
          default: 100,
          min: 1,
          max: 1000,
          step: 1,
          description: 'Maximum possible private value for bidders',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const valueMin = config.valueMin ?? 10;
    const valueMax = config.valueMax ?? 100;
    const numUnits = config.numUnits ?? 3;

    if (valueMin < 0) return { valid: false, error: 'Minimum valuation cannot be negative' };
    if (valueMax <= 0) return { valid: false, error: 'Maximum valuation must be positive' };
    if (valueMin >= valueMax) return { valid: false, error: 'Minimum valuation must be less than maximum' };
    if (numUnits < 1) return { valid: false, error: 'Must have at least 1 unit' };
    return { valid: true };
  }

  async setupPlayers(
    sessionId: string,
    _playerCount: number,
    config: Record<string, any>
  ): Promise<void> {
    await this.assignValuations(sessionId, config);
  }

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
    const valueMax = config.valueMax ?? 100;
    const players = await PlayerModel.findBySession(sessionId);
    for (const player of players) {
      const valuation = Math.round(valueMin + Math.random() * (valueMax - valueMin));
      await pool.query('UPDATE players SET valuation = $1 WHERE id = $2', [valuation, player.id]);
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
    if (actions.length === 0) return [];

    const numUnits = config.numUnits ?? 3;

    const bidders = actions.map((a) => {
      const player = allPlayers.find((p) => p.id === a.playerId);
      return {
        playerId: a.playerId,
        playerName: a.playerName,
        bid: a.action.bid as number,
        valuation: Number(player?.valuation) || 0,
      };
    });

    // Sort by bid descending
    const sorted = [...bidders].sort((a, b) => b.bid - a.bid);

    // Determine winners: top numUnits bidders
    // Handle ties at the margin by random selection
    const winnerIds = new Set<string>();
    let rank = 0;

    for (const bidder of sorted) {
      if (winnerIds.size >= numUnits) break;
      winnerIds.add(bidder.playerId);
      rank++;
    }

    // Handle ties at the cutoff
    // If there are ties at the last winning position, the sort already randomized ties implicitly
    // (JavaScript sort is not stable for equal elements in all engines, but we shuffle tied bidders)
    const cutoffBid = sorted[Math.min(numUnits, sorted.length) - 1]?.bid;
    const tiedAtCutoff = sorted.filter(
      (b) => b.bid === cutoffBid && !winnerIds.has(b.playerId) && winnerIds.size < numUnits
    );
    // Shuffle and fill remaining spots
    for (const tied of tiedAtCutoff.sort(() => Math.random() - 0.5)) {
      if (winnerIds.size >= numUnits) break;
      winnerIds.add(tied.playerId);
    }

    return bidders.map((bidder) => {
      const isWinner = winnerIds.has(bidder.playerId);
      // Discriminative: each winner pays their own bid
      const pricePaid = isWinner ? bidder.bid : 0;
      const profit = isWinner ? bidder.valuation - pricePaid : 0;

      // Determine this bidder's rank
      const bidderRank = sorted.findIndex((s) => s.playerId === bidder.playerId) + 1;

      return {
        playerId: bidder.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          bid: bidder.bid,
          valuation: bidder.valuation,
          isWinner,
          pricePaid: isWinner ? Math.round(pricePaid * 100) / 100 : null,
          rank: bidderRank,
          numUnits,
          numBidders: bidders.length,
          cutoffBid: cutoffBid ?? 0,
          auctionFormat: 'discriminative',
        },
      };
    });
  }
}
