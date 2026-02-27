import type { BotStrategy } from './BotStrategyRegistry';
import type { Player } from '../../types';

/** Helper: random float in [min, max] */
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Helper: clamp value to [min, max] */
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Helper: round to 2 decimal places */
const r2 = (v: number) => Math.round(v * 100) / 100;

// ─── Prisoner's Dilemma ────────────────────────────────────────────────────
export const prisonerDilemmaStrategy: BotStrategy = {
  getSimultaneousAction(_player, _config, roundNumber, previousResults) {
    // Tit-for-tat: cooperate on round 1, then mirror majority of opponents' last moves
    if (roundNumber <= 1 || !previousResults?.length) {
      return { choice: 'cooperate' };
    }
    // Look at last round's results to see what opponents did
    const lastRound = previousResults[previousResults.length - 1];
    if (lastRound?.opponentDefected) {
      return { choice: 'defect' };
    }
    // Default: cooperate with 70% probability
    return { choice: Math.random() < 0.7 ? 'cooperate' : 'defect' };
  },
};

// ─── Beauty Contest ────────────────────────────────────────────────────────
export const beautyContestStrategy: BotStrategy = {
  getSimultaneousAction(_player, config, roundNumber) {
    const maxNumber = config.maxNumber || 100;
    const fraction = config.fraction || 0.67;
    // Level-2 thinking: guess fraction² × midpoint, with noise decreasing over rounds
    const midpoint = maxNumber / 2;
    const level2 = fraction * fraction * midpoint;
    const noise = rand(-5, 5) * Math.max(0.3, 1 - roundNumber * 0.1);
    return { number: clamp(r2(level2 + noise), 0, maxNumber) };
  },
};

// ─── Public Goods ──────────────────────────────────────────────────────────
export const publicGoodsStrategy: BotStrategy = {
  getSimultaneousAction(_player, config) {
    const endowment = config.endowment || 20;
    // Contribute 40–60% of endowment
    const fraction = rand(0.4, 0.6);
    return { contribution: r2(clamp(fraction * endowment, 0, endowment)) };
  },
};

// ─── Bertrand Competition ──────────────────────────────────────────────────
export const bertrandStrategy: BotStrategy = {
  getSimultaneousAction(_player, config) {
    const mc = config.marginalCost || 10;
    const maxPrice = config.maxPrice || 100;
    // Price = MC + random 5–15% markup
    const markup = rand(0.05, 0.15);
    const price = mc * (1 + markup);
    return { price: r2(clamp(price, 0, maxPrice)) };
  },
};

// ─── Cournot Competition ───────────────────────────────────────────────────
export const cournotStrategy: BotStrategy = {
  getSimultaneousAction(_player, config) {
    const a = config.demandIntercept || 100;
    const b = config.demandSlope || 1;
    const mc = config.marginalCost || 10;
    const maxQ = config.maxQuantity || 100;
    // Cournot best response assuming 2 symmetric firms, with noise
    // q* = (a - mc) / (2b * n) where n ≈ 3 (guess at number of firms)
    const qStar = (a - mc) / (2 * b * 3);
    const noise = rand(-3, 3);
    return { quantity: r2(clamp(qStar + noise, 0, maxQ)) };
  },
};

// ─── Negative Externality ──────────────────────────────────────────────────
export const negativeExternalityStrategy: BotStrategy = {
  getSimultaneousAction(_player, config) {
    const maxProd = config.maxProduction || 50;
    // Produce ~55–65% of max
    const fraction = rand(0.55, 0.65);
    return { production: Math.round(clamp(fraction * maxProd, 0, maxProd)) };
  },
};

// ─── Common Pool Resource ──────────────────────────────────────────────────
export const commonPoolResourceStrategy: BotStrategy = {
  getSimultaneousAction(_player, config) {
    const maxExtraction = config.maxExtraction || 25;
    // Extract 30–50% of max (moderate)
    const fraction = rand(0.3, 0.5);
    return { extraction: r2(clamp(fraction * maxExtraction, 0, maxExtraction)) };
  },
};

// ─── Stag Hunt ─────────────────────────────────────────────────────────────
export const stagHuntStrategy: BotStrategy = {
  getSimultaneousAction() {
    // 70% stag (risky but cooperative), 30% hare (safe)
    return { choice: Math.random() < 0.7 ? 'stag' : 'hare' };
  },
};

// ─── Dictator Game ─────────────────────────────────────────────────────────
export const dictatorStrategy: BotStrategy = {
  getSimultaneousAction(_player, config) {
    const endowment = config.endowment || 10;
    // Give 20–40% (behaviorally realistic)
    const fraction = rand(0.2, 0.4);
    return { give: r2(clamp(fraction * endowment, 0, endowment)) };
  },
};

// ─── Matching Pennies ──────────────────────────────────────────────────────
export const matchingPenniesStrategy: BotStrategy = {
  getSimultaneousAction() {
    // Nash equilibrium: 50/50
    return { choice: Math.random() < 0.5 ? 'heads' : 'tails' };
  },
};
