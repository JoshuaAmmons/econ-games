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

// ============================================================================
// Types
// ============================================================================

interface PlayerInventory {
  field: Record<string, number>;
  house: Record<string, number>;
}

interface ProductionParams {
  p1: number;
  p2: number;
  p3: number;
}

interface PlayerTypeConfig {
  production: Record<string, ProductionParams>; // keyed by good name
  earningRequirements: Record<string, number>;  // good name → required count per set
  earningAmount: number;                         // cents per complete set
}

interface RoundState {
  phase: 'production' | 'move' | 'complete' | 'transitioning_to_move' | 'completing';
  inventories: Map<string, PlayerInventory>;
  productionSettings: Map<string, number[]>; // playerId → % allocation per good
  playerTypes: Map<string, number>;          // playerId → type index
  phaseStartedAt: number;
  productionLength: number;
  moveLength: number;
  chatMessages: Array<{ from: string; fromName: string; message: string; recipients: string | string[]; timestamp: number }>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_PLAYER_TYPES: PlayerTypeConfig[] = [
  {
    production: {
      good1: { p1: 0, p2: 0.411096, p3: 2.5 },
      good2: { p1: 0, p2: 2.254, p3: 1 },
    },
    earningRequirements: { good1: 3, good2: 1 },
    earningAmount: 3,
  },
  {
    production: {
      good1: { p1: 0, p2: 2.53, p3: 1 },
      good2: { p1: 0, p2: 1.1, p3: 2 },
    },
    earningRequirements: { good1: 1, good2: 2 },
    earningAmount: 2,
  },
];

// ============================================================================
// Engine
// ============================================================================

export class DiscoveryProcessEngine implements GameEngine {
  readonly gameType: GameType = 'discovery_process';

  // In-memory round states keyed by roundId
  private roundStates: Map<string, RoundState> = new Map();
  // Production phase auto-transition timers
  private productionTimers: Map<string, NodeJS.Timeout> = new Map();
  // Move phase auto-end timers
  private moveTimers: Map<string, NodeJS.Timeout> = new Map();

