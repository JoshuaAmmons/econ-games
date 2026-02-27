import type { BotStrategy } from './BotStrategyRegistry';
import type { Player } from '../../types';

/** Helper: random float in [min, max] */
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Helper: clamp value to [min, max] */
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Helper: round to 2 decimal places */
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * DA bot strategy: buyers bid a fraction of their valuation,
 * sellers ask a markup over their cost. Both converge over time.
 */
const daStrategy: BotStrategy = {
  getDAAction(player, config, gameState, elapsedSeconds) {
    const role = player.role;
    const roundDuration = config.time_per_round || 180;
    // Progress through round: 0 → 1
    const progress = Math.min(elapsedSeconds / roundDuration, 1);

    if (role === 'buyer') {
      const valuation = Number(player.valuation) || 50;
      // Start bidding at 50% of valuation, ramp up to 90%
      const minFrac = 0.5;
      const maxFrac = 0.9;
      const fraction = minFrac + (maxFrac - minFrac) * progress;
      const noise = rand(-2, 2);
      const price = r2(clamp(valuation * fraction + noise, 0.01, valuation - 0.01));
      return { type: 'bid', price };
    } else {
      const cost = Number(player.production_cost) || 30;
      // Start asking at 150% of cost, ramp down to 110%
      const maxFrac = 1.5;
      const minFrac = 1.1;
      const fraction = maxFrac - (maxFrac - minFrac) * progress;
      const noise = rand(-2, 2);
      const price = r2(clamp(cost * fraction + noise, cost + 0.01, 999));
      return { type: 'ask', price };
    }
  },
};

// All three DA variants use the same strategy
export const doubleAuctionStrategy = daStrategy;
export const taxSubsidyStrategy = daStrategy;
export const priceControlStrategy = daStrategy;
