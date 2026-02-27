import type { Server } from 'socket.io';
import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from '../simultaneous/SimultaneousBaseEngine';
import { PlayerModel } from '../../models/Player';
import { SessionModel } from '../../models/Session';
import { RoundModel } from '../../models/Round';
import { pool } from '../../config/database';

/**
 * English Auction Engine (Week 26)
 *
 * Based on: Coppinger, Smith & Titus (1980) Economic Inquiry.
 *
 * In a real English auction, the price ascends and bidders drop out one by
 * one until only one remains. This is strategically equivalent to a
 * second-price (Vickrey) sealed-bid auction.
 *
 * Implementation: Each player has a private valuation and submits their
 * "maximum bid" — the highest price they would be willing to pay
 * (proxy bidding, as in eBay). The highest max-bid wins, but pays the
 * second-highest max-bid (second-price rule). Dominant strategy is truthful
 * bidding (max bid = valuation).
 *
 * game_config: {
 *   valueMin: number,   // minimum private valuation (default 10)
 *   valueMax: number,   // maximum private valuation (default 100)
 * }
 */
export class EnglishAuctionEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'english_auction';

  getUIConfig(): UIConfig {
    return {
      name: 'English Auction (Ascending / Proxy Bid)',
      description:
        'Submit your maximum willingness to pay. Highest bidder wins but pays the second-highest bid. Truthful bidding is the dominant strategy.',
      category: 'simultaneous',
      weekNumber: 26,
      roles: [
        { role: 'bidder', label: 'Bidder', description: 'Submit your maximum willingness to pay' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Number of Bidders',
          type: 'number',
          default: 4,
          min: 2,
          max: 20,
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

    if (valueMin < 0) return { valid: false, error: 'Minimum valuation cannot be negative' };
    if (valueMax <= 0) return { valid: false, error: 'Maximum valuation must be positive' };
    if (valueMin >= valueMax) return { valid: false, error: 'Minimum valuation must be less than maximum' };
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
    const { maxBid } = action;
    if (maxBid === undefined || maxBid === null) return 'Maximum bid is required';
    if (typeof maxBid !== 'number' || isNaN(maxBid)) return 'Maximum bid must be a valid number';
    if (maxBid < 0) return 'Maximum bid cannot be negative';
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    _config: Record<string, any>,
    allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const bidders = actions.map((a) => {
      const player = allPlayers.find((p) => p.id === a.playerId);
      return {
        playerId: a.playerId,
        playerName: a.playerName,
        maxBid: a.action.maxBid as number,
        valuation: Number(player?.valuation) || 0,
      };
    });

    // Sort by max bid descending
    const sorted = [...bidders].sort((a, b) => b.maxBid - a.maxBid);
    const highestBid = sorted[0].maxBid;

    // Handle ties randomly
    const tiedWinners = sorted.filter((b) => b.maxBid === highestBid);
    const winner = tiedWinners[Math.floor(Math.random() * tiedWinners.length)];

    // English auction = second-price: pay the second-highest bid
    const secondHighestBid = sorted.length > 1 ? sorted[1].maxBid : 0;
    const pricePaid = secondHighestBid;
    const winnerProfit = winner.valuation - pricePaid;

    return bidders.map((bidder) => {
      const isWinner = bidder.playerId === winner.playerId;
      return {
        playerId: bidder.playerId,
        profit: isWinner ? Math.round(winnerProfit * 100) / 100 : 0,
        resultData: {
          maxBid: bidder.maxBid,
          valuation: bidder.valuation,
          isWinner,
          pricePaid: isWinner ? Math.round(pricePaid * 100) / 100 : null,
          winnerMaxBid: winner.maxBid,
          secondHighestBid: Math.round(secondHighestBid * 100) / 100,
          winnerName: winner.playerName,
          auctionFormat: 'english',
          numBidders: bidders.length,
        },
      };
    });
  }
}
