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

/**
 * A trade offer posted by a player during the trade phase.
 * Offers can be scoped to local (same village) or global (all villages).
 */
interface TradeOffer {
  id: string;
  playerId: string;
  playerName: string;
  village: number;
  offerGood: string;
  offerAmount: number;
  wantGood: string;
  wantAmount: number;
  scope: 'local' | 'global';
  status: 'open' | 'accepted' | 'cancelled';
  acceptedBy?: string;
  acceptedByName?: string;
  createdAt: number;
}

/**
 * In-memory state for a single round of Three-Village Trade.
 */
interface RoundState {
  phase: 'production' | 'trade' | 'results';
  /** playerId -> { allocation (0-100 for first good), goods produced } */
  productions: Map<string, { allocation: number; goods: Record<string, number> }>;
  /** playerId -> current inventory { red: 5, blue: 3, pink: 0 } */
  inventories: Map<string, Record<string, number>>;
  /** All trade offers posted this round */
  tradeOffers: TradeOffer[];
  /** playerId -> village number (1, 2, or 3) */
  playerVillages: Map<string, number>;
  /** playerId -> player type ('A' or 'B') */
  playerTypes: Map<string, 'A' | 'B'>;
  /** playerId -> player display name */
  playerNames: Map<string, string>;
  /** Timer for auto-transitioning between phases */
  phaseTimerId?: NodeJS.Timeout;
  /** Cached session config */
  config: Record<string, any>;
  /** Session ID for DB lookups */
  sessionId: string;
  /** Set of player IDs that have submitted production this round */
  productionSubmitted: Set<string>;
  /** Total active player count for this round */
  totalPlayers: number;
  /** Monotonically increasing offer ID counter */
  nextOfferId: number;
}

/**
 * Village definition: which two goods a village produces, and which good it imports.
 */
interface VillageDefinition {
  goods: [string, string];
  importGood: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Village layout:
 * - Village 1 (Red-Blue): produces red and blue, needs pink
 * - Village 2 (Blue-Pink): produces blue and pink, needs red
 * - Village 3 (Pink-Red): produces pink and red, needs blue
 *
 * Each village produces the scarce good needed by the other two villages,
 * creating symmetric gains from inter-village trade.
 */
const VILLAGES: Record<number, VillageDefinition> = {
  1: { goods: ['red', 'blue'], importGood: 'pink' },
  2: { goods: ['blue', 'pink'], importGood: 'red' },
  3: { goods: ['pink', 'red'], importGood: 'blue' },
};

const ALL_GOODS = ['red', 'blue', 'pink'];

// ============================================================================
// Engine
// ============================================================================

/**
 * Three-Village Long-Distance Trade Engine
 *
 * Based on: Kimbrough, Smith & Wilson (2008) "Historical Property Rights,
 * Sociality, and the Emergence of Impersonal Exchange in Long-Distance Trade",
 * American Economic Review.
 *
 * Three villages form a circular trade network where each village produces two
 * of three goods. Within each village, players have comparative advantages in
 * different goods (Type A vs Type B), creating gains from LOCAL trade. The
 * third good (which the village cannot produce) must be imported from another
 * village, creating gains from INTER-VILLAGE (long-distance) trade.
 *
 * Key economic insights:
 * 1. Specialization + local trade raises earnings vs autarky
 * 2. Inter-village trade further boosts earnings via the import bonus
 * 3. Property rights and trust enable impersonal long-distance exchange
 * 4. Transport costs create a wedge between local and global trade value
 *
 * Three-phase rounds:
 * Phase 1 (Production): Players allocate effort between their 2 village goods.
 *   Production features diminishing returns (exponent < 1 after normalization),
 *   so full specialization is optimal when trade is available.
 *
 * Phase 2 (Trade): Players post offers to buy/sell goods. Offers can be local
 *   (same village only) or global (all villages). Other players accept offers,
 *   triggering immediate inventory transfers. Inter-village trades may incur
 *   transport costs.
 *
 * Phase 3 (Results): Earnings calculated from final inventory using a
 *   Leontief-style min function on local goods, with a logarithmic bonus
 *   for the imported good. This reward structure incentivizes balanced
 *   consumption of local goods AND acquisition of the import good.
 */
export class ThreeVillageTradeEngine implements GameEngine {
  readonly gameType: GameType = 'three_village_trade' as GameType;

  /** In-memory round states keyed by roundId */
  private roundStates: Map<string, RoundState> = new Map();

  // --------------------------------------------------------------------------
  // UI Configuration
  // --------------------------------------------------------------------------

