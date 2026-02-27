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

interface PostedPrice {
  playerId: string;
  playerName: string;
  price: number;
  cost: number;
}

interface BuyerChoice {
  playerId: string;
  playerName: string;
  sellerId: string;
  valuation: number;
}

interface RoundState {
  phase: 'posting' | 'shopping' | 'complete';
  postedPrices: Map<string, PostedPrice>; // sellerId → posted price
  buyerChoices: Map<string, BuyerChoice>; // buyerId → choice
  sellers: Set<string>;
  buyers: Set<string>;
  phaseTimerId?: NodeJS.Timeout;
}

// ============================================================================
// Engine
// ============================================================================

/**
 * Posted-Offer Pricing Engine (Week 28 — Mankiw Ch. 4)
 *
 * Based on: Plott & Smith (1978) "An Experimental Examination of Two Exchange
 * Institutions", Review of Economic Studies; and Ketcham, Smith & Williams (1984)
 * "A Comparison of Posted-Offer and Double-Auction Pricing Institutions".
 *
 * Two-phase market institution:
 * Phase 1 (Posting): Sellers simultaneously post take-it-or-leave-it prices.
 * Phase 2 (Shopping): Buyers see posted prices and choose which seller to buy from.
 *
 * Simplifications from the original Smith design:
 * - Each seller offers one unit (original allows multi-unit (p,q) offers)
 * - Buyers shop simultaneously with random tie-breaking (original uses
 *   sequential shopping in a random order, giving earlier buyers first pick)
 * - Both simplifications preserve the key teaching points below.
 *
 * Key teaching point: Prices converge from ABOVE (seller market power),
 * unlike continuous double auction which converges from both sides.
 * The institutional asymmetry biases outcomes in favour of sellers because
 * sellers set take-it-or-leave-it prices with no continuous bid feedback.
 *
 * game_config: {
 *   valueMin: number,    // min buyer valuation (default 10)
 *   valueMax: number,    // max buyer valuation (default 100)
 *   costMin: number,     // min seller cost (default 10)
 *   costMax: number,     // max seller cost (default 100)
 * }
 */
export class PostedOfferEngine implements GameEngine {
  readonly gameType: GameType = 'posted_offer';

  // In-memory round states keyed by roundId
  private roundStates: Map<string, RoundState> = new Map();

