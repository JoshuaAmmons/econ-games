/** Rule parameters the Discovery Process engine sends with every tick (`tick.rules`). */
export interface GameRules {
  captureRadius: number;
  interactRadius: number;
  chatRadius: number;
  stunSeconds: number;
  largePreyValue: number;
  smallPreyValue: number;
  largePreyCaptureProb: number;
  healthDecay: number;
  hearthCapacity: number;
  maxHealth: number;
  earningsMultiplier: number;
  enableHit: boolean;
  enableTugOfWar: boolean;
  tugOfWarCostPerSec: number;
}

/** Engine defaults, used until the first tick arrives (or if an older server omits `rules`). */
export const DEFAULT_RULES: GameRules = {
  captureRadius: 100,
  interactRadius: 300,
  chatRadius: 700,
  stunSeconds: 3,
  largePreyValue: 38,
  smallPreyValue: 1,
  largePreyCaptureProb: 0.25,
  healthDecay: 8,
  hearthCapacity: 100,
  maxHealth: 100,
  earningsMultiplier: 0.01,
  enableHit: false,
  enableTugOfWar: true,
  tugOfWarCostPerSec: 10,
};
