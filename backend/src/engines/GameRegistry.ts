import type { GameEngine, GameType, UIConfig } from './GameEngine';

/**
 * Singleton registry that maps game type strings to engine instances.
 * All game engines register themselves here on startup.
 */
class GameRegistryClass {
  private engines: Map<GameType, GameEngine> = new Map();

  /**
   * Register a game engine for a given game type.
   */
  register(engine: GameEngine): void {
    if (this.engines.has(engine.gameType)) {
      console.warn(`GameRegistry: overwriting engine for "${engine.gameType}"`);
    }
    this.engines.set(engine.gameType, engine);
    console.log(`GameRegistry: registered "${engine.gameType}"`);
  }

  /**
   * Get the engine for a game type. Throws if not found.
   */
  get(gameType: string): GameEngine {
    const engine = this.engines.get(gameType as GameType);
    if (!engine) {
      throw new Error(`No game engine registered for type "${gameType}"`);
    }
    return engine;
  }

  /**
   * Check if a game type is registered.
   */
  has(gameType: string): boolean {
    return this.engines.has(gameType as GameType);
  }

  /**
   * List all registered game types.
   */
  list(): GameType[] {
    return Array.from(this.engines.keys());
  }

  /**
   * Get UI configs for all registered games, sorted by week number.
   */
  listWithConfigs(): Array<{ gameType: GameType; config: UIConfig }> {
    return Array.from(this.engines.entries())
      .map(([gameType, engine]) => ({
        gameType,
        config: engine.getUIConfig(),
      }))
      .sort((a, b) => a.config.weekNumber - b.config.weekNumber);
  }
}

/** Singleton instance */
export const GameRegistry = new GameRegistryClass();
