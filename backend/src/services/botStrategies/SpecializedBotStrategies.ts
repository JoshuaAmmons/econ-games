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
      // Buyers: handled by the engine during shopping phase transition
      // Return null so BotService skips this bot
      return null as any;
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

// ─── Discovery Process (Hunter-Gatherer) ──────────────────────────────────
//
// A real-time arena can't be played from a script scheduled at round start:
// prey move, and what a bot should do in camp depends on what everyone caught.
// So this strategy uses a live hook instead of getSpecializedActions —
// BotService polls the engine's per-player view (the same visibility-filtered
// snapshot a human receives) every `liveTickMs` and runs the returned actions.

/** What BotService hands a live strategy on every decision. */
export interface LiveBotContext {
  /** This bot's position among the session's bots, in creation order (stable across rounds). */
  botIndex: number;
  /** Ids of every bot in the session, so a bot can tell humans from bots. */
  botIds: ReadonlySet<string>;
  /** Scratch space that persists for this bot until the round ends. */
  memory: Record<string, any>;
  /** Current time in ms. */
  now: number;
}

/** A strategy that reacts to live game state instead of scheduling actions up front. */
export interface LiveBotStrategy {
  /** How often BotService asks the bot for a decision, in ms. */
  liveTickMs: number;
  getLiveActions(
    player: Player,
    view: Record<string, any>,
    ctx: LiveBotContext
  ): Array<Record<string, any>>;
}

export function isLiveBotStrategy(s: BotStrategy | undefined): s is BotStrategy & LiveBotStrategy {
  return typeof (s as Partial<LiveBotStrategy> | undefined)?.getLiveActions === 'function';
}

interface DPPoint { x: number; y: number }
interface DPPlayerView extends DPPoint { id: string; name: string; food: number; health: number; stunned: boolean; inTug: boolean }
interface DPPreyView extends DPPoint { id: string; type: 'large' | 'small' }
interface DPPotView extends DPPoint { id: string; ownerId: string; food: number }
interface DPRules { captureRadius: number; interactRadius: number; healthDecay: number; hearthCapacity: number; maxHealth: number }
interface DPView {
  phase: 'hunting' | 'trading' | 'interim';
  you: DPPoint & { id: string; food: number; health: number; stunned: boolean; inTug: boolean; lockedZone: 'left' | 'right' | null };
  players: DPPlayerView[];
  prey: DPPreyView[];
  pots: DPPotView[];
  world: { width: number; height: number; leftZoneEnd: number; middleZoneEnd: number };
  rules: DPRules;
}
type DPAction = Record<string, any>;

/**
 * Round-robin by bot index, so a 4-seat practice session shows one of each:
 *  - loner: small game only, never gives, deposits, or withdraws (the go-it-alone baseline)
 *  - coordinator: always hunts large game, sets up a pot at camp, gives its surplus away
 *  - mixed: gambles on large game only while healthy, otherwise plays safe on small game;
 *    shares a surplus, draws on pots when short
 */
type DPArchetype = 'loner' | 'coordinator' | 'mixed';
const DP_ARCHETYPES: DPArchetype[] = ['loner', 'coordinator', 'mixed'];
/** Mixed bots hunt large game only while they can absorb a failed hunt. */
const DP_MIXED_LARGE_GAME_HEALTH = 80;
/** Seconds a bot keeps chasing one camp partner before trying someone else. */
const DP_CHASE_GIVE_UP_MS = 12000;
const DP_MIN_CHAT_GAP_MS = 1500;
/** A short bot waits this long in camp for others to fill a pot before asking for food. */
const DP_ASK_DELAY_MS = 4000;

const dpDist = (a: DPPoint, b: DPPoint) => Math.hypot(a.x - b.x, a.y - b.y);

function dpMinBy<T>(items: T[], score: (t: T) => number): T | undefined {
  let best: T | undefined;
  let bestScore = Infinity;
  for (const item of items) {
    const s = score(item);
    if (s < bestScore) { best = item; bestScore = s; }
  }
  return best;
}

/** Food that still raises end-of-round health: the engine applies decay, then caps at maxHealth and hearthCapacity. */
function dpFoodWanted(health: number, rules: DPRules): number {
  return Math.max(0, Math.min(rules.maxHealth - (health - rules.healthDecay), rules.hearthCapacity));
}
const dpNeed = (p: { food: number; health: number }, rules: DPRules) =>
  Math.max(0, Math.floor(dpFoodWanted(p.health, rules) - p.food));
