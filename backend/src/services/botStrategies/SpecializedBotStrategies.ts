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

// ─── Ellsberg Urn Choice Task ──────────────────────────────────────────
export const ellsbergStrategy: BotStrategy = {
  getSimultaneousAction(_player, _config) {
    // Bots randomly choose urn and color
    const urn = Math.random() < 0.5 ? 'known' : 'ambiguous';
    const color = Math.random() < 0.5 ? 'red' : 'black';
    return { urn, color };
  },
};

// ─── Newsvendor Problem ───────────────────────────────────────────────
export const newsvendorStrategy: BotStrategy = {
  getSimultaneousAction(_player, config) {
    const demandMin = config.demandMin ?? 0;
    const demandMax = config.demandMax ?? 100;
    const unitCost = config.unitCost ?? 5;
    const sellingPrice = config.sellingPrice ?? 10;
    const salvageValue = config.salvageValue ?? 1;

    // Compute optimal (critical-ratio) quantity with some noise
    const criticalRatio = (sellingPrice - unitCost) / (sellingPrice - salvageValue);
    const optimal = demandMin + (demandMax - demandMin) * criticalRatio;
    // Add noise: ±15% of range around optimal (simulates pull-to-center bias)
    const noise = rand(-0.15, 0.15) * (demandMax - demandMin);
    const order = Math.round(clamp(optimal + noise, 0, demandMax * 2));
    return { orderQuantity: order };
  },
};

// ─── Dutch Auction ────────────────────────────────────────────────────
export const dutchAuctionStrategy: BotStrategy = {
  getSimultaneousAction(player, _config) {
    // First-price logic: shade valuation by 50–80%
    const valuation = Number((player as any).valuation) || rand(30, 80);
    const shade = rand(0.5, 0.8);
    return { stopPrice: r2(clamp(valuation * shade, 0, 999)) };
  },
};

// ─── English Auction ──────────────────────────────────────────────────
export const englishAuctionStrategy: BotStrategy = {
  getSimultaneousAction(player, _config) {
    // Second-price logic: bid near true valuation (dominant strategy is truthful)
    const valuation = Number((player as any).valuation) || rand(30, 80);
    const noise = rand(-1, 1);
    return { maxBid: r2(clamp(valuation + noise, 0, 999)) };
  },
};

// ─── Discriminative Multi-Unit Auction ────────────────────────────────
export const discriminativeAuctionStrategy: BotStrategy = {
  getSimultaneousAction(player, _config) {
    // Pay-as-bid: shade valuation like first-price (50–80%)
    const valuation = Number((player as any).valuation) || rand(30, 80);
    const shade = rand(0.5, 0.8);
    return { bid: r2(clamp(valuation * shade, 0, 999)) };
  },
};

// ─── Posted-Offer Pricing ────────────────────────────────────────────
export const postedOfferStrategy: BotStrategy = {
  getSimultaneousAction(player, _config) {
    const role = (player as any).role;
    if (role === 'seller') {
      // Sellers: post price = cost × 1.2–1.5 markup
      const cost = Number((player as any).production_cost) || rand(20, 60);
      const markup = rand(1.2, 1.5);
      return { price: r2(clamp(cost * markup, 0, 999)) };
    } else {
      // Buyers: just submit (action handled by engine in shopping phase)
      // For simultaneous-compatible fallback, submit a placeholder
      return { buyerReady: true };
    }
  },
};

// ─── Lindahl Mechanism ──────────────────────────────────────────────
export const lindahlStrategy: BotStrategy = {
  getSimultaneousAction(player, _config) {
    // Under-report WTP to free-ride (60–90% of true value)
    const valuation = Number((player as any).valuation) || rand(5, 15);
    const shade = rand(0.6, 0.9);
    return { willingnessToPay: r2(clamp(valuation * shade, 0, 999)) };
  },
};

// ─── Public Goods Auction ───────────────────────────────────────────
export const pgAuctionStrategy: BotStrategy = {
  getSimultaneousAction(player, _config) {
    // Bid 50–80% of true value (strategic shading)
    const valuation = Number((player as any).valuation) || rand(15, 35);
    const shade = rand(0.5, 0.8);
    return { bid: r2(clamp(valuation * shade, 0, 999)) };
  },
};

// ─── Sealed Bid-Offer Auction ───────────────────────────────────────
export const sealedBidOfferStrategy: BotStrategy = {
  getSimultaneousAction(player, _config) {
    const role = (player as any).role;
    if (role === 'seller') {
      // Sellers: ask 110–140% of cost
      const cost = Number((player as any).production_cost) || rand(20, 60);
      const markup = rand(1.1, 1.4);
      return { ask: r2(clamp(cost * markup, 0, 999)) };
    } else {
      // Buyers: bid 60–90% of valuation
      const valuation = Number((player as any).valuation) || rand(30, 80);
      const shade = rand(0.6, 0.9);
      return { bid: r2(clamp(valuation * shade, 0, 999)) };
    }
  },
};

// ─── Sponsored Search / GSP ─────────────────────────────────────────
export const sponsoredSearchStrategy: BotStrategy = {
  getSimultaneousAction(player, _config) {
    // GSP: shade bid to 50–80% of value per click
    const valuation = Number((player as any).valuation) || rand(3, 8);
    const shade = rand(0.5, 0.8);
    return { bid: r2(clamp(valuation * shade, 0, 999)) };
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
