/**
 * Per-game default configurations for solo + bots "practice mode."
 *
 * A practice session is a normal session under the hood: it has a market_size,
 * num_rounds, time_per_round, and game_config. The only difference is that
 * exactly one human player joins, the rest of the seats are filled with bots
 * by BotService.createBotsForSession, and the session auto-starts (no admin).
 *
 * To add a new game to practice mode, add an entry to PRACTICE_CONFIGS below
 * and (if its role is non-default) add it to PRACTICE_HUMAN_ROLES.
 */

import type { GameType } from '../engines/GameEngine';

export interface PracticeConfig {
  /** Total seats in the session, including the one human (rest become bots). */
  market_size: number;
  /** Number of rounds in the session. */
  num_rounds: number;
  /** Seconds per round. Schema requires >= 30 and <= 600. */
  time_per_round: number;
  /** Game-specific configuration passed to the engine and validators. */
  game_config: Record<string, any>;
  /** DA valuation range — required NOT NULL on sessions even for non-DA games. */
  valuation_min?: number;
  valuation_max?: number;
  valuation_increments?: number;
  /** DA cost range — same. */
  cost_min?: number;
  cost_max?: number;
  cost_increments?: number;
}

/** Default DA valuation/cost defaults used when the game does not really need them. */
const NON_DA_DEFAULTS = {
  valuation_min: 0,
  valuation_max: 100,
  valuation_increments: 5,
  cost_min: 0,
  cost_max: 100,
  cost_increments: 5,
};

/**
 * Per-game-type defaults. Keep entries minimal — engines validate the rest.
 * Only games listed here are eligible for practice mode.
 */
export const PRACTICE_CONFIGS: Partial<Record<GameType, PracticeConfig>> = {
  // ─── Chapter 4 — game theory and bargaining ─────────────────────────────
  prisoner_dilemma: {
    market_size: 4, // 1 human + 3 bots
    num_rounds: 10, // enough for tit-for-tat to teach the lesson
    time_per_round: 45,
    game_config: {
      reward: 3,
      temptation: 5,
      sucker: 0,
      punishment: 1,
    },
    ...NON_DA_DEFAULTS,
  },

  stag_hunt: {
    market_size: 4, // 1 human + 3 bots
    num_rounds: 5,
    time_per_round: 45,
    game_config: {},
    ...NON_DA_DEFAULTS,
  },

  // ─── Chapter 1 — decision making (level-k reasoning) ────────────────────
  beauty_contest: {
    market_size: 6, // 1 human + 5 bots — needs a few players for the average to be meaningful
    num_rounds: 5,
    time_per_round: 45,
    game_config: {
      maxNumber: 100,
      fraction: 0.667, // pick 2/3 of the average
    },
    ...NON_DA_DEFAULTS,
  },

  // ─── Chapter 2 — pricing, costs, profits (Smith 1962 convergence to CE) ──
  double_auction: {
    market_size: 6, // 1 human + 5 bots = 3 buyers + 3 sellers after BotService balancing
    num_rounds: 2, // two rounds is enough to see convergence and demonstrates the across-period replication effect
    time_per_round: 90, // continuous trading needs more time than discrete-action games
    game_config: {},
    valuation_min: 5,
    valuation_max: 95,
    valuation_increments: 5,
    cost_min: 5,
    cost_max: 95,
    cost_increments: 5,
  },

  // ─── Chapter 3 — advanced pricing (decisions under demand uncertainty) ──
  newsvendor: {
    market_size: 2, // schema requires >= 2; this is effectively solo (each player decides independently)
    num_rounds: 5,
    time_per_round: 45,
    game_config: {
      unitCost: 5,
      sellingPrice: 10,
      salvageValue: 1,
      demandMin: 0,
      demandMax: 100,
    },
    ...NON_DA_DEFAULTS,
  },

  // ─── Chapter 5 — adverse selection / moral hazard (paired-role) ─────────
  trust_game: {
    market_size: 2, // sender (human) + receiver (bot)
    num_rounds: 3, // a few rounds let students see whether reciprocity emerges
    time_per_round: 120, // sequential games need more time (two moves per round)
    game_config: {
      endowment: 10,
      multiplier: 3,
    },
    ...NON_DA_DEFAULTS,
  },

  // ─── Chapter 6 — organizational design (collective action / free riding) ─
  public_goods: {
    market_size: 4, // 1 human + 3 bots
    num_rounds: 5,
    time_per_round: 45,
    game_config: {
      endowment: 20,
      mpcr: 0.4, // marginal per-capita return
    },
    ...NON_DA_DEFAULTS,
  },

  // ─── Chapter 7 — macroeconomics (Smith-Suchanek-Williams 1988 bubbles) ──
  asset_bubble: {
    market_size: 6, // 1 human + 5 bot traders
    num_rounds: 8, // shorter than the canonical SSW 15-period horizon, but enough for bubble dynamics
    time_per_round: 60,
    game_config: {
      // Engine defaults: 3 shares per player, 385¢ starting cash, dividends ∈ {0, 8, 28, 60}
      // E[dividend] = 24¢, so FV at round 1 = 24 × 8 = 192¢; declines linearly each period.
    },
    ...NON_DA_DEFAULTS,
  },
};

/**
 * Per-game-type role assignment for the human player in practice mode.
 * For paired-role games (Ultimatum, TrustGame, etc.), the human always
 * gets the first-mover role so the experience is predictable; bots get
 * the other roles via BotService.createBotsForSession.
 */
export const PRACTICE_HUMAN_ROLES: Partial<Record<GameType, string>> = {
  // Uniform-role games
  prisoner_dilemma: 'player',
  stag_hunt: 'player',
  beauty_contest: 'player',
  public_goods: 'player',
  common_pool_resource: 'player',
  dictator: 'player',
  matching_pennies: 'player',
  bertrand: 'firm',
  cournot: 'firm',
  negative_externality: 'firm',
  asset_bubble: 'trader',

  // DA games — human always gets 'buyer' in practice; bots balance into sellers
  double_auction: 'buyer',
  double_auction_tax: 'buyer',
  double_auction_price_controls: 'buyer',

  // Paired-role games — human is always first-mover
  ultimatum: 'proposer',
  bargaining: 'proposer',
  gift_exchange: 'employer',
  principal_agent: 'principal',
  trust_game: 'sender',
  market_for_lemons: 'seller',

  // Auctions
  auction: 'bidder',
  dutch_auction: 'bidder',
  english_auction: 'bidder',
  discriminative_auction: 'bidder',
  bid_auction: 'bidder',

  // Specialized
  newsvendor: 'manager',
  ellsberg: 'chooser',
  comparative_advantage: 'country',
  monopoly: 'monopolist',
};

/** List the set of game types supported in practice mode. */
export function listPracticeGameTypes(): GameType[] {
  return Object.keys(PRACTICE_CONFIGS) as GameType[];
}

/** Look up a practice config; returns null if the game is not yet enabled. */
export function getPracticeConfig(gameType: string): PracticeConfig | null {
  return (PRACTICE_CONFIGS as Record<string, PracticeConfig | undefined>)[gameType] ?? null;
}

/** Look up the human role for a game; defaults to 'player' if not listed. */
export function getPracticeHumanRole(gameType: string): string {
  return (PRACTICE_HUMAN_ROLES as Record<string, string | undefined>)[gameType] ?? 'player';
}
