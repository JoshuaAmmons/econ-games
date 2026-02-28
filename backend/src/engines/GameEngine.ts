import type { Server } from 'socket.io';

/**
 * Game type identifiers matching the database constraint
 */
export type GameType =
  | 'double_auction'
  | 'double_auction_tax'
  | 'double_auction_price_controls'
  | 'bertrand'
  | 'cournot'
  | 'public_goods'
  | 'negative_externality'
  | 'ultimatum'
  | 'gift_exchange'
  | 'principal_agent'
  | 'comparative_advantage'
  | 'monopoly'
  | 'market_for_lemons'
  | 'discovery_process'
  | 'prisoner_dilemma'
  | 'beauty_contest'
  | 'trust_game'
  | 'auction'
  | 'bargaining'
  | 'common_pool_resource'
  | 'stag_hunt'
  | 'dictator'
  | 'matching_pennies'
  | 'ellsberg'
  | 'newsvendor'
  | 'dutch_auction'
  | 'english_auction'
  | 'discriminative_auction'
  | 'posted_offer'
  | 'lindahl'
  | 'pg_auction'
  | 'sealed_bid_offer'
  | 'sponsored_search'
  | 'double_dutch_auction'
  | 'asset_bubble'
  | 'contestable_market';

/**
 * Result of validating a game config
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Result of processing a player action
 */
export interface ActionResult {
  success: boolean;
  error?: string;
  /** Data to broadcast to all players in the market room */
  broadcast?: {
    event: string;
    data: any;
  };
  /** Data to send only to the acting player */
  reply?: {
    event: string;
    data: any;
  };
}

/**
 * Result of processing end-of-round
 */
export interface RoundResult {
  /** Per-player results with profits */
  playerResults: Array<{
    playerId: string;
    profit: number;
    resultData: Record<string, any>;
  }>;
  /** Summary data to broadcast */
  summary: Record<string, any>;
}

/**
 * Player role definition for a game type
 */
export interface RoleDefinition {
  role: string;
  label: string;
  description: string;
}

/**
 * Configuration field definition for the UI
 */
export interface ConfigField {
  name: string;
  label: string;
  type: 'number' | 'select' | 'checkbox';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  description?: string;
  /** If true, this field is only shown for DA-based games */
  daOnly?: boolean;
}

/**
 * UI configuration returned by an engine to tell the frontend what to render
 */
export interface UIConfig {
  /** Human-readable game name */
  name: string;
  /** Short description */
  description: string;
  /** The category of game for grouping */
  category: 'continuous_trading' | 'simultaneous' | 'sequential' | 'specialized';
  /** Available player roles */
  roles: RoleDefinition[];
  /** Whether this game uses the standard DA order book UI */
  usesOrderBook: boolean;
  /** Whether players need valuation/cost assignments */
  usesValuationCost: boolean;
  /** Game-specific configuration fields */
  configFields: ConfigField[];
  /** Semester week number for ordering */
  weekNumber: number;
}

/**
 * Core interface that every game engine must implement.
 * Each game type provides its own engine that handles validation,
 * player setup, action processing, and round resolution.
 */
export interface GameEngine {
  /** The game type identifier */
  readonly gameType: GameType;

  /** Get UI configuration for the frontend */
  getUIConfig(): UIConfig;

  /** Validate game-specific configuration */
  validateConfig(config: Record<string, any>): ValidationResult;

  /**
   * Set up players for a session.
   * Assigns roles, valuations/costs, or game-specific data.
   */
  setupPlayers(sessionId: string, playerCount: number, config: Record<string, any>): Promise<void>;

  /**
   * Handle a player action (bid, ask, decision, etc.).
   * Returns what to broadcast and/or reply.
   */
  handleAction(
    roundId: string,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult>;

  /**
   * Process end-of-round logic.
   * Calculate results, update profits, return summary.
   */
  processRoundEnd(roundId: string, sessionCode: string, io: Server): Promise<RoundResult>;

  /**
   * Get the current game state for a round.
   * Used when a player reconnects or loads the page mid-round.
   */
  getGameState(roundId: string, playerId?: string): Promise<Record<string, any>>;

  /**
   * Called when a round starts (optional lifecycle hook).
   * Engines can use this to initialize in-memory state, schedule timers, etc.
   */
  onRoundStart?(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<void>;
}
