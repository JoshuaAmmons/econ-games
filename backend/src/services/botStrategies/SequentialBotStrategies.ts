import type { BotStrategy } from './BotStrategyRegistry';
import type { Player } from '../../types';

/** Helper: random float in [min, max] */
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Helper: clamp value to [min, max] */
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Helper: round to 2 decimal places */
const r2 = (v: number) => Math.round(v * 100) / 100;

// ─── Ultimatum Game ────────────────────────────────────────────────────────
export const ultimatumStrategy: BotStrategy = {
  getFirstMoveAction(_player, config) {
    const endowment = config.endowment || 10;
    const minOffer = config.minOffer || 0;
    // Offer 40–50% of endowment
    const fraction = rand(0.4, 0.5);
    return { offer: r2(clamp(fraction * endowment, minOffer, endowment)) };
  },
  getSecondMoveAction(_player, config, partnerAction) {
    const endowment = config.endowment || 10;
    const offer = partnerAction.offer || 0;
    // Accept if offer > 20% of endowment
    return { accept: offer > endowment * 0.2 };
  },
};

// ─── Bargaining Game ───────────────────────────────────────────────────────
export const bargainingStrategy: BotStrategy = {
  getFirstMoveAction(_player, config) {
    const pieSize = config.pieSize || 10;
    // Keep 50–60% of pie
    const keepFraction = rand(0.5, 0.6);
    return { keep: r2(clamp(keepFraction * pieSize, 0, pieSize)) };
  },
  getSecondMoveAction(_player, config, partnerAction) {
    const pieSize = config.pieSize || 10;
    const keep = partnerAction.keep || 0;
    const offered = pieSize - keep;
    // Accept if offered > 30% of pie
    return { accept: offered > pieSize * 0.3 };
  },
};

// ─── Gift Exchange ─────────────────────────────────────────────────────────
export const giftExchangeStrategy: BotStrategy = {
  getFirstMoveAction(_player, config) {
    const maxWage = config.maxWage || 50;
    // Offer 50–70% of max wage
    const fraction = rand(0.5, 0.7);
    return { wage: r2(clamp(fraction * maxWage, 0, maxWage)) };
  },
  getSecondMoveAction(_player, config, partnerAction) {
    const maxWage = config.maxWage || 50;
    const maxEffort = config.maxEffort || 10;
    const wage = partnerAction.wage || 0;
    // Effort proportional to wage (reciprocity) with noise
    const wageRatio = wage / maxWage;
    const effort = Math.round(clamp(wageRatio * maxEffort + rand(-1, 1), 1, maxEffort));
    return { effort };
  },
};

// ─── Principal-Agent ───────────────────────────────────────────────────────
export const principalAgentStrategy: BotStrategy = {
  getFirstMoveAction(_player, config) {
    const maxWage = config.maxWage || 50;
    const maxBonus = config.maxBonus || 50;
    // Moderate wage ~30%, bonus ~50–60%
    return {
      fixedWage: r2(clamp(rand(0.25, 0.35) * maxWage, 0, maxWage)),
      bonus: r2(clamp(rand(0.5, 0.6) * maxBonus, 0, maxBonus)),
    };
  },
  getSecondMoveAction(_player, config, partnerAction) {
    const effortCost = config.effortCost || 10;
    const bonus = partnerAction.bonus || 0;
    const highEffortProb = config.highEffortProb || 0.8;
    // Choose high effort if expected bonus × probability > effort cost
    const expectedBonusGain = bonus * highEffortProb;
    return { highEffort: expectedBonusGain > effortCost * 0.8 };
  },
};

// ─── Trust Game ────────────────────────────────────────────────────────────
export const trustGameStrategy: BotStrategy = {
  getFirstMoveAction(_player, config) {
    const endowment = config.endowment || 10;
    // Send 40–60% of endowment
    const fraction = rand(0.4, 0.6);
    return { amountSent: r2(clamp(fraction * endowment, 0, endowment)) };
  },
  getSecondMoveAction(_player, config, partnerAction) {
    const multiplier = config.multiplier || 3;
    const amountSent = partnerAction.amountSent || 0;
    const received = amountSent * multiplier;
    // Return 30–50% of the tripled amount (reciprocity)
    const returnFraction = rand(0.3, 0.5);
    return { amountReturned: r2(clamp(returnFraction * received, 0, received)) };
  },
};

// ─── Market for Lemons ─────────────────────────────────────────────────────
export const marketForLemonsStrategy: BotStrategy = {
  getFirstMoveAction(_player, config) {
    // Seller sets price based on their quality (which the engine assigns)
    // We don't know quality here, so set a moderate price
    const maxPrice = 100;
    const price = r2(rand(20, 60));
    return { price: clamp(price, 0, maxPrice) };
  },
  getSecondMoveAction(_player, config, partnerAction) {
    const buyerValueFraction = config.buyerValueFraction || 1.5;
    const price = partnerAction.price || 0;
    // Accept if price seems reasonable (< average expected value)
    // Average quality ≈ 50, value = quality × buyerValueFraction
    const averageValue = 50 * buyerValueFraction;
    return { accept: price < averageValue * rand(0.6, 0.9) };
  },
};
