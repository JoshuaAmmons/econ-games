import type { Player } from '../../types';

/**
 * Interface for game-specific bot strategies.
 * Each method returns an action object in the exact format the engine expects.
 * Return null to skip (e.g., DA bot deciding not to act this tick).
 */
export interface BotStrategy {
  /** Simultaneous-move games: return the decision action */
  getSimultaneousAction?(
    player: Player,
    config: Record<string, any>,
    roundNumber: number,
    previousResults?: any[]
  ): Record<string, any>;

  /** Sequential games: first-mover action */
  getFirstMoveAction?(
    player: Player,
    config: Record<string, any>,
    roundNumber: number
  ): Record<string, any>;

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
}

export const BotStrategyRegistry = new BotStrategyRegistryClass();
