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
// Types & Interfaces
// ============================================================================

interface HunterGathererConfig {
  // Map
  worldWidth: number;         // default 10080
  worldHeight: number;        // default 1050
  // Zones: left=large-prey, middle=trading, right=small-prey
  leftZoneEnd: number;        // default 3360 (1/3)
  middleZoneEnd: number;      // default 6720 (2/3)

  // Phase durations (seconds)
  huntingDuration: number;    // default 30
  tradingDuration: number;    // default 60
  interimDuration: number;    // default 5

  // Prey
  largePrey: number;          // count, default 20
  smallPrey: number;          // count, default 40
  largePreyValue: number;     // food units, default 38
  smallPreyValue: number;     // food units, default 1
  largePreyCaptureProb: number; // 0-1, default 0.25
  preySpeed: number;          // px per tick, default 8
  captureRadius: number;      // px, default 100

  // Player
  playerSpeed: number;        // px per tick, default 12
  startHealth: number;        // default 85
  maxHealth: number;          // default 100
  healthDecay: number;        // per round, default 8
  hearthCapacity: number;     // max food → health, default 100
  earningsMultiplier: number; // earnings = round(health * this), default 0.01

  // Social
  stunRadius: number;         // px, default 300
  stunDuration: number;       // ticks, default 7
  stunCooldown: number;       // ticks, default 4
  enableHit: boolean;         // default false
  hitCost: number;            // health cost to attacker, default 3
  hitDamage: number;          // health damage to target, default 10
  enableTugOfWar: boolean;    // default true
  tugOfWarCost: number;       // health per tick, default 1
  chatRadius: number;         // px, default 700
  visibilityRadius: number;   // px, default 1000
}

type Phase = 'hunting' | 'trading' | 'interim';

interface Position {
  x: number;
  y: number;
}

interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  pos: Position;
  target: Position | null;       // movement target
  food: number;                  // accumulated food units this round
  health: number;
  stunTimer: number;             // ticks remaining stunned
  stunCooldown: number;          // ticks before can stun again
  lockedZone: 'left' | 'right' | null; // side-locking during hunting
  // Tug-of-war
  tugTarget: string | null;      // other player id
  tugInitiator: boolean;         // did this player start the tug?
  tugTickCount: number;          // how many ticks in tug
  // Per-round earnings
  roundEarnings: number;
}

interface PreyState {
  id: string;
  type: 'large' | 'small';
  pos: Position;
  target: Position;              // AI movement target
  alive: boolean;
  captureSuccess: boolean;       // predetermined outcome
  value: number;
}

interface PotState {
  id: string;
  pos: Position;
  ownerId: string;
  food: number;
}

interface ChatMessage {
  from: string;
  fromName: string;
  message: string;
  timestamp: number;
}

interface RoundState {
  phase: Phase;
  tick: number;
  phaseStartTick: number;
  config: HunterGathererConfig;
  players: Map<string, PlayerState>;
  prey: Map<string, PreyState>;
  pots: Map<string, PotState>;
  chatMessages: ChatMessage[];
  nextPreyId: number;
  nextPotId: number;
}

// ============================================================================
// Constants
// ============================================================================

const TICK_INTERVAL_MS = 100; // 10 ticks/sec
const TICKS_PER_SECOND = 10;

const DEFAULT_CONFIG: HunterGathererConfig = {
  worldWidth: 10080,
  worldHeight: 1050,
  leftZoneEnd: 3360,
  middleZoneEnd: 6720,
  huntingDuration: 30,
  tradingDuration: 60,
  interimDuration: 5,
  largePrey: 20,
  smallPrey: 40,
  largePreyValue: 38,
  smallPreyValue: 1,
  largePreyCaptureProb: 0.25,
  preySpeed: 8,
  captureRadius: 100,
  playerSpeed: 12,
  startHealth: 85,
  maxHealth: 100,
  healthDecay: 8,
  hearthCapacity: 100,
  earningsMultiplier: 0.01,
  stunRadius: 300,
  stunDuration: 7,
  stunCooldown: 4,
  enableHit: false,
  hitCost: 3,
  hitDamage: 10,
  enableTugOfWar: true,
  tugOfWarCost: 1,
  chatRadius: 700,
  visibilityRadius: 1000,
};

// ============================================================================
// Helpers
// ============================================================================

function dist(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function randomInRect(x1: number, y1: number, x2: number, y2: number): Position {
  return {
    x: x1 + Math.random() * (x2 - x1),
    y: y1 + Math.random() * (y2 - y1),
  };
}

/** Move position toward target at given speed (axis-aligned, matching VB.NET original) */
function moveToward(pos: Position, target: Position, speed: number, worldW: number, worldH: number): Position {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  // Axis-aligned: move along each axis independently (diagonal = sqrt(2) × speed)
  const newX = clamp(
    Math.abs(dx) <= speed ? target.x : pos.x + Math.sign(dx) * speed,
    0, worldW
  );
  const newY = clamp(
    Math.abs(dy) <= speed ? target.y : pos.y + Math.sign(dy) * speed,
    0, worldH
  );
  return { x: newX, y: newY };
}

function mergeConfig(gameConfig: Record<string, any>): HunterGathererConfig {
  const cfg = { ...DEFAULT_CONFIG };
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof HunterGathererConfig)[]) {
    if (gameConfig[key] !== undefined) {
      (cfg as any)[key] = gameConfig[key];
    }
  }
  return cfg;
}

// ============================================================================
// Engine
// ============================================================================

