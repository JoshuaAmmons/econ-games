import type { Server } from 'socket.io';
import type { Player, Session } from '../types';
import { PlayerModel } from '../models/Player';
import { SessionModel } from '../models/Session';
import { GameRegistry } from '../engines/GameRegistry';
import { generateValuations, generateProductionCosts } from './gameLogic';
import { BotStrategyRegistry } from './botStrategies';

// Import to ensure all strategies are registered
import './botStrategies/index';

// Game types that use the DA buyer/seller role system
const DA_GAME_TYPES = ['double_auction', 'double_auction_tax', 'double_auction_price_controls'];

// Games where players alternate between two roles
const PAIRED_ROLES: Record<string, [string, string]> = {
  ultimatum: ['proposer', 'responder'],
  bargaining: ['proposer', 'responder'],
  gift_exchange: ['employer', 'worker'],
  principal_agent: ['principal', 'agent'],
  trust_game: ['sender', 'receiver'],
  market_for_lemons: ['seller', 'buyer'],
  posted_offer: ['seller', 'buyer'],
  sealed_bid_offer: ['buyer', 'seller'],
};

// Default role for non-DA, non-paired game types
const GAME_ROLES: Record<string, string> = {
  bertrand: 'firm',
  cournot: 'firm',
  public_goods: 'player',
  negative_externality: 'firm',
  comparative_advantage: 'country',
  monopoly: 'monopolist',
  discovery_process: 'producer',
  prisoner_dilemma: 'player',
  beauty_contest: 'player',
  common_pool_resource: 'player',
  stag_hunt: 'player',
  dictator: 'player',
  matching_pennies: 'player',
  auction: 'bidder',
  ellsberg: 'chooser',
  newsvendor: 'manager',
  dutch_auction: 'bidder',
  english_auction: 'bidder',
  discriminative_auction: 'bidder',
  posted_offer: 'seller',
  lindahl: 'voter',
  pg_auction: 'voter',
  sealed_bid_offer: 'buyer',
  sponsored_search: 'advertiser',
};

// Sequential game types (need first-mover / second-mover handling)
const SEQUENTIAL_TYPES = new Set(Object.keys(PAIRED_ROLES));

// DA game types (need interval-based bidding)
const DA_TYPES = new Set(DA_GAME_TYPES);

// DA bot interval range in milliseconds
const DA_MIN_INTERVAL_MS = 3000;
const DA_MAX_INTERVAL_MS = 12000;

/** Recent log messages (ring buffer for diagnostics) */
const recentLogs: string[] = [];
function botLog(msg: string) {
  console.log(msg);
  recentLogs.push(`${new Date().toISOString()} ${msg}`);
  if (recentLogs.length > 50) recentLogs.shift();
}

/**
 * Singleton service that manages bot player creation and automated actions.
 */
export class BotService {
  private static instance: BotService;

  /** Active bot timers per round (for cleanup) */
  private roundTimers = new Map<string, NodeJS.Timeout[]>();

  /** Track round start times for DA elapsed-time calculation */
  private roundStartTimes = new Map<string, number>();

  /** Socket.IO server reference (set once from socketHandler) */
  private io: import('socket.io').Server | null = null;

  private constructor() {}

  /** Store the Socket.IO server so sessionController can trigger bot rounds */
  setIO(io: import('socket.io').Server): void { this.io = io; }

  /** Get the stored Socket.IO server */
  getIO(): import('socket.io').Server | null { return this.io; }

  /** Get recent log messages for diagnostics */
  getRecentLogs(): string[] { return [...recentLogs]; }

  static getInstance(): BotService {
    if (!BotService.instance) {
      BotService.instance = new BotService();
    }
    return BotService.instance;
  }

  // ─── Bot Player Creation ───────────────────────────────────────────────

