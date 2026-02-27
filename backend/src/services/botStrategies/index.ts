import { BotStrategyRegistry } from './BotStrategyRegistry';

// Simultaneous game strategies
import {
  prisonerDilemmaStrategy,
  beautyContestStrategy,
  publicGoodsStrategy,
  bertrandStrategy,
  cournotStrategy,
  negativeExternalityStrategy,
  commonPoolResourceStrategy,
  stagHuntStrategy,
  dictatorStrategy,
  matchingPenniesStrategy,
} from './SimultaneousBotStrategies';

// Sequential game strategies
import {
  ultimatumStrategy,
  bargainingStrategy,
  giftExchangeStrategy,
  principalAgentStrategy,
  trustGameStrategy,
  marketForLemonsStrategy,
} from './SequentialBotStrategies';

// Double auction strategies
import {
  doubleAuctionStrategy,
  taxSubsidyStrategy,
  priceControlStrategy,
} from './DoubleAuctionBotStrategies';

// Specialized game strategies
import {
  monopolyStrategy,
  comparativeAdvantageStrategy,
  auctionStrategy,
  discoveryProcessStrategy,
} from './SpecializedBotStrategies';

// ─── Register all strategies ───────────────────────────────────────────────

// Simultaneous
BotStrategyRegistry.register('prisoner_dilemma', prisonerDilemmaStrategy);
BotStrategyRegistry.register('beauty_contest', beautyContestStrategy);
BotStrategyRegistry.register('public_goods', publicGoodsStrategy);
BotStrategyRegistry.register('bertrand', bertrandStrategy);
BotStrategyRegistry.register('cournot', cournotStrategy);
BotStrategyRegistry.register('negative_externality', negativeExternalityStrategy);
BotStrategyRegistry.register('common_pool_resource', commonPoolResourceStrategy);
BotStrategyRegistry.register('stag_hunt', stagHuntStrategy);
BotStrategyRegistry.register('dictator', dictatorStrategy);
BotStrategyRegistry.register('matching_pennies', matchingPenniesStrategy);

// Sequential
BotStrategyRegistry.register('ultimatum', ultimatumStrategy);
BotStrategyRegistry.register('bargaining', bargainingStrategy);
BotStrategyRegistry.register('gift_exchange', giftExchangeStrategy);
BotStrategyRegistry.register('principal_agent', principalAgentStrategy);
BotStrategyRegistry.register('trust_game', trustGameStrategy);
BotStrategyRegistry.register('market_for_lemons', marketForLemonsStrategy);

// Double Auction
BotStrategyRegistry.register('double_auction', doubleAuctionStrategy);
BotStrategyRegistry.register('double_auction_tax', taxSubsidyStrategy);
BotStrategyRegistry.register('double_auction_price_controls', priceControlStrategy);

// Specialized
BotStrategyRegistry.register('monopoly', monopolyStrategy);
BotStrategyRegistry.register('comparative_advantage', comparativeAdvantageStrategy);
BotStrategyRegistry.register('auction', auctionStrategy);
BotStrategyRegistry.register('discovery_process', discoveryProcessStrategy);

export { BotStrategyRegistry } from './BotStrategyRegistry';
export type { BotStrategy } from './BotStrategyRegistry';
