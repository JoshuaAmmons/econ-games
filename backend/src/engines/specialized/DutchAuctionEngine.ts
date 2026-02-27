import type { Server } from 'socket.io';
import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from '../simultaneous/SimultaneousBaseEngine';
import { PlayerModel } from '../../models/Player';
import { SessionModel } from '../../models/Session';
import { RoundModel } from '../../models/Round';
import { pool } from '../../config/database';

/**
 * Dutch Auction Engine (Week 25)
 *
 * Based on: Coppinger, Smith & Titus (1980) Economic Inquiry.
 *
 * In a real Dutch auction, the price starts high and descends; the first
 * bidder to "stop the clock" wins at that price. This is strategically
 * equivalent to a first-price sealed-bid auction.
 *
 * Implementation: Each player has a private valuation and submits their
 * "stop price" — the descending price at which they would stop the clock.
 * Highest stop price wins and pays their own stop price (first-price rule).
 *
 * game_config: {
 *   valueMin: number,   // minimum private valuation (default 10)
 *   valueMax: number,   // maximum private valuation (default 100)
 * }
 */
export class DutchAuctionEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'dutch_auction';

  getUIConfig(): UIConfig {
    return {
      name: 'Dutch Auction (Descending Clock)',
      description:
        'Price descends from high to low. Submit the price at which you would stop the clock. Highest stop-price wins and pays their price. Strategically equivalent to first-price sealed bid.',
      category: 'simultaneous',
      weekNumber: 25,
      roles: [
        { role: 'bidder', label: 'Bidder', description: 'Choose when to stop the descending clock' },
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
    const { stopPrice } = action;
    if (stopPrice === undefined || stopPrice === null) return 'Stop price is required';
    if (typeof stopPrice !== 'number' || isNaN(stopPrice)) return 'Stop price must be a valid number';
    if (stopPrice < 0) return 'Stop price cannot be negative';
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    _config: Record<string, any>,
    allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    // Build bidder list with valuations
    const bidders = actions.map((a) => {
      const player = allPlayers.find((p) => p.id === a.playerId);
      return {
        playerId: a.playerId,
        playerName: a.playerName,
        stopPrice: a.action.stopPrice as number,
        valuation: Number(player?.valuation) || 0,
      };
    });

    // Sort by stop price descending
    const sorted = [...bidders].sort((a, b) => b.stopPrice - a.stopPrice);
    const highestPrice = sorted[0].stopPrice;

    // Handle ties randomly
    const tiedWinners = sorted.filter((b) => b.stopPrice === highestPrice);
    const winner = tiedWinners[Math.floor(Math.random() * tiedWinners.length)];

    // Dutch auction = first-price: pay your own stop price
    const pricePaid = winner.stopPrice;
    const winnerProfit = winner.valuation - pricePaid;

    return bidders.map((bidder) => {
      const isWinner = bidder.playerId === winner.playerId;
      return {
        playerId: bidder.playerId,
        profit: isWinner ? Math.round(winnerProfit * 100) / 100 : 0,
        resultData: {
          stopPrice: bidder.stopPrice,
          valuation: bidder.valuation,
          isWinner,
          pricePaid: isWinner ? Math.round(pricePaid * 100) / 100 : null,
          winnerStopPrice: winner.stopPrice,
          winnerName: winner.playerName,
          auctionFormat: 'dutch',
          numBidders: bidders.length,
        },
      };
    });
  }
}
