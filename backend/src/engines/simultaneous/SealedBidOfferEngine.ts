import type { Server } from 'socket.io';
import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';
import { PlayerModel } from '../../models/Player';
import { SessionModel } from '../../models/Session';
import { RoundModel } from '../../models/Round';
import { pool } from '../../config/database';

/**
 * Sealed Bid-Offer Auction Engine (Week 31 — Mankiw Ch. 15)
 *
 * Based on: Smith, Williams, Bratton & Vannoni (1982) "Competitive Market
 * Institutions: Double Auctions vs. Sealed Bid-Offer Auctions", AER 72(1):58-77.
 * Also discussed in Smith (1982) "Microeconomic Systems as an Experimental
 * Science", AER 72(5):923-955 (the "PQ" institution).
 *
 * Two-sided sealed clearing market (call market). Half of players are buyers,
 * half are sellers. Buyers submit sealed bids (max WTP), sellers submit sealed
 * asks (min WTA). Engine finds the clearing price where supply meets demand.
 *
 * Clearing: Sort bids descending, asks ascending. Find Q* where bid[Q*] ≥ ask[Q*].
 * Clearing price = average of marginal bid and marginal ask (k=0.5 convention,
 * matching Smith's original design).
 * All inframarginal traders trade at the uniform clearing price.
 *
 * Simplification: single unit per trader (original allows price-quantity schedules).
 *
 * Buyer profit = valuation - clearingPrice
 * Seller profit = clearingPrice - cost
 *
 * Key finding from Smith (1982): The sealed bid-offer auction converges more
 * slowly than the continuous double auction due to strategic under-revelation
 * (bid shading), but eventually approaches competitive equilibrium.
 *
 * game_config: {
 *   valueMin: number,    // min buyer valuation (default 10)
 *   valueMax: number,    // max buyer valuation (default 100)
 *   costMin: number,     // min seller cost (default 10)
 *   costMax: number,     // max seller cost (default 100)
 * }
 */