export class DiscoveryProcessEngine implements GameEngine {
  readonly gameType: GameType = 'discovery_process';

  // In-memory state per round (keyed by roundId)
  private roundStates = new Map<string, RoundState>();
  // Tick intervals per round
  private tickIntervals = new Map<string, ReturnType<typeof setInterval>>();
  // Map roundId → sessionCode for broadcasts
  private roundSessions = new Map<string, string>();
  // Map roundId → io reference
  private roundIO = new Map<string, Server>();

  // ------------------------------------------------------------------
  // GameEngine interface: getUIConfig
  // ------------------------------------------------------------------
  getUIConfig(): UIConfig {
    return {
      name: 'Discovery Process (Hunter-Gatherer)',
      description: 'Real-time 2D hunting & trading game. Hunt prey, manage health, and interact with other players through stunning, transferring, and tug-of-war.',
      category: 'specialized',
      roles: [{ role: 'gatherer', label: 'Gatherer', description: 'Hunt prey, trade food, survive.' }],
      usesOrderBook: false,
      usesValuationCost: false,
      weekNumber: 14,
      configFields: [
        { name: 'huntingDuration', label: 'Hunting Phase (sec)', type: 'number', default: 30, min: 10, max: 120, step: 5, description: 'Seconds for hunting phase' },
        { name: 'tradingDuration', label: 'Trading Phase (sec)', type: 'number', default: 60, min: 10, max: 180, step: 5, description: 'Seconds for trading phase' },
        { name: 'interimDuration', label: 'Interim Phase (sec)', type: 'number', default: 5, min: 3, max: 30, step: 1 },
        { name: 'largePrey', label: 'Large Prey Count', type: 'number', default: 20, min: 0, max: 100, step: 1 },
        { name: 'smallPrey', label: 'Small Prey Count', type: 'number', default: 40, min: 0, max: 200, step: 1 },
        { name: 'largePreyValue', label: 'Large Prey Value', type: 'number', default: 38, min: 1, max: 100, step: 1 },
        { name: 'smallPreyValue', label: 'Small Prey Value', type: 'number', default: 1, min: 1, max: 50, step: 1 },
        { name: 'largePreyCaptureProb', label: 'Large Prey Capture Probability', type: 'number', default: 0.25, min: 0, max: 1, step: 0.05 },
        { name: 'startHealth', label: 'Starting Health', type: 'number', default: 85, min: 10, max: 200, step: 5 },
        { name: 'maxHealth', label: 'Max Health', type: 'number', default: 100, min: 50, max: 300, step: 10 },
        { name: 'healthDecay', label: 'Health Decay / Round', type: 'number', default: 8, min: 0, max: 50, step: 1 },
        { name: 'hearthCapacity', label: 'Hearth Capacity', type: 'number', default: 100, min: 10, max: 500, step: 10 },
        { name: 'earningsMultiplier', label: 'Earnings Multiplier', type: 'number', default: 0.01, min: 0.001, max: 1, step: 0.001 },
        { name: 'enableHit', label: 'Enable Hit', type: 'checkbox', default: false, description: 'Allow players to hit others during trading' },
        { name: 'hitCost', label: 'Hit Cost (to attacker)', type: 'number', default: 3, min: 0, max: 50, step: 1 },
        { name: 'hitDamage', label: 'Hit Damage (to target)', type: 'number', default: 10, min: 0, max: 100, step: 1 },
        { name: 'enableTugOfWar', label: 'Enable Tug of War', type: 'checkbox', default: true, description: 'Taking from stunned player triggers tug-of-war' },
        { name: 'tugOfWarCost', label: 'Tug of War Cost / tick', type: 'number', default: 1, min: 0, max: 10, step: 0.5 },
        { name: 'playerSpeed', label: 'Player Speed', type: 'number', default: 12, min: 1, max: 30, step: 1 },
        { name: 'preySpeed', label: 'Prey Speed', type: 'number', default: 8, min: 1, max: 30, step: 1 },
      ],
    };
  }

  // ------------------------------------------------------------------
  // validateConfig
  // ------------------------------------------------------------------
  validateConfig(config: Record<string, any>): ValidationResult {
    const hd = config.huntingDuration ?? DEFAULT_CONFIG.huntingDuration;
    if (hd < 5) return { valid: false, error: 'Hunting duration must be >= 5 seconds' };
    return { valid: true };
  }

  // ------------------------------------------------------------------
  // setupPlayers
  // ------------------------------------------------------------------
  async setupPlayers(sessionId: string, playerCount: number, config: Record<string, any>): Promise<void> {
    // All players are "gatherer" role — no buyer/seller distinction
    // Players are already created by the join flow; nothing extra to do
  }

