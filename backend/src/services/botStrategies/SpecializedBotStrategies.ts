import type { BotStrategy } from './BotStrategyRegistry';
import type { Player } from '../../types';

/** Helper: random float in [min, max] */
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Helper: clamp value to [min, max] */
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Helper: round to 2 decimal places */
const r2 = (v: number) => Math.round(v * 100) / 100;

// ─── Monopoly ──────────────────────────────────────────────────────────────
export const monopolyStrategy: BotStrategy = {
  getSimultaneousAction(_player, config) {
    const a = config.demandIntercept || 100;
    const mc = config.marginalCost || 20;
    // Profit-maximizing price: (a + MC) / 2, with noise
    const optimalPrice = (a + mc) / 2;
    const noise = rand(-3, 3);
    return { price: r2(clamp(optimalPrice + noise, 0, a)) };
  },
};

// ─── Comparative Advantage ─────────────────────────────────────────────────
export const comparativeAdvantageStrategy: BotStrategy = {
  getSimultaneousAction(_player, config) {
    const laborUnits = config.laborUnits || 100;
    // Specialize: allocate 60–80% to good 1 (or good 2 randomly)
    const specialize = Math.random() < 0.5;
    const allocation = specialize ? rand(60, 80) : rand(20, 40);
    return { laborGood1: Math.round(clamp(allocation, 0, laborUnits)) };
  },
};

// ─── Sealed-Bid Auction ────────────────────────────────────────────────────
export const auctionStrategy: BotStrategy = {
  getSimultaneousAction(player, config) {
    const auctionType = config.auctionType || 'first_price';
    // Valuation is set per-round by the engine in setupPlayers/onRoundStart
    // We need to get it from player data or game state
    const valuation = Number((player as any).valuation) || rand(30, 80);

    if (auctionType === 'second_price') {
      // Second-price: bid truthfully (dominant strategy)
      const noise = rand(-1, 1);
      return { bid: r2(clamp(valuation + noise, 0, 999)) };
    } else {
      // First-price: shade bid to 50–80% of valuation
      const shade = rand(0.5, 0.8);
      return { bid: r2(clamp(valuation * shade, 0, 999)) };
    }
  },
};

// ─── Discovery Process ─────────────────────────────────────────────────────
export const discoveryProcessStrategy: BotStrategy = {
  getSpecializedActions(_player, config) {
    // Simple strategy: specialize in first good (100% allocation),
    // then move goods to own house during move phase
    const actions: Array<{ action: Record<string, any>; delayMs: number }> = [];

    // During production phase: set allocation to specialize
    actions.push({
      action: { type: 'set_production', allocation: [100, 0] },
      delayMs: 1000,
    });

    // Start production
    actions.push({
      action: { type: 'start_production' },
      delayMs: 2000,
    });

    return actions;
  },
};
