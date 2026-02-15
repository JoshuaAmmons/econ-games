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
  phase: 'production' | 'move' | 'complete';
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
    const isNew = !this.roundStates.has(roundId);
    const state = this.getOrCreateRoundState(roundId, config);

    // Schedule auto-transition from production→move when round state is first created
    if (isNew && state.phase === 'production') {
      this.scheduleProductionEnd(roundId, state, config, session, sessionCode, io);
    }

    switch (action.type) {
      case 'set_production':
        return this.handleSetProduction(state, playerId, action, sessionCode, io);

      case 'start_production':
        return this.handleStartProduction(roundId, state, config, session, sessionCode, io);

      case 'move_goods':
        return this.handleMoveGoods(roundId, state, playerId, action, config, sessionCode, io);

      case 'chat':
        return this.handleChat(state, playerId, player.name || `Player`, action, sessionCode, io);

      case 'get_state': {
        // Ensure production timer is scheduled if not already
        if (state.phase === 'production' && !this.productionTimers.has(roundId)) {
          this.scheduleProductionEnd(roundId, state, config, session, sessionCode, io);
        }
        const gameState = await this.getGameState(roundId, playerId);
        // Only emit to the requesting player, not the whole room
        const sockets = await io.in(`market-${sessionCode}`).fetchSockets();
        for (const s of sockets) {
          if ((s as any).playerId === playerId) {
            s.emit('game-state', gameState);
            break;
          }
        }
        return { success: true };
      }

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

    // Broadcast phase change and all inventories
    io.to(`market-${sessionCode}`).emit('phase-changed', {
      phase: 'move',
      timeRemaining: state.moveLength,
    });

    // Broadcast all inventories so everyone sees production results
    for (const [pid, inv] of state.inventories) {
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

    if (!good || !amount || amount < 1) {
      return { success: false, error: 'Invalid good or amount' };
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
      // Private message: send to specific players + sender
      const recipientList = Array.isArray(recipients) ? recipients : [recipients];
      // Emit to all in market room but include recipients list so client can filter
      io.to(`market-${sessionCode}`).emit('chat-message', chatMsg);
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
    const state = this.roundStates.get(roundId);
    const activePlayers = await PlayerModel.findActiveBySession(session.id);

    // If production never happened (e.g., timer expired during production), run it now
    if (state && state.phase === 'production') {
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

    // Broadcast earnings
    io.to(`market-${sessionCode}`).emit('period-earnings', {
      roundId,
      results: results.map((r) => ({
        ...r,
        playerName: activePlayers.find((p) => p.id === r.playerId)?.name || 'Unknown',
      })),
    });

    io.to(`market-${sessionCode}`).emit('phase-changed', {
      phase: 'complete',
      timeRemaining: 0,
    });

    // Clean up in-memory state and timers for this round
    this.roundStates.delete(roundId);
    const timer = this.productionTimers.get(roundId);
    if (timer) {
      clearTimeout(timer);
      this.productionTimers.delete(roundId);
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
              profit: Number(r.profit),
              ...r.result_data,
            }))
          : null,
      };
    }

    // No active state — return config and any existing results
    return {
      phase: existingResults.length > 0 ? 'complete' : 'waiting',
      timeRemaining: 0,
      inventories: {},
      productionSettings: {},
      chatMessages: [],
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
    const timer = setTimeout(async () => {
      this.productionTimers.delete(roundId);
      const currentState = this.roundStates.get(roundId);
      if (currentState && currentState.phase === 'production') {
        console.log(`[DiscoveryProcess] Auto-transitioning production→move for round ${roundId}`);
        await this.handleStartProduction(roundId, currentState, config, session, sessionCode, io);
      }
    }, delayMs);

    this.productionTimers.set(roundId, timer);
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
