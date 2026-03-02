import type { Server } from 'socket.io';
import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';
import { PlayerModel } from '../../models/Player';
import { RoundModel } from '../../models/Round';
import { SessionModel } from '../../models/Session';
import { pool } from '../../config/database';

/**
 * Bid Auction — Buyers Only
 * Based on Smith (1964) "Effect of Market Organization on Competitive Equilibrium"
 *
 * All players are buyers with private valuations.
 * A fixed number of units are supplied by the system.
 * Buyers submit sealed bid prices; highest bids win.
 * Configurable: uniform pricing (all pay lowest accepted bid) or
 * discriminative pricing (each pays their own bid).
 */
export class BidAuctionEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'bid_auction';

  getUIConfig(): UIConfig {
    return {
      name: 'Bid Auction (Buyers Only)',
      description:
        'Buyers compete with sealed bids. Highest bids win. Tests competitive demand behavior.',
      category: 'simultaneous',
      weekNumber: 33,
      roles: [
        { role: 'buyer', label: 'Buyer', description: 'Submit a sealed bid price' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        { name: 'market_size', label: 'Number of Buyers', type: 'number', default: 8, min: 2, max: 20 },
        { name: 'num_rounds', label: 'Number of Rounds', type: 'number', default: 10, min: 1, max: 30 },
        { name: 'time_per_round', label: 'Time per Round (seconds)', type: 'number', default: 60, min: 15, max: 300 },
        { name: 'numUnits', label: 'Units Supplied', type: 'number', default: 3, min: 1, max: 15, step: 1, description: 'Number of units the system supplies each round' },
        { name: 'valueMin', label: 'Minimum Valuation ($)', type: 'number', default: 10, min: 0, max: 500, step: 1 },
        { name: 'valueMax', label: 'Maximum Valuation ($)', type: 'number', default: 100, min: 1, max: 1000, step: 1 },
        {
          name: 'pricingRule',
          label: 'Pricing Rule',
          type: 'select',
          default: 'uniform',
          options: [
            { value: 'uniform', label: 'Uniform (all pay clearing price)' },
            { value: 'discriminative', label: 'Discriminative (each pays own bid)' },
          ],
          description: 'How winning buyers are charged',
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
    if (valueMin >= valueMax) return { valid: false, error: 'Min valuation must be less than max' };
    if (numUnits < 1) return { valid: false, error: 'Must supply at least 1 unit' };
    return { valid: true };
  }

  async setupPlayers(sessionId: string, _playerCount: number, config: Record<string, any>): Promise<void> {
    await this.assignValuations(sessionId, config);
  }

  async onRoundStart(roundId: string, _sessionCode: string, _io: Server): Promise<void> {
    const round = await RoundModel.findById(roundId);
    if (!round) return;
    const session = await SessionModel.findById(round.session_id);
    if (!session) return;
    await this.reassignValuations(session.id, session.game_config || {});
  }

  private async assignValuations(sessionId: string, config: Record<string, any>): Promise<void> {
    const valueMin = config.valueMin ?? 10;
    const valueMax = config.valueMax ?? 100;
    const players = await PlayerModel.findBySession(sessionId);
    for (const player of players) {
      const valuation = Math.round(valueMin + Math.random() * (valueMax - valueMin));
      await pool.query(
        'UPDATE players SET role = $1, valuation = $2, production_cost = NULL WHERE id = $3',
        ['buyer', valuation, player.id]
      );
    }
  }

  private async reassignValuations(sessionId: string, config: Record<string, any>): Promise<void> {
    const valueMin = config.valueMin ?? 10;
    const valueMax = config.valueMax ?? 100;
    const players = await PlayerModel.findBySession(sessionId);
    for (const player of players) {
      const valuation = Math.round(valueMin + Math.random() * (valueMax - valueMin));
      await pool.query('UPDATE players SET valuation = $1 WHERE id = $2', [valuation, player.id]);
    }
  }

  protected validateAction(action: Record<string, any>, _player: any, _config: Record<string, any>): string | null {
    const { bid } = action;
    if (bid === undefined || bid === null) return 'Bid price is required';
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
    const pricingRule = config.pricingRule ?? 'uniform';

    const buyers = actions.map((a) => {
      const player = allPlayers.find((p) => p.id === a.playerId);
      return {
        playerId: a.playerId,
        playerName: a.playerName,
        bid: a.action.bid as number,
        valuation: Number(player?.valuation) || 0,
      };
    });

    // Sort by bid descending (highest bids first)
    const sorted = [...buyers].sort((a, b) => b.bid - a.bid);

    // Accept highest numUnits bids
    const winnerIds = new Set<string>();
    for (const b of sorted) {
      if (winnerIds.size >= numUnits) break;
      winnerIds.add(b.playerId);
    }

    // Handle ties at the cutoff
    const cutoffBid = sorted[Math.min(numUnits, sorted.length) - 1]?.bid;
    const tiedAtCutoff = sorted.filter(
      (b) => b.bid === cutoffBid && !winnerIds.has(b.playerId) && winnerIds.size < numUnits
    );
    for (const tied of tiedAtCutoff.sort(() => Math.random() - 0.5)) {
      if (winnerIds.size >= numUnits) break;
      winnerIds.add(tied.playerId);
    }

    // Determine clearing price
    const acceptedBuyers = sorted.filter((b) => winnerIds.has(b.playerId));
    const clearingPrice =
      pricingRule === 'uniform' && acceptedBuyers.length > 0
        ? Math.min(...acceptedBuyers.map((b) => b.bid))
        : 0;

    // Compute efficiency: max surplus from best possible allocation
    const sortedByValue = [...buyers].sort((a, b) => b.valuation - a.valuation);
    const efficientBuyers = sortedByValue.slice(0, Math.min(numUnits, sortedByValue.length));
    const maxSurplus = efficientBuyers.reduce((sum, b) => sum + b.valuation, 0);
    const actualWinners = buyers.filter((b) => winnerIds.has(b.playerId));
    const actualSurplus = actualWinners.reduce((sum, b) => sum + b.valuation, 0);
    const efficiency = maxSurplus > 0 ? Math.round((actualSurplus / maxSurplus) * 10000) / 100 : 100;

    return buyers.map((buyer) => {
      const isWinner = winnerIds.has(buyer.playerId);
      const pricePaid = isWinner
        ? pricingRule === 'uniform'
          ? clearingPrice
          : buyer.bid
        : 0;
      const profit = isWinner ? buyer.valuation - pricePaid : 0;
      const rank = sorted.findIndex((b) => b.playerId === buyer.playerId) + 1;

      return {
        playerId: buyer.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          role: 'buyer',
          bid: buyer.bid,
          valuation: buyer.valuation,
          isWinner,
          pricePaid: isWinner ? Math.round(pricePaid * 100) / 100 : null,
          rank,
          numUnits,
          numBuyers: buyers.length,
          clearingPrice: Math.round(clearingPrice * 100) / 100,
          cutoffBid: cutoffBid ?? 0,
          efficiency,
          pricingRule,
        },
      };
    });
  }
}