  getUIConfig(): UIConfig {
    return {
      name: 'Exchange & Specialization',
      description: 'Produce goods in your field, move them to houses, and discover the benefits of specialization and exchange.',
      category: 'specialized',
      weekNumber: 14,
      roles: [
        { role: 'producer', label: 'Producer', description: 'Produce and trade goods in the village economy' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Number of Players',
          type: 'number',
          default: 8,
          min: 2,
          max: 24,
        },
        {
          name: 'num_rounds',
          label: 'Number of Periods',
          type: 'number',
          default: 20,
          min: 1,
          max: 50,
        },
        {
          name: 'time_per_round',
          label: 'Move Phase Length (seconds)',
          type: 'number',
          default: 90,
          min: 30,
          max: 300,
        },
        {
          name: 'productionLength',
          label: 'Production Phase Length (seconds)',
          type: 'number',
          default: 10,
          min: 5,
          max: 60,
        },
        {
          name: 'numGoods',
          label: 'Number of Goods',
          type: 'select',
          default: '2',
          options: [
            { value: '2', label: '2 Goods' },
            { value: '3', label: '3 Goods' },
          ],
        },
        {
          name: 'good1Name',
          label: 'Good 1 Name',
          type: 'select',
          default: 'Orange',
          options: [
            { value: 'Orange', label: 'Orange' },
            { value: 'Red', label: 'Red' },
            { value: 'Food', label: 'Food' },
          ],
        },
        {
          name: 'good2Name',
          label: 'Good 2 Name',
          type: 'select',
          default: 'Blue',
          options: [
            { value: 'Blue', label: 'Blue' },
            { value: 'Green', label: 'Green' },
            { value: 'Clothing', label: 'Clothing' },
          ],
        },
        {
          name: 'allowStealing',
          label: 'Allow Stealing',
          type: 'checkbox',
          default: false,
          description: 'Allow players to take goods from other players\' houses',
        },
        {
          name: 'allowChat',
          label: 'Enable Chat',
          type: 'checkbox',
          default: true,
        },
        {
          name: 'allowPrivateChat',
          label: 'Enable Private Chat',
          type: 'checkbox',
          default: true,
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    if (config.productionLength !== undefined && config.productionLength < 1) {
      return { valid: false, error: 'Production length must be at least 1 second' };
    }
    return { valid: true };
  }

  async setupPlayers(
    _sessionId: string,
    _playerCount: number,
    _config: Record<string, any>
  ): Promise<void> {
    // Players are assigned roles and types during the join flow
  }

  // --------------------------------------------------------------------------
  // Round lifecycle
  // --------------------------------------------------------------------------

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

    // Create fresh round state and schedule the production→move auto-transition
    const state = this.getOrCreateRoundState(roundId, config);

    // Pre-populate player inventories with empty goods so getGameState can return them
    const activePlayers = await PlayerModel.findActiveBySession(session.id);
    const goodNames = this.getGoodNames(config);
    for (const p of activePlayers) {
      if (!state.inventories.has(p.id)) {
        const inv: PlayerInventory = { field: {}, house: {} };
        for (const gn of goodNames) {
          inv.field[gn] = 0;
          inv.house[gn] = 0;
        }
        state.inventories.set(p.id, inv);
      }
      state.playerTypes.set(p.id, this.getPlayerTypeIndex(p, activePlayers));
    }

    this.scheduleProductionEnd(roundId, state, config, session, sessionCode, io);

    // Build and broadcast the full initial game state to all players
    const playerTypes = this.getPlayerTypes(config);
    const playerInfo = activePlayers.map((p, idx) => {
      const typeIndex = state.playerTypes.get(p.id) ?? this.getPlayerTypeIndex(p, activePlayers);
      const pType = playerTypes[typeIndex % playerTypes.length];
      return {
        id: p.id,
        name: p.name || `Player ${idx + 1}`,
        label: idx + 1,
        typeIndex,
        earningRequirements: pType.earningRequirements,
        earningAmount: pType.earningAmount,
      };
    });

    const inventories: Record<string, PlayerInventory> = {};
    for (const [pid, inv] of state.inventories) {
      inventories[pid] = inv;
    }

    const configBlock = {
      numGoods: parseInt(config.numGoods) || 2,
      good1Name: config.good1Name || 'Orange',
      good1Color: config.good1Color || '#FF5733',
      good2Name: config.good2Name || 'Blue',
      good2Color: config.good2Color || '#6495ED',
      good3Name: config.good3Name || 'Pink',
      good3Color: config.good3Color || '#FF1493',
      productionLength: config.productionLength || 10,
      moveLength: config.time_per_round || 90,
      allowStealing: config.allowStealing || false,
      allowChat: config.allowChat !== false,
      allowPrivateChat: config.allowPrivateChat !== false,
    };

    // Broadcast full game-state to ALL players in the market room
    io.to(`market-${sessionCode}`).emit('game-state', {
      phase: 'production',
      timeRemaining: state.productionLength,
      inventories,
      productionSettings: {},
      chatMessages: [],
      goodNames,
      playerInfo,
      config: configBlock,
      results: null,
    });

    console.log(`[DiscoveryProcess] Round ${roundId} initialized for ${activePlayers.length} players, production timer scheduled (${state.productionLength}s)`);
  }

  // --------------------------------------------------------------------------
  // Action handling
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

    const round = await RoundModel.findById(roundId);
    if (!round) return { success: false, error: 'Round not found' };

    const session = await SessionModel.findById(round.session_id);
    if (!session) return { success: false, error: 'Session not found' };

    const config = session.game_config || {};

    // Ensure round state exists (getOrCreateRoundState is idempotent)
    const state = this.getOrCreateRoundState(roundId, config);

    switch (action.type) {
      case 'set_production':
        return this.handleSetProduction(state, playerId, action, sessionCode, io);

      case 'start_production':
        return this.handleStartProduction(roundId, state, config, session, sessionCode, io);

      case 'move_goods':
        return this.handleMoveGoods(roundId, state, playerId, action, config, sessionCode, io);

      case 'chat':
        return this.handleChat(state, playerId, player.name || `Player`, action, sessionCode, io);

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  }

  private handleSetProduction(
    state: RoundState,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): ActionResult {
    const allocation = action.allocation as number[];
    if (!allocation || !Array.isArray(allocation)) {
      return { success: false, error: 'Allocation must be an array of percentages' };
    }

    const sum = allocation.reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 100) > 1) {
      return { success: false, error: 'Allocation percentages must sum to 100' };
    }

    state.productionSettings.set(playerId, allocation);

    io.to(`market-${sessionCode}`).emit('production-updated', {
      playerId,
      allocation,
    });

    return { success: true };
  }

