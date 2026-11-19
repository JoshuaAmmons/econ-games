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
/** The session's contract parameters, with the engine's defaults (PrincipalAgentEngine). */
function principalAgentParams(config: Record<string, any>) {
  return {
    maxWage: Number(config.maxWage ?? 50),
    maxBonus: Number(config.maxBonus ?? 50),
    highEffortProb: Number(config.highEffortProb ?? 0.8),
    lowEffortProb: Number(config.lowEffortProb ?? 0.2),
    effortCost: Number(config.effortCost ?? 10),
  };
}

/** The bonus at which high effort just pays for itself: effort cost / (P(high | high) - P(high | low)). */
function incentiveBonus(p: ReturnType<typeof principalAgentParams>): number {
  const gain = p.highEffortProb - p.lowEffortProb;
  return gain > 0 ? p.effortCost / gain : Infinity;
}

export const principalAgentStrategy: BotStrategy = {
  getFirstMoveAction(_player, config) {
    const p = principalAgentParams(config);
    // Moderate wage ~30% of the maximum. Bonus ~50-60% of the maximum, raised if needed to 20% above
    // the incentive-compatible bonus (when the maximum allows), so the contract can motivate high
    // effort under any session settings. At the defaults (IC bonus $16.67) this is the old $25-30.
    const ic = incentiveBonus(p);
    const bonus = Math.max(rand(0.5, 0.6) * p.maxBonus, Number.isFinite(ic) ? ic * 1.2 : 0);
    return {
      fixedWage: r2(clamp(rand(0.25, 0.35) * p.maxWage, 0, p.maxWage)),
      bonus: r2(clamp(bonus, 0, p.maxBonus)),
    };
  },
  getSecondMoveAction(_player, config, partnerAction) {
    // High effort exactly when it pays: the bonus times the rise in the chance of high output that
    // effort buys exceeds the effort cost, i.e. bonus x (P(high | high) - P(high | low)) > cost
    // (defaults 0.8, 0.2, $10: any bonus above $16.67). Until 19 Nov 2026 the rule was bonus x 0.8 >
    // 10 x 0.8, i.e. any bonus above $10.
    const p = principalAgentParams(config);
    const bonus = Number(partnerAction.bonus) || 0;
    return { highEffort: bonus * (p.highEffortProb - p.lowEffortProb) > p.effortCost };
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
  // The seller's quality is assigned by the engine; BotService fetches the bot's own game state
  // (assignedQuality, as a human seller's screen gets it) for strategies that ask for it.
  needsView: true,
  getFirstMoveAction(_player, config, _roundNumber, view) {
    const quality = Number(view?.assignedQuality);
    if (Number.isFinite(quality) && quality > 0) {
      // Price above own cost (quality x sellerCostFraction): cost x 1.2-2.0, never below cost + $1.
      // Until 19 Nov 2026 the bot priced at $20-60 without knowing its quality, so a high-quality
      // bot seller could sell below its own cost.
      const cost = quality * Number(config.sellerCostFraction ?? 0.5);
      return { price: r2(Math.max(cost + 1, cost * rand(1.2, 2.0))) };
    }
    // No quality available (should not happen): the old moderate price
    return { price: r2(clamp(rand(20, 60), 0, 100)) };
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