const dpSurplus = (p: { food: number; health: number }, rules: DPRules) =>
  Math.max(0, Math.floor(p.food - dpFoodWanted(p.health, rules)));

const dpMove = (pt: DPPoint): DPAction => ({ type: 'set_target', x: Math.round(pt.x), y: Math.round(pt.y) });

/** Queue a chat line; dpFlushChat sends them one at a time so bots don't flood camp chat. */
function dpSay(p: Record<string, any>, message: string): void {
  (p.chatQueue ??= [] as string[]).push(message);
}

function dpFlushChat(p: Record<string, any>, now: number): DPAction[] {
  if (!p.chatQueue?.length || now - (p.lastChatAt ?? -Infinity) < DP_MIN_CHAT_GAP_MS) return [];
  p.lastChatAt = now;
  return [{ type: 'chat', message: p.chatQueue.shift() }];
}

function dpRandomPointIn(side: 'left' | 'middle' | 'right', world: DPView['world']): DPPoint {
  const [x1, x2] = side === 'left' ? [0, world.leftZoneEnd]
    : side === 'right' ? [world.middleZoneEnd, world.width]
    : [world.leftZoneEnd, world.middleZoneEnd];
  return { x: rand(x1 + 100, x2 - 100), y: rand(100, world.height - 100) };
}

/** Aim where the prey will be, using its velocity since the last look. */
function dpLead(p: Record<string, any>, prey: DPPreyView, now: number, world: DPView['world']): DPPoint {
  const seen = p.lastSeenPrey;
  p.lastSeenPrey = { id: prey.id, x: prey.x, y: prey.y, t: now };
  if (!seen || seen.id !== prey.id || now <= seen.t) return prey;
  const leadMs = 300;
  const k = leadMs / (now - seen.t);
  return {
    x: clamp(prey.x + (prey.x - seen.x) * k, 0, world.width),
    y: clamp(prey.y + (prey.y - seen.y) * k, 0, world.height),
  };
}

function dpHunt(v: DPView, archetype: DPArchetype, mem: Record<string, any>, now: number): DPAction[] {
  const { you, world, rules } = v;
  const p = mem.phaseMem;

  // The side is chosen once per round; the engine's zone lock makes it binding anyway.
  if (!mem.side) {
    mem.side = archetype === 'loner' ? 'right'
      : archetype === 'coordinator' ? 'left'
      : you.health >= DP_MIXED_LARGE_GAME_HEALTH ? 'left' : 'right';
  }
  const side: 'left' | 'right' = you.lockedZone ?? mem.side;

  // Short pauses (getting bearings, after each throw) keep bots beatable by a human.
  p.waitUntil ??= now + rand(500, 1500);
  if (now < p.waitUntil) return [];

  const wanted = side === 'left' ? 'large' : 'small';
  const prey = v.prey.filter(q => q.type === wanted);
  const rivals = v.players.filter(q => q.id !== you.id);

  let target = prey.find(q => q.id === p.preyId);
  if (!target) {
    // Nearest prey, but leave one alone if someone else is clearly closer to it.
    target = dpMinBy(prey, q => {
      const d = dpDist(you, q);
      return d + (rivals.some(r => dpDist(r, q) < d * 0.7) ? 600 : 0);
    });
    p.preyId = target?.id;
  }

  if (target) {
    if (dpDist(you, target) <= rules.captureRadius * 0.9) {
      p.preyId = undefined;
      p.waitUntil = now + rand(400, 1200);
      return [{ type: 'capture_prey', preyId: target.id }];
    }
    return [dpMove(dpLead(p, target, now, world))];
  }

  // Nothing in sight: sweep the hunting ground.
  if (!p.explore || dpDist(you, p.explore) < 60) p.explore = dpRandomPointIn(side, world);
  return [dpMove(p.explore)];
}

