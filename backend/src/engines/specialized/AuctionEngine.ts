import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from '../simultaneous/SimultaneousBaseEngine';
import { PlayerModel } from '../../models/Player';
import { pool } from '../../config/database';

/**
 * Auction Engine (Week 22)
 *
 * First-Price / Second-Price Sealed-Bid Auction
 *
 * Each player is a bidder with a private valuation (randomly assigned).
 * All players simultaneously submit a sealed bid.
 * The highest bidder wins the item.
 *   - First-price auction: winner pays their own bid.
 *   - Second-price auction: winner pays the second-highest bid.
 * Winner profit = valuation - price paid. Losers get 0.
 *
 * game_config: {
 *   auctionType: 'first_price' | 'second_price',  // auction format (default 'first_price')
 *   valueMin: number,    // minimum private value (default 10)
 *   valueMax: number,    // maximum private value (default 100)
 * }
 */
export class AuctionEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'auction';

  getUIConfig(): UIConfig {
    return {
      name: 'Sealed-Bid Auction',
      description: 'Bidders with private valuations submit sealed bids. Highest bidder wins. Compare first-price vs second-price auction formats.',
      category: 'simultaneous',
      weekNumber: 22,
      roles: [
        { role: 'bidder', label: 'Bidder', description: 'Submit a sealed bid for the item' },
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
          name: 'auctionType',
          label: 'Auction Type',
          type: 'select',
          default: 'first_price',
          options: [
            { value: 'first_price', label: 'First-Price (pay your bid)' },
            { value: 'second_price', label: 'Second-Price (pay second-highest bid)' },
          ],
          description: 'First-price: winner pays own bid. Second-price: winner pays the second-highest bid.',
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

    if (valueMin < 0) {
      return { valid: false, error: 'Minimum valuation cannot be negative' };
    }
    if (valueMax <= 0) {
      return { valid: false, error: 'Maximum valuation must be positive' };
    }
    if (valueMin >= valueMax) {
      return { valid: false, error: 'Minimum valuation must be less than maximum valuation' };
    }
    if (config.auctionType && config.auctionType !== 'first_price' && config.auctionType !== 'second_price') {
      return { valid: false, error: 'Auction type must be "first_price" or "second_price"' };
    }
    return { valid: true };
  }

  /**
   * Override setupPlayers to assign each bidder a random private valuation.
   * Valuations are stored in the player's `valuation` column.
   */
  async setupPlayers(
    sessionId: string,
    _playerCount: number,
    config: Record<string, any>
  ): Promise<void> {
    const valueMin = config.valueMin ?? 10;
    const valueMax = config.valueMax ?? 100;

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
    if (actions.length === 0) return [];

    const auctionType = config.auctionType ?? 'first_price';

    // Build bid list with valuations from player records
    const bidders = actions.map((a) => {
      const player = allPlayers.find((p) => p.id === a.playerId);
      return {
        playerId: a.playerId,
        playerName: a.playerName,
        bid: a.action.bid as number,
        valuation: player?.valuation ?? 0,
      };
    });

    // Sort by bid descending to find winner(s)
    const sorted = [...bidders].sort((a, b) => b.bid - a.bid);
    const highestBid = sorted[0].bid;

    // Handle ties: all tied highest bidders — pick one randomly
    const tiedWinners = sorted.filter((b) => b.bid === highestBid);
    const winner = tiedWinners[Math.floor(Math.random() * tiedWinners.length)];

    // Determine the price paid
    let pricePaid: number;
    if (auctionType === 'second_price') {
      // Second-price: pay the second-highest bid
      // If there's a tie, the second-highest is the same as the highest
      const secondHighestBid = sorted.length > 1 ? sorted[1].bid : 0;
      pricePaid = secondHighestBid;
    } else {
      // First-price: pay your own bid
      pricePaid = winner.bid;
    }

    const winnerProfit = winner.valuation - pricePaid;

    return bidders.map((bidder) => {
      const isWinner = bidder.playerId === winner.playerId;

      return {
        playerId: bidder.playerId,
        profit: isWinner ? Math.round(winnerProfit * 100) / 100 : 0,
        resultData: {
          bid: bidder.bid,
          valuation: bidder.valuation,
          isWinner,
          pricePaid: isWinner ? Math.round(pricePaid * 100) / 100 : null,
          winnerBid: winner.bid,
          winnerName: winner.playerName,
          auctionType,
          numBidders: bidders.length,
        },
      };
    });
  }
}