  private async handleStartProduction(
    roundId: string,
    state: RoundState,
    config: Record<string, any>,
    session: any,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    if (state.phase !== 'production') {
      return { success: false, error: 'Not in production phase' };
    }
    // Immediately transition to prevent concurrent re-entry
    state.phase = 'transitioning_to_move';

    // Cancel the auto-transition timer if it exists
    const existingTimer = this.productionTimers.get(roundId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.productionTimers.delete(roundId);
    }

    // Calculate production for all players
    const activePlayers = await PlayerModel.findActiveBySession(session.id);
    const goodNames = this.getGoodNames(config);
    const playerTypes = this.getPlayerTypes(config);
    const productionLength = config.productionLength || 10;

    for (const p of activePlayers) {
      const typeIndex = this.getPlayerTypeIndex(p, activePlayers);
      state.playerTypes.set(p.id, typeIndex);
      const pType = playerTypes[typeIndex % playerTypes.length];
      const allocation = state.productionSettings.get(p.id) || this.defaultAllocation(goodNames.length);

      const inventory = state.inventories.get(p.id) || { field: {}, house: {} };

      // Calculate production for each good
      goodNames.forEach((goodName, i) => {
        const goodKey = `good${i + 1}`;
        const params = pType.production[goodKey] || { p1: 0, p2: 1, p3: 1 };
        const timeFraction = (allocation[i] / 100) * productionLength;
        const produced = Math.floor(params.p1 + params.p2 * Math.pow(timeFraction, params.p3));
        inventory.field[goodName] = (inventory.field[goodName] || 0) + produced;
      });

      state.inventories.set(p.id, inventory);

      // Store action
      await GameActionModel.create(roundId, p.id, 'production', {
        allocation,
        produced: { ...inventory.field },
      });
    }

    // Transition to move phase
    state.phase = 'move';
    state.phaseStartedAt = Date.now();

    // Schedule auto-end of move phase
    this.scheduleMoveEnd(roundId, state, sessionCode, io);

    console.log(`[DiscoveryProcess] Broadcasting phase-changed: move (${state.moveLength}s) to market-${sessionCode}`);

    // Broadcast phase change and all inventories
    io.to(`market-${sessionCode}`).emit('phase-changed', {
      phase: 'move',
      timeRemaining: state.moveLength,
    });

    // Broadcast all inventories so everyone sees production results
    for (const [pid, inv] of state.inventories) {
      console.log(`[DiscoveryProcess] Broadcasting inventory for ${pid}: field=${JSON.stringify(inv.field)}, house=${JSON.stringify(inv.house)}`);
      io.to(`market-${sessionCode}`).emit('inventory-updated', {
        playerId: pid,
        inventory: inv,
      });
    }

    return { success: true };
  }

  private async handleMoveGoods(
    roundId: string,
    state: RoundState,
    playerId: string,
    action: Record<string, any>,
    config: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    if (state.phase !== 'move') {
      return { success: false, error: 'Not in move phase' };
    }

    const { good, amount, fromLocation, fromPlayerId, toPlayerId } = action;

    if (!good || typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) {
      return { success: false, error: 'Invalid good or amount (must be a positive integer)' };
    }

    if (fromLocation !== 'field' && fromLocation !== 'house') {
      return { success: false, error: 'fromLocation must be "field" or "house"' };
    }

    // Validate: can only move from own inventory (unless stealing is enabled)
    const allowStealing = config.allowStealing || false;
    if (fromPlayerId !== playerId && !allowStealing) {
      return { success: false, error: 'Cannot take goods from other players' };
    }

    const fromInventory = state.inventories.get(fromPlayerId);
    if (!fromInventory) {
      return { success: false, error: 'Source player inventory not found' };
    }

    const toInventory = state.inventories.get(toPlayerId);
    if (!toInventory) {
      return { success: false, error: 'Destination player inventory not found' };
    }

    // Check source has enough goods
    const fromStore = fromLocation === 'field' ? fromInventory.field : fromInventory.house;
    if ((fromStore[good] || 0) < amount) {
      return { success: false, error: `Not enough ${good} in ${fromLocation}` };
    }

    // Move goods: always goes to destination's house
    fromStore[good] -= amount;
    toInventory.house[good] = (toInventory.house[good] || 0) + amount;

    // Store the move action
    await GameActionModel.create(roundId, playerId, 'move', {
      good,
      amount,
      fromLocation,
      fromPlayerId,
      toPlayerId,
    });

    // Broadcast updated inventories
    io.to(`market-${sessionCode}`).emit('inventory-updated', {
      playerId: fromPlayerId,
      inventory: fromInventory,
    });
    io.to(`market-${sessionCode}`).emit('inventory-updated', {
      playerId: toPlayerId,
      inventory: toInventory,
    });
    io.to(`market-${sessionCode}`).emit('goods-moved', {
      fromPlayerId,
      toPlayerId,
      good,
      amount,
      movedBy: playerId,
    });

    return { success: true };
  }