function dpCamp(
  v: DPView,
  archetype: DPArchetype,
  mem: Record<string, any>,
  ctx: LiveBotContext
): DPAction[] {
  const { you, world, rules } = v;
  const { now, botIds } = ctx;
  const p = mem.phaseMem;
  const camp = { x: (world.leftZoneEnd + world.middleZoneEnd) / 2, y: world.height / 2 };
  const reach = rules.interactRadius * 0.8;
  const others = v.players.filter(q => q.id !== you.id);
  p.deposited ??= {} as Record<string, number>;

  // Thank whoever topped us up (any rise in food we didn't withdraw ourselves).
  if (p.lastFood !== undefined && you.food > p.lastFood && archetype !== 'loner') dpSay(p, 'Thanks for the food!');
  p.lastFood = you.food;

  p.waitUntil ??= now + rand(1000, 2500);
  if (now < p.waitUntil) return [];

  if (archetype === 'loner') {
    // Never trades. Says so once, then keeps to the edge of camp nearest its hunting ground.
    const spot = (p.spot ??= { x: world.middleZoneEnd - 120, y: rand(100, world.height - 100) });
    if (!p.saidHello) { p.saidHello = true; dpSay(p, 'I hunt alone. Keeping what I caught.'); }
    return [dpMove(spot)];
  }

  // The coordinator's first job in camp: set up a shared pot in the middle.
  const myPot = v.pots.find(q => q.ownerId === you.id);
  if (archetype === 'coordinator' && !myPot) {
    if (dpDist(you, camp) > 60) return [dpMove(camp)];
    if (now - (p.potTriedAt ?? -Infinity) < 3000) return [];
    if (p.potTriedAt === undefined) dpSay(p, 'Pot is in the middle of camp — leave spare food, take what you need.');
    p.potTriedAt = now;
    return [{ type: 'place_pot' }];
  }

  const surplus = dpSurplus(you, rules);
  const need = dpNeed(you, rules);

  if (surplus > 0) {
    // Gift needy humans directly, so a student sees exchange happen to them.
    const needyHumans = others
      .filter(q => !botIds.has(q.id) && !q.inTug && dpNeed(q, rules) > 0 && !(p.gaveUpOn?.[q.id]))
      .sort((a, b) => dpNeed(b, rules) - dpNeed(a, rules));
    const pot = myPot ?? dpMinBy(v.pots, q => dpDist(you, q));
    const needyBots = pot ? [] : others
      .filter(q => botIds.has(q.id) && !q.inTug && dpNeed(q, rules) > 0 && !(p.gaveUpOn?.[q.id]))
      .sort((a, b) => dpNeed(b, rules) - dpNeed(a, rules));
    // Only settle for a bot or the pot from the middle of camp, where every human is in view.
    if (!needyHumans.length && dpDist(you, camp) > rules.interactRadius) return [dpMove(camp)];
    const recipient = needyHumans[0] ?? needyBots[0];

    if (recipient) {
      if (p.chasing !== recipient.id) { p.chasing = recipient.id; p.chaseSince = now; }
      if (now - p.chaseSince > DP_CHASE_GIVE_UP_MS) {
        (p.gaveUpOn ??= {})[recipient.id] = true;
        return [];
      }
      if (dpDist(you, recipient) > reach) return [dpMove(recipient)];
      const amount = Math.min(surplus, dpNeed(recipient, rules));
      // Practice mode names the human "You", so only bots are addressed by name.
      const offer = archetype === 'coordinator'
        ? `take ${amount} food — I caught more than I can eat.`
        : `here's ${amount} spare food for you.`;
      dpSay(p, botIds.has(recipient.id)
        ? `${recipient.name}, ${offer}`
        : offer.charAt(0).toUpperCase() + offer.slice(1));
      return [{ type: 'transfer', targetId: recipient.id, amount }];
    }

    // Nobody visibly short: leave the rest in a pot for whoever needs it later.
    if (pot) {
      if (dpDist(you, pot) > reach) return [dpMove(pot)];
      p.deposited[pot.id] = (p.deposited[pot.id] ?? 0) + surplus;
      dpSay(p, `Left ${surplus} spare food in the pot — take what you need.`);
      return [{ type: 'deposit_pot', potId: pot.id, amount: surplus }];
    }
  } else if (need > 0) {
    // Short: draw on food other people left in a pot.
    const pot = dpMinBy(
      v.pots.filter(q => q.food - (p.deposited[q.id] ?? 0) > 0),
      q => dpDist(you, q)
    );
    if (pot) {
      if (dpDist(you, pot) > reach) return [dpMove(pot)];
      const amount = Math.min(need, pot.food - (p.deposited[pot.id] ?? 0));
      p.lastFood = you.food + amount;
      p.chatQueue = (p.chatQueue ?? []).filter((m: string) => m !== p.askLine); // no longer true
      dpSay(p, `Took ${amount} food from the pot. Thank you, whoever filled it.`);
      return [{ type: 'withdraw_pot', potId: pot.id, amount }];
    }
    if (!p.askedForHelp && others.length > 0 && now > p.waitUntil + DP_ASK_DELAY_MS) {
      // Ask within earshot (and giving range) of a human, then stay close by.
      const human = dpMinBy(others.filter(q => !botIds.has(q.id)), q => dpDist(you, q));
      p.approachSince ??= now;
      if (human && dpDist(you, human) > reach && now - p.approachSince < DP_CHASE_GIVE_UP_MS) {
        return [dpMove(human)];
      }
      p.askedNear = human?.id;
      p.askedAt = now;
      p.askedForHelp = true;
      p.idle = undefined; // hang around the person we asked, not the old spot
      p.askLine = archetype === 'coordinator'
        ? `Came back empty-handed — I could use ${need} food if anyone has extra.`
        : `Rough hunt. Short ${need} food — anyone have spare?`;
      dpSay(p, p.askLine);
    }
  }

  // Nothing to do: mill about the middle of camp (or, while still short, near whoever we asked).
  const askedHuman = need > 0 && now - p.askedAt < DP_CHASE_GIVE_UP_MS
    ? others.find(q => q.id === p.askedNear)
    : undefined;
  if (askedHuman && dpDist(you, askedHuman) > reach) return [dpMove(askedHuman)];
  if (!p.idle || now > p.idleUntil) {
    const base = askedHuman ?? myPot ?? camp;
    p.idle = { x: base.x + rand(-150, 150), y: clamp(base.y + rand(-120, 120), 50, world.height - 50) };
    p.idleUntil = now + rand(3000, 6000);
  }
  return [dpMove(p.idle)];
}

