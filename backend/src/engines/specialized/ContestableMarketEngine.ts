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

interface RoundState {
  phase: 'entry' | 'posting' | 'results';
  entryDecisions: Map<string, boolean>;  // playerId -> entered
  postedPrices: Map<string, number>;     // playerId -> price
  incumbentId: string;
  activeSellers: Set<string>;            // incumbent + entering entrants
  entrantIds: Set<string>;               // all entrant player ids
  phaseTimerId?: NodeJS.Timeout;
  config: Record<string, any>;           // cached config for resolution
  sessionId: string;
}

// ============================================================================
// Engine
// ============================================================================

/**
 * Contestable Market Engine (Week 30)
 *
 * Based on: Coursey, Isaac & Smith (1984) "Natural Monopoly and Contestable
 * Markets: Some Experimental Results", Journal of Law & Economics.
 *
 * One incumbent seller faces potential entrants in a market with decreasing
 * average costs (high fixed cost, low variable cost). Tests whether the
 * threat of entry disciplines monopoly pricing.
 *
 * Three-phase rounds:
 * Phase 1 (Entry Decision): Entrants decide whether to enter (pay entry cost).
 * Phase 2 (Price Posting): Active sellers post prices.
 * Phase 3 (Market Resolution): Lowest price wins all demand (winner-take-all).
 *
 * Key teaching point: Even though the cost structure favors a single seller
 * (natural monopoly), the threat of entry can push the incumbent's price
 * toward the competitive level, validating contestable markets theory.
 */
export class ContestableMarketEngine implements GameEngine {
  readonly gameType: GameType = 'contestable_market';

  // In-memory round states keyed by roundId
  private roundStates: Map<string, RoundState> = new Map();