  // ------------------------------------------------------------------
  // onRoundStart — spawn prey, place players, start tick loop
  // ------------------------------------------------------------------
  async onRoundStart(roundId: string, sessionCode: string, io: Server): Promise<void> {
    const session = await SessionModel.findByCode(sessionCode);
    if (!session) return;

    const gameConfig = (session as any).game_config || {};
    const cfg = mergeConfig(gameConfig);

    const players = await PlayerModel.findActiveBySession(session.id);

    // Build initial player states
    const playerMap = new Map<string, PlayerState>();
    const middleX = (cfg.leftZoneEnd + cfg.middleZoneEnd) / 2;
    const middleY = cfg.worldHeight / 2;

    // Determine starting health: first round uses startHealth, later rounds carry over
    const roundNumber = (session as any).current_round ?? 1;
    let healthMap: Record<string, number> = {};

    if (roundNumber > 1) {
      // Load previous round's results to get health
      const rounds = await RoundModel.findBySession(session.id);
      const prevRound = rounds.find((r: any) => r.round_number === roundNumber - 1);
      if (prevRound) {
        const prevResults = await GameResultModel.findByRound(prevRound.id);
        for (const r of prevResults) {
          healthMap[(r as any).player_id] = (r as any).result_data?.health ?? cfg.startHealth;
        }
      }
    }

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      // Spread players in middle zone at start
      const angle = (2 * Math.PI * i) / players.length;
      const spreadRadius = 200;
      const startX = middleX + Math.cos(angle) * spreadRadius;
      const startY = middleY + Math.sin(angle) * spreadRadius;

      const prevHealth = healthMap[p.id];
      const health = prevHealth !== undefined ? prevHealth : cfg.startHealth;

      playerMap.set(p.id, {
        id: p.id,
        name: (p as any).name || `Player ${i + 1}`,
        isBot: !!(p as any).is_bot,
        pos: { x: startX, y: startY },
        target: null,
        food: 0,
        health,
        stunTimer: 0,
        stunCooldown: 0,
        lockedZone: null,
        tugTarget: null,
        tugInitiator: false,
        tugTickCount: 0,
        roundEarnings: 0,
      });
    }

    // Spawn prey
    const preyMap = new Map<string, PreyState>();
    let nextPreyId = 1;

    // Large prey in left zone
    for (let i = 0; i < cfg.largePrey; i++) {
      const id = `prey_${nextPreyId++}`;
      const pos = randomInRect(50, 50, cfg.leftZoneEnd - 50, cfg.worldHeight - 50);
      preyMap.set(id, {
        id,
        type: 'large',
        pos,
        target: randomInRect(50, 50, cfg.leftZoneEnd - 50, cfg.worldHeight - 50),
        alive: true,
        captureSuccess: Math.random() < cfg.largePreyCaptureProb,
        value: cfg.largePreyValue,
      });
    }

    // Small prey in right zone
    for (let i = 0; i < cfg.smallPrey; i++) {
      const id = `prey_${nextPreyId++}`;
      const pos = randomInRect(cfg.middleZoneEnd + 50, 50, cfg.worldWidth - 50, cfg.worldHeight - 50);
      preyMap.set(id, {
        id,
        type: 'small',
        pos,
        target: randomInRect(cfg.middleZoneEnd + 50, 50, cfg.worldWidth - 50, cfg.worldHeight - 50),
        alive: true,
        captureSuccess: true, // small prey always captured
        value: cfg.smallPreyValue,
      });
    }

    const state: RoundState = {
      phase: 'hunting',
      tick: 0,
      phaseStartTick: 0,
      config: cfg,
      players: playerMap,
      prey: preyMap,
      pots: new Map(),
      chatMessages: [],
      nextPreyId,
      nextPotId: 1,
    };

    this.roundStates.set(roundId, state);
    this.roundSessions.set(roundId, sessionCode);
    this.roundIO.set(roundId, io);

    // Broadcast phase start
    io.to(`market-${sessionCode}`).emit('phase-changed', {
      phase: 'hunting',
      duration: cfg.huntingDuration,
    });