export const discoveryProcessStrategy: BotStrategy & LiveBotStrategy = {
  liveTickMs: 250,

  getLiveActions(_player, view, ctx) {
    const v = view as DPView;
    if (!v.you || !v.rules || !v.world) return [];
    const mem = ctx.memory;
    if (mem.phase !== v.phase) {
      mem.phase = v.phase;
      mem.phaseMem = {};
    }
    // Stuns wear off on their own; the engine makes bots yield a tug-of-war.
    if (v.you.stunned || v.you.inTug) return [];

    const archetype = DP_ARCHETYPES[ctx.botIndex % DP_ARCHETYPES.length];
    if (v.phase === 'hunting') return dpHunt(v, archetype, mem, ctx.now);
    if (v.phase === 'trading') {
      const actions = dpCamp(v, archetype, mem, ctx);
      // Chat goes first: it can't fail in camp, so a failed move/gift never swallows a queued line.
      return [...dpFlushChat(mem.phaseMem, ctx.now), ...actions];
    }
    return [];
  },
};

// ─── Asset Bubble (SSW) ───────────────────────────────────────────────────
/**
 * A trader's private value for a share this period, by type. The bots are a fixed mix by seat
 * (BotService's botIndex, in creation order): seats 1-5 of every five are
 * fundamental, speculator, trend follower, speculator, trend follower. The mix reproduces the
 * Smith-Suchanek-Williams (1988) pattern the textbook's Chapter 7 lab promises ("prices rise above
 * fundamental value for most of the horizon and then crash near the end"); bots that all priced
 * around the true value would trade around it and there would be no bubble to see.
 *
 * FV = expected dividend x periods remaining (24c x 8 = 192c in period 1 of practice, down to 24c).
 * - Fundamental trader: values a share at FV x U(0.9, 1.1).
 * - Speculator ("greater fool", momentum across periods): in period 1, FV x U(0.8, 1.1); later,
 *   max(FV, last period's average price) x its own optimism (fixed per bot, 1.00-1.25) x U(0.95, 1.05):
 *   it expects to resell at least at last period's price. So while FV falls, its value does not.
 * - Trend follower (momentum within the period): the latest trade price (this period's, else last
 *   period's average, else FV) x U(0.85, 1.15).
 * - The end of the horizon: speculators and trend followers expect fewer buyers to resell to. Their
 *   premium over FV shrinks steadily in the periods just before the last quarter of the horizon (to half
 *   with 3 of 8 periods left in practice), and in the last quarter (the final 2 of 8 periods) they value
 *   a share at no more than its dividends: speculators FV x U(0.6, 1.0), trend followers FV x U(0.7, 1.05).
 * Simulated with an idle student over 20 practice games (19 Nov 2026): prices near or below FV in
 * period 1, rising to about twice FV by period 5, then near or below FV in periods 7-8.
 */