  getUIConfig(): UIConfig {
    return {
      name: 'Posted-Offer Pricing',
      description: 'Sellers post take-it-or-leave-it prices, then buyers choose which seller to buy from. Compare price convergence to double auction markets.',
      category: 'specialized',
      weekNumber: 28,
      roles: [
        { role: 'seller', label: 'Seller', description: 'Post a price for your product' },
        { role: 'buyer', label: 'Buyer', description: 'Choose which seller to buy from' },
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
          description: 'Total players (half become sellers, half buyers)',
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
          default: 90,
          min: 30,
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
   * Assign half as sellers (with costs) and half as buyers (with valuations).
   */
  async setupPlayers(
    sessionId: string,
    _playerCount: number,
    config: Record<string, any>
  ): Promise<void> {
    await this.assignRolesAndValues(sessionId, config);
  }

  /**
   * Initialize round state, assign fresh valuations/costs, start posting phase.
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
      phase: 'posting',
      postedPrices: new Map(),
      buyerChoices: new Map(),
      sellers: new Set(),
      buyers: new Set(),
    };

    for (const p of players) {
      if (p.role === 'seller') {
        state.sellers.add(p.id);
      } else {
        state.buyers.add(p.id);
      }
    }

    this.roundStates.set(roundId, state);

    // Schedule auto-transition to shopping phase at half the round time
    const roundTime = config.time_per_round ?? 90;
    const postingTime = Math.floor(roundTime / 2);

    state.phaseTimerId = setTimeout(() => {
      this.transitionToShopping(roundId, sessionCode, io);
    }, postingTime * 1000);

    // Broadcast initial game state
    io.to(`market-${sessionCode}`).emit('game-state', {
      phase: 'posting',
      role: null, // Each player checks their own role
      postedPrices: [],
      timeRemaining: postingTime,
    });

    console.log(`[PostedOffer] Round ${roundId} started — posting phase (${postingTime}s)`);
  }

  /**
   * Handle player actions (posting prices or choosing sellers).
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

    // Store action in DB
    await GameActionModel.create(
      roundId,
      playerId,
      action.type || (player.role === 'seller' ? 'post_price' : 'choose_seller'),
      action,
    );

    if (player.role === 'seller') {
      return this.handleSellerAction(state, playerId, player, action, roundId, sessionCode, io);
    } else {
      return this.handleBuyerAction(state, playerId, player, action, roundId, sessionCode, io);
    }
  }

  private async handleSellerAction(
    state: RoundState,
    playerId: string,
    player: any,
    action: Record<string, any>,
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    if (state.phase !== 'posting') {
      return { success: false, error: 'Posting phase has ended' };
    }

    const { price } = action;
    if (price === undefined || price === null) return { success: false, error: 'Price is required' };
    if (typeof price !== 'number' || isNaN(price)) return { success: false, error: 'Price must be a number' };
    if (price < 0) return { success: false, error: 'Price cannot be negative' };

    if (state.postedPrices.has(playerId)) {
      return { success: false, error: 'You have already posted a price' };
    }

    state.postedPrices.set(playerId, {
      playerId,
      playerName: player.name || 'Seller',
      price,
      cost: player.cost ?? 0,
    });

    // Notify all players that a seller posted
    io.to(`market-${sessionCode}`).emit('action-submitted', {
      submitted: state.postedPrices.size,
      total: state.sellers.size,
      phase: 'posting',
    });

    // If all sellers have posted, transition to shopping immediately
    if (state.postedPrices.size >= state.sellers.size) {
      this.transitionToShopping(roundId, sessionCode, io);
    }

    return {
      success: true,
      reply: {
        event: 'action-confirmed',
        data: { message: `Price $${price.toFixed(2)} posted successfully` },
      },
    };
  }

  private async handleBuyerAction(
    state: RoundState,
    playerId: string,
    player: any,
    action: Record<string, any>,
    _roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    if (state.phase !== 'shopping') {
      return { success: false, error: 'Shopping phase has not started yet' };
    }

    const { sellerId } = action;
    if (!sellerId) return { success: false, error: 'Must choose a seller' };

    // Validate sellerId exists and posted a price
    if (!state.postedPrices.has(sellerId)) {
      return { success: false, error: 'Invalid seller or seller did not post a price' };
    }

    if (state.buyerChoices.has(playerId)) {
      return { success: false, error: 'You have already made your choice' };
    }

    state.buyerChoices.set(playerId, {
      playerId,
      playerName: player.name || 'Buyer',
      sellerId,
      valuation: player.valuation ?? 0,
    });

    // Notify all players
    io.to(`market-${sessionCode}`).emit('action-submitted', {
      submitted: state.buyerChoices.size,
      total: state.buyers.size,
      phase: 'shopping',
    });

    return {
      success: true,
      reply: {
        event: 'action-confirmed',
        data: { message: 'Choice submitted successfully' },
      },
    };
  }

  /**
   * Transition from posting phase to shopping phase.
   */
  private transitionToShopping(
    roundId: string,
    sessionCode: string,
    io: Server
  ): void {
    const state = this.roundStates.get(roundId);
    if (!state || state.phase !== 'posting') return;

    // Clear the posting timer
    if (state.phaseTimerId) {
      clearTimeout(state.phaseTimerId);
      state.phaseTimerId = undefined;
    }

    state.phase = 'shopping';

    // Build posted prices list for broadcast (hide costs)
    const postedPrices = Array.from(state.postedPrices.values()).map(pp => ({
      sellerId: pp.playerId,
      sellerName: pp.playerName,
      price: pp.price,
    }));

    // Broadcast phase change with posted prices
    io.to(`market-${sessionCode}`).emit('phase-change', {
      phase: 'shopping',
      postedPrices,
    });

    console.log(`[PostedOffer] Round ${roundId} — shopping phase started, ${postedPrices.length} prices posted`);
  }

  /**
   * Process end of round: match buyers to sellers and calculate profits.
   */
  async processRoundEnd(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<RoundResult> {
    const state = this.roundStates.get(roundId);
    const round = await RoundModel.findById(roundId);
    if (!round) return { playerResults: [], summary: {} };

    const session = await SessionModel.findById(round.session_id);
    if (!session) return { playerResults: [], summary: {} };

    const allPlayers = await PlayerModel.findBySession(session.id);

    // Clear any pending timer
    if (state?.phaseTimerId) {
      clearTimeout(state.phaseTimerId);
    }

    // Match buyers to sellers
    const matches = new Map<string, string>(); // sellerId → buyerId (winning buyer)

    if (state) {
      // For each seller, collect all buyers who chose them
      const sellerBuyers = new Map<string, string[]>();
      for (const [buyerId, choice] of state.buyerChoices) {
        const list = sellerBuyers.get(choice.sellerId) || [];
        list.push(buyerId);
        sellerBuyers.set(choice.sellerId, list);
      }

      // For each seller with buyers, randomly pick one buyer to match
      for (const [sellerId, buyerIds] of sellerBuyers) {
        const winningBuyerId = buyerIds[Math.floor(Math.random() * buyerIds.length)];
        matches.set(sellerId, winningBuyerId);
      }
    }

    // Calculate results for all players
    const playerResults: Array<{ playerId: string; profit: number; resultData: Record<string, any> }> = [];
    let totalSurplus = 0;
    let maxSurplus = 0;
    let numTrades = 0;

    // Compute max possible surplus
    const buyerVals = allPlayers.filter(p => p.role === 'buyer').map(p => p.valuation ?? 0).sort((a, b) => b - a);
    const sellerCosts = allPlayers.filter(p => p.role === 'seller').map(p => (p as any).cost ?? p.production_cost ?? 0).sort((a, b) => a - b);
    for (let i = 0; i < Math.min(buyerVals.length, sellerCosts.length); i++) {
      if (buyerVals[i] > sellerCosts[i]) maxSurplus += buyerVals[i] - sellerCosts[i];
    }

    for (const player of allPlayers) {
      const postedPrice = state?.postedPrices.get(player.id);
      const buyerChoice = state?.buyerChoices.get(player.id);

      if (player.role === 'seller') {
        const matchedBuyerId = matches.get(player.id);
        const isMatched = !!matchedBuyerId;
        const price = postedPrice?.price ?? 0;
        const cost = (player as any).cost ?? player.production_cost ?? 0;
        const profit = isMatched ? price - cost : 0;
        if (isMatched) {
          totalSurplus += profit;
          numTrades++;
        }

        const matchedBuyer = matchedBuyerId ? allPlayers.find(p => p.id === matchedBuyerId) : null;

        playerResults.push({
          playerId: player.id,
          profit: Math.round(profit * 100) / 100,
          resultData: {
            role: 'seller',
            price: postedPrice ? price : null,
            cost,
            isMatched,
            tradedWith: matchedBuyer?.name || null,
            postedPrice: postedPrice ? true : false,
          },
        });
      } else {
        // Buyer
        const sellerId = buyerChoice?.sellerId;
        const matchedSellerId = sellerId ? (matches.get(sellerId) === player.id ? sellerId : null) : null;
        const isMatched = !!matchedSellerId;
        const valuation = player.valuation ?? 0;
        const pricePaid = isMatched ? (state?.postedPrices.get(matchedSellerId!)?.price ?? 0) : 0;
        const profit = isMatched ? valuation - pricePaid : 0;
        if (isMatched) totalSurplus += profit;

        const matchedSeller = matchedSellerId ? allPlayers.find(p => p.id === matchedSellerId) : null;

        playerResults.push({
          playerId: player.id,
          profit: Math.round(profit * 100) / 100,
          resultData: {
            role: 'buyer',
            valuation,
            pricePaid: isMatched ? pricePaid : null,
            isMatched,
            tradedWith: matchedSeller?.name || null,
            selectedSeller: sellerId || null,
          },
        });
      }
    }

    const efficiency = maxSurplus > 0 ? Math.round((totalSurplus / maxSurplus) * 10000) / 100 : 100;

    // Add efficiency to all results
    for (const r of playerResults) {
      r.resultData.efficiency = efficiency;
      r.resultData.numTrades = numTrades;
      r.resultData.totalSurplus = Math.round(totalSurplus * 100) / 100;
      r.resultData.maxSurplus = Math.round(maxSurplus * 100) / 100;
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
      await pool.query(
        'UPDATE players SET total_profit = COALESCE(total_profit, 0) + $1 WHERE id = $2',
        [result.profit, result.playerId]
      );
    }

    // Clean up round state
    this.roundStates.delete(roundId);

    const summary = {
      numTrades,
      efficiency,
      totalSurplus: Math.round(totalSurplus * 100) / 100,
      maxSurplus: Math.round(maxSurplus * 100) / 100,
      numSellers: allPlayers.filter(p => p.role === 'seller').length,
      numBuyers: allPlayers.filter(p => p.role === 'buyer').length,
    };

    return { playerResults, summary };
  }

  /**
   * Get current game state for reconnecting players.
   */
  async getGameState(
    roundId: string,
    playerId?: string
  ): Promise<Record<string, any>> {
    const state = this.roundStates.get(roundId);
    if (!state) {
      // Check for existing results
      const results = await GameResultModel.findByRound(roundId);
      if (results && results.length > 0) {
        return { phase: 'complete', results };
      }
      return { phase: 'unknown' };
    }

    const gameState: Record<string, any> = {
      phase: state.phase,
    };

    if (state.phase === 'shopping' || state.phase === 'complete') {
      // Show posted prices to everyone
      gameState.postedPrices = Array.from(state.postedPrices.values()).map(pp => ({
        sellerId: pp.playerId,
        sellerName: pp.playerName,
        price: pp.price,
      }));
    }

    if (playerId) {
      // Check if this player has already submitted
      if (state.postedPrices.has(playerId)) {
        gameState.myAction = { price: state.postedPrices.get(playerId)!.price };
      }
      if (state.buyerChoices.has(playerId)) {
        gameState.myAction = { sellerId: state.buyerChoices.get(playerId)!.sellerId };
      }
    }

    gameState.totalSubmitted = state.phase === 'posting'
      ? state.postedPrices.size
      : state.buyerChoices.size;
    gameState.totalPlayers = state.phase === 'posting'
      ? state.sellers.size
      : state.buyers.size;

    return gameState;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async assignRolesAndValues(
    sessionId: string,
    config: Record<string, any>
  ): Promise<void> {
    const valueMin = config.valueMin ?? 10;
    const valueMax = config.valueMax ?? 100;
    const costMin = config.costMin ?? 10;
    const costMax = config.costMax ?? 100;

    const players = await PlayerModel.findBySession(sessionId);
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const halfPoint = Math.ceil(shuffled.length / 2);

    for (let i = 0; i < shuffled.length; i++) {
      const player = shuffled[i];
      if (i < halfPoint) {
        // Seller: gets cost
        const cost = Math.round(costMin + Math.random() * (costMax - costMin));
        await pool.query(
          'UPDATE players SET role = $1, cost = $2, valuation = NULL WHERE id = $3',
          ['seller', cost, player.id]
        );
      } else {
        // Buyer: gets valuation
        const valuation = Math.round(valueMin + Math.random() * (valueMax - valueMin));
        await pool.query(
          'UPDATE players SET role = $1, valuation = $2, cost = NULL WHERE id = $3',
          ['buyer', valuation, player.id]
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
      if (player.role === 'seller') {
        const cost = Math.round(costMin + Math.random() * (costMax - costMin));
        await pool.query('UPDATE players SET cost = $1 WHERE id = $2', [cost, player.id]);
      } else {
        const valuation = Math.round(valueMin + Math.random() * (valueMax - valueMin));
        await pool.query('UPDATE players SET valuation = $1 WHERE id = $2', [valuation, player.id]);
      }
    }
  }
}