    // Start tick loop
    const interval = setInterval(() => {
      this.processTick(roundId);
    }, TICK_INTERVAL_MS);
    this.tickIntervals.set(roundId, interval);
  }

  // ------------------------------------------------------------------
  // processTick — the server game loop (10/sec)
  // ------------------------------------------------------------------
  private processTick(roundId: string): void {
    const state = this.roundStates.get(roundId);
    if (!state) return;
    const io = this.roundIO.get(roundId);
    const sessionCode = this.roundSessions.get(roundId);
    if (!io || !sessionCode) return;

    state.tick++;
    const cfg = state.config;
    const phaseTicks = state.tick - state.phaseStartTick;

    // --- Phase transitions ---
    if (state.phase === 'hunting' && phaseTicks >= cfg.huntingDuration * TICKS_PER_SECOND) {
      this.transitionToTrading(roundId, state, io, sessionCode);
      return;
    }
    if (state.phase === 'trading' && phaseTicks >= cfg.tradingDuration * TICKS_PER_SECOND) {
      this.transitionToInterim(roundId, state, io, sessionCode);
      return;
    }
    if (state.phase === 'interim' && phaseTicks >= cfg.interimDuration * TICKS_PER_SECOND) {
      this.finishRound(roundId, state, io, sessionCode);
      return;
    }

    // --- Movement ---
    for (const ps of state.players.values()) {
      // Skip movement if stunned or in tug
      if (ps.stunTimer > 0) {
        ps.stunTimer--;
        continue;
      }
      if (ps.tugTarget) continue;

      // Decrement stun cooldown
      if (ps.stunCooldown > 0) ps.stunCooldown--;

      // Move toward target
      if (ps.target) {
        ps.pos = moveToward(ps.pos, ps.target, cfg.playerSpeed, cfg.worldWidth, cfg.worldHeight);
        // If reached target, clear it
        if (Math.abs(ps.pos.x - ps.target.x) < 1 && Math.abs(ps.pos.y - ps.target.y) < 1) {
          ps.target = null;
        }
      }

      // Zone locking during hunting phase
      if (state.phase === 'hunting' && ps.lockedZone === null) {
        if (ps.pos.x < cfg.leftZoneEnd) {
          ps.lockedZone = 'left';
        } else if (ps.pos.x > cfg.middleZoneEnd) {
          ps.lockedZone = 'right';
        }
      }

      // Enforce zone lock: clamp position
      if (state.phase === 'hunting' && ps.lockedZone === 'left') {
        ps.pos.x = Math.min(ps.pos.x, cfg.leftZoneEnd);
      } else if (state.phase === 'hunting' && ps.lockedZone === 'right') {
        ps.pos.x = Math.max(ps.pos.x, cfg.middleZoneEnd);
      }

      // During trading phase, confine to middle zone
      if (state.phase === 'trading') {
        ps.pos.x = clamp(ps.pos.x, cfg.leftZoneEnd, cfg.middleZoneEnd);
      }
    }

    // --- Prey AI ---
    if (state.phase === 'hunting') {
      for (const prey of state.prey.values()) {
        if (!prey.alive) continue;
        prey.pos = moveToward(prey.pos, prey.target, cfg.preySpeed, cfg.worldWidth, cfg.worldHeight);
        // If reached target, pick new random target in same zone
        if (Math.abs(prey.pos.x - prey.target.x) < 1 && Math.abs(prey.pos.y - prey.target.y) < 1) {
          if (prey.type === 'large') {
            prey.target = randomInRect(50, 50, cfg.leftZoneEnd - 50, cfg.worldHeight - 50);
          } else {
            prey.target = randomInRect(cfg.middleZoneEnd + 50, 50, cfg.worldWidth - 50, cfg.worldHeight - 50);
          }
        }
      }
    }

    // --- Tug-of-war tick ---
    for (const ps of state.players.values()) {
      if (ps.tugTarget) {
        ps.tugTickCount++;
        ps.health = Math.max(0, ps.health - cfg.tugOfWarCost);
      }
    }

    // --- Broadcast filtered state to each player ---
    this.broadcastTick(state, io, sessionCode);
  }

  // ------------------------------------------------------------------
  // Phase transitions
  // ------------------------------------------------------------------
  private transitionToTrading(roundId: string, state: RoundState, io: Server, sessionCode: string): void {
    state.phase = 'trading';
    state.phaseStartTick = state.tick;
    const cfg = state.config;

    // Move all players to middle zone
    for (const ps of state.players.values()) {
      const middleX = (cfg.leftZoneEnd + cfg.middleZoneEnd) / 2;
      ps.pos.x = clamp(ps.pos.x, cfg.leftZoneEnd + 50, cfg.middleZoneEnd - 50);
      ps.target = null;
      ps.lockedZone = null;
      ps.stunTimer = 0;
      ps.stunCooldown = 0;
    }

    io.to(`market-${sessionCode}`).emit('phase-changed', {
      phase: 'trading',
      duration: cfg.tradingDuration,
    });
  }

  private transitionToInterim(roundId: string, state: RoundState, io: Server, sessionCode: string): void {
    state.phase = 'interim';
    state.phaseStartTick = state.tick;
    const cfg = state.config;

    // End all tug-of-wars
    for (const ps of state.players.values()) {
      ps.tugTarget = null;
      ps.tugInitiator = false;
      ps.tugTickCount = 0;
      ps.stunTimer = 0;
    }

    // Calculate health update: decay + food restore
    for (const ps of state.players.values()) {
      ps.health -= cfg.healthDecay;
      const restore = Math.min(ps.food, cfg.hearthCapacity);
      ps.health = Math.min(ps.health + restore, cfg.maxHealth);
      ps.health = Math.max(ps.health, 0);
      ps.roundEarnings = Math.round(ps.health * cfg.earningsMultiplier * 100) / 100;
    }

    // Broadcast interim results
    const interimData: Record<string, any> = {};
    for (const ps of state.players.values()) {
      interimData[ps.id] = {
        name: ps.name,
        food: ps.food,
        health: ps.health,
        earnings: ps.roundEarnings,
      };
    }

    io.to(`market-${sessionCode}`).emit('period-earnings', interimData);
    io.to(`market-${sessionCode}`).emit('phase-changed', {
      phase: 'interim',
      duration: cfg.interimDuration,
    });
  }

  private async finishRound(roundId: string, state: RoundState, io: Server, sessionCode: string): Promise<void> {
    // Stop tick loop
    const interval = this.tickIntervals.get(roundId);
    if (interval) {
      clearInterval(interval);
      this.tickIntervals.delete(roundId);
    }

    // End round via processRoundEnd (called by socketHandler, but we trigger it here since we own the timer)
    try {
      const round = await RoundModel.findById(roundId);
      if (round && (round as any).status === 'active') {
        await RoundModel.end(roundId);
      }
    } catch (e) {
      // Round may already be ended
    }

    // Persist results
    for (const ps of state.players.values()) {
      try {
        await GameResultModel.create(roundId, ps.id, {
          food: ps.food,
          health: ps.health,
          earnings: ps.roundEarnings,
        }, ps.roundEarnings);

        await PlayerModel.updateProfit(ps.id, ps.roundEarnings);
      } catch (e) {
        console.error(`[DiscoveryProcess] Error persisting result for ${ps.id}:`, e);
      }
    }

    // Broadcast round-end
    io.to(`market-${sessionCode}`).emit('round-ended', {
      roundId,
      results: Array.from(state.players.values()).map(ps => ({
        playerId: ps.id,
        name: ps.name,
        food: ps.food,
        health: ps.health,
        earnings: ps.roundEarnings,
      })),
    });

    // Clean up
    this.roundStates.delete(roundId);
    this.roundSessions.delete(roundId);
    this.roundIO.delete(roundId);

    // Auto-advance to next round
    if ((io as any).__scheduleAutoAdvance) {
      (io as any).__scheduleAutoAdvance(sessionCode);
    }
  }

  // ------------------------------------------------------------------
  // broadcastTick — send filtered game state to each player
  // ------------------------------------------------------------------
  private broadcastTick(state: RoundState, io: Server, sessionCode: string): void {
    const cfg = state.config;
    const phaseTicks = state.tick - state.phaseStartTick;
    let phaseTimeLeft = 0;

    if (state.phase === 'hunting') {
      phaseTimeLeft = Math.max(0, cfg.huntingDuration - phaseTicks / TICKS_PER_SECOND);
    } else if (state.phase === 'trading') {
      phaseTimeLeft = Math.max(0, cfg.tradingDuration - phaseTicks / TICKS_PER_SECOND);
    } else if (state.phase === 'interim') {
      phaseTimeLeft = Math.max(0, cfg.interimDuration - phaseTicks / TICKS_PER_SECOND);
    }

    // Build arrays for all entities (filtering done per-player below)
    const allPlayers = Array.from(state.players.values()).map(ps => ({
      id: ps.id,
      name: ps.name,
      x: Math.round(ps.pos.x),
      y: Math.round(ps.pos.y),
      food: ps.food,
      health: ps.health,
      stunned: ps.stunTimer > 0,
      inTug: !!ps.tugTarget,
    }));

    const allPrey = Array.from(state.prey.values())
      .filter(p => p.alive)
      .map(p => ({
        id: p.id,
        type: p.type,
        x: Math.round(p.pos.x),
        y: Math.round(p.pos.y),
      }));

    const allPots = Array.from(state.pots.values()).map(pot => ({
      id: pot.id,
      x: Math.round(pot.pos.x),
      y: Math.round(pot.pos.y),
      ownerId: pot.ownerId,
      food: pot.food,
    }));

    // Per-player filtered broadcast
    for (const ps of state.players.values()) {
      const vr = cfg.visibilityRadius;
      const px = ps.pos.x;
      const py = ps.pos.y;

      // Filter entities within visibility radius
      const nearPlayers = allPlayers.filter(p =>
        p.id === ps.id || (Math.abs(p.x - px) <= vr && Math.abs(p.y - py) <= vr)
      );
      const nearPrey = allPrey.filter(p =>
        Math.abs(p.x - px) <= vr && Math.abs(p.y - py) <= vr
      );
      const nearPots = allPots.filter(p =>
        Math.abs(p.x - px) <= vr && Math.abs(p.y - py) <= vr
      );

      const tickData = {
        tick: state.tick,
        phase: state.phase,
        timeLeft: Math.round(phaseTimeLeft * 10) / 10,
        you: {
          id: ps.id,
          x: Math.round(ps.pos.x),
          y: Math.round(ps.pos.y),
          food: ps.food,
          health: ps.health,
          stunned: ps.stunTimer > 0,
          stunCooldown: ps.stunCooldown,
          inTug: !!ps.tugTarget,
          tugTarget: ps.tugTarget,
          lockedZone: ps.lockedZone,
        },
        players: nearPlayers,
        prey: nearPrey,
        pots: nearPots,
        world: {
          width: cfg.worldWidth,
          height: cfg.worldHeight,
          leftZoneEnd: cfg.leftZoneEnd,
          middleZoneEnd: cfg.middleZoneEnd,
        },
      };

      io.to(`player-${ps.id}`).emit('game-tick', tickData);
    }
  }

  // ------------------------------------------------------------------
  // handleAction — 11 action types
  // ------------------------------------------------------------------
  async handleAction(
    roundId: string,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    const state = this.roundStates.get(roundId);
    if (!state) return { success: false, error: 'No active round state' };

    const player = state.players.get(playerId);
    if (!player) return { success: false, error: 'Player not in round' };

    const cfg = state.config;
    const type = action.type as string;

    switch (type) {
      // ---- Movement ----
      case 'set_target': {
        const tx = Number(action.x);
        const ty = Number(action.y);
        if (isNaN(tx) || isNaN(ty)) return { success: false, error: 'Invalid target' };

        // Clamp target to world bounds
        let targetX = clamp(tx, 0, cfg.worldWidth);
        let targetY = clamp(ty, 0, cfg.worldHeight);

        // Enforce zone lock during hunting
        if (state.phase === 'hunting' && player.lockedZone === 'left') {
          targetX = Math.min(targetX, cfg.leftZoneEnd);
        } else if (state.phase === 'hunting' && player.lockedZone === 'right') {
          targetX = Math.max(targetX, cfg.middleZoneEnd);
        }

        // During trading, confine to middle zone
        if (state.phase === 'trading') {
          targetX = clamp(targetX, cfg.leftZoneEnd, cfg.middleZoneEnd);
        }

        player.target = { x: targetX, y: targetY };
        return { success: true };
      }

      // ---- Prey capture ----
      case 'capture_prey': {
        if (state.phase !== 'hunting') return { success: false, error: 'Can only capture during hunting' };
        if (player.stunTimer > 0) return { success: false, error: 'Stunned' };

        const preyId = action.preyId as string;
        const prey = state.prey.get(preyId);
        if (!prey || !prey.alive) return { success: false, error: 'Prey not found or dead' };

        const d = dist(player.pos, prey.pos);
        if (d > cfg.captureRadius) return { success: false, error: 'Too far' };

        prey.alive = false;
        const captured = prey.captureSuccess;
        const foodGained = captured ? prey.value : 0;
        player.food += foodGained;

        // Persist action
        await GameActionModel.create(roundId, playerId, 'capture_prey', {
          preyId, preyType: prey.type, captured, foodGained,
        });

        // Notify the player
        return {
          success: true,
          reply: {
            event: 'capture-result',
            data: { preyId, preyType: prey.type, captured, foodGained, totalFood: player.food },
          },
        };
      }

      // ---- Stun ----
      case 'stun': {
        if (state.phase !== 'trading') return { success: false, error: 'Can only stun during trading' };
        if (player.stunTimer > 0) return { success: false, error: 'You are stunned' };
        if (player.stunCooldown > 0) return { success: false, error: 'Stun on cooldown' };
        if (player.tugTarget) return { success: false, error: 'In tug of war' };

        const targetId = action.targetId as string;
        const target = state.players.get(targetId);
        if (!target) return { success: false, error: 'Target not found' };
        if (target.stunTimer > 0) return { success: false, error: 'Target already stunned' };
        if (target.tugTarget) return { success: false, error: 'Target in tug of war' };

        const d = dist(player.pos, target.pos);
        if (d > cfg.stunRadius) return { success: false, error: 'Too far' };

        target.stunTimer = cfg.stunDuration;
        player.stunCooldown = cfg.stunCooldown;

        await GameActionModel.create(roundId, playerId, 'stun', { targetId });

        // Broadcast stun event to nearby players
        return {
          success: true,
          broadcast: {
            event: 'stun-event',
            data: { stunnerId: playerId, targetId, stunnerName: player.name, targetName: target.name },
          },
        };
      }

      // ---- Transfer food ----
      case 'transfer': {
        if (state.phase !== 'trading') return { success: false, error: 'Can only transfer during trading' };

        const targetId = action.targetId as string;
        const amount = Math.floor(Number(action.amount));
        if (isNaN(amount) || amount <= 0) return { success: false, error: 'Invalid amount' };
        if (player.food < amount) return { success: false, error: 'Not enough food' };

        const target = state.players.get(targetId);
        if (!target) return { success: false, error: 'Target not found' };

        const d = dist(player.pos, target.pos);
        if (d > cfg.stunRadius) return { success: false, error: 'Too far' };

        // Target must be stunned to receive
        if (target.stunTimer <= 0) return { success: false, error: 'Target must be stunned' };

        player.food -= amount;
        target.food += amount;

        await GameActionModel.create(roundId, playerId, 'transfer', { targetId, amount });

        return {
          success: true,
          broadcast: {
            event: 'transfer-event',
            data: { fromId: playerId, toId: targetId, amount, fromName: player.name, toName: target.name },
          },
        };
      }

      // ---- Take (theft → triggers tug-of-war) ----
      case 'take': {
        if (state.phase !== 'trading') return { success: false, error: 'Can only take during trading' };
        if (player.tugTarget) return { success: false, error: 'Already in tug of war' };

        const targetId = action.targetId as string;
        const amount = Math.floor(Number(action.amount));
        if (isNaN(amount) || amount <= 0) return { success: false, error: 'Invalid amount' };

        const target = state.players.get(targetId);
        if (!target) return { success: false, error: 'Target not found' };
        if (target.stunTimer <= 0) return { success: false, error: 'Target must be stunned' };
        if (target.food < amount) return { success: false, error: 'Target has insufficient food' };

        const d = dist(player.pos, target.pos);
        if (d > cfg.stunRadius) return { success: false, error: 'Too far' };

        if (cfg.enableTugOfWar) {
          // Start tug-of-war
          player.tugTarget = targetId;
          player.tugInitiator = true;
          player.tugTickCount = 0;
          target.tugTarget = playerId;
          target.tugInitiator = false;
          target.tugTickCount = 0;
          target.stunTimer = 0; // Unstun them for the tug

          await GameActionModel.create(roundId, playerId, 'take', { targetId, amount, tugStarted: true });

          return {
            success: true,
            broadcast: {
              event: 'tug-start',
              data: {
                initatorId: playerId, targetId, amount,
                initiatorName: player.name, targetName: target.name,
              },
            },
          };
        } else {
          // No tug-of-war, just take
          target.food -= amount;
          player.food += amount;

          await GameActionModel.create(roundId, playerId, 'take', { targetId, amount, tugStarted: false });

          return {
            success: true,
            broadcast: {
              event: 'take-event',
              data: { takerId: playerId, targetId, amount, takerName: player.name, targetName: target.name },
            },
          };
        }
      }

      // ---- Yield tug-of-war ----
      case 'yield_tug': {
        if (!player.tugTarget) return { success: false, error: 'Not in tug of war' };

        const other = state.players.get(player.tugTarget);
        if (!other) return { success: false, error: 'Tug partner not found' };

        // The yielder gives up. If the initiator yields, target keeps food.
        // If the target yields, initiator takes the food.
        const initiator = player.tugInitiator ? player : other;
        const defender = player.tugInitiator ? other : player;

        // Find the original take amount from the action log (default to 1)
        let takeAmount = 1;
        try {
          const actions = await GameActionModel.findByRoundAndType(roundId, 'take');
          const takeAction = actions.find((a: any) =>
            a.player_id === initiator.id && a.action_data?.targetId === defender.id && a.action_data?.tugStarted
          );
          if (takeAction) takeAmount = (takeAction as any).action_data.amount || 1;
        } catch (e) { /* use default */ }

        if (player.tugInitiator) {
          // Initiator yields → nothing happens, food stays with defender
        } else {
          // Defender yields → initiator takes food
          const actual = Math.min(takeAmount, defender.food);
          defender.food -= actual;
          initiator.food += actual;
        }

        // Clear tug state for both
        player.tugTarget = null;
        player.tugInitiator = false;
        player.tugTickCount = 0;
        other.tugTarget = null;
        other.tugInitiator = false;
        other.tugTickCount = 0;

        await GameActionModel.create(roundId, playerId, 'yield_tug', {
          yieldedBy: playerId,
          otherPlayer: other.id,
          initiatorYielded: player.tugInitiator,
        });

        return {
          success: true,
          broadcast: {
            event: 'tug-end',
            data: {
              yielderId: playerId, otherId: other.id,
              yielderName: player.name, otherName: other.name,
              initiatorYielded: player.tugInitiator,
            },
          },
        };
      }

      // ---- Hit ----
      case 'hit': {
        if (!cfg.enableHit) return { success: false, error: 'Hit is disabled' };
        if (state.phase !== 'trading') return { success: false, error: 'Can only hit during trading' };
        if (player.stunTimer > 0) return { success: false, error: 'You are stunned' };

        const targetId = action.targetId as string;
        const target = state.players.get(targetId);
        if (!target) return { success: false, error: 'Target not found' };

        const d = dist(player.pos, target.pos);
        if (d > cfg.stunRadius) return { success: false, error: 'Too far' };

        player.health = Math.max(0, player.health - cfg.hitCost);
        target.health = Math.max(0, target.health - cfg.hitDamage);

        await GameActionModel.create(roundId, playerId, 'hit', { targetId });

        return {
          success: true,
          broadcast: {
            event: 'hit-event',
            data: { hitterId: playerId, targetId, hitterName: player.name, targetName: target.name },
          },
        };
      }

      // ---- Place pot ----
      case 'place_pot': {
        if (state.phase !== 'trading') return { success: false, error: 'Can only place pot during trading' };

        // Must be in middle zone
        if (player.pos.x < cfg.leftZoneEnd || player.pos.x > cfg.middleZoneEnd) {
          return { success: false, error: 'Must be in middle zone' };
        }

        const potId = `pot_${state.nextPotId++}`;
        state.pots.set(potId, {
          id: potId,
          pos: { x: player.pos.x, y: player.pos.y },
          ownerId: playerId,
          food: 0,
        });

        await GameActionModel.create(roundId, playerId, 'place_pot', { potId });

        return {
          success: true,
          broadcast: {
            event: 'pot-placed',
            data: { potId, x: player.pos.x, y: player.pos.y, ownerName: player.name },
          },
        };
      }

      // ---- Deposit into pot ----
      case 'deposit_pot': {
        if (state.phase !== 'trading') return { success: false, error: 'Can only deposit during trading' };

        const potId = action.potId as string;
        const amount = Math.floor(Number(action.amount));
        if (isNaN(amount) || amount <= 0) return { success: false, error: 'Invalid amount' };
        if (player.food < amount) return { success: false, error: 'Not enough food' };

        const pot = state.pots.get(potId);
        if (!pot) return { success: false, error: 'Pot not found' };

        const d = dist(player.pos, pot.pos);
        if (d > cfg.stunRadius) return { success: false, error: 'Too far from pot' };

        player.food -= amount;
        pot.food += amount;

        await GameActionModel.create(roundId, playerId, 'deposit_pot', { potId, amount });

        return { success: true };
      }

      // ---- Withdraw from pot ----
      case 'withdraw_pot': {
        if (state.phase !== 'trading') return { success: false, error: 'Can only withdraw during trading' };

        const potId = action.potId as string;
        const amount = Math.floor(Number(action.amount));
        if (isNaN(amount) || amount <= 0) return { success: false, error: 'Invalid amount' };

        const pot = state.pots.get(potId);
        if (!pot) return { success: false, error: 'Pot not found' };
        if (pot.food < amount) return { success: false, error: 'Pot has insufficient food' };

        const d = dist(player.pos, pot.pos);
        if (d > cfg.stunRadius) return { success: false, error: 'Too far from pot' };

        pot.food -= amount;
        player.food += amount;

        await GameActionModel.create(roundId, playerId, 'withdraw_pot', { potId, amount });

        return { success: true };
      }

      // ---- Chat ----
      case 'chat': {
        if (state.phase !== 'trading') return { success: false, error: 'Chat only available during trading' };

        // Must be in middle zone
        if (player.pos.x < cfg.leftZoneEnd || player.pos.x > cfg.middleZoneEnd) {
          return { success: false, error: 'Must be in middle zone' };
        }

        const message = String(action.message || '').trim().slice(0, 200);
        if (!message) return { success: false, error: 'Empty message' };

        const chatMsg: ChatMessage = {
          from: playerId,
          fromName: player.name,
          message,
          timestamp: Date.now(),
        };
        state.chatMessages.push(chatMsg);

        // Send to players within chat radius
        for (const other of state.players.values()) {
          if (other.id === playerId) continue;
          const d = dist(player.pos, other.pos);
          if (d <= cfg.chatRadius) {
            io.to(`player-${other.id}`).emit('chat-message', chatMsg);
          }
        }

        // Also send back to sender
        io.to(`player-${playerId}`).emit('chat-message', chatMsg);

        await GameActionModel.create(roundId, playerId, 'chat', { message });

        return { success: true };
      }

      default:
        return { success: false, error: `Unknown action type: ${type}` };
    }
  }

  // ------------------------------------------------------------------
  // processRoundEnd — called by socketHandler after round timer
  // ------------------------------------------------------------------
  async processRoundEnd(roundId: string, sessionCode: string, io: Server): Promise<RoundResult> {
    const state = this.roundStates.get(roundId);

    // If state still exists, the internal timer didn't fire yet — force finish
    if (state) {
      // Stop tick loop
      const interval = this.tickIntervals.get(roundId);
      if (interval) {
        clearInterval(interval);
        this.tickIntervals.delete(roundId);
      }

      // Calculate interim if not done
      if (state.phase !== 'interim') {
        const cfg = state.config;
        for (const ps of state.players.values()) {
          ps.health -= cfg.healthDecay;
          const restore = Math.min(ps.food, cfg.hearthCapacity);
          ps.health = Math.min(ps.health + restore, cfg.maxHealth);
          ps.health = Math.max(ps.health, 0);
          ps.roundEarnings = Math.round(ps.health * cfg.earningsMultiplier * 100) / 100;
        }
      }

      // Persist results
      const playerResults: RoundResult['playerResults'] = [];
      for (const ps of state.players.values()) {
        try {
          await GameResultModel.create(roundId, ps.id, {
            food: ps.food,
            health: ps.health,
            earnings: ps.roundEarnings,
          }, ps.roundEarnings);

          await PlayerModel.updateProfit(ps.id, ps.roundEarnings);
        } catch (e) {
          // May already exist from finishRound
        }

        playerResults.push({
          playerId: ps.id,
          profit: ps.roundEarnings,
          resultData: { food: ps.food, health: ps.health },
        });
      }

      // Clean up
      this.roundStates.delete(roundId);
      this.roundSessions.delete(roundId);
      this.roundIO.delete(roundId);

      return {
        playerResults,
        summary: {
          playerCount: playerResults.length,
          avgHealth: playerResults.reduce((s, r) => s + r.resultData.health, 0) / (playerResults.length || 1),
          avgFood: playerResults.reduce((s, r) => s + r.resultData.food, 0) / (playerResults.length || 1),
        },
      };
    }

    // State already cleaned up by finishRound — load from DB
    const results = await GameResultModel.findByRound(roundId);
    return {
      playerResults: results.map((r: any) => ({
        playerId: r.player_id,
        profit: r.profit,
        resultData: r.result_data || {},
      })),
      summary: { playerCount: results.length },
    };
  }

  // ------------------------------------------------------------------
  // getGameState — for reconnection
  // ------------------------------------------------------------------
  async getGameState(roundId: string, playerId?: string): Promise<Record<string, any>> {
    const state = this.roundStates.get(roundId);

    if (state && playerId) {
      const ps = state.players.get(playerId);
      if (!ps) return { phase: state.phase, error: 'Player not in state' };

      const cfg = state.config;
      const vr = cfg.visibilityRadius;

      // Return current snapshot for the requesting player
      const nearPlayers = Array.from(state.players.values())
        .filter(p => p.id === playerId || dist(p.pos, ps.pos) <= vr)
        .map(p => ({
          id: p.id, name: p.name,
          x: Math.round(p.pos.x), y: Math.round(p.pos.y),
          food: p.food, health: p.health,
          stunned: p.stunTimer > 0, inTug: !!p.tugTarget,
        }));

      const nearPrey = Array.from(state.prey.values())
        .filter(p => p.alive && dist(p.pos, ps.pos) <= vr)
        .map(p => ({ id: p.id, type: p.type, x: Math.round(p.pos.x), y: Math.round(p.pos.y) }));

      const nearPots = Array.from(state.pots.values())
        .filter(p => dist(p.pos, ps.pos) <= vr)
        .map(p => ({ id: p.id, x: Math.round(p.pos.x), y: Math.round(p.pos.y), ownerId: p.ownerId, food: p.food }));

      const phaseTicks = state.tick - state.phaseStartTick;
      let timeLeft = 0;
      if (state.phase === 'hunting') timeLeft = cfg.huntingDuration - phaseTicks / TICKS_PER_SECOND;
      else if (state.phase === 'trading') timeLeft = cfg.tradingDuration - phaseTicks / TICKS_PER_SECOND;
      else if (state.phase === 'interim') timeLeft = cfg.interimDuration - phaseTicks / TICKS_PER_SECOND;

      return {
        phase: state.phase,
        timeLeft: Math.max(0, Math.round(timeLeft * 10) / 10),
        you: {
          id: ps.id, x: Math.round(ps.pos.x), y: Math.round(ps.pos.y),
          food: ps.food, health: ps.health,
          stunned: ps.stunTimer > 0, stunCooldown: ps.stunCooldown,
          inTug: !!ps.tugTarget, tugTarget: ps.tugTarget,
          lockedZone: ps.lockedZone,
        },
        players: nearPlayers,
        prey: nearPrey,
        pots: nearPots,
        world: {
          width: cfg.worldWidth, height: cfg.worldHeight,
          leftZoneEnd: cfg.leftZoneEnd, middleZoneEnd: cfg.middleZoneEnd,
        },
      };
    }

    // No in-memory state — return basic info from DB
    return { phase: 'complete', message: 'Round data available in results' };
  }
}