export const ASSET_BUBBLE_MIX = ['fundamental', 'speculator', 'trend', 'speculator', 'trend'] as const;
export type AssetBubbleTraderType = typeof ASSET_BUBBLE_MIX[number];

/** A stable number in [0, 1) from a string (a bot's id), so each bot keeps its optimism all game. */
function unitHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function assetBubbleTraderType(botIndex: number): AssetBubbleTraderType {
  return ASSET_BUBBLE_MIX[((botIndex % ASSET_BUBBLE_MIX.length) + ASSET_BUBBLE_MIX.length) % ASSET_BUBBLE_MIX.length];
}

/** The bot's value for one share now (cents), from its view of the market (see BotService). */
export function assetBubbleValue(player: Player, view: Record<string, any>): number {
  const type = assetBubbleTraderType(Number(view.botIndex) || 0);
  const expectedDividend = Number(view.expectedDividend ?? 24);
  const totalPeriods = Math.max(1, Number(view.totalRounds) || 1);
  const periodsRemaining = Math.max(1, Number(view.periodsRemaining) || 1);
  const FV = expectedDividend * periodsRemaining;
  if (type === 'fundamental') return FV * rand(0.9, 1.1);

  // Resale confidence: 1 until the end nears, 0.5 one step before the last quarter, 0 in the last quarter
  const lastQuarter = Math.max(1, Math.round(totalPeriods * 0.25));
  const confidence = clamp((periodsRemaining - lastQuarter) / lastQuarter, 0, 1);
  const history: Array<{ round: number; avgPrice: number | null }> = view.priceHistory || [];
  const lastPeriod = [...history].reverse().find((h) => h.avgPrice != null && h.avgPrice > 0);

  let premiumValue: number;
  if (type === 'speculator') {
    if (confidence === 0) return FV * rand(0.6, 1.0);
    const optimism = 1 + 0.25 * unitHash(player.id);
    premiumValue = lastPeriod
      ? Math.max(FV, Number(lastPeriod.avgPrice)) * optimism * rand(0.95, 1.05)
      : FV * rand(0.8, 1.1);
  } else {
    if (confidence === 0) return FV * rand(0.7, 1.05);
    const trades: Array<{ price: number }> = view.trades || [];
    const ref = trades.length ? Number(trades[trades.length - 1].price)
      : lastPeriod ? Number(lastPeriod.avgPrice) : FV;
    premiumValue = ref * rand(0.85, 1.15);
  }
  return FV + confidence * (premiumValue - FV);
}

/**
 * Asset Bubble bots. BotService hands each bot its live view of the round (AssetBubbleEngine
 * getTraderView: period, portfolio, order book, this period's trades) plus the earlier periods'
 * average prices and its seat (botIndex). The bot values a share (assetBubbleValue), then:
 * buys at the best ask when that is at or below its value, or sells at the best bid when that is at
 * or above it (70% of the time each), otherwise posts a bid at 85-100% of its value (never more than
 * its cash) or an ask at 100-115% of it. replace: true tells BotService to withdraw the bot's own
 * resting order on that side first, so each bot keeps at most one bid and one ask in the book.
 */