  /**
   * Create bot players to fill remaining slots up to market_size.
   * Called when a session with bot_enabled=true starts.
   */
  async createBotsForSession(session: Session): Promise<Player[]> {
    const existing = await PlayerModel.findActiveBySession(session.id);
    const humanCount = existing.length;
    const botsNeeded = session.market_size - humanCount;
    if (botsNeeded <= 0) return [];

    const gameType = session.game_type || 'double_auction';
    const bots: Player[] = [];

    for (let i = 0; i < botsNeeded; i++) {
      const botName = `Bot ${i + 1}`;
      let bot: Player | null = null;

      if (DA_TYPES.has(gameType)) {
        // DA games: need buyer/seller role balancing + valuation/cost
        bot = await PlayerModel.createWithRoleAssignment(
          session.id,
          session.market_size,
          botName,
          true, // isBot
          (existingPlayers) => {
            const buyers = existingPlayers.filter(p => p.role === 'buyer').length;
            const sellers = existingPlayers.filter(p => p.role === 'seller').length;
            const role: 'buyer' | 'seller' = buyers <= sellers ? 'buyer' : 'seller';

            let value: number;
            if (role === 'buyer') {
              const vals = generateValuations(
                session.valuation_min, session.valuation_max,
                session.valuation_increments, 1
              );
              value = vals[0];
            } else {
              const costs = generateProductionCosts(
                session.cost_min, session.cost_max,
                session.cost_increments, 1
              );
              value = costs[0];
            }
            const valueColumn = role === 'buyer' ? 'valuation' as const : 'production_cost' as const;
            return { role, valueColumn, value };
          }
        );
      } else if (PAIRED_ROLES[gameType]) {
        // Paired-role games: alternate between two roles
        const [role1, role2] = PAIRED_ROLES[gameType];
        bot = await PlayerModel.createWithRoleAssignment(
          session.id,
          session.market_size,
          botName,
          true,
          (existingPlayers) => {
            const r1Count = existingPlayers.filter(p => p.role === role1).length;
            const r2Count = existingPlayers.filter(p => p.role === role2).length;
            return { role: r1Count <= r2Count ? role1 : role2 };
          }
        );
      } else {
        // Uniform-role games
        const role = GAME_ROLES[gameType] || 'player';
        bot = await PlayerModel.createWithCapacityCheck(
          session.id, session.market_size, role, botName, true
        );
      }

      if (bot) bots.push(bot);
    }

    botLog(`BotService: Created ${bots.length} bots for session ${session.code} (${gameType})`);
    return bots;
  }

  // ─── Round Lifecycle ───────────────────────────────────────────────────

  /**
   * Called when a round starts. Schedules bot actions.
   */
  async onRoundStart(
    roundId: string,
    sessionCode: string,
    session: Session,
    io: Server
  ): Promise<void> {
    const gameType = session.game_type || 'double_auction';
    botLog(`[BotService] onRoundStart called: session=${sessionCode}, gameType=${gameType}, roundId=${roundId}`);

    const strategy = BotStrategyRegistry.get(gameType);
    if (!strategy) {
      botLog(`BotService: No strategy for game type "${gameType}"`);
      return;
    }
    botLog(`[BotService] Strategy found for ${gameType}, hasDAAction=${!!strategy.getDAAction}`);

    const allPlayers = await PlayerModel.findActiveBySession(session.id);
    const bots = allPlayers.filter(p => p.is_bot);
    botLog(`[BotService] Found ${bots.length} bots out of ${allPlayers.length} players`);
    if (bots.length === 0) return;

    const config = {
      ...session.game_config || {},
      time_per_round: session.time_per_round,
    };
    const timers: NodeJS.Timeout[] = [];
    this.roundStartTimes.set(roundId, Date.now());

    if (DA_TYPES.has(gameType)) {
      // DA games: schedule periodic bid/ask submissions
      for (const bot of bots) {
        this.scheduleDABotActions(bot, roundId, sessionCode, gameType, config, io, timers);
      }
    } else if (SEQUENTIAL_TYPES.has(gameType)) {
      // Sequential games: only first-movers act now; second-movers respond reactively
      const [firstMoverRole] = PAIRED_ROLES[gameType] || [];
      const firstMoverBots = bots.filter(b => b.role === firstMoverRole);
      for (const bot of firstMoverBots) {
        const delay = 1000 + Math.random() * 4000;
        const timer = setTimeout(async () => {
          try {
            const engine = GameRegistry.get(gameType);
            // Get the round number from the round
            const action = strategy.getFirstMoveAction?.(bot, config, 1);
            if (action) {
              await engine.handleAction(roundId, bot.id, action, sessionCode, io);
            }
          } catch (err) {
            console.error(`BotService: Error submitting first move for bot ${bot.name}:`, err);
          }
        }, delay);
        timers.push(timer);
      }
    } else if (strategy.getSpecializedActions) {
      // Specialized games with custom action sequences
      for (const bot of bots) {
        const actions = strategy.getSpecializedActions(bot, config, {}, 1);
        botLog(`[BotService] ${bot.name}: ${actions.length} specialized actions scheduled for ${gameType}`);
        for (const { action, delayMs } of actions) {
          const timer = setTimeout(async () => {
            try {
              const engine = GameRegistry.get(gameType);
              const result = await engine.handleAction(roundId, bot.id, action, sessionCode, io);
              botLog(`[BotService] ${bot.name} action ${action.type}: ${result?.success ? 'OK' : result?.error || 'fail'}`);
            } catch (err) {
              console.error(`BotService: Error in specialized action for bot ${bot.name}:`, err);
            }
          }, delayMs);
          timers.push(timer);
        }
      }
    } else {
      // Simultaneous games: submit with random delay
      for (const bot of bots) {
        const delay = 1000 + Math.random() * 4000;
        const timer = setTimeout(async () => {
          try {
            const engine = GameRegistry.get(gameType);
            const action = strategy.getSimultaneousAction?.(bot, config, 1);
            if (action) {
              await engine.handleAction(roundId, bot.id, action, sessionCode, io);
            }
          } catch (err) {
            console.error(`BotService: Error submitting action for bot ${bot.name}:`, err);
          }
        }, delay);
        timers.push(timer);
      }
    }

    this.roundTimers.set(roundId, timers);
  }

