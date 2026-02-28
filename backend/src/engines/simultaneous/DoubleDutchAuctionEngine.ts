import type { Server } from 'socket.io';
import type {
  GameEngine,
  GameType,
  UIConfig,
  ValidationResult,
  ActionResult,
  RoundResult,
} from '../GameEngine';
import { GameActionModel } from '../../models/GameAction';
import { GameResultModel } from '../../models/GameResult';
import { PlayerModel } from '../../models/Player';
import { RoundModel } from '../../models/Round';
import { SessionModel } from '../../models/Session';
import { pool } from '../../config/database';

// ============================================================================
// Types
// ============================================================================

interface Submission {
  stopPrice: number;
  role: string;
  valuation: number;
  cost: number;
}

interface RoundState {
  submissions: Map<string, Submission>;
  buyers: Set<string>;
  sellers: Set<string>;
}

interface Match {
  buyerId: string;
  sellerId: string;
  buyerStopPrice: number;
  sellerStopPrice: number;
  tradePrice: number;
  buyerValuation: number;
  sellerCost: number;
}

// ============================================================================
// Engine
// ============================================================================

/**
 * Double Dutch Auction Engine (Week 31 — Mankiw Ch. 17)
 *
 * Based on: McCabe, Rassenti & Smith (1992) "Designing Call Auction
 * Institutions: Is Double Dutch the Best?", Economic Journal 102(410), 9-23.
 *
 * Two-sided call market using converging clock mechanism:
 * - Descending buyer's clock (starts high, lowers)
 * - Ascending seller's clock (starts at 0, rises)
 * Traders "stop" their clock at the price they're willing to trade.
 *
 * In this classroom implementation, buyers and sellers submit "stop prices"
 * simultaneously. The server finds the UNIFORM CLEARING PRICE where supply
 * meets demand, and all qualifying trades execute at that single price —
 * faithful to the McCabe et al. mechanism where the two clocks converge
 * to one market-clearing price.
 *
 * Matching algorithm:
 *   Sort buyers by stopPrice DESC (demand), sellers by stopPrice ASC (supply).
 *   Find Q* = largest quantity where buyer[Q*-1].stop >= seller[Q*-1].stop.
 *   Clearing price = midpoint of marginal buyer and marginal seller stops.
 *   ALL Q* trades execute at this ONE uniform clearing price.
 *
 * Key teaching point: The call market converges to an efficient clearing
 * price from both sides simultaneously, unlike posted-offer (one-sided)
 * or continuous DA (sequential). High efficiency with a single price.
 *
 * Buyer profit  = valuation - clearingPrice  (if matched)
 * Seller profit = clearingPrice - cost       (if matched)
 * Unmatched players earn 0.
 *
 * game_config: {
 *   valueMin: number,    // min buyer valuation (default 20)
 *   valueMax: number,    // max buyer valuation (default 100)
 *   costMin: number,     // min seller cost (default 10)
 *   costMax: number,     // max seller cost (default 90)
 * }
 */
export class DoubleDutchAuctionEngine implements GameEngine {
  readonly gameType: GameType = 'double_dutch_auction';

  // In-memory round states keyed by roundId
  private roundStates: Map<string, RoundState> = new Map();

  /** Guard against concurrent processRoundEnd calls (double-profit bug) */
  private resolvingRounds = new Set<string>();