export const assetBubbleStrategy: BotStrategy = {
  getDAAction(player, _config, gameState, _elapsedSeconds) {
    const view = gameState || {};
    const portfolio = view.myPortfolio;
    if (!portfolio) return null;
    const cash = Number(portfolio.cash) || 0;
    const shares = Number(portfolio.shares) || 0;
    const value = assetBubbleValue(player, view);

    const othersAsks = (view.asks || []).filter((a: any) => a.playerId !== player.id);
    const othersBids = (view.bids || []).filter((b: any) => b.playerId !== player.id);
    const bestAsk = othersAsks.reduce((m: number, a: any) => Math.min(m, Number(a.price)), Infinity);
    const bestBid = othersBids.reduce((m: number, b: any) => Math.max(m, Number(b.price)), 0);

    if (bestAsk <= value && bestAsk <= cash && Math.random() < 0.7) {
      return { type: 'bid', price: Math.round(bestAsk), replace: true };
    }
    if (bestBid > 0 && bestBid >= value && shares > 0 && Math.random() < 0.7) {
      return { type: 'ask', price: Math.round(bestBid), replace: true };
    }

    const side = shares <= 0 ? 'bid' : cash < value * 0.5 ? 'ask' : Math.random() < 0.5 ? 'bid' : 'ask';
    if (side === 'bid') {
      const price = Math.min(Math.round(value * rand(0.85, 1.0)), Math.floor(cash));
      return price >= 1 ? { type: 'bid', price, replace: true } : null;
    }
    return { type: 'ask', price: Math.max(1, Math.round(value * rand(1.0, 1.15))), replace: true };
  },
};

// ─── Double Dutch Auction ─────────────────────────────────────────────────
export const doubleDutchStrategy: BotStrategy = {
  getSimultaneousAction(player, _config) {
    const role = (player as any).role;
    if (role === 'seller') {
      // Sellers: stop price = 100–130% of cost
      const cost = Number((player as any).production_cost) || rand(20, 60);
      const stopPrice = Math.round(cost * (1.0 + Math.random() * 0.3));
      return { type: 'submit_stop_price', stopPrice: Math.max(1, stopPrice) };
    } else {
      // Buyers: stop price = 70–100% of valuation
      const valuation = Number((player as any).valuation) || rand(30, 80);
      const stopPrice = Math.round(valuation * (0.7 + Math.random() * 0.3));
      return { type: 'submit_stop_price', stopPrice: Math.max(1, stopPrice) };
    }
  },
};

// ─── Contestable Market ───────────────────────────────────────────────────
export const contestableMarketStrategy: BotStrategy = {
  getSimultaneousAction(player, config, _roundNumber) {
    const phase = (config as any).phase || (config as any).gamePhase;

    if (phase === 'entry') {
      // Entrants enter with ~70% probability
      const role = (player as any).role;
      if (role === 'entrant') {
        return Math.random() < 0.7
          ? { type: 'enter' }
          : { type: 'stay_out' };
      }
      // Incumbent doesn't need to make entry decision
      return null as any;
    }

    if (phase === 'posting') {
      // Compute a price
      const fixedCost = config.fixedCost ?? 500;
      const variableCost = config.variableCost ?? 5;
      const demandIntercept = config.demandIntercept ?? 100;
      const demandSlope = config.demandSlope ?? 1;

      // Monopoly price: maximize (P - VC) * (intercept - P) / slope
      // FOC: P_monopoly = (intercept + VC) / 2
      const monopolyPrice = (demandIntercept + variableCost) / 2;
      const role = (player as any).role;

      let price: number;
      if (role === 'incumbent') {
        // Incumbent prices slightly above competitive (VC) toward monopoly
        price = variableCost + Math.random() * (monopolyPrice - variableCost);
      } else {
        // Entrant slightly undercuts or matches — price between VC and monopoly
        price = variableCost + Math.random() * (monopolyPrice - variableCost);
      }
      return { type: 'post_price', price: r2(Math.max(variableCost, price)) };
    }

    // Other phases: no action needed
    return null as any;
  },
};

// ─── Wool Export Punishment ───────────────────────────────────────────────
export const woolExportPunishmentStrategy: BotStrategy = {
  getSpecializedActions(player, config, _gameState, _roundNumber) {
    const actions: Array<{ action: Record<string, any>; delayMs: number }> = [];
    const role = (player as any).game_data?.role || (player as any).role;

    if (role === 'smuggler') {
      // Smuggle with 60% probability (matching paper's observed rates)
      const decision = Math.random() < 0.6 ? 'smuggle' : 'trade_locally';
      actions.push({
        action: { type: decision },
        delayMs: 1000 + Math.random() * 2000,
      });
    } else if (role === 'harbor_watch') {
      // Reporting depends on punishment level
      const punishmentLevel = config?.punishment_level || 'low';
      // Low punishment: 80% report. High punishment: 15% report (matching paper)
      const reportProb = punishmentLevel === 'high' ? 0.15 : 0.80;
      const decision = Math.random() < reportProb ? 'report' : 'blind_eye';
      actions.push({
        action: { type: decision },
        delayMs: 1500 + Math.random() * 2000,
      });
    }
    // port_merchant and foreign_contact are passive — no action needed

    return actions;
  },
};