  private handleChat(
    state: RoundState,
    playerId: string,
    playerName: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): ActionResult {
    const { message, recipients } = action;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return { success: false, error: 'Message cannot be empty' };
    }

    const chatMsg = {
      from: playerId,
      fromName: playerName,
      message: message.trim().substring(0, 500),
      recipients: recipients || 'all',
      timestamp: Date.now(),
    };

    state.chatMessages.push(chatMsg);

    if (recipients === 'all') {
      io.to(`market-${sessionCode}`).emit('chat-message', chatMsg);
    } else {
      // Private message: send only to intended recipients + sender
      const recipientList = Array.isArray(recipients) ? recipients : [recipients];
      const targets = new Set([...recipientList, playerId]);
      for (const targetId of targets) {
        io.to(`player-${targetId}`).emit('chat-message', chatMsg);
      }
    }

    return { success: true };
  }

  // --------------------------------------------------------------------------
  // Round end
  // --------------------------------------------------------------------------

  async processRoundEnd(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<RoundResult> {
    const round = await RoundModel.findById(roundId);
    if (!round) return { playerResults: [], summary: {} };

    const session = await SessionModel.findById(round.session_id);
    if (!session) return { playerResults: [], summary: {} };

    const config = session.game_config || {};
    let state = this.roundStates.get(roundId);
    const activePlayers = await PlayerModel.findActiveBySession(session.id);

    // Guard against double processing (auto-timer + manual end-round)
    if (state && (state.phase === 'complete' || state.phase === 'completing')) {
      console.log(`[DiscoveryProcess] Round ${roundId} already completed/completing, skipping duplicate processRoundEnd`);
      // Return existing results from DB
      const existingResults = await GameResultModel.findByRound(roundId);
      return {
        playerResults: existingResults.map(r => ({
          playerId: r.player_id,
          profit: Number(r.profit),
          resultData: r.result_data || {},
        })),
        summary: {},
      };
    }
    // Immediately mark as completing to prevent concurrent re-entry
    if (state) {
      state.phase = 'completing';
    }

    // If no in-memory state (server restarted), check DB for production actions
    if (!state) {
      const allActions = await GameActionModel.findByRound(roundId);
      const hasProduction = allActions.some(a => a.action_type === 'production');
      if (!hasProduction) {
        // No production happened — create state and run production now
        state = this.getOrCreateRoundState(roundId, config);
        await this.handleStartProduction(roundId, state, config, session, sessionCode, io);
      } else {
        // Reconstruct state from DB
        const goodNames = this.getGoodNames(config);
        const productionActions = allActions.filter(a => a.action_type === 'production');
        const moveActions = allActions.filter(a => a.action_type === 'move');
        const inventories = new Map<string, PlayerInventory>();
        for (const pa of productionActions) {
          const produced = pa.action_data?.produced || {};
          const inv: PlayerInventory = { field: { ...produced }, house: {} };
          for (const gn of goodNames) inv.house[gn] = 0;
          inventories.set(pa.player_id, inv);
        }
        for (const ma of moveActions) {
          const { good, amount, fromLocation, fromPlayerId, toPlayerId } = ma.action_data;
          const fromInv = inventories.get(fromPlayerId);
          const toInv = inventories.get(toPlayerId);
          if (fromInv && toInv) {
            const fromStore = fromLocation === 'field' ? fromInv.field : fromInv.house;
            fromStore[good] = (fromStore[good] || 0) - amount;
            toInv.house[good] = (toInv.house[good] || 0) + amount;
          }
        }
        state = {
          phase: 'move' as const,
          inventories,
          productionSettings: new Map(),
          playerTypes: new Map(),
          phaseStartedAt: Date.now(),
          productionLength: config.productionLength || 10,
          moveLength: config.time_per_round || 90,
          chatMessages: [],
        };
        for (const p of activePlayers) {
          state.playerTypes.set(p.id, this.getPlayerTypeIndex(p, activePlayers));
        }
        this.roundStates.set(roundId, state);
      }
    } else if (state.phase === 'production') {
      // State exists but production never transitioned — run it now
      await this.handleStartProduction(roundId, state, config, session, sessionCode, io);
    }

    // Calculate earnings for each player
    const goodNames = this.getGoodNames(config);
    const playerTypes = this.getPlayerTypes(config);
    const results: Array<{ playerId: string; profit: number; resultData: Record<string, any> }> = [];

    for (const p of activePlayers) {
      const inventory = state?.inventories.get(p.id) || { field: {}, house: {} };
      const typeIndex = state?.playerTypes.get(p.id) ?? this.getPlayerTypeIndex(p, activePlayers);
      const pType = playerTypes[typeIndex % playerTypes.length];

      // Count complete sets in house
      const houseGoods = inventory.house;
      const setAmounts = goodNames.map((name, i) => {
        const goodKey = `good${i + 1}`;
        const required = pType.earningRequirements[goodKey] || 1;
        const available = houseGoods[name] || 0;
        return Math.floor(available / required);
      });
      const completeSets = Math.min(...setAmounts);
      const earnings = completeSets * pType.earningAmount;

      // Calculate wasted goods
      const wasted: Record<string, number> = {};
      goodNames.forEach((name, i) => {
        const goodKey = `good${i + 1}`;
        const required = pType.earningRequirements[goodKey] || 1;
        const available = houseGoods[name] || 0;
        wasted[name] = available - (completeSets * required);
      });

      const resultData = {
        inventory,
        completeSets,
        earnings,
        wasted,
        typeIndex,
        earningRequirements: pType.earningRequirements,
        earningAmount: pType.earningAmount,
      };

      results.push({
        playerId: p.id,
        profit: earnings,
        resultData,
      });

      await GameResultModel.create(roundId, p.id, resultData, earnings);
      await PlayerModel.updateProfit(p.id, earnings);
    }

    // Mark phase complete
    if (state) {
      state.phase = 'complete';
    }

    // Broadcast earnings (flatten resultData into the result objects for the frontend)
    io.to(`market-${sessionCode}`).emit('period-earnings', {
      roundId,
      results: results.map((r) => ({
        playerId: r.playerId,
        playerName: activePlayers.find((p) => p.id === r.playerId)?.name || 'Unknown',
        profit: r.profit,
        ...r.resultData,
      })),
    });

    io.to(`market-${sessionCode}`).emit('phase-changed', {
      phase: 'complete',
      timeRemaining: 0,
    });

    // Clean up timers for this round (keep roundState for reconnection)
    const timer = this.productionTimers.get(roundId);
    if (timer) {
      clearTimeout(timer);
      this.productionTimers.delete(roundId);
    }
    const moveTimer = this.moveTimers.get(roundId);
    if (moveTimer) {
      clearTimeout(moveTimer);
      this.moveTimers.delete(roundId);
    }

    return {
      playerResults: results,
      summary: {
        totalPlayers: activePlayers.length,
        results: results.map((r) => ({
          playerId: r.playerId,
          playerName: activePlayers.find((p) => p.id === r.playerId)?.name || 'Unknown',
          profit: r.profit,
          ...r.resultData,
        })),
      },
    };
  }

  // --------------------------------------------------------------------------
  // Game state (reconnection support)
  // --------------------------------------------------------------------------

  async getGameState(
    roundId: string,
    playerId?: string
  ): Promise<Record<string, any>> {
    const round = await RoundModel.findById(roundId);
    if (!round) return { phase: 'waiting' };

    const session = await SessionModel.findById(round.session_id);
    if (!session) return { phase: 'waiting' };

    const config = session.game_config || {};
    const state = this.roundStates.get(roundId);
    const activePlayers = await PlayerModel.findActiveBySession(session.id);

    // Get results if round is complete
    const existingResults = await GameResultModel.findByRound(roundId);

    const goodNames = this.getGoodNames(config);
    const playerTypes = this.getPlayerTypes(config);

    // Build player info for frontend
    const playerInfo = activePlayers.map((p, idx) => {
      const typeIndex = state?.playerTypes.get(p.id) ?? this.getPlayerTypeIndex(p, activePlayers);
      const pType = playerTypes[typeIndex % playerTypes.length];
      return {
        id: p.id,
        name: p.name || `Player ${idx + 1}`,
        label: idx + 1,
        typeIndex,
        earningRequirements: pType.earningRequirements,
        earningAmount: pType.earningAmount,
      };
    });

    if (state) {
      // Active round state
      const inventories: Record<string, PlayerInventory> = {};
      for (const [pid, inv] of state.inventories) {
        inventories[pid] = inv;
      }

      const productionSettings: Record<string, number[]> = {};
      for (const [pid, alloc] of state.productionSettings) {
        productionSettings[pid] = alloc;
      }

      // Calculate time remaining
      const elapsed = (Date.now() - state.phaseStartedAt) / 1000;
      const phaseLength = state.phase === 'production' ? state.productionLength : state.moveLength;
      const timeRemaining = Math.max(0, phaseLength - elapsed);

      return {
        phase: state.phase,
        timeRemaining: Math.round(timeRemaining),
        inventories,
        productionSettings,
        chatMessages: state.chatMessages,
        goodNames,
        playerInfo,
        config: {
          numGoods: parseInt(config.numGoods) || 2,
          good1Name: config.good1Name || 'Orange',
          good1Color: config.good1Color || '#FF5733',
          good2Name: config.good2Name || 'Blue',
          good2Color: config.good2Color || '#6495ED',
          good3Name: config.good3Name || 'Pink',
          good3Color: config.good3Color || '#FF1493',
          productionLength: config.productionLength || 10,
          moveLength: config.time_per_round || 90,
          allowStealing: config.allowStealing || false,
          allowChat: config.allowChat !== false,
          allowPrivateChat: config.allowPrivateChat !== false,
        },
        results: existingResults.length > 0
          ? existingResults.map((r) => ({
              playerId: r.player_id,
              playerName: activePlayers.find((p) => p.id === r.player_id)?.name || 'Unknown',
              profit: Number(r.profit),
              ...r.result_data,
            }))
          : null,
      };
    }

    // No active in-memory state — try to reconstruct from database
    const configBlock = {
      numGoods: parseInt(config.numGoods) || 2,
      good1Name: config.good1Name || 'Orange',
      good1Color: config.good1Color || '#FF5733',
      good2Name: config.good2Name || 'Blue',
      good2Color: config.good2Color || '#6495ED',
      good3Name: config.good3Name || 'Pink',
      good3Color: config.good3Color || '#FF1493',
      productionLength: config.productionLength || 10,
      moveLength: config.time_per_round || 90,
      allowStealing: config.allowStealing || false,
      allowChat: config.allowChat !== false,
      allowPrivateChat: config.allowPrivateChat !== false,
    };

    // If round is active and has production actions, reconstruct state
    if (round.status === 'active') {
      const allActions = await GameActionModel.findByRound(roundId);
      const productionActions = allActions.filter(a => a.action_type === 'production');
      const moveActions = allActions.filter(a => a.action_type === 'move');

      if (productionActions.length > 0) {
        // Reconstruct inventories from production + moves
        const inventories: Record<string, PlayerInventory> = {};
        for (const pa of productionActions) {
          const produced = pa.action_data?.produced || {};
          inventories[pa.player_id] = {
            field: { ...produced },
            house: {},
          };
          // Initialize house with 0 for each good
          for (const goodName of goodNames) {
            inventories[pa.player_id].house[goodName] = 0;
          }
        }

        // Replay move actions
        for (const ma of moveActions) {
          const { good, amount, fromLocation, fromPlayerId, toPlayerId } = ma.action_data;
          const fromInv = inventories[fromPlayerId];
          const toInv = inventories[toPlayerId];
          if (fromInv && toInv) {
            const fromStore = fromLocation === 'field' ? fromInv.field : fromInv.house;
            fromStore[good] = (fromStore[good] || 0) - amount;
            toInv.house[good] = (toInv.house[good] || 0) + amount;
          }
        }

        // Reconstruct in-memory state so future requests are fast
        const reconstructed: RoundState = {
          phase: 'move',
          inventories: new Map(Object.entries(inventories)),
          productionSettings: new Map(),
          playerTypes: new Map(),
          phaseStartedAt: Date.now(), // approximate
          productionLength: config.productionLength || 10,
          moveLength: config.time_per_round || 90,
          chatMessages: [],
        };
        // Restore player types
        for (const p of activePlayers) {
          const typeIdx = this.getPlayerTypeIndex(p, activePlayers);
          reconstructed.playerTypes.set(p.id, typeIdx);
        }
        // Restore production settings
        for (const pa of productionActions) {
          if (pa.action_data?.allocation) {
            reconstructed.productionSettings.set(pa.player_id, pa.action_data.allocation);
          }
        }
        this.roundStates.set(roundId, reconstructed);

        // Estimate time remaining from round start
        const elapsed = round.started_at
          ? (Date.now() - new Date(round.started_at).getTime()) / 1000
          : 0;
        const moveLength = config.time_per_round || 90;
        const prodLength = config.productionLength || 10;
        const moveTimeRemaining = Math.max(0, (prodLength + moveLength) - elapsed);

        return {
          phase: 'move',
          timeRemaining: Math.round(moveTimeRemaining),
          inventories,
          productionSettings: Object.fromEntries(reconstructed.productionSettings),
          chatMessages: [],
          goodNames,
          playerInfo,
          config: configBlock,
          results: null,
        };
      }
    }

    // If round is active but no production happened yet, determine phase from elapsed time
    if (round.status === 'active') {
      const elapsed = round.started_at
        ? (Date.now() - new Date(round.started_at).getTime()) / 1000
        : 0;
      const prodLength = config.productionLength || 10;
      const moveLength = config.time_per_round || 90;

      if (elapsed < prodLength) {
        // Still in production phase
        return {
          phase: 'production',
          timeRemaining: Math.round(prodLength - elapsed),
          inventories: {},
          productionSettings: {},
          chatMessages: [],
          goodNames,
          playerInfo,
          config: configBlock,
          results: null,
        };
      } else {
        // Production time has passed but no production actions in DB (server restarted)
        // Run production now so players get their goods
        const state = this.getOrCreateRoundState(roundId, config);
        if (state.phase === 'production') {
          // Calculate production for all players inline
          for (const p of activePlayers) {
            const typeIndex = this.getPlayerTypeIndex(p, activePlayers);
            state.playerTypes.set(p.id, typeIndex);
            const pType = playerTypes[typeIndex % playerTypes.length];
            const allocation = state.productionSettings.get(p.id) || this.defaultAllocation(goodNames.length);
            const inventory = state.inventories.get(p.id) || { field: {}, house: {} };

            goodNames.forEach((goodName, i) => {
              const goodKey = `good${i + 1}`;
              const params = pType.production[goodKey] || { p1: 0, p2: 1, p3: 1 };
              const timeFraction = (allocation[i] / 100) * prodLength;
              const produced = Math.floor(params.p1 + params.p2 * Math.pow(timeFraction, params.p3));
              inventory.field[goodName] = (inventory.field[goodName] || 0) + produced;
            });

            // Initialize house
            for (const goodName of goodNames) {
              if (inventory.house[goodName] === undefined) inventory.house[goodName] = 0;
            }
            state.inventories.set(p.id, inventory);

            await GameActionModel.create(roundId, p.id, 'production', {
              allocation,
              produced: { ...inventory.field },
            });
          }
          state.phase = 'move';
          state.phaseStartedAt = Date.now();
        }

        const inventories: Record<string, PlayerInventory> = {};
        for (const [pid, inv] of state.inventories) {
          inventories[pid] = inv;
        }

        const moveTimeRemaining = Math.max(0, (prodLength + moveLength) - elapsed);
        return {
          phase: 'move',
          timeRemaining: Math.round(moveTimeRemaining),
          inventories,
          productionSettings: {},
          chatMessages: [],
          goodNames,
          playerInfo,
          config: configBlock,
          results: null,
        };
      }
    }

    // For completed rounds with no in-memory state, reconstruct inventories from DB
    let reconstructedInventories: Record<string, PlayerInventory> = {};
    if (round.status === 'completed') {
      const allActions = await GameActionModel.findByRound(roundId);
      const productionActions = allActions.filter(a => a.action_type === 'production');
      const moveActions = allActions.filter(a => a.action_type === 'move');

      for (const pa of productionActions) {
        const produced = pa.action_data?.produced || {};
        reconstructedInventories[pa.player_id] = {
          field: { ...produced },
          house: {},
        };
        for (const gn of goodNames) {
          reconstructedInventories[pa.player_id].house[gn] = 0;
        }
      }
      // Replay move actions
      for (const ma of moveActions) {
        const { good, amount, fromLocation, fromPlayerId, toPlayerId } = ma.action_data;
        const fromInv = reconstructedInventories[fromPlayerId];
        const toInv = reconstructedInventories[toPlayerId];
        if (fromInv && toInv) {
          const fromStore = fromLocation === 'field' ? fromInv.field : fromInv.house;
          fromStore[good] = (fromStore[good] || 0) - amount;
          toInv.house[good] = (toInv.house[good] || 0) + amount;
        }
      }
    }

    return {
      phase: existingResults.length > 0 ? 'complete' : 'waiting',
      timeRemaining: 0,
      inventories: reconstructedInventories,
      productionSettings: {},
      chatMessages: [],
      goodNames,
      playerInfo,
      config: configBlock,
      results: existingResults.length > 0
        ? existingResults.map((r) => ({
            playerId: r.player_id,
            playerName: activePlayers.find((p) => p.id === r.player_id)?.name || 'Unknown',
            profit: Number(r.profit),
            ...r.result_data,
          }))
        : null,
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private getOrCreateRoundState(roundId: string, config: Record<string, any>): RoundState {
    let state = this.roundStates.get(roundId);
    if (!state) {
      state = {
        phase: 'production',
        inventories: new Map(),
        productionSettings: new Map(),
        playerTypes: new Map(),
        phaseStartedAt: Date.now(),
        productionLength: config.productionLength || 10,
        moveLength: config.time_per_round || 90,
        chatMessages: [],
      };
      this.roundStates.set(roundId, state);
    }
    return state;
  }

  /**
   * Schedule automatic production → move transition after productionLength seconds.
   * Called the first time handleAction is invoked for a new round.
   */
  private scheduleProductionEnd(
    roundId: string,
    state: RoundState,
    config: Record<string, any>,
    session: any,
    sessionCode: string,
    io: Server
  ): void {
    // Don't double-schedule
    if (this.productionTimers.has(roundId)) return;

    const delayMs = state.productionLength * 1000;
    console.log(`[DiscoveryProcess] Scheduling production end in ${delayMs}ms for round ${roundId}`);
    const timer = setTimeout(async () => {
      this.productionTimers.delete(roundId);
      const currentState = this.roundStates.get(roundId);
      if (currentState && currentState.phase === 'production') {
        console.log(`[DiscoveryProcess] Auto-transitioning production→move for round ${roundId}`);
        try {
          await this.handleStartProduction(roundId, currentState, config, session, sessionCode, io);
          console.log(`[DiscoveryProcess] Production→move transition complete for round ${roundId}`);
        } catch (err) {
          console.error(`[DiscoveryProcess] Error in production→move transition:`, err);
        }
      } else {
        console.log(`[DiscoveryProcess] Timer fired but phase is ${currentState?.phase || 'no state'} for round ${roundId}`);
      }
    }, delayMs);

    this.productionTimers.set(roundId, timer);
  }

  /**
   * Schedule automatic move phase end after moveLength seconds.
   * Triggers processRoundEnd and emits round-ended to all clients.
   */
  private scheduleMoveEnd(
    roundId: string,
    state: RoundState,
    sessionCode: string,
    io: Server
  ): void {
    // Don't double-schedule
    if (this.moveTimers.has(roundId)) return;

    const delayMs = state.moveLength * 1000;
    console.log(`[DiscoveryProcess] Scheduling move end in ${delayMs}ms for round ${roundId}`);
    const timer = setTimeout(async () => {
      this.moveTimers.delete(roundId);
      const currentState = this.roundStates.get(roundId);
      if (currentState && currentState.phase === 'move') {
        console.log(`[DiscoveryProcess] Auto-ending move phase for round ${roundId}`);
        try {
          // Mark the round as ended in DB
          await RoundModel.end(roundId);

          // Process round end (calculates earnings, broadcasts results)
          const roundResult = await this.processRoundEnd(roundId, sessionCode, io);

          // Get trades for backward compat
          const { TradeModel } = await import('../../models/Trade');
          const trades = await TradeModel.findByRound(roundId);

          // Emit round-ended to both session and market rooms
          io.to(`session-${sessionCode}`).emit('round-ended', {
            roundId,
            trades,
            results: roundResult,
          });
          io.to(`market-${sessionCode}`).emit('round-ended', {
            roundId,
            trades,
            results: roundResult,
          });

          console.log(`[DiscoveryProcess] Move phase auto-ended for round ${roundId}`);
        } catch (err) {
          console.error(`[DiscoveryProcess] Error in move phase auto-end:`, err);
        }
      } else {
        console.log(`[DiscoveryProcess] Move timer fired but phase is ${currentState?.phase || 'no state'} for round ${roundId}`);
      }
    }, delayMs);

    this.moveTimers.set(roundId, timer);
  }

  private getGoodNames(config: Record<string, any>): string[] {
    const numGoods = parseInt(config.numGoods) || 2;
    const names = [
      config.good1Name || 'Orange',
      config.good2Name || 'Blue',
    ];
    if (numGoods >= 3) {
      names.push(config.good3Name || 'Pink');
    }
    return names;
  }

  private getPlayerTypes(config: Record<string, any>): PlayerTypeConfig[] {
    if (config.playerTypes && Array.isArray(config.playerTypes)) {
      return config.playerTypes;
    }
    return DEFAULT_PLAYER_TYPES;
  }

  private getPlayerTypeIndex(player: any, allPlayers: any[]): number {
    // Assign types alternating: player 0 → type 0, player 1 → type 1, etc.
    const idx = allPlayers.findIndex((p) => p.id === player.id);
    return idx >= 0 ? idx % 2 : 0;
  }

  private defaultAllocation(numGoods: number): number[] {
    const per = Math.round(100 / numGoods);
    const alloc = Array(numGoods).fill(per);
    // Adjust last to ensure sum is 100
    alloc[alloc.length - 1] = 100 - per * (numGoods - 1);
    return alloc;
  }
}