  getUIConfig(): UIConfig {
    return {
      name: 'Double Dutch Auction',
      description: 'Two-sided call market with converging clocks. All trades execute at one uniform clearing price.',
      category: 'specialized',
      weekNumber: 31,
      roles: [
        { role: 'buyer', label: 'Buyer', description: 'Submit the maximum price you are willing to pay' },
        { role: 'seller', label: 'Seller', description: 'Submit the minimum price you are willing to accept' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Total Players',
          type: 'number',
          default: 10,
          min: 4,
          max: 30,
          description: 'Half become buyers, half sellers',
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
          label: 'Min Buyer Valuation ($)',
          type: 'number',
          default: 20,
          min: 0,
          max: 500,
          step: 1,
          description: 'Minimum possible buyer valuation',
        },
        {
          name: 'valueMax',
          label: 'Max Buyer Valuation ($)',
          type: 'number',
          default: 100,
          min: 1,
          max: 1000,
          step: 1,
          description: 'Maximum possible buyer valuation',
        },
        {
          name: 'costMin',
          label: 'Min Seller Cost ($)',
          type: 'number',
          default: 10,
          min: 0,
          max: 500,
          step: 1,
          description: 'Minimum possible seller production cost',
        },
        {
          name: 'costMax',
          label: 'Max Seller Cost ($)',
          type: 'number',
          default: 90,
          min: 1,
          max: 1000,
          step: 1,
          description: 'Maximum possible seller production cost',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const valueMin = config.valueMin ?? 20;
    const valueMax = config.valueMax ?? 100;
    const costMin = config.costMin ?? 10;
    const costMax = config.costMax ?? 90;

    if (valueMin < 0) return { valid: false, error: 'Minimum valuation cannot be negative' };
    if (valueMax <= 0) return { valid: false, error: 'Maximum valuation must be positive' };
    if (valueMin >= valueMax) return { valid: false, error: 'Min valuation must be less than max valuation' };
    if (costMin < 0) return { valid: false, error: 'Minimum cost cannot be negative' };
    if (costMax <= 0) return { valid: false, error: 'Maximum cost must be positive' };
    if (costMin >= costMax) return { valid: false, error: 'Min cost must be less than max cost' };
    return { valid: true };
  }

  /**
   * Assign half as buyers (with random valuations) and half as sellers (with random costs).
   */
  async setupPlayers(
    sessionId: string,
    _playerCount: number,
    config: Record<string, any>
  ): Promise<void> {
    await this.assignRolesAndValues(sessionId, config);
  }

  /**
   * Initialize round state, reassign fresh valuations/costs, broadcast game state.
   */
  async onRoundStart(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<void> {
    const round = await RoundModel.findById(roundId);
    if (!round) return;
    const session = await SessionModel.findById(round.session_id);
    if (!session) return;
    const config = session.game_config || {};

    // Reassign values each round (keep roles stable)
    await this.reassignValues(session.id, config);

    // Create round state
    const players = await PlayerModel.findActiveBySession(session.id);
    const state: RoundState = {
      submissions: new Map(),
      buyers: new Set(),
      sellers: new Set(),
    };

    for (const p of players) {
      if (p.role === 'buyer') {
        state.buyers.add(p.id);
      } else if (p.role === 'seller') {
        state.sellers.add(p.id);
      }
    }

    this.roundStates.set(roundId, state);

    // Broadcast initial game state
    io.to(`market-${sessionCode}`).emit('game-state', {
      phase: 'submitting',
      submitted: 0,
      totalPlayers: players.length,
    });

    console.log(`[DoubleDutch] Round ${roundId} started — ${state.buyers.size} buyers, ${state.sellers.size} sellers`);
  }

  /**
   * Handle a player submitting their stop price.
   */
  async handleAction(
    roundId: string,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    const player = await PlayerModel.findById(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const state = this.roundStates.get(roundId);
    if (!state) return { success: false, error: 'Round not initialized' };

    // Check for duplicate submission
    if (state.submissions.has(playerId)) {
      return { success: false, error: 'You have already submitted your stop price this round' };
    }

    // Validate action type
    const actionType = action.type || 'submit_stop_price';
    if (actionType !== 'submit_stop_price') {
      return { success: false, error: `Unknown action type: ${actionType}` };
    }

    // Validate stop price
    const { stopPrice } = action;
    if (stopPrice === undefined || stopPrice === null) {
      return { success: false, error: 'Stop price is required' };
    }
    if (typeof stopPrice !== 'number' || isNaN(stopPrice)) {
      return { success: false, error: 'Stop price must be a valid number' };
    }
    if (stopPrice < 0) {
      return { success: false, error: 'Stop price cannot be negative' };
    }

    // Determine role-specific values
    const role = player.role || 'buyer';
    const valuation = player.valuation ?? 0;
    const cost = player.production_cost ?? 0;

    // Store in round state
    state.submissions.set(playerId, {
      stopPrice,
      role,
      valuation,
      cost,
    });

    // Store in DB
    await GameActionModel.create(roundId, playerId, 'submit_stop_price', {
      stopPrice,
      role,
    });

    // Broadcast submission count (not the actual stop price — keep it private)
    const totalSubmitted = state.submissions.size;
    const totalPlayers = state.buyers.size + state.sellers.size;

    io.to(`market-${sessionCode}`).emit('action-submitted', {
      playerId,
      playerName: player.name,
      submitted: totalSubmitted,
      total: totalPlayers,
    });

    console.log(`[DoubleDutch] ${player.name} (${role}) submitted stop price $${stopPrice} — ${totalSubmitted}/${totalPlayers}`);

    return {
      success: true,
      reply: {
        event: 'action-confirmed',
        data: { message: `Stop price $${stopPrice.toFixed(2)} submitted successfully` },
      },
    };
  }

  /**
   * Process end of round: run matching algorithm, calculate profits, save results.
   */
  async processRoundEnd(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<RoundResult> {
    // Prevent concurrent resolution
    if (this.resolvingRounds.has(roundId)) {
      // Wait briefly and return existing results
      const existingResults = await GameResultModel.findByRound(roundId);
      if (existingResults.length > 0) {
        return {
          playerResults: existingResults.map(r => ({
            playerId: r.player_id,
            profit: Number(r.profit),
            resultData: r.result_data,
          })),
          summary: {},
        };
      }
      return { playerResults: [], summary: {} };
    }
    this.resolvingRounds.add(roundId);

    try {
      // Double-check: if results already exist, skip
      const existingResults = await GameResultModel.findByRound(roundId);
      if (existingResults.length > 0) {
        return {
          playerResults: existingResults.map(r => ({
            playerId: r.player_id,
            profit: Number(r.profit),
            resultData: r.result_data,
          })),
          summary: {},
        };
      }

      const state = this.roundStates.get(roundId);
      const round = await RoundModel.findById(roundId);
      if (!round) return { playerResults: [], summary: {} };

      const session = await SessionModel.findById(round.session_id);
      if (!session) return { playerResults: [], summary: {} };

      const allPlayers = await PlayerModel.findActiveBySession(session.id);

      // Separate buyer and seller submissions
      const buyerSubmissions: Array<{ playerId: string; stopPrice: number; valuation: number }> = [];
      const sellerSubmissions: Array<{ playerId: string; stopPrice: number; cost: number }> = [];

      if (state) {
        for (const [playerId, sub] of state.submissions) {
          if (sub.role === 'buyer') {
            buyerSubmissions.push({ playerId, stopPrice: sub.stopPrice, valuation: sub.valuation });
          } else {
            sellerSubmissions.push({ playerId, stopPrice: sub.stopPrice, cost: sub.cost });
          }
        }
      }

      // --- Matching Algorithm (Uniform Clearing Price) ---
      // Sort buyers by stopPrice DESC (demand curve)
      const sortedBuyers = [...buyerSubmissions].sort((a, b) => b.stopPrice - a.stopPrice);
      // Sort sellers by stopPrice ASC (supply curve)
      const sortedSellers = [...sellerSubmissions].sort((a, b) => a.stopPrice - b.stopPrice);

      // Find Q* = largest quantity where buyer[Q*-1].stop >= seller[Q*-1].stop
      let qStar = 0;
      while (
        qStar < sortedBuyers.length &&
        qStar < sortedSellers.length &&
        sortedBuyers[qStar].stopPrice >= sortedSellers[qStar].stopPrice
      ) {
        qStar++;
      }

      // Compute uniform clearing price as midpoint of marginal buyer and seller
      let clearingPrice = 0;
      if (qStar > 0) {
        const marginalBuyerStop = sortedBuyers[qStar - 1].stopPrice;
        const marginalSellerStop = sortedSellers[qStar - 1].stopPrice;
        clearingPrice = Math.round(((marginalBuyerStop + marginalSellerStop) / 2) * 100) / 100;
      }

      // ALL Q* trades execute at the ONE clearing price
      const matches: Match[] = [];
      for (let k = 0; k < qStar; k++) {
        matches.push({
          buyerId: sortedBuyers[k].playerId,
          sellerId: sortedSellers[k].playerId,
          buyerStopPrice: sortedBuyers[k].stopPrice,
          sellerStopPrice: sortedSellers[k].stopPrice,
          tradePrice: clearingPrice,  // UNIFORM price for all trades
          buyerValuation: sortedBuyers[k].valuation,
          sellerCost: sortedSellers[k].cost,
        });
      }

      // Build sets for quick match lookup
      const matchedBuyers = new Map<string, Match>();
      const matchedSellers = new Map<string, Match>();
      for (const m of matches) {
        matchedBuyers.set(m.buyerId, m);
        matchedSellers.set(m.sellerId, m);
      }

      // --- Compute efficiency ---
      // Max possible surplus: sort all buyer valuations DESC and all seller costs ASC
      const allBuyerVals = allPlayers
        .filter(p => p.role === 'buyer')
        .map(p => p.valuation ?? 0)
        .sort((a, b) => b - a);
      const allSellerCosts = allPlayers
        .filter(p => p.role === 'seller')
        .map(p => p.production_cost ?? 0)
        .sort((a, b) => a - b);

      let maxSurplus = 0;
      for (let k = 0; k < Math.min(allBuyerVals.length, allSellerCosts.length); k++) {
        if (allBuyerVals[k] > allSellerCosts[k]) {
          maxSurplus += allBuyerVals[k] - allSellerCosts[k];
        }
      }

      // --- Calculate profits ---
      let actualSurplus = 0;
      const tradePrices: number[] = [];

      const playerResults: Array<{ playerId: string; profit: number; resultData: Record<string, any> }> = [];

      for (const player of allPlayers) {
        const submission = state?.submissions.get(player.id);

        if (player.role === 'buyer') {
          const match = matchedBuyers.get(player.id);
          const isMatched = !!match;
          const valuation = player.valuation ?? 0;
          const profit = isMatched ? Math.round((valuation - match!.tradePrice) * 100) / 100 : 0;
          if (isMatched) {
            actualSurplus += valuation - match!.tradePrice;
            tradePrices.push(match!.tradePrice);
          }

          const matchedSeller = isMatched
            ? allPlayers.find(p => p.id === match!.sellerId)
            : null;

          playerResults.push({
            playerId: player.id,
            profit,
            resultData: {
              role: 'buyer',
              valuation,
              stopPrice: submission?.stopPrice ?? null,
              submitted: !!submission,
              isMatched,
              tradePrice: isMatched ? match!.tradePrice : null,
              tradedWith: matchedSeller?.name || null,
            },
          });
        } else if (player.role === 'seller') {
          const match = matchedSellers.get(player.id);
          const isMatched = !!match;
          const cost = player.production_cost ?? 0;
          const profit = isMatched ? Math.round((match!.tradePrice - cost) * 100) / 100 : 0;
          if (isMatched) {
            actualSurplus += match!.tradePrice - cost;
          }

          const matchedBuyer = isMatched
            ? allPlayers.find(p => p.id === match!.buyerId)
            : null;

          playerResults.push({
            playerId: player.id,
            profit,
            resultData: {
              role: 'seller',
              cost,
              stopPrice: submission?.stopPrice ?? null,
              submitted: !!submission,
              isMatched,
              tradePrice: isMatched ? match!.tradePrice : null,
              tradedWith: matchedBuyer?.name || null,
            },
          });
        }
      }

      // Round actual surplus
      actualSurplus = Math.round(actualSurplus * 100) / 100;

      const efficiency = maxSurplus > 0
        ? Math.round((actualSurplus / maxSurplus) * 10000) / 100
        : 100;

      // Price dispersion stats
      let avgPrice = 0;
      let minPrice = 0;
      let maxPrice = 0;
      let priceStdDev = 0;
      if (tradePrices.length > 0) {
        avgPrice = Math.round((tradePrices.reduce((a, b) => a + b, 0) / tradePrices.length) * 100) / 100;
        minPrice = Math.round(Math.min(...tradePrices) * 100) / 100;
        maxPrice = Math.round(Math.max(...tradePrices) * 100) / 100;
        if (tradePrices.length > 1) {
          const variance = tradePrices.reduce((sum, p) => sum + (p - avgPrice) ** 2, 0) / tradePrices.length;
          priceStdDev = Math.round(Math.sqrt(variance) * 100) / 100;
        }
      }

      // Append summary stats to every player's resultData
      for (const r of playerResults) {
        r.resultData.numTrades = matches.length;
        r.resultData.efficiency = efficiency;
        r.resultData.actualSurplus = actualSurplus;
        r.resultData.maxSurplus = Math.round(maxSurplus * 100) / 100;
        r.resultData.avgPrice = avgPrice;
        r.resultData.minPrice = minPrice;
        r.resultData.maxPrice = maxPrice;
        r.resultData.priceStdDev = priceStdDev;
        r.resultData.numBuyers = allPlayers.filter(p => p.role === 'buyer').length;
        r.resultData.numSellers = allPlayers.filter(p => p.role === 'seller').length;
      }

      // Save results to DB
      for (const result of playerResults) {
        await GameResultModel.create(
          roundId,
          result.playerId,
          result.resultData,
          result.profit,
        );

        // Update cumulative earnings
        if (result.profit !== 0) {
          await pool.query(
            'UPDATE players SET total_profit = COALESCE(total_profit, 0) + $1 WHERE id = $2',
            [result.profit, result.playerId]
          );
        }
      }

      // Clean up round state
      this.roundStates.delete(roundId);

      const summary = {
        numTrades: matches.length,
        efficiency,
        actualSurplus,
        maxSurplus: Math.round(maxSurplus * 100) / 100,
        avgPrice,
        minPrice,
        maxPrice,
        priceStdDev,
        tradePrices,
        numBuyers: allPlayers.filter(p => p.role === 'buyer').length,
        numSellers: allPlayers.filter(p => p.role === 'seller').length,
        totalSubmissions: state ? state.submissions.size : 0,
        matches: matches.map(m => ({
          buyerId: m.buyerId,
          sellerId: m.sellerId,
          tradePrice: m.tradePrice,
          buyerName: allPlayers.find(p => p.id === m.buyerId)?.name || 'Unknown',
          sellerName: allPlayers.find(p => p.id === m.sellerId)?.name || 'Unknown',
        })),
      };

      console.log(`[DoubleDutch] Round ${roundId} resolved — ${matches.length} trades, efficiency ${efficiency}%, avg price $${avgPrice}`);

      return { playerResults, summary };
    } finally {
      this.resolvingRounds.delete(roundId);
    }
  }

  /**
   * Get current game state for reconnecting players.
   */
  async getGameState(
    roundId: string,
    playerId?: string
  ): Promise<Record<string, any>> {
    const state = this.roundStates.get(roundId);

    // If no in-memory state, check for existing results
    if (!state) {
      const results = await GameResultModel.findByRound(roundId);
      if (results && results.length > 0) {
        const playerResult = playerId
          ? results.find(r => r.player_id === playerId)
          : null;
        return {
          phase: 'complete',
          results: results.map(r => ({
            playerId: r.player_id,
            profit: Number(r.profit),
            ...r.result_data,
          })),
          myResult: playerResult ? {
            profit: Number(playerResult.profit),
            ...playerResult.result_data,
          } : null,
        };
      }
      return { phase: 'unknown' };
    }

    const totalPlayers = state.buyers.size + state.sellers.size;
    const totalSubmitted = state.submissions.size;

    const gameState: Record<string, any> = {
      phase: 'submitting',
      totalSubmitted,
      totalPlayers,
    };

    if (playerId) {
      // Return this player's role, valuation/cost, and submission status
      const player = await PlayerModel.findById(playerId);
      if (player) {
        gameState.role = player.role;
        gameState.valuation = player.valuation ?? null;
        gameState.cost = player.production_cost ?? null;
      }

      const submission = state.submissions.get(playerId);
      gameState.submitted = !!submission;
      if (submission) {
        gameState.myStopPrice = submission.stopPrice;
      }
    }

    return gameState;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async assignRolesAndValues(
    sessionId: string,
    config: Record<string, any>
  ): Promise<void> {
    const valueMin = config.valueMin ?? 20;
    const valueMax = config.valueMax ?? 100;
    const costMin = config.costMin ?? 10;
    const costMax = config.costMax ?? 90;

    const players = await PlayerModel.findBySession(sessionId);
    // Shuffle to randomize role assignment
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const halfPoint = Math.ceil(shuffled.length / 2);

    for (let i = 0; i < shuffled.length; i++) {
      const player = shuffled[i];
      if (i < halfPoint) {
        // Buyer: gets valuation
        const valuation = Math.round(valueMin + Math.random() * (valueMax - valueMin));
        await pool.query(
          'UPDATE players SET role = $1, valuation = $2, production_cost = NULL WHERE id = $3',
          ['buyer', valuation, player.id]
        );
      } else {
        // Seller: gets cost
        const cost = Math.round(costMin + Math.random() * (costMax - costMin));
        await pool.query(
          'UPDATE players SET role = $1, production_cost = $2, valuation = NULL WHERE id = $3',
          ['seller', cost, player.id]
        );
      }
    }
  }

  private async reassignValues(
    sessionId: string,
    config: Record<string, any>
  ): Promise<void> {
    const valueMin = config.valueMin ?? 20;
    const valueMax = config.valueMax ?? 100;
    const costMin = config.costMin ?? 10;
    const costMax = config.costMax ?? 90;

    const players = await PlayerModel.findBySession(sessionId);
    for (const player of players) {
      if (player.role === 'buyer') {
        const valuation = Math.round(valueMin + Math.random() * (valueMax - valueMin));
        await pool.query('UPDATE players SET valuation = $1 WHERE id = $2', [valuation, player.id]);
      } else if (player.role === 'seller') {
        const cost = Math.round(costMin + Math.random() * (costMax - costMin));
        await pool.query('UPDATE players SET production_cost = $1 WHERE id = $2', [cost, player.id]);
      }
    }
  }
}