  /**
   * Called when a first-mover submits and the partner is a bot second-mover.
   */
  async onFirstMoveSubmitted(
    roundId: string,
    botPlayerId: string,
    partnerAction: Record<string, any>,
    session: Session,
    io: Server
  ): Promise<void> {
    const gameType = session.game_type || 'double_auction';
    const strategy = BotStrategyRegistry.get(gameType);
    if (!strategy?.getSecondMoveAction) return;

    const bot = await PlayerModel.findById(botPlayerId);
    if (!bot || !bot.is_bot) return;

    const config = session.game_config || {};
    const sessionCode = session.code;

    // Small delay for realism (1–3 seconds)
    const delay = 1000 + Math.random() * 2000;
    const timer = setTimeout(async () => {
      try {
        const engine = GameRegistry.get(gameType);
        const action = strategy.getSecondMoveAction!(bot, config, partnerAction, 1);
        if (action) {
          await engine.handleAction(roundId, bot.id, action, sessionCode, io);
        }
      } catch (err) {
        console.error(`BotService: Error submitting second move for bot ${bot.name}:`, err);
      }
    }, delay);

    // Track timer for cleanup
    const existing = this.roundTimers.get(roundId) || [];
    existing.push(timer);
    this.roundTimers.set(roundId, existing);
  }

  /**
   * Clean up timers when a round ends.
   */
  onRoundEnd(roundId: string): void {
    const timers = this.roundTimers.get(roundId);
    if (timers) {
      for (const t of timers) clearTimeout(t);
      this.roundTimers.delete(roundId);
    }
    this.roundStartTimes.delete(roundId);
  }

  /**
   * Clean up all state for a session.
   */
  onSessionEnd(sessionId: string): void {
    // Clean up any remaining round timers (iterate all)
    for (const [roundId, timers] of this.roundTimers) {
      for (const t of timers) clearTimeout(t);
    }
    this.roundTimers.clear();
    this.roundStartTimes.clear();
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  /**
   * Schedule periodic DA bot actions (bid/ask) for a single bot.
   */
  private scheduleDABotActions(
    bot: Player,
    roundId: string,
    sessionCode: string,
    gameType: string,
    config: Record<string, any>,
    io: Server,
    timers: NodeJS.Timeout[]
  ): void {
    const strategy = BotStrategyRegistry.get(gameType);
    if (!strategy?.getDAAction) return;

    const scheduleNext = () => {
      const interval = DA_MIN_INTERVAL_MS + Math.random() * (DA_MAX_INTERVAL_MS - DA_MIN_INTERVAL_MS);
      const timer = setTimeout(async () => {
        // Check if round is still active
        const startTime = this.roundStartTimes.get(roundId);
        if (!startTime) return; // Round ended

        const elapsed = (Date.now() - startTime) / 1000;
        try {
          const engine = GameRegistry.get(gameType);
          const action = strategy.getDAAction!(bot, config, {}, elapsed);
          if (action) {
            const result = await engine.handleAction(roundId, bot.id, action, sessionCode, io);
            botLog(`BotService DA: ${bot.name} (${bot.role}) submitted ${action.type} @ ${action.price} → ${result?.success ? 'OK' : result?.error || 'unknown'}`);
          }
        } catch (err) {
          console.error(`BotService DA error for ${bot.name}:`, err);
        }
        // Schedule next action
        scheduleNext();
      }, interval);
      timers.push(timer);
    };

    // Start with a random initial delay
    const initialDelay = 1000 + Math.random() * 2000;
    botLog(`BotService DA: Scheduling ${bot.name} (${bot.role}) with initial delay ${Math.round(initialDelay)}ms`);
    const initTimer = setTimeout(() => scheduleNext(), initialDelay);
    timers.push(initTimer);
  }
}