  getUIConfig(): UIConfig {
    return {
      name: 'Three-Village Trade',
      description:
        'Three villages trade locally and between villages. Discover the gains from specialization and long-distance exchange.',
      category: 'specialized',
      weekNumber: 28,
      roles: [
        {
          role: 'villager',
          label: 'Villager',
          description: 'Produce goods, trade locally and between villages to maximize earnings',
        },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Total Players',
          type: 'number',
          default: 6,
          min: 6,
          max: 12,
          step: 3,
          description: 'Must be divisible by 3 (2-4 per village)',
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
          default: 120,
          min: 60,
          max: 300,
        },
        {
          name: 'production_base_advantage',
          label: 'Advantaged Good Output',
          type: 'number',
          default: 12,
          min: 5,
          max: 30,
          description: 'Max output when fully specialized in advantaged good',
        },
        {
          name: 'production_base_other',
          label: 'Other Good Output',
          type: 'number',
          default: 10,
          min: 5,
          max: 30,
          description: 'Max output when fully specialized in non-advantaged good',
        },
        {
          name: 'production_exponent',
          label: 'Production Exponent',
          type: 'number',
          default: 1.3,
          min: 0.5,
          max: 3.0,
          step: 0.1,
          description: 'Diminishing returns (>1 means increasing returns at low allocation)',
        },
        {
          name: 'earnings_multiplier',
          label: 'Earnings Multiplier',
          type: 'number',
          default: 10,
          min: 1,
          max: 100,
          description: 'Scales earnings to reasonable cent amounts',
        },
        {
          name: 'import_bonus_factor',
          label: 'Import Bonus Factor',
          type: 'number',
          default: 0.3,
          min: 0,
          max: 2.0,
          step: 0.1,
          description: 'Weight of imported good logarithmic bonus (0 = no bonus)',
        },
        {
          name: 'ratio_type_a',
          label: 'Type A Ratio (k)',
          type: 'number',
          default: 2,
          min: 0.1,
          max: 10,
          step: 0.1,
          description: 'Type A needs k units of good1 per unit of good2',
        },
        {
          name: 'ratio_type_b',
          label: 'Type B Ratio (k)',
          type: 'number',
          default: 0.5,
          min: 0.1,
          max: 10,
          step: 0.1,
          description: 'Type B needs k units of good1 per unit of good2',
        },
        {
          name: 'allow_inter_village_trade',
          label: 'Allow Inter-Village Trade',
          type: 'checkbox',
          default: true,
          description: 'If false, only local trade within villages is allowed (autarky baseline)',
        },
        {
          name: 'transport_cost',
          label: 'Transport Cost per Unit',
          type: 'number',
          default: 0,
          min: 0,
          max: 10,
          description: 'Per-unit cost deducted from inter-village trades',
        },
      ],
    };
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  validateConfig(config: Record<string, any>): ValidationResult {
    const marketSize = config.market_size ?? 6;
    if (marketSize < 6) {
      return { valid: false, error: 'Need at least 6 players (2 per village)' };
    }
    if (marketSize % 3 !== 0) {
      return { valid: false, error: 'Player count must be divisible by 3 for equal village sizes' };
    }
    if (marketSize > 12) {
      return { valid: false, error: 'Maximum 12 players (4 per village)' };
    }

    const baseAdv = config.production_base_advantage ?? 12;
    const baseOther = config.production_base_other ?? 10;
    if (baseAdv <= 0 || baseOther <= 0) {
      return { valid: false, error: 'Production base values must be positive' };
    }

    const exp = config.production_exponent ?? 1.3;
    if (exp <= 0) {
      return { valid: false, error: 'Production exponent must be positive' };
    }

    const multiplier = config.earnings_multiplier ?? 10;
    if (multiplier <= 0) {
      return { valid: false, error: 'Earnings multiplier must be positive' };
    }

    const ratioA = config.ratio_type_a ?? 2;
    const ratioB = config.ratio_type_b ?? 0.5;
    if (ratioA <= 0 || ratioB <= 0) {
      return { valid: false, error: 'Ratio values must be positive' };
    }

    const transportCost = config.transport_cost ?? 0;
    if (transportCost < 0) {
      return { valid: false, error: 'Transport cost cannot be negative' };
    }

    return { valid: true };
  }

  // --------------------------------------------------------------------------
  // Player Setup
  // --------------------------------------------------------------------------

  /**
   * Distribute players evenly across 3 villages, alternating Type A and B
   * within each village. Store village and type in player.game_data.
   *
   * Village assignment: players sorted by join order, distributed round-robin.
   * Type assignment: within each village, alternate A, B, A, B...
   */
  async setupPlayers(
    sessionId: string,
    _playerCount: number,
    _config: Record<string, any>
  ): Promise<void> {
    const players = await PlayerModel.findBySession(sessionId);
    // Shuffle for randomized village assignment
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    const perVillage = Math.ceil(shuffled.length / 3);
    const villageCounts = [0, 0, 0]; // track how many assigned to each village

    for (let i = 0; i < shuffled.length; i++) {
      const village = (i % 3) + 1; // 1, 2, 3, 1, 2, 3, ...
      const indexInVillage = villageCounts[village - 1];
      villageCounts[village - 1]++;

      const playerType: 'A' | 'B' = indexInVillage % 2 === 0 ? 'A' : 'B';

      const gameData = {
        village,
        playerType,
        villageGoods: VILLAGES[village].goods,
        importGood: VILLAGES[village].importGood,
      };

      await pool.query(
        `UPDATE players SET role = 'villager', game_data = $1 WHERE id = $2`,
        [JSON.stringify(gameData), shuffled[i].id]
      );
    }

    console.log(
      `[ThreeVillageTrade] setupPlayers: ${shuffled.length} players across 3 villages ` +
      `(${villageCounts[0]}, ${villageCounts[1]}, ${villageCounts[2]})`
    );
  }

  // --------------------------------------------------------------------------
  // Round Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Initialize round state and start the production phase.
   * Called when a new round begins.
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

    // Build round state from player game_data
    const state: RoundState = {
      phase: 'production',
      productions: new Map(),
      inventories: new Map(),
      tradeOffers: [],
      playerVillages: new Map(),
      playerTypes: new Map(),
      playerNames: new Map(),
      config,
      sessionId: session.id,
      productionSubmitted: new Set(),
      totalPlayers: players.length,
      nextOfferId: 1,
    };

    for (const p of players) {
      const gd = (p.game_data as Record<string, any>) || {};
      const village = gd.village ?? 1;
      const playerType = gd.playerType ?? 'A';

      state.playerVillages.set(p.id, village);
      state.playerTypes.set(p.id, playerType);
      state.playerNames.set(p.id, p.name || `Player`);

      // Initialize empty inventory with all three goods
      const inv: Record<string, number> = {};
      for (const good of ALL_GOODS) {
        inv[good] = 0;
      }
      state.inventories.set(p.id, inv);
    }

    this.roundStates.set(roundId, state);

    // Schedule auto-transition from production to trade phase
    const roundTime = config.time_per_round ?? 120;
    const productionTime = Math.floor(roundTime * 0.25);

    state.phaseTimerId = setTimeout(() => {
      this.transitionToTrade(roundId, sessionCode, io);
    }, productionTime * 1000);

    // Build player info for broadcast
    const playerInfo = players.map(p => {
      const gd = (p.game_data as Record<string, any>) || {};
      return {
        id: p.id,
        name: p.name || 'Player',
        village: gd.village ?? 1,
        playerType: gd.playerType ?? 'A',
        villageGoods: VILLAGES[gd.village ?? 1].goods,
        importGood: VILLAGES[gd.village ?? 1].importGood,
      };
    });