// ─── Three Village Trade ─────────────────────────────────────────────────
export const threeVillageTradeStrategy: BotStrategy = {
  getSpecializedActions(player, config, gameState, _roundNumber) {
    const actions: Array<{ action: Record<string, any>; delayMs: number }> = [];
    const phase = gameState?.phase;
    const playerType = (player as any).game_data?.playerType;
    const village = (player as any).game_data?.village;

    if (phase === 'production') {
      // Specialize based on type: Type A -> 85-95% first good, Type B -> 5-15% first good
      const allocation = playerType === 'A'
        ? 85 + Math.floor(Math.random() * 11)  // 85-95
        : 5 + Math.floor(Math.random() * 11);   // 5-15
      actions.push({
        action: { type: 'set_production', allocation },
        delayMs: 500 + Math.random() * 1500,
      });
    }

    if (phase === 'trade') {
      const inventory = gameState?.inventory || {};
      const villageGoods = gameState?.villageGoods || [];
      const importGood = gameState?.importGood;

      // Find good with most surplus
      let maxGood = villageGoods[0];
      let maxAmount = inventory[maxGood] || 0;
      for (const g of villageGoods) {
        if ((inventory[g] || 0) > maxAmount) {
          maxGood = g;
          maxAmount = inventory[g] || 0;
        }
      }

      if (maxAmount >= 2) {
        const offerAmount = Math.floor(maxAmount * 0.4);
        if (offerAmount >= 1) {
          // Want the other local good or import good
          const wantGood = importGood && Math.random() < 0.4
            ? importGood
            : villageGoods.find((g: string) => g !== maxGood) || villageGoods[0];
          const scope = wantGood === importGood ? 'global' : 'local';
          actions.push({
            action: {
              type: 'post_offer',
              offerGood: maxGood,
              offerAmount,
              wantGood,
              wantAmount: Math.max(1, Math.floor(offerAmount * 0.8)),
              scope,
            },
            delayMs: 1000 + Math.random() * 2000,
          });
        }
      }

      // Try to accept an existing offer
      const offers = gameState?.tradeOffers || [];
      const acceptableOffer = offers.find((o: any) =>
        o.status === 'open' &&
        o.playerId !== player.id &&
        (inventory[o.wantGood] || 0) >= o.wantAmount
      );
      if (acceptableOffer) {
        actions.push({
          action: { type: 'accept_offer', offerId: acceptableOffer.id },
          delayMs: 3000 + Math.random() * 2000,
        });
      }
    }

    return actions;
  },
};

// ─── Offer Auction (Sellers Only) ─────────────────────────────────────────
export const offerAuctionStrategy: BotStrategy = {
  getSimultaneousAction(player, _config) {
    // Sellers: offer at 110–150% of cost (strategic markup)
    const cost = Number((player as any).production_cost) || rand(20, 60);
    const markup = rand(1.1, 1.5);
    return { ask: r2(clamp(cost * markup, 0, 999)) };
  },
};

// ─── Bid Auction (Buyers Only) ────────────────────────────────────────────
export const bidAuctionStrategy: BotStrategy = {
  getSimultaneousAction(player, _config) {
    // Buyers: bid at 60–90% of valuation (strategic shading)
    const valuation = Number((player as any).valuation) || rand(30, 80);
    const shade = rand(0.6, 0.9);
    return { bid: r2(clamp(valuation * shade, 0, 999)) };
  },
};

// ─── Electricity Market ───────────────────────────────────────────────────
export const electricityMarketStrategy: BotStrategy = {
  getSimultaneousAction(player, _config) {
    const blocks = (player as any).game_data?.blocks || [
      { mw: 40, marginalCost: 15 },
      { mw: 35, marginalCost: 40 },
      { mw: 25, marginalCost: 75 },
    ];
    const offers = blocks.map((block: any, i: number) => ({
      block: i,
      price: r2(clamp(block.marginalCost * rand(1.05, 1.5), block.marginalCost, 999)),
    }));
    return { offers };
  },
};
