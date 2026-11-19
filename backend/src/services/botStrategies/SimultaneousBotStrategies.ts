import type { BotStrategy } from './BotStrategyRegistry';
import type { Player } from '../../types';

/** Helper: random float in [min, max] */
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Helper: clamp value to [min, max] */
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Helper: round to 2 decimal places */
const r2 = (v: number) => Math.round(v * 100) / 100;

// ─── Prisoner's Dilemma ────────────────────────────────────────────────────
/**
 * Exact tit-for-tat against the human players (the textbook's Chapter 4 lab: "every bot retaliates
 * in the following round ... a single round of cooperation restores the cooperative path").
 * Round 1: cooperate. Later rounds: copy the human's most recent move. Bots ignore one another's
 * moves (they only answer humans); since every bot copies the same human move, bots never drift into
 * defecting against each other. With several humans (a class session with bots), the bot copies the
 * majority of the humans' moves in the latest round any human played, cooperating on a tie. If no
 * human has played yet, it cooperates.
 */
export const prisonerDilemmaStrategy: BotStrategy = {
  getSimultaneousAction(_player, _config, roundNumber, history) {
    if (roundNumber <= 1 || !history?.length) {
      return { choice: 'cooperate' };
    }
    for (let i = history.length - 1; i >= 0; i--) {
      const humanMoves = history[i].decisions.filter((d) => !d.isBot);
      if (humanMoves.length === 0) continue; // no human played that round: look further back
      const defections = humanMoves.filter((d) => d.action?.choice === 'defect').length;
      return { choice: defections * 2 > humanMoves.length ? 'defect' : 'cooperate' };
    }
    return { choice: 'cooperate' };
  },
};

// ─── Beauty Contest ────────────────────────────────────────────────────────
export const beautyContestStrategy: BotStrategy = {
  getSimultaneousAction(_player, config, _roundNumber) {
    const maxNumber = config.maxNumber || 100;
    const fraction = config.fraction || 0.67;
    // Level-2 thinking: guess fraction² × midpoint (22.2 at the defaults), ±4.5 noise every round.
    // Until 19 Nov 2026 BotService passed round 1 to every bot, so the noise never shrank; it is held
    // at the round-1 width so the calibration students have played does not change now that the real
    // round number arrives (the textbook's Chapter 1 lab describes level-two bots, nothing more).
    const midpoint = maxNumber / 2;
    const level2 = fraction * fraction * midpoint;
    const noise = rand(-5, 5) * 0.9;
    return { number: clamp(r2(level2 + noise), 0, maxNumber) };
  },
};

// ─── Public Goods ──────────────────────────────────────────────────────────
/**
 * Conditional cooperators (Fischbacher, Gächter & Fehr 2001; Fischbacher & Gächter 2010), as the
 * textbook's Chapter 6 lab describes them: "contributions start at 40-60% of endowment and decay
 * toward zero across rounds ... contributing 40-60% depending on observed group behavior".
 * Round 1: a random 40-60% of the endowment. Later rounds: a bit less than the average the OTHER
 * players (human and bots alike) gave last round, i.e. that average times a random 0.75-0.95, plus
 * noise of ±5% of the endowment, in whole tokens. Because each bot gives less than it sees, giving
 * decays toward zero when the human free-rides and holds up (about 12-13 of 20) when the human gives
 * everything. A bot that sees no other decision last round repeats the round-1 rule.
 */
export const publicGoodsStrategy: BotStrategy = {
  getSimultaneousAction(player, config, roundNumber, history) {
    const endowment = config.endowment || 20;
    const last = roundNumber > 1 && history?.length ? history[history.length - 1] : null;
    const others = (last?.decisions || []).filter(
      (d) => d.playerId !== player.id && typeof d.action?.contribution === 'number'
    );
    if (others.length === 0) {
      return { contribution: Math.round(clamp(rand(0.4, 0.6) * endowment, 0, endowment)) };
    }
    const othersAvg = others.reduce((sum, d) => sum + Number(d.action.contribution), 0) / others.length;
    const target = othersAvg * rand(0.75, 0.95) + rand(-0.05, 0.05) * endowment;
    return { contribution: Math.round(clamp(target, 0, endowment)) };
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
