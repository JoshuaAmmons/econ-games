import type { Player } from '../../types';

/**
 * One earlier round of a simultaneous game, as BotService hands it to a bot: every decision made in
 * that round, with whether the player who made it is a bot.
 */
export interface BotRoundRecord {
  roundNumber: number;
  decisions: Array<{ playerId: string; isBot: boolean; action: Record<string, any> }>;
}

/**
 * Interface for game-specific bot strategies.
 * Each method returns an action object in the exact format the engine expects.
 * Return null to skip (e.g., DA bot deciding not to act this tick).
 */
export interface BotStrategy {
  /**
   * Simultaneous-move games: return the decision action. roundNumber is the session's current round;
   * history holds the session's earlier rounds, oldest first (empty in round 1).
   */
  getSimultaneousAction?(
    player: Player,
    config: Record<string, any>,
    roundNumber: number,
    history?: BotRoundRecord[]
  ): Record<string, any>;

  /**
   * Sequential games: first-mover action. view is the bot's own game state for the round (what a
   * human in its seat would be sent), fetched only for strategies that set needsView.
   */
  getFirstMoveAction?(
    player: Player,
    config: Record<string, any>,
    roundNumber: number,
    view?: Record<string, any>
  ): Record<string, any>;

  /** Set when getFirstMoveAction needs the bot's game state (e.g. a Lemons seller's assigned quality). */
  needsView?: boolean;

  /** Sequential games: second-mover response to partner's first move */
  getSecondMoveAction?(
    player: Player,
    config: Record<string, any>,
    partnerAction: Record<string, any>,
    roundNumber: number
  ): Record<string, any>;

  /** DA games: return a bid or ask action, or null to skip this tick */
  getDAAction?(
    player: Player,
    config: Record<string, any>,
    gameState: Record<string, any>,
    elapsedSeconds: number
  ): Record<string, any> | null;

  /** Specialized games with custom action flows */
  getSpecializedActions?(
    player: Player,
    config: Record<string, any>,
    gameState: Record<string, any>,
    roundNumber: number
  ): Array<{ action: Record<string, any>; delayMs: number }>;
}

class BotStrategyRegistryClass {
  private strategies = new Map<string, BotStrategy>();

  register(gameType: string, strategy: BotStrategy): void {
    this.strategies.set(gameType, strategy);
  }

  get(gameType: string): BotStrategy | undefined {
    return this.strategies.get(gameType);
  }

  has(gameType: string): boolean {
    return this.strategies.has(gameType);
  }

  listAll(): string[] {
    return Array.from(this.strategies.keys());
  }
}

export const BotStrategyRegistry = new BotStrategyRegistryClass();