    // Broadcast initial game state
    io.to(`market-${sessionCode}`).emit('game-state', {
      phase: 'production',
      timeRemaining: productionTime,
      totalRoundTime: roundTime,
      playerInfo,
      config: {
        allow_inter_village_trade: config.allow_inter_village_trade !== false,
        transport_cost: config.transport_cost ?? 0,
        production_base_advantage: config.production_base_advantage ?? 12,
        production_base_other: config.production_base_other ?? 10,
        production_exponent: config.production_exponent ?? 1.3,
        earnings_multiplier: config.earnings_multiplier ?? 10,
        import_bonus_factor: config.import_bonus_factor ?? 0.3,
        ratio_type_a: config.ratio_type_a ?? 2,
        ratio_type_b: config.ratio_type_b ?? 0.5,
      },
      villages: VILLAGES,
    });

    console.log(
      `[ThreeVillageTrade] Round ${roundId} started - production phase (${productionTime}s), ` +
      `${players.length} players`
    );
  }

  // --------------------------------------------------------------------------
  // Action Handling
  // --------------------------------------------------------------------------

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

    const actionType = action.type;

    // Store action in DB for audit trail
    await GameActionModel.create(roundId, playerId, actionType || 'unknown', action);

    switch (actionType) {
      case 'set_production':
        return this.handleSetProduction(state, playerId, player, action, roundId, sessionCode, io);

      case 'post_offer':
        return this.handlePostOffer(state, playerId, player, action, roundId, sessionCode, io);

      case 'accept_offer':
        return this.handleAcceptOffer(state, playerId, player, action, roundId, sessionCode, io);

      case 'cancel_offer':
        return this.handleCancelOffer(state, playerId, player, action, roundId, sessionCode, io);

      default:
        return { success: false, error: `Unknown action type: ${actionType}` };
    }
  }

  // --------------------------------------------------------------------------
  // Production Phase Actions
  // --------------------------------------------------------------------------

  /**
   * Handle a player setting their production allocation.
   * allocation: 0-100, percentage of effort on their FIRST village good.
   * The remainder goes to their SECOND village good.
   *
   * Production function: output = round(base * (fraction)^exponent)
   * where base depends on player type (advantaged vs other good).
   */
  private handleSetProduction(
    state: RoundState,
    playerId: string,
    player: any,
    action: Record<string, any>,
    roundId: string,
    sessionCode: string,
    io: Server
  ): ActionResult {
    if (state.phase !== 'production') {
      return { success: false, error: 'Not in production phase' };
    }

    const allocation = action.allocation;
    if (allocation === undefined || allocation === null) {
      return { success: false, error: 'Allocation is required (0-100)' };
    }
    if (typeof allocation !== 'number' || isNaN(allocation)) {
      return { success: false, error: 'Allocation must be a number' };
    }
    if (allocation < 0 || allocation > 100) {
      return { success: false, error: 'Allocation must be between 0 and 100' };
    }

    const village = state.playerVillages.get(playerId) ?? 1;
    const playerType = state.playerTypes.get(playerId) ?? 'A';
    const villageDef = VILLAGES[village];

    // Calculate production output
    const goods = this.calculateProduction(allocation, village, playerType, state.config);

    // Store production result
    state.productions.set(playerId, { allocation, goods });

    // Update inventory with produced goods
    const inv = state.inventories.get(playerId) || this.emptyInventory();
    for (const [good, amount] of Object.entries(goods)) {
      inv[good] = (inv[good] || 0) + amount;
    }
    state.inventories.set(playerId, inv);

    // Track submission
    state.productionSubmitted.add(playerId);

    // Broadcast that this player submitted (don't reveal allocation to others)
    io.to(`market-${sessionCode}`).emit('production-submitted', {
      playerId,
      playerName: state.playerNames.get(playerId) || 'Player',
      submitted: state.productionSubmitted.size,
      total: state.totalPlayers,
    });

    // If all players have submitted, transition to trade immediately
    if (state.productionSubmitted.size >= state.totalPlayers) {
      // Use setImmediate to allow the reply to be sent first
      setImmediate(() => {
        this.transitionToTrade(roundId, sessionCode, io);
      });
    }

    return {
      success: true,
      reply: {
        event: 'production-results',
        data: {
          playerId,
          allocation,
          goods,
          inventory: { ...inv },
        },
      },
    };
  }

  // --------------------------------------------------------------------------
  // Trade Phase Actions
  // --------------------------------------------------------------------------

  /**
   * Post a trade offer. Players specify what they offer and what they want.
   * Offers can be local (visible to same-village players) or global (all players).
   */
  private handlePostOffer(
    state: RoundState,
    playerId: string,
    player: any,
    action: Record<string, any>,
    roundId: string,
    sessionCode: string,
    io: Server
  ): ActionResult {
    if (state.phase !== 'trade') {
      return { success: false, error: 'Not in trade phase' };
    }

    const { offerGood, offerAmount, wantGood, wantAmount, scope } = action;

    // Validate goods
    if (!ALL_GOODS.includes(offerGood)) {
      return { success: false, error: `Invalid offer good: ${offerGood}` };
    }
    if (!ALL_GOODS.includes(wantGood)) {
      return { success: false, error: `Invalid want good: ${wantGood}` };
    }
    if (offerGood === wantGood) {
      return { success: false, error: 'Cannot trade a good for itself' };
    }

    // Validate amounts
    if (!Number.isInteger(offerAmount) || offerAmount < 1) {
      return { success: false, error: 'Offer amount must be a positive integer' };
    }
    if (!Number.isInteger(wantAmount) || wantAmount < 1) {
      return { success: false, error: 'Want amount must be a positive integer' };
    }

    // Validate scope
    const offerScope = scope === 'global' ? 'global' : 'local';
    if (offerScope === 'global' && state.config.allow_inter_village_trade === false) {
      return { success: false, error: 'Inter-village trade is not allowed in this session' };
    }

    // Check inventory
    const inv = state.inventories.get(playerId);
    if (!inv) {
      return { success: false, error: 'Player inventory not found' };
    }
    if ((inv[offerGood] || 0) < offerAmount) {
      return {
        success: false,
        error: `Insufficient ${offerGood}: you have ${inv[offerGood] || 0}, need ${offerAmount}`,
      };
    }

    const village = state.playerVillages.get(playerId) ?? 1;
    const offerId = `offer-${roundId.slice(-6)}-${state.nextOfferId++}`;

    const offer: TradeOffer = {
      id: offerId,
      playerId,
      playerName: state.playerNames.get(playerId) || 'Player',
      village,
      offerGood,
      offerAmount,
      wantGood,
      wantAmount,
      scope: offerScope,
      status: 'open',
      createdAt: Date.now(),
    };

    state.tradeOffers.push(offer);

    // Broadcast to appropriate scope
    if (offerScope === 'global') {
      // Visible to all players
      io.to(`market-${sessionCode}`).emit('trade-offer-posted', { offer });
    } else {
      // Visible only to same-village players
      // We broadcast to all but include village info so the client can filter
      io.to(`market-${sessionCode}`).emit('trade-offer-posted', { offer });
    }

    console.log(
      `[ThreeVillageTrade] Offer posted: ${offerId} by V${village} player - ` +
      `${offerAmount} ${offerGood} for ${wantAmount} ${wantGood} (${offerScope})`
    );

    return {
      success: true,
      reply: {
        event: 'action-confirmed',
        data: { message: 'Offer posted', offerId },
      },
    };
  }

  /**
   * Accept a trade offer. Validates inventory on both sides, transfers goods,
   * and applies transport costs for inter-village trades.
   */
  private handleAcceptOffer(
    state: RoundState,
    playerId: string,
    player: any,
    action: Record<string, any>,
    roundId: string,
    sessionCode: string,
    io: Server
  ): ActionResult {
    if (state.phase !== 'trade') {
      return { success: false, error: 'Not in trade phase' };
    }

    const { offerId } = action;
    const offer = state.tradeOffers.find(o => o.id === offerId);

    if (!offer) {
      return { success: false, error: 'Offer not found' };
    }
    if (offer.status !== 'open') {
      return { success: false, error: `Offer is ${offer.status}, cannot accept` };
    }
    if (offer.playerId === playerId) {
      return { success: false, error: 'Cannot accept your own offer' };
    }

    // Check scope: local offers can only be accepted by same-village players
    const acceptorVillage = state.playerVillages.get(playerId) ?? 1;
    if (offer.scope === 'local' && acceptorVillage !== offer.village) {
      return { success: false, error: 'This is a local offer; you are in a different village' };
    }

    // Verify the offerer still has the goods
    const offererInv = state.inventories.get(offer.playerId);
    if (!offererInv || (offererInv[offer.offerGood] || 0) < offer.offerAmount) {
      // Offerer no longer has the goods (traded away in another offer)
      offer.status = 'cancelled';
      io.to(`market-${sessionCode}`).emit('trade-offer-cancelled', {
        offerId: offer.id,
        reason: 'Offerer no longer has sufficient goods',
      });
      return { success: false, error: 'Offerer no longer has sufficient goods' };
    }

    // Verify the acceptor has the wanted goods
    const acceptorInv = state.inventories.get(playerId);
    if (!acceptorInv || (acceptorInv[offer.wantGood] || 0) < offer.wantAmount) {
      return {
        success: false,
        error: `Insufficient ${offer.wantGood}: you have ${acceptorInv?.[offer.wantGood] || 0}, need ${offer.wantAmount}`,
      };
    }

    // Determine if this is an inter-village trade
    const isInterVillage = acceptorVillage !== offer.village;
    const transportCost = isInterVillage ? (state.config.transport_cost ?? 0) : 0;

    // Calculate net amounts after transport cost
    // Transport cost reduces the amount received by the acceptor and offerer respectively
    const offererReceives = Math.max(0, offer.wantAmount - (isInterVillage ? transportCost : 0));
    const acceptorReceives = Math.max(0, offer.offerAmount - (isInterVillage ? transportCost : 0));

    if (acceptorReceives <= 0 || offererReceives <= 0) {
      return { success: false, error: 'Transport costs exceed trade value; trade not worthwhile' };
    }

    // Execute the trade
    // Offerer gives offerGood, receives wantGood (minus transport)
    offererInv[offer.offerGood] -= offer.offerAmount;
    offererInv[offer.wantGood] = (offererInv[offer.wantGood] || 0) + offererReceives;

    // Acceptor gives wantGood, receives offerGood (minus transport)
    acceptorInv[offer.wantGood] -= offer.wantAmount;
    acceptorInv[offer.offerGood] = (acceptorInv[offer.offerGood] || 0) + acceptorReceives;

    // Update offer status
    offer.status = 'accepted';
    offer.acceptedBy = playerId;
    offer.acceptedByName = state.playerNames.get(playerId) || 'Player';

    // Auto-cancel any other open offers from the offerer for the same good
    // if they no longer have enough inventory
    this.autoCancelInsufficientOffers(state, offer.playerId, sessionCode, io);
    this.autoCancelInsufficientOffers(state, playerId, sessionCode, io);

    // Broadcast the trade
    io.to(`market-${sessionCode}`).emit('trade-offer-accepted', {
      offerId: offer.id,
      acceptedBy: playerId,
      acceptedByName: state.playerNames.get(playerId) || 'Player',
      acceptedByVillage: acceptorVillage,
      isInterVillage,
      transportCost: isInterVillage ? transportCost : 0,
      offererReceived: offererReceives,
      acceptorReceived: acceptorReceives,
      // Send updated inventories to the two parties
      offererInventory: { ...offererInv },
      acceptorInventory: { ...acceptorInv },
    });

    console.log(
      `[ThreeVillageTrade] Trade accepted: ${offerId} by V${acceptorVillage} player${isInterVillage ? ' (INTER-VILLAGE, transport=' + transportCost + ')' : ''}`
    );

    return {
      success: true,
      reply: {
        event: 'action-confirmed',
        data: {
          message: `Trade accepted${isInterVillage ? ` (transport cost: ${transportCost} per unit)` : ''}`,
          inventory: { ...acceptorInv },
        },
      },
    };
  }

  /**
   * Cancel an open offer. Only the offerer can cancel their own offer.
   */
  private handleCancelOffer(
    state: RoundState,
    playerId: string,
    player: any,
    action: Record<string, any>,
    roundId: string,
    sessionCode: string,
    io: Server
  ): ActionResult {
    if (state.phase !== 'trade') {
      return { success: false, error: 'Not in trade phase' };
    }

    const { offerId } = action;
    const offer = state.tradeOffers.find(o => o.id === offerId);

    if (!offer) {
      return { success: false, error: 'Offer not found' };
    }
    if (offer.playerId !== playerId) {
      return { success: false, error: 'You can only cancel your own offers' };
    }
    if (offer.status !== 'open') {
      return { success: false, error: `Offer is already ${offer.status}` };
    }

    offer.status = 'cancelled';

    io.to(`market-${sessionCode}`).emit('trade-offer-cancelled', {
      offerId: offer.id,
      reason: 'Cancelled by offerer',
    });

    console.log(`[ThreeVillageTrade] Offer cancelled: ${offerId}`);

    return {
      success: true,
      reply: {
        event: 'action-confirmed',
        data: { message: 'Offer cancelled' },
      },
    };
  }

  // --------------------------------------------------------------------------
  // Phase Transitions
  // --------------------------------------------------------------------------

  /**
   * Transition from production to trade phase.
   * Players who didn't submit production get a default 50/50 allocation.
   */
  private async transitionToTrade(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<void> {
    const state = this.roundStates.get(roundId);
    if (!state || state.phase !== 'production') return;

    // Clear the production timer
    if (state.phaseTimerId) {
      clearTimeout(state.phaseTimerId);
      state.phaseTimerId = undefined;
    }

    // Default any players who didn't submit to 50/50 allocation
    for (const [playerId] of state.playerVillages) {
      if (!state.productionSubmitted.has(playerId)) {
        const village = state.playerVillages.get(playerId) ?? 1;
        const playerType = state.playerTypes.get(playerId) ?? 'A';
        const goods = this.calculateProduction(50, village, playerType, state.config);

        state.productions.set(playerId, { allocation: 50, goods });

        const inv = state.inventories.get(playerId) || this.emptyInventory();
        for (const [good, amount] of Object.entries(goods)) {
          inv[good] = (inv[good] || 0) + amount;
        }
        state.inventories.set(playerId, inv);

        console.log(
          `[ThreeVillageTrade] Player ${playerId} defaulted to 50/50 allocation: ${JSON.stringify(goods)}`
        );
      }
    }

    state.phase = 'trade';

    // Schedule auto-transition to results after trade time
    const roundTime = state.config.time_per_round ?? 120;
    const tradeTime = Math.floor(roundTime * 0.65);

    state.phaseTimerId = setTimeout(() => {
      this.transitionToResults(roundId, sessionCode, io);
    }, tradeTime * 1000);

    // Build production results for broadcast (each player sees all village members' production)
    const productionResults: Array<{
      playerId: string;
      playerName: string;
      village: number;
      goods: Record<string, number>;
    }> = [];

    for (const [pid, prod] of state.productions) {
      productionResults.push({
        playerId: pid,
        playerName: state.playerNames.get(pid) || 'Player',
        village: state.playerVillages.get(pid) ?? 1,
        goods: prod.goods,
      });
    }

    // Build inventories for broadcast
    const inventories: Record<string, Record<string, number>> = {};
    for (const [pid, inv] of state.inventories) {
      inventories[pid] = { ...inv };
    }

    io.to(`market-${sessionCode}`).emit('phase-changed', {
      phase: 'trade',
      timeRemaining: tradeTime,
      productionResults,
      inventories,
    });

    console.log(
      `[ThreeVillageTrade] Round ${roundId} - trade phase (${tradeTime}s), ` +
      `${state.productions.size} players produced`
    );
  }

  /**
   * Transition from trade to results phase.
   * Cancel all remaining open offers, calculate earnings.
   */
  private async transitionToResults(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<void> {
    const state = this.roundStates.get(roundId);
    if (!state || state.phase !== 'trade') return;

    // Clear the trade timer
    if (state.phaseTimerId) {
      clearTimeout(state.phaseTimerId);
      state.phaseTimerId = undefined;
    }

    // Cancel all remaining open offers
    for (const offer of state.tradeOffers) {
      if (offer.status === 'open') {
        offer.status = 'cancelled';
      }
    }

    state.phase = 'results';

    // Calculate earnings for all players
    const playerResults: Array<{
      playerId: string;
      profit: number;
      resultData: Record<string, any>;
    }> = [];

    const villageAggregates: Record<number, {
      totalEarnings: number;
      totalImported: number;
      playerCount: number;
      totalTrades: number;
    }> = {
      1: { totalEarnings: 0, totalImported: 0, playerCount: 0, totalTrades: 0 },
      2: { totalEarnings: 0, totalImported: 0, playerCount: 0, totalTrades: 0 },
      3: { totalEarnings: 0, totalImported: 0, playerCount: 0, totalTrades: 0 },
    };

    for (const [playerId, inv] of state.inventories) {
      const village = state.playerVillages.get(playerId) ?? 1;
      const playerType = state.playerTypes.get(playerId) ?? 'A';
      const villageDef = VILLAGES[village];

      const earnings = this.calculateEarnings(inv, village, playerType, state.config);

      // Count trades this player participated in
      const tradesAsOfferer = state.tradeOffers.filter(
        o => o.playerId === playerId && o.status === 'accepted'
      ).length;
      const tradesAsAcceptor = state.tradeOffers.filter(
        o => o.acceptedBy === playerId
      ).length;
      const interVillageTrades = state.tradeOffers.filter(
        o =>
          o.status === 'accepted' &&
          (o.playerId === playerId || o.acceptedBy === playerId) &&
          state.playerVillages.get(o.playerId) !== state.playerVillages.get(o.acceptedBy!)
      ).length;

      const resultData: Record<string, any> = {
        village,
        playerType,
        allocation: state.productions.get(playerId)?.allocation ?? 50,
        produced: state.productions.get(playerId)?.goods ?? {},
        finalInventory: { ...inv },
        earnings: Math.round(earnings * 100) / 100,
        localGoods: [villageDef.goods[0], villageDef.goods[1]],
        importGood: villageDef.importGood,
        importAmount: inv[villageDef.importGood] || 0,
        tradesCompleted: tradesAsOfferer + tradesAsAcceptor,
        interVillageTrades,
      };

      const profit = Math.round(earnings * 100) / 100;
      playerResults.push({ playerId, profit, resultData });

      // Aggregate village stats
      const va = villageAggregates[village];
      va.totalEarnings += profit;
      va.totalImported += (inv[villageDef.importGood] || 0);
      va.playerCount++;
      va.totalTrades += (tradesAsOfferer + tradesAsAcceptor);
    }

    // Compute theoretical benchmarks
    const config = state.config;
    const autarkyEarnings = this.computeAutarkyBenchmark(config);
    const localTradeEarnings = this.computeLocalTradeBenchmark(config);

    // Save results to DB and update profits
    for (const result of playerResults) {
      await GameResultModel.create(roundId, result.playerId, result.resultData, result.profit);

      await pool.query(
        'UPDATE players SET total_profit = COALESCE(total_profit, 0) + $1 WHERE id = $2',
        [result.profit, result.playerId]
      );
    }

    // Build summary
    const summary = {
      villageAggregates,
      tradeOffers: state.tradeOffers.map(o => ({
        id: o.id,
        village: o.village,
        offerGood: o.offerGood,
        offerAmount: o.offerAmount,
        wantGood: o.wantGood,
        wantAmount: o.wantAmount,
        scope: o.scope,
        status: o.status,
        acceptedBy: o.acceptedBy,
      })),
      totalTradesCompleted: state.tradeOffers.filter(o => o.status === 'accepted').length,
      totalInterVillageTrades: state.tradeOffers.filter(
        o =>
          o.status === 'accepted' &&
          state.playerVillages.get(o.playerId) !== state.playerVillages.get(o.acceptedBy!)
      ).length,
      benchmarks: {
        autarkyEarnings,
        localTradeEarnings,
      },
    };

    // Broadcast results
    io.to(`market-${sessionCode}`).emit('phase-changed', {
      phase: 'results',
      playerResults: playerResults.map(r => ({
        playerId: r.playerId,
        profit: r.profit,
        ...r.resultData,
      })),
      villageAggregates,
      benchmarks: summary.benchmarks,
      totalTrades: summary.totalTradesCompleted,
      totalInterVillageTrades: summary.totalInterVillageTrades,
    });

    console.log(
      `[ThreeVillageTrade] Round ${roundId} resolved: ` +
      `${summary.totalTradesCompleted} trades (${summary.totalInterVillageTrades} inter-village), ` +
      `avg earnings: V1=${(villageAggregates[1].totalEarnings / Math.max(1, villageAggregates[1].playerCount)).toFixed(1)}, ` +
      `V2=${(villageAggregates[2].totalEarnings / Math.max(1, villageAggregates[2].playerCount)).toFixed(1)}, ` +
      `V3=${(villageAggregates[3].totalEarnings / Math.max(1, villageAggregates[3].playerCount)).toFixed(1)}`
    );
  }

  // --------------------------------------------------------------------------
  // Process Round End
  // --------------------------------------------------------------------------

  /**
   * Called by the framework when the round timer expires.
   * If we haven't reached results phase yet, force-transition through remaining phases.
   */
  async processRoundEnd(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<RoundResult> {
    const state = this.roundStates.get(roundId);

    // If we haven't resolved yet, force through remaining phases
    if (state && state.phase !== 'results') {
      if (state.phase === 'production') {
        await this.transitionToTrade(roundId, sessionCode, io);
      }
      // state.phase may have changed to 'trade'
      const updatedState = this.roundStates.get(roundId);
      if (updatedState && updatedState.phase === 'trade') {
        await this.transitionToResults(roundId, sessionCode, io);
      }
    }

    // Clear any leftover timers
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

    // Build summary from saved data
    const villageAggregates: Record<number, { totalEarnings: number; playerCount: number }> = {
      1: { totalEarnings: 0, playerCount: 0 },
      2: { totalEarnings: 0, playerCount: 0 },
      3: { totalEarnings: 0, playerCount: 0 },
    };

    for (const r of playerResults) {
      const v = r.resultData.village ?? 1;
      villageAggregates[v].totalEarnings += r.profit;
      villageAggregates[v].playerCount++;
    }

    const summary = { villageAggregates };

    // Clean up round state
    this.roundStates.delete(roundId);

    return { playerResults, summary };
  }

  // --------------------------------------------------------------------------
  // Game State (for reconnecting players)
  // --------------------------------------------------------------------------

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
      totalPlayers: state.totalPlayers,
    };

    // Build inventories map
    const inventories: Record<string, Record<string, number>> = {};
    for (const [pid, inv] of state.inventories) {
      inventories[pid] = { ...inv };
    }
    gameState.inventories = inventories;

    // Include player info
    const playerInfo: Array<Record<string, any>> = [];
    for (const [pid, village] of state.playerVillages) {
      playerInfo.push({
        id: pid,
        name: state.playerNames.get(pid) || 'Player',
        village,
        playerType: state.playerTypes.get(pid) ?? 'A',
        villageGoods: VILLAGES[village].goods,
        importGood: VILLAGES[village].importGood,
      });
    }
    gameState.playerInfo = playerInfo;

    // Player-specific state
    if (playerId) {
      const myVillage = state.playerVillages.get(playerId) ?? 1;
      const myType = state.playerTypes.get(playerId) ?? 'A';

      gameState.myVillage = myVillage;
      gameState.myType = myType;
      gameState.myGoods = VILLAGES[myVillage].goods;
      gameState.myImportGood = VILLAGES[myVillage].importGood;
      gameState.myInventory = state.inventories.get(playerId)
        ? { ...state.inventories.get(playerId)! }
        : this.emptyInventory();

      if (state.phase === 'production') {
        const prod = state.productions.get(playerId);
        gameState.myAllocation = prod?.allocation ?? null;
        gameState.hasSubmitted = state.productionSubmitted.has(playerId);
      }

      if (state.phase === 'production') {
        gameState.productionSubmitted = state.productionSubmitted.size;
      }
    }

    // Trade phase state: include active offers
    if (state.phase === 'trade' || state.phase === 'results') {
      // Filter offers based on visibility
      if (playerId) {
        const myVillage = state.playerVillages.get(playerId) ?? 1;
        gameState.tradeOffers = state.tradeOffers
          .filter(o => {
            // Player can see: their own offers, global offers, or local offers from their village
            if (o.playerId === playerId) return true;
            if (o.scope === 'global') return true;
            if (o.scope === 'local' && o.village === myVillage) return true;
            return false;
          })
          .map(o => ({
            id: o.id,
            playerId: o.playerId,
            playerName: o.playerName,
            village: o.village,
            offerGood: o.offerGood,
            offerAmount: o.offerAmount,
            wantGood: o.wantGood,
            wantAmount: o.wantAmount,
            scope: o.scope,
            status: o.status,
            acceptedBy: o.acceptedBy,
            acceptedByName: o.acceptedByName,
          }));
      } else {
        // No player specified — return all offers (admin/observer view)
        gameState.tradeOffers = state.tradeOffers.map(o => ({
          id: o.id,
          playerId: o.playerId,
          playerName: o.playerName,
          village: o.village,
          offerGood: o.offerGood,
          offerAmount: o.offerAmount,
          wantGood: o.wantGood,
          wantAmount: o.wantAmount,
          scope: o.scope,
          status: o.status,
          acceptedBy: o.acceptedBy,
          acceptedByName: o.acceptedByName,
        }));
      }

      // Include production results (visible after production phase)
      if (state.productions.size > 0) {
        const productionResults: Array<Record<string, any>> = [];
        for (const [pid, prod] of state.productions) {
          productionResults.push({
            playerId: pid,
            playerName: state.playerNames.get(pid) || 'Player',
            village: state.playerVillages.get(pid) ?? 1,
            goods: prod.goods,
          });
        }
        gameState.productionResults = productionResults;
      }
    }

    // Config info for the client
    gameState.config = {
      allow_inter_village_trade: state.config.allow_inter_village_trade !== false,
      transport_cost: state.config.transport_cost ?? 0,
      production_base_advantage: state.config.production_base_advantage ?? 12,
      production_base_other: state.config.production_base_other ?? 10,
      production_exponent: state.config.production_exponent ?? 1.3,
      earnings_multiplier: state.config.earnings_multiplier ?? 10,
      import_bonus_factor: state.config.import_bonus_factor ?? 0.3,
      ratio_type_a: state.config.ratio_type_a ?? 2,
      ratio_type_b: state.config.ratio_type_b ?? 0.5,
    };
    gameState.villages = VILLAGES;

    return gameState;
  }

  // --------------------------------------------------------------------------
  // Production Calculation
  // --------------------------------------------------------------------------

  /**
   * Calculate production output for a player given their allocation.
   *
   * Production function for each good:
   *   output = round(base * (fraction)^exponent)
   *
   * where:
   *   - base = production_base_advantage for the good matching the player's type advantage
   *   - base = production_base_other for the other good
   *   - fraction = allocation/100 for good1 (first village good), (100-allocation)/100 for good2
   *   - exponent = production_exponent (default 1.3, creating increasing returns that
   *     favor specialization when combined with trade)
   *
   * Example (Type A, Village 1, alloc=100%):
   *   Red = round(12 * (100/100)^1.3) = 12
   *   Blue = round(10 * (0/100)^1.3) = 0
   *
   * Example (Type A, Village 1, alloc=50%):
   *   Red = round(12 * (0.5)^1.3) = round(12 * 0.406) = 5
   *   Blue = round(10 * (0.5)^1.3) = round(10 * 0.406) = 4
   */
  private calculateProduction(
    allocation: number,
    village: number,
    playerType: 'A' | 'B',
    config: Record<string, any>
  ): Record<string, number> {
    const baseAdv = config.production_base_advantage ?? 12;
    const baseOther = config.production_base_other ?? 10;
    const exponent = config.production_exponent ?? 1.3;

    const villageDef = VILLAGES[village];
    const good1 = villageDef.goods[0]; // first village good
    const good2 = villageDef.goods[1]; // second village good

    // Type A has advantage in good1, Type B has advantage in good2
    const good1Base = playerType === 'A' ? baseAdv : baseOther;
    const good2Base = playerType === 'A' ? baseOther : baseAdv;

    const frac1 = allocation / 100;
    const frac2 = (100 - allocation) / 100;

    const goods: Record<string, number> = {};

    // Calculate output for each good (floor to 0 for safety)
    goods[good1] = Math.max(0, Math.round(good1Base * Math.pow(frac1, exponent)));
    goods[good2] = Math.max(0, Math.round(good2Base * Math.pow(frac2, exponent)));

    // Import good is never produced
    goods[villageDef.importGood] = 0;

    return goods;
  }

  // --------------------------------------------------------------------------
  // Earnings Calculation
  // --------------------------------------------------------------------------

  /**
   * Calculate earnings from a player's final inventory.
   *
   * Earnings = min(good1, k * good2) * multiplier * (1 + importFactor * ln(1 + good3))
   *
   * Where:
   * - good1, good2 = the village's two locally-produced goods
   * - good3 = the imported good (not produced locally)
   * - k = ratio factor (Type A: ratio_type_a, Type B: ratio_type_b)
   *   This creates different "exchange rates" between local goods for each type,
   *   ensuring gains from local A-B trade even without inter-village trade.
   * - The min() is a Leontief complementarity — players need BOTH local goods
   * - The logarithmic import bonus rewards importing the scarce third good
   *   but with diminishing returns (first units of import matter most)
   *
   * Economic intuition:
   * - Without trade: Type A produces mostly good1 but needs both → low earnings
   * - With local trade: A produces good1, B produces good2, they trade → higher earnings
   * - With inter-village trade: acquire good3 import bonus → highest earnings
   */
  private calculateEarnings(
    inventory: Record<string, number>,
    village: number,
    playerType: 'A' | 'B',
    config: Record<string, any>
  ): number {
    const multiplier = config.earnings_multiplier ?? 10;
    const importFactor = config.import_bonus_factor ?? 0.3;
    const ratioA = config.ratio_type_a ?? 2;
    const ratioB = config.ratio_type_b ?? 0.5;

    const villageDef = VILLAGES[village];
    const good1 = inventory[villageDef.goods[0]] || 0;
    const good2 = inventory[villageDef.goods[1]] || 0;
    const good3 = inventory[villageDef.importGood] || 0;

    // k-ratio: Type A values good1 more (k=2 means needs 2 good1 per good2),
    // Type B values good2 more (k=0.5 means needs 0.5 good1 per good2)
    const k = playerType === 'A' ? ratioA : ratioB;

    // Leontief min on local goods: effective_sets = min(good1, k * good2)
    // With k=2 for Type A: min(good1, 2*good2) means they need 2× as much good1
    // With k=0.5 for Type B: min(good1, 0.5*good2) means they need 0.5× as much good1
    const effectiveSets = Math.min(good1, k * good2);

    // Logarithmic import bonus: (1 + factor * ln(1 + good3))
    // This ensures the first units of import are most valuable (diminishing returns)
    // When good3=0: bonus=1 (no penalty, just no bonus)
    // When good3=1: bonus ~ 1 + 0.3*0.693 = 1.21 (21% boost)
    // When good3=5: bonus ~ 1 + 0.3*1.79 = 1.54 (54% boost)
    const importBonus = 1 + importFactor * Math.log(1 + good3);

    const earnings = effectiveSets * multiplier * importBonus;

    return Math.max(0, earnings);
  }

  // --------------------------------------------------------------------------
  // Benchmark Calculations
  // --------------------------------------------------------------------------

  /**
   * Compute expected earnings under autarky (no trade at all).
   * A player with 50/50 allocation, no trade, no imports.
   * Returns average per player.
   */
  private computeAutarkyBenchmark(config: Record<string, any>): number {
    // Under autarky, best strategy is to balance production for the min function.
    // Type A with k=2: min(good1, 2*good2) maximized when good1 = 2*good2
    // With production of good1 = baseAdv * (a/100)^exp, good2 = baseOther * ((100-a)/100)^exp
    // This is complex analytically, so we'll approximate with a few allocations
    const baseAdv = config.production_base_advantage ?? 12;
    const baseOther = config.production_base_other ?? 10;
    const exponent = config.production_exponent ?? 1.3;
    const multiplier = config.earnings_multiplier ?? 10;
    const ratioA = config.ratio_type_a ?? 2;
    const ratioB = config.ratio_type_b ?? 0.5;

    let bestA = 0;
    let bestB = 0;

    // Brute-force search for optimal autarky allocation
    for (let alloc = 0; alloc <= 100; alloc++) {
      const frac1 = alloc / 100;
      const frac2 = (100 - alloc) / 100;

      // Type A
      const g1a = Math.round(baseAdv * Math.pow(frac1, exponent));
      const g2a = Math.round(baseOther * Math.pow(frac2, exponent));
      const earningsA = Math.min(g1a, ratioA * g2a) * multiplier;

      // Type B
      const g1b = Math.round(baseOther * Math.pow(frac1, exponent));
      const g2b = Math.round(baseAdv * Math.pow(frac2, exponent));
      const earningsB = Math.min(g1b, ratioB * g2b) * multiplier;

      if (earningsA > bestA) bestA = earningsA;
      if (earningsB > bestB) bestB = earningsB;
    }

    return Math.round(((bestA + bestB) / 2) * 100) / 100;
  }

  /**
   * Compute expected earnings with local trade only (no imports).
   * Type A fully specializes in good1, Type B in good2, they trade optimally.
   * Returns average per player.
   */
  private computeLocalTradeBenchmark(config: Record<string, any>): number {
    const baseAdv = config.production_base_advantage ?? 12;
    const baseOther = config.production_base_other ?? 10;
    const exponent = config.production_exponent ?? 1.3;
    const multiplier = config.earnings_multiplier ?? 10;
    const ratioA = config.ratio_type_a ?? 2;
    const ratioB = config.ratio_type_b ?? 0.5;

    // Full specialization:
    // Type A produces: good1 = baseAdv * 1^exp = baseAdv, good2 = 0
    // Type B produces: good1 = 0, good2 = baseAdv
    const aProduces1 = baseAdv;
    const bProduces2 = baseAdv;

    // After optimal trade (assume 1 Type A and 1 Type B):
    // Total pool: aProduces1 of good1, bProduces2 of good2
    // Need to split so both benefit. Best split maximizes sum of earnings.
    // We'll do a brute-force over how much good1 goes to A vs B
    let bestTotal = 0;

    for (let g1forA = 0; g1forA <= aProduces1; g1forA++) {
      const g1forB = aProduces1 - g1forA;
      for (let g2forA = 0; g2forA <= bProduces2; g2forA++) {
        const g2forB = bProduces2 - g2forA;

        const earningsA = Math.min(g1forA, ratioA * g2forA) * multiplier;
        const earningsB = Math.min(g1forB, ratioB * g2forB) * multiplier;

        if (earningsA + earningsB > bestTotal) {
          bestTotal = earningsA + earningsB;
        }
      }
    }

    return Math.round((bestTotal / 2) * 100) / 100;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Create an empty inventory with all goods set to 0.
   */
  private emptyInventory(): Record<string, number> {
    const inv: Record<string, number> = {};
    for (const good of ALL_GOODS) {
      inv[good] = 0;
    }
    return inv;
  }

  /**
   * Auto-cancel offers for a player whose inventory may have changed.
   * If a player no longer has enough goods to fulfill their open offers,
   * those offers are automatically cancelled.
   */
  private autoCancelInsufficientOffers(
    state: RoundState,
    playerId: string,
    sessionCode: string,
    io: Server
  ): void {
    const inv = state.inventories.get(playerId);
    if (!inv) return;

    // Calculate committed goods across all open offers
    const committed: Record<string, number> = {};
    const playerOpenOffers = state.tradeOffers.filter(
      o => o.playerId === playerId && o.status === 'open'
    );

    for (const offer of playerOpenOffers) {
      committed[offer.offerGood] = (committed[offer.offerGood] || 0) + offer.offerAmount;
    }

    // Cancel offers that exceed available inventory (cancel most recent first)
    const offersToCancel: TradeOffer[] = [];
    const remaining: Record<string, number> = { ...inv };

    // Process offers in creation order (oldest first get priority)
    const sortedOffers = [...playerOpenOffers].sort((a, b) => a.createdAt - b.createdAt);

    for (const offer of sortedOffers) {
      if ((remaining[offer.offerGood] || 0) >= offer.offerAmount) {
        remaining[offer.offerGood] -= offer.offerAmount;
      } else {
        offersToCancel.push(offer);
      }
    }

    for (const offer of offersToCancel) {
      offer.status = 'cancelled';
      io.to(`market-${sessionCode}`).emit('trade-offer-cancelled', {
        offerId: offer.id,
        reason: 'Insufficient inventory after trade',
      });
      console.log(
        `[ThreeVillageTrade] Auto-cancelled offer ${offer.id} (insufficient ${offer.offerGood})`
      );
    }
  }
}
