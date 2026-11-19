import type { BotStrategy } from './BotStrategyRegistry';
import type { Player } from '../../types';

/** Helper: random float in [min, max] */
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Helper: clamp value to [min, max] */
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Helper: round to 2 decimal places */
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Weight a bot puts on the previous period's average trade price from period 2 on: its offer moves
 * this share of the way from its period-1 path to that price (partial adjustment).
 */
export const DA_ANCHOR_WEIGHT = 0.5;

/**
 * DA bot strategy: buyers bid a fraction of their valuation,
 * sellers ask a markup over their cost. Both converge over time.
 *
 * Period 1 (and any period after one with no trades): buyers ramp from 50% to 90% of value across
 * the period, sellers from 150% down to 110% of cost, with ±2 noise.
 * From period 2 on, a small learning rule (19 Nov 2026), so period 2 opens closer to equilibrium and
 * its prices are tighter, as the textbook's Chapter 2 lab and the lecture describe ("loose convergence
 * in Period 1 and tighter convergence in Period 2"): each offer moves halfway (DA_ANCHOR_WEIGHT) from
 * the period-1 path toward the previous period's average trade price (gameState.previousMeanPrice,
 * from BotService). A bid never exceeds the bot's value and an ask is never below its cost, so a bot
 * whose value or cost is on the wrong side of that price still cannot trade at a loss.
 */
const daStrategy: BotStrategy = {
  getDAAction(player, config, gameState, elapsedSeconds) {
    const role = player.role;
    const roundDuration = config.time_per_round || 180;
    // Progress through round: 0 → 1
    const progress = Math.min(elapsedSeconds / roundDuration, 1);
    const anchor = Number(gameState?.previousMeanPrice);
    const learn = (x: number) =>
      Number.isFinite(anchor) && anchor > 0 ? DA_ANCHOR_WEIGHT * anchor + (1 - DA_ANCHOR_WEIGHT) * x : x;

    if (role === 'buyer') {
      const valuation = Number(player.valuation) || 50;
      // Start bidding at 50% of valuation, ramp up to 90%
      const minFrac = 0.5;
      const maxFrac = 0.9;
      const fraction = minFrac + (maxFrac - minFrac) * progress;
      const noise = rand(-2, 2);
      const price = r2(clamp(learn(valuation * fraction + noise), 0.01, valuation - 0.01));
      return { type: 'bid', price };
    } else {
      const cost = Number(player.production_cost) || 30;
      // Start asking at 150% of cost, ramp down to 110%
      const maxFrac = 1.5;
      const minFrac = 1.1;
      const fraction = maxFrac - (maxFrac - minFrac) * progress;
      const noise = rand(-2, 2);
      const price = r2(clamp(learn(cost * fraction + noise), cost + 0.01, 999));
      return { type: 'ask', price };
    }
  },
};

// All three DA variants use the same strategy
export const doubleAuctionStrategy = daStrategy;
export const taxSubsidyStrategy = daStrategy;
export const priceControlStrategy = daStrategy;