export class SealedBidOfferEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'sealed_bid_offer';

  getUIConfig(): UIConfig {
    return {
      name: 'Sealed Bid-Offer Auction',
      description: 'A one-shot clearing market. Buyers submit sealed bids, sellers submit sealed asks. The market clears at the intersection.',
      category: 'simultaneous',
      weekNumber: 31,
      roles: [
        { role: 'buyer', label: 'Buyer', description: 'Submit a sealed bid (maximum willingness-to-pay)' },
        { role: 'seller', label: 'Seller', description: 'Submit a sealed ask (minimum willingness-to-accept)' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Total Players',
          type: 'number',
          default: 6,
          min: 4,
          max: 20,
          description: 'Total players (half become buyers, half sellers)',
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
          label: 'Minimum Buyer Valuation ($)',
          type: 'number',
          default: 10,
          min: 0,
          max: 500,
          step: 1,
          description: 'Minimum possible buyer valuation',
        },
        {
          name: 'valueMax',
          label: 'Maximum Buyer Valuation ($)',
          type: 'number',
          default: 100,
          min: 1,
          max: 1000,
          step: 1,
          description: 'Maximum possible buyer valuation',
        },
        {
          name: 'costMin',
          label: 'Minimum Seller Cost ($)',
          type: 'number',
          default: 10,
          min: 0,
          max: 500,
          step: 1,
          description: 'Minimum possible seller production cost',
        },
        {
          name: 'costMax',
          label: 'Maximum Seller Cost ($)',
          type: 'number',
          default: 100,
          min: 1,
          max: 1000,
          step: 1,
          description: 'Maximum possible seller production cost',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const valueMin = config.valueMin ?? 10;
    const valueMax = config.valueMax ?? 100;
    const costMin = config.costMin ?? 10;
    const costMax = config.costMax ?? 100;

    if (valueMin < 0) return { valid: false, error: 'Minimum valuation cannot be negative' };
    if (valueMax <= 0) return { valid: false, error: 'Maximum valuation must be positive' };
    if (valueMin >= valueMax) return { valid: false, error: 'Min valuation must be less than max valuation' };
    if (costMin < 0) return { valid: false, error: 'Minimum cost cannot be negative' };
    if (costMax <= 0) return { valid: false, error: 'Maximum cost must be positive' };
    if (costMin >= costMax) return { valid: false, error: 'Min cost must be less than max cost' };
    return { valid: true };
  }

  /**
   * Assign half as buyers (with valuations) and half as sellers (with costs).
   */
  async setupPlayers(
    sessionId: string,
    _playerCount: number,
    config: Record<string, any>
  ): Promise<void> {
    await this.assignRolesAndValues(sessionId, config);
  }

  /**
   * Reassign valuations/costs at the start of each round (keep roles stable).
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
    await this.reassignValues(session.id, session.game_config || {});
  }

  private async assignRolesAndValues(
    sessionId: string,
    config: Record<string, any>
  ): Promise<void> {
    const valueMin = config.valueMin ?? 10;
    const valueMax = config.valueMax ?? 100;
    const costMin = config.costMin ?? 10;
    const costMax = config.costMax ?? 100;

    const players = await PlayerModel.findBySession(sessionId);
    // Shuffle players to randomize role assignment
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const halfPoint = Math.ceil(shuffled.length / 2);

    for (let i = 0; i < shuffled.length; i++) {
      const player = shuffled[i];
      if (i < halfPoint) {
        // Buyer: gets valuation
        const valuation = Math.round(valueMin + Math.random() * (valueMax - valueMin));
        await pool.query(
          'UPDATE players SET role = $1, valuation = $2, cost = NULL WHERE id = $3',
          ['buyer', valuation, player.id]
        );
      } else {
        // Seller: gets cost
        const cost = Math.round(costMin + Math.random() * (costMax - costMin));
        await pool.query(
          'UPDATE players SET role = $1, valuation = NULL, cost = $2 WHERE id = $3',
          ['seller', cost, player.id]
        );
      }
    }
  }

  private async reassignValues(
    sessionId: string,
    config: Record<string, any>
  ): Promise<void> {
    const valueMin = config.valueMin ?? 10;
    const valueMax = config.valueMax ?? 100;
    const costMin = config.costMin ?? 10;
    const costMax = config.costMax ?? 100;

    const players = await PlayerModel.findBySession(sessionId);
    for (const player of players) {
      if (player.role === 'buyer') {
        const valuation = Math.round(valueMin + Math.random() * (valueMax - valueMin));
        await pool.query('UPDATE players SET valuation = $1 WHERE id = $2', [valuation, player.id]);
      } else {
        const cost = Math.round(costMin + Math.random() * (costMax - costMin));
        await pool.query('UPDATE players SET cost = $1 WHERE id = $2', [cost, player.id]);
      }
    }
  }

  protected validateAction(
    action: Record<string, any>,
    player: any,
    _config: Record<string, any>
  ): string | null {
    if (player.role === 'buyer') {
      const { bid } = action;
      if (bid === undefined || bid === null) return 'Bid amount is required';
      if (typeof bid !== 'number' || isNaN(bid)) return 'Bid must be a valid number';
      if (bid < 0) return 'Bid cannot be negative';
      return null;
    } else {
      const { ask } = action;
      if (ask === undefined || ask === null) return 'Ask amount is required';
      if (typeof ask !== 'number' || isNaN(ask)) return 'Ask must be a valid number';
      if (ask < 0) return 'Ask cannot be negative';
      return null;
    }
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    _config: Record<string, any>,
    allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    // Separate buyers and sellers
    const buyers: Array<{ playerId: string; playerName: string; bid: number; valuation: number }> = [];
    const sellers: Array<{ playerId: string; playerName: string; ask: number; cost: number }> = [];

    for (const a of actions) {
      const player = allPlayers.find((p) => p.id === a.playerId);
      if (player?.role === 'buyer') {
        buyers.push({
          playerId: a.playerId,
          playerName: a.playerName,
          bid: a.action.bid as number,
          valuation: player?.valuation ?? 0,
        });
      } else {
        sellers.push({
          playerId: a.playerId,
          playerName: a.playerName,
          ask: a.action.ask as number,
          cost: player?.cost ?? 0,
        });
      }
    }

    // Sort bids descending, asks ascending
    const sortedBuyers = [...buyers].sort((a, b) => b.bid - a.bid);
    const sortedSellers = [...sellers].sort((a, b) => a.ask - b.ask);

    // Find clearing quantity: Q* where bid[i] >= ask[i]
    let clearingQuantity = 0;
    const maxTrades = Math.min(sortedBuyers.length, sortedSellers.length);
    for (let i = 0; i < maxTrades; i++) {
      if (sortedBuyers[i].bid >= sortedSellers[i].ask) {
        clearingQuantity = i + 1;
      } else {
        break;
      }
    }

    // Clearing price: average of marginal bid and marginal ask
    let clearingPrice = 0;
    if (clearingQuantity > 0) {
      const marginalBid = sortedBuyers[clearingQuantity - 1].bid;
      const marginalAsk = sortedSellers[clearingQuantity - 1].ask;
      clearingPrice = Math.round(((marginalBid + marginalAsk) / 2) * 100) / 100;
    }

    // Compute maximum possible surplus for efficiency calculation
    let maxSurplus = 0;
    const allBuyerVals = buyers.map(b => b.valuation).sort((a, b) => b - a);
    const allSellerCosts = sellers.map(s => s.cost).sort((a, b) => a - b);
    for (let i = 0; i < Math.min(allBuyerVals.length, allSellerCosts.length); i++) {
      if (allBuyerVals[i] > allSellerCosts[i]) {
        maxSurplus += allBuyerVals[i] - allSellerCosts[i];
      }
    }

    // Determine winning buyers and sellers
    const winningBuyerIds = new Set(sortedBuyers.slice(0, clearingQuantity).map(b => b.playerId));
    const winningSellerIds = new Set(sortedSellers.slice(0, clearingQuantity).map(s => s.playerId));

    // Compute actual surplus
    let actualSurplus = 0;

    const results: Array<{ playerId: string; profit: number; resultData: Record<string, any> }> = [];

    // Buyer results
    for (const buyer of buyers) {
      const isTrader = winningBuyerIds.has(buyer.playerId);
      const profit = isTrader ? buyer.valuation - clearingPrice : 0;
      if (isTrader) actualSurplus += profit;
      const rank = sortedBuyers.findIndex(b => b.playerId === buyer.playerId) + 1;

      results.push({
        playerId: buyer.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          role: 'buyer',
          bid: buyer.bid,
          valuation: buyer.valuation,
          clearingPrice,
          clearingQuantity,
          isTrader,
          rank,
          numBuyers: buyers.length,
          numSellers: sellers.length,
        },
      });
    }

    // Seller results
    for (const seller of sellers) {
      const isTrader = winningSellerIds.has(seller.playerId);
      const profit = isTrader ? clearingPrice - seller.cost : 0;
      if (isTrader) actualSurplus += profit;
      const rank = sortedSellers.findIndex(s => s.playerId === seller.playerId) + 1;

      results.push({
        playerId: seller.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          role: 'seller',
          ask: seller.ask,
          cost: seller.cost,
          clearingPrice,
          clearingQuantity,
          isTrader,
          rank,
          numBuyers: buyers.length,
          numSellers: sellers.length,
        },
      });
    }

    // Add efficiency to all results
    const efficiency = maxSurplus > 0 ? Math.round((actualSurplus / maxSurplus) * 10000) / 100 : 100;
    for (const r of results) {
      r.resultData.efficiency = efficiency;
      r.resultData.actualSurplus = Math.round(actualSurplus * 100) / 100;
      r.resultData.maxSurplus = Math.round(maxSurplus * 100) / 100;
    }

    return results;
  }
}
