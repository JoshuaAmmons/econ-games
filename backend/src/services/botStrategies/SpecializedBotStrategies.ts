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
  getSpecializedActions(player, config) {
    const actions: Array<{ action: Record<string, any>; delayMs: number }> = [];
    const productionLength = (config.productionLength ?? 10) * 1000; // ms

    // Good names from config
    const good1 = config.good1Name || 'Orange';
    const good2 = config.good2Name || 'Blue';

    // Set allocation — bots use default 50/50 (produces a mix of both goods)
    actions.push({
      action: { type: 'set_production', allocation: [50, 50] },
      delayMs: 500 + Math.random() * 500,
    });

    // Do NOT send start_production — let the production timer handle it
    // so human players have the full production phase to adjust their slider.

    // After production timer fires → move phase starts.
    // Move produced goods from field to own house in small batches.
    // With diminishing-returns production params, typical 50/50 yields ~3–6 per good.
    const moveBase = productionLength + 2000 + Math.random() * 2000;
    const batchSize = 2;
    const numBatches = 5; // up to 10 units per good

    for (let i = 0; i < numBatches; i++) {
      for (const good of [good1, good2]) {
        actions.push({
          action: {
            type: 'move_goods',
            good,
            amount: batchSize,
            fromLocation: 'field',
            fromPlayerId: player.id,
            toPlayerId: player.id,
          },
          delayMs: moveBase + i * 800 + (good === good2 ? 400 : 0),
        });
      }
    }

    return actions;
  },
};