  getUIConfig(): UIConfig {
    return {
      name: 'Contestable Market',
      description: 'Natural monopoly with potential entrants. Does the threat of entry discipline pricing?',
      category: 'specialized',
      weekNumber: 30,
      roles: [
        { role: 'incumbent', label: 'Incumbent', description: 'You are the established seller in this market' },
        { role: 'entrant', label: 'Potential Entrant', description: 'Decide whether to enter the market and compete' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Total Players',
          type: 'number',
          default: 3,
          min: 2,
          max: 10,
          description: '1 incumbent + rest as potential entrants (paper: 1+2)',
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
          name: 'fixed_cost',
          label: 'Fixed Cost',
          type: 'number',
          default: 500,
          min: 0,
          max: 10000,
          description: 'High FC creates natural monopoly',
        },
        {
          name: 'variable_cost',
          label: 'Variable Cost per Unit',
          type: 'number',
          default: 5,
          min: 0,
          max: 100,
        },
        {
          name: 'demand_intercept',
          label: 'Demand Intercept',
          type: 'number',
          default: 100,
          min: 10,
          max: 1000,
          description: 'Q = intercept - slope * P',
        },
        {
          name: 'demand_slope',
          label: 'Demand Slope',
          type: 'number',
          default: 1,
          min: 0.1,
          max: 10,
          step: 0.1,
        },
        {
          name: 'entry_cost',
          label: 'Entry Cost',
          type: 'number',
          default: 0,
          min: 0,
          max: 1000,
          description: 'Sunk cost to enter the market',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const fixedCost = config.fixed_cost ?? 500;
    const variableCost = config.variable_cost ?? 5;
    const demandIntercept = config.demand_intercept ?? 100;
    const demandSlope = config.demand_slope ?? 1;
    const entryCost = config.entry_cost ?? 0;

    if (fixedCost < 0) return { valid: false, error: 'Fixed cost cannot be negative' };
    if (variableCost < 0) return { valid: false, error: 'Variable cost cannot be negative' };
    if (demandIntercept <= 0) return { valid: false, error: 'Demand intercept must be positive' };
    if (demandSlope <= 0) return { valid: false, error: 'Demand slope must be positive' };
    if (entryCost < 0) return { valid: false, error: 'Entry cost cannot be negative' };

    // Check that demand produces positive quantity at variable cost
    const qAtVC = demandIntercept - demandSlope * variableCost;
    if (qAtVC <= 0) {
      return { valid: false, error: 'Demand intercept is too low relative to variable cost; no positive quantity is possible' };
    }

    return { valid: true };
  }

  /**
   * Assign roles: one random player becomes "incumbent", all others become "entrant".
   */
  async setupPlayers(
    sessionId: string,
    _playerCount: number,
    _config: Record<string, any>
  ): Promise<void> {
    const players = await PlayerModel.findBySession(sessionId);
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    for (let i = 0; i < shuffled.length; i++) {
      const role = i === 0 ? 'incumbent' : 'entrant';
      await pool.query(
        'UPDATE players SET role = $1 WHERE id = $2',
        [role, shuffled[i].id]
      );
    }

    console.log(`[ContestableMarket] setupPlayers: assigned 1 incumbent + ${shuffled.length - 1} entrants`);
  }

  /**
   * Initialize round state, start entry phase.
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

    const players = await PlayerModel.findActiveBySession(session.id);
    const incumbent = players.find(p => p.role === 'incumbent');
    if (!incumbent) {
      console.error(`[ContestableMarket] No incumbent found for session ${session.id}`);
      return;
    }

    const entrantIds = new Set<string>();
    for (const p of players) {
      if (p.role === 'entrant') {
        entrantIds.add(p.id);
      }
    }

    const state: RoundState = {
      phase: 'entry',
      entryDecisions: new Map(),
      postedPrices: new Map(),
      incumbentId: incumbent.id,
      activeSellers: new Set([incumbent.id]), // incumbent always active
      entrantIds,
      config,
      sessionId: session.id,
    };

    this.roundStates.set(roundId, state);

    // Schedule auto-transition to posting phase after 25% of round time
    const roundTime = config.time_per_round ?? 90;
    const entryTime = Math.floor(roundTime * 0.25);

    state.phaseTimerId = setTimeout(() => {
      this.transitionToPosting(roundId, sessionCode, io);
    }, entryTime * 1000);

    // Broadcast initial state
    io.to(`market-${sessionCode}`).emit('game-state', {
      phase: 'entry',
      incumbentId: incumbent.id,
      entrantCount: entrantIds.size,
      timeRemaining: entryTime,
    });

    console.log(`[ContestableMarket] Round ${roundId} started - entry phase (${entryTime}s), ${entrantIds.size} potential entrants`);
  }

  /**
   * Handle player actions across all phases.
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
      action.type || 'unknown',
      action,
    );

    const actionType = action.type;

    // ---------- Entry phase actions ----------
    if (actionType === 'enter' || actionType === 'stay_out') {
      return this.handleEntryAction(state, playerId, player, action, roundId, sessionCode, io);
    }

    // ---------- Posting phase actions ----------
    if (actionType === 'post_price') {
      return this.handlePostPriceAction(state, playerId, player, action, roundId, sessionCode, io);
    }

    return { success: false, error: `Unknown action type: ${actionType}` };
  }

  // --------------------------------------------------------------------------
  // Entry Phase
  // --------------------------------------------------------------------------

  private async handleEntryAction(
    state: RoundState,
    playerId: string,
    player: any,
    action: Record<string, any>,
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    if (state.phase !== 'entry') {
      return { success: false, error: 'Entry phase has ended' };
    }

    if (player.role !== 'entrant') {
      return { success: false, error: 'Only entrants can make entry decisions' };
    }

    if (!state.entrantIds.has(playerId)) {
      return { success: false, error: 'Player is not an entrant' };
    }

    if (state.entryDecisions.has(playerId)) {
      return { success: false, error: 'You have already made your entry decision' };
    }

    const entering = action.type === 'enter';
    state.entryDecisions.set(playerId, entering);

    if (entering) {
      state.activeSellers.add(playerId);
    }

    // Broadcast submission count (not decisions yet)
    io.to(`market-${sessionCode}`).emit('action-submitted', {
      submitted: state.entryDecisions.size,
      total: state.entrantIds.size,
      phase: 'entry',
    });

    const message = entering
      ? 'You have decided to enter the market'
      : 'You have decided to stay out';

    // If all entrants have decided, transition to posting immediately
    if (state.entryDecisions.size >= state.entrantIds.size) {
      this.transitionToPosting(roundId, sessionCode, io);
    }

    return {
      success: true,
      reply: {
        event: 'action-confirmed',
        data: { message },
      },
    };
  }

  // --------------------------------------------------------------------------
  // Posting Phase
  // --------------------------------------------------------------------------

  private async handlePostPriceAction(
    state: RoundState,
    playerId: string,
    _player: any,
    action: Record<string, any>,
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    if (state.phase !== 'posting') {
      return { success: false, error: 'Price posting phase has not started or has ended' };
    }

    if (!state.activeSellers.has(playerId)) {
      return { success: false, error: 'Only active sellers can post prices' };
    }

    if (state.postedPrices.has(playerId)) {
      return { success: false, error: 'You have already posted a price' };
    }

    const { price } = action;
    if (price === undefined || price === null) return { success: false, error: 'Price is required' };
    if (typeof price !== 'number' || isNaN(price)) return { success: false, error: 'Price must be a number' };
    if (price < 0) return { success: false, error: 'Price cannot be negative' };

    state.postedPrices.set(playerId, Math.round(price * 100) / 100);

    // Broadcast submission count
    io.to(`market-${sessionCode}`).emit('action-submitted', {
      submitted: state.postedPrices.size,
      total: state.activeSellers.size,
      phase: 'posting',
    });

    // If all active sellers have posted, resolve market immediately
    if (state.postedPrices.size >= state.activeSellers.size) {
      await this.resolveMarket(roundId, sessionCode, io);
    }

    return {
      success: true,
      reply: {
        event: 'action-confirmed',
        data: { message: `Price $${price.toFixed(2)} posted successfully` },
      },
    };
  }

  // --------------------------------------------------------------------------
  // Phase Transitions
  // --------------------------------------------------------------------------

  /**
   * Transition from entry phase to posting phase.
   * Defaults undecided entrants to "stay out".
   */
  private async transitionToPosting(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<void> {
    const state = this.roundStates.get(roundId);
    if (!state || state.phase !== 'entry') return;

    // Clear the entry timer
    if (state.phaseTimerId) {
      clearTimeout(state.phaseTimerId);
      state.phaseTimerId = undefined;
    }

    // Default undecided entrants to "stay out"
    for (const entrantId of state.entrantIds) {
      if (!state.entryDecisions.has(entrantId)) {
        state.entryDecisions.set(entrantId, false);
        console.log(`[ContestableMarket] Entrant ${entrantId} defaulted to stay out`);
      }
    }

    state.phase = 'posting';

    // Build entry results for broadcast
    const entryResults: Array<{ playerId: string; entered: boolean }> = [];
    for (const [pid, entered] of state.entryDecisions) {
      entryResults.push({ playerId: pid, entered });
    }

    const numEntrants = Array.from(state.entryDecisions.values()).filter(e => e).length;

    // Schedule auto-transition to results after 35% of total round time
    const roundTime = state.config.time_per_round ?? 90;
    const postingTime = Math.floor(roundTime * 0.35);

    state.phaseTimerId = setTimeout(() => {
      this.resolveMarket(roundId, sessionCode, io);
    }, postingTime * 1000);

    // Broadcast phase change
    io.to(`market-${sessionCode}`).emit('phase-change', {
      phase: 'posting',
      entryResults,
      activeSellers: state.activeSellers.size,
      numEntrants,
      timeRemaining: postingTime,
    });

    console.log(`[ContestableMarket] Round ${roundId} - posting phase (${postingTime}s), ${state.activeSellers.size} active sellers (${numEntrants} entrants + incumbent)`);
  }

  /**
   * Resolve the market: find lowest price, allocate demand, compute profits.
   */
  private async resolveMarket(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<void> {
    const state = this.roundStates.get(roundId);
    if (!state || state.phase === 'results') return;

    // Clear any pending timer
    if (state.phaseTimerId) {
      clearTimeout(state.phaseTimerId);
      state.phaseTimerId = undefined;
    }

    // Default active sellers who didn't post to a high price (demand_intercept / demand_slope)
    const config = state.config;
    const demandIntercept = config.demand_intercept ?? 100;
    const demandSlope = config.demand_slope ?? 1;
    const defaultPrice = Math.round((demandIntercept / demandSlope) * 100) / 100;

    for (const sellerId of state.activeSellers) {
      if (!state.postedPrices.has(sellerId)) {
        state.postedPrices.set(sellerId, defaultPrice);
        console.log(`[ContestableMarket] Active seller ${sellerId} defaulted to price $${defaultPrice}`);
      }
    }

    state.phase = 'results';

    // --- Market resolution ---
    const fixedCost = config.fixed_cost ?? 500;
    const variableCost = config.variable_cost ?? 5;
    const entryCost = config.entry_cost ?? 0;

    const prices = Array.from(state.postedPrices.entries());

    // Find lowest price among active sellers
    const lowestPrice = Math.min(...prices.map(([, p]) => p));
    const winners = prices.filter(([, p]) => p === lowestPrice);

    // Calculate demand at lowest price
    const totalQ = Math.max(0, demandIntercept - demandSlope * lowestPrice);
    const qPerWinner = winners.length > 0 ? totalQ / winners.length : 0;

    const winnerIds = new Set(winners.map(([id]) => id));

    // Get all players for result storage
    const allPlayers = await PlayerModel.findActiveBySession(state.sessionId);

    // Compute per-player profits
    const playerResults: Array<{ playerId: string; profit: number; resultData: Record<string, any> }> = [];

    // Compute benchmark values
    const monopolyPrice = Math.round(((demandIntercept / demandSlope + variableCost) / 2) * 100) / 100;
    const monopolyQ = Math.max(0, demandIntercept - demandSlope * monopolyPrice);
    const monopolyProfit = Math.round((monopolyPrice * monopolyQ - fixedCost - variableCost * monopolyQ) * 100) / 100;

    // Competitive (zero-profit) price: P where P*Q - FC - VC*Q = 0
    // P*(intercept - slope*P) = FC + VC*(intercept - slope*P)
    // (P - VC)*(intercept - slope*P) = FC
    // Let's solve numerically for simplicity
    const competitivePrice = this.computeZeroProfitPrice(demandIntercept, demandSlope, fixedCost, variableCost);

    for (const player of allPlayers) {
      const isIncumbent = player.id === state.incumbentId;
      const isEntrant = state.entrantIds.has(player.id);
      const entered = isEntrant ? (state.entryDecisions.get(player.id) ?? false) : false;
      const isActiveSeller = state.activeSellers.has(player.id);
      const postedPrice = state.postedPrices.get(player.id);
      const isWinner = winnerIds.has(player.id);

      let profit = 0;
      let revenue = 0;
      let totalCost = 0;
      let quantity = 0;

      if (!isActiveSeller) {
        // Non-entering entrant: 0 profit
        profit = 0;
      } else if (isWinner) {
        // Winner: gets share of demand
        quantity = qPerWinner;
        revenue = lowestPrice * qPerWinner;
        totalCost = fixedCost + variableCost * qPerWinner;
        profit = revenue - totalCost;
        if (isEntrant) {
          profit -= entryCost;
        }
      } else {
        // Active seller but not lowest price: paid FC but sold nothing
        totalCost = fixedCost;
        profit = -fixedCost;
        if (isEntrant) {
          profit -= entryCost;
        }
      }

      profit = Math.round(profit * 100) / 100;
      revenue = Math.round(revenue * 100) / 100;
      totalCost = Math.round(totalCost * 100) / 100;
      quantity = Math.round(quantity * 100) / 100;

      playerResults.push({
        playerId: player.id,
        profit,
        resultData: {
          role: isIncumbent ? 'incumbent' : 'entrant',
          entered: isIncumbent ? true : entered,
          isActiveSeller,
          postedPrice: postedPrice ?? null,
          isWinner,
          quantity,
          revenue,
          totalCost,
          entryCostPaid: (isEntrant && entered) ? entryCost : 0,
          lowestPrice: Math.round(lowestPrice * 100) / 100,
          totalDemand: Math.round(totalQ * 100) / 100,
          numActiveSellers: state.activeSellers.size,
          monopolyPrice,
          monopolyProfit,
          competitivePrice,
        },
      });
    }

    // Broadcast results
    const resultsSummary = {
      lowestPrice: Math.round(lowestPrice * 100) / 100,
      totalDemand: Math.round(totalQ * 100) / 100,
      numActiveSellers: state.activeSellers.size,
      numEntrants: Array.from(state.entryDecisions.values()).filter(e => e).length,
      winnersCount: winners.length,
      monopolyPrice,
      monopolyProfit,
      competitivePrice,
    };

    io.to(`market-${sessionCode}`).emit('phase-change', {
      phase: 'results',
      results: resultsSummary,
    });

    console.log(`[ContestableMarket] Round ${roundId} resolved: lowest price=$${lowestPrice}, Q=${Math.round(totalQ * 100) / 100}, ${winners.length} winner(s), ${state.activeSellers.size} active sellers`);

    // Save results to DB
    for (const result of playerResults) {
      await GameResultModel.create(
        roundId,
        result.playerId,
        result.resultData,
        result.profit,
      );

      await pool.query(
        'UPDATE players SET total_profit = COALESCE(total_profit, 0) + $1 WHERE id = $2',
        [result.profit, result.playerId]
      );
    }
  }

  /**
   * Process end of round. If market hasn't been resolved yet, resolve it now.
   */
  async processRoundEnd(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<RoundResult> {
    const state = this.roundStates.get(roundId);

    // If we haven't resolved yet, do it now
    if (state && state.phase !== 'results') {
      // Force transition through remaining phases
      if (state.phase === 'entry') {
        // Default all undecided entrants to stay out, then move to posting
        for (const entrantId of state.entrantIds) {
          if (!state.entryDecisions.has(entrantId)) {
            state.entryDecisions.set(entrantId, false);
          }
        }
        state.phase = 'posting';
      }

      // Resolve the market (handles defaulting non-posted prices)
      await this.resolveMarket(roundId, sessionCode, io);
    }

    // Clear any leftover timer
    if (state?.phaseTimerId) {
      clearTimeout(state.phaseTimerId);
    }

    // Read results from DB
    const results = await GameResultModel.findByRound(roundId);
    const playerResults = (results || []).map((r: any) => ({
      playerId: r.player_id,
      profit: r.profit ?? 0,
      resultData: r.result_data || {},
    }));

    // Build summary from saved result data
    const firstResult = playerResults.length > 0 ? playerResults[0].resultData : {};
    const summary = {
      lowestPrice: firstResult.lowestPrice ?? 0,
      totalDemand: firstResult.totalDemand ?? 0,
      numActiveSellers: firstResult.numActiveSellers ?? 0,
      monopolyPrice: firstResult.monopolyPrice ?? 0,
      monopolyProfit: firstResult.monopolyProfit ?? 0,
      competitivePrice: firstResult.competitivePrice ?? 0,
    };

    // Clean up round state
    this.roundStates.delete(roundId);

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
      incumbentId: state.incumbentId,
      numActiveSellers: state.activeSellers.size,
    };

    if (playerId) {
      const isIncumbent = playerId === state.incumbentId;
      const isEntrant = state.entrantIds.has(playerId);
      gameState.myRole = isIncumbent ? 'incumbent' : (isEntrant ? 'entrant' : 'observer');

      // Entry phase: show whether this player has decided
      if (state.phase === 'entry' && isEntrant) {
        gameState.myEntryDecision = state.entryDecisions.has(playerId)
          ? (state.entryDecisions.get(playerId) ? 'enter' : 'stay_out')
          : null;
      }

      // Posting phase: show whether this player has posted
      if (state.phase === 'posting' && state.activeSellers.has(playerId)) {
        gameState.myPostedPrice = state.postedPrices.has(playerId)
          ? state.postedPrices.get(playerId)
          : null;
      }

      gameState.isActiveSeller = state.activeSellers.has(playerId);
    }

    // Show entry results once posting phase starts
    if (state.phase === 'posting' || state.phase === 'results') {
      const entryResults: Array<{ playerId: string; entered: boolean }> = [];
      for (const [pid, entered] of state.entryDecisions) {
        entryResults.push({ playerId: pid, entered });
      }
      gameState.entryResults = entryResults;
    }

    // Show posted prices only in results phase
    if (state.phase === 'results') {
      const postedPrices: Array<{ playerId: string; price: number }> = [];
      for (const [pid, price] of state.postedPrices) {
        postedPrices.push({ playerId: pid, price });
      }
      gameState.postedPrices = postedPrices;
    }

    // Submission progress
    if (state.phase === 'entry') {
      gameState.totalSubmitted = state.entryDecisions.size;
      gameState.totalPlayers = state.entrantIds.size;
    } else if (state.phase === 'posting') {
      gameState.totalSubmitted = state.postedPrices.size;
      gameState.totalPlayers = state.activeSellers.size;
    }

    return gameState;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Compute the zero-profit (competitive) price numerically.
   * Solves: (P - VC) * (intercept - slope * P) = FC
   * This is a quadratic in P. We pick the lower root (competitive price).
   */
  private computeZeroProfitPrice(
    intercept: number,
    slope: number,
    fixedCost: number,
    variableCost: number
  ): number {
    // Expand: (P - VC)(intercept - slope*P) = FC
    // P*intercept - slope*P^2 - VC*intercept + VC*slope*P = FC
    // -slope*P^2 + (intercept + VC*slope)*P - (VC*intercept + FC) = 0
    // slope*P^2 - (intercept + VC*slope)*P + (VC*intercept + FC) = 0

    const a = slope;
    const b = -(intercept + variableCost * slope);
    const c = variableCost * intercept + fixedCost;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
      // No zero-profit price exists (FC too high for any price to break even)
      // Return variable cost as a floor
      return Math.round(variableCost * 100) / 100;
    }

    const sqrtD = Math.sqrt(discriminant);
    const p1 = (-b - sqrtD) / (2 * a);
    const p2 = (-b + sqrtD) / (2 * a);

    // Pick the lower positive root (competitive price)
    const candidates = [p1, p2].filter(p => p > variableCost);
    if (candidates.length === 0) {
      return Math.round(variableCost * 100) / 100;
    }

    const competitivePrice = Math.min(...candidates);
    return Math.round(competitivePrice * 100) / 100;
  }
}
