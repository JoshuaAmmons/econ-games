import React from 'react';
import type { AnalyticsData } from '../hooks/useAnalyticsData';

/**
 * Props passed to every game-specific analytics component.
 */
export interface AnalyticsProps {
  data: AnalyticsData;
  completedRounds: AnalyticsData['rounds'];
}

/**
 * Registry mapping game types to their analytics components.
 * Components are lazy-loaded for code splitting.
 */
const analyticsRegistry: Record<string, React.LazyExoticComponent<React.ComponentType<AnalyticsProps>>> = {
  double_auction: React.lazy(() => import('./doubleAuction/DAAnalytics')),
  double_auction_tax: React.lazy(() => import('./doubleAuction/DAAnalytics')),
  double_auction_price_controls: React.lazy(() => import('./doubleAuction/DAAnalytics')),
  bertrand: React.lazy(() => import('./simultaneous/BertrandAnalytics')),
  cournot: React.lazy(() => import('./simultaneous/CournotAnalytics')),
  public_goods: React.lazy(() => import('./simultaneous/PublicGoodsAnalytics')),
  negative_externality: React.lazy(() => import('./simultaneous/NegExternalityAnalytics')),
  ultimatum: React.lazy(() => import('./sequential/UltimatumAnalytics')),
  gift_exchange: React.lazy(() => import('./sequential/GiftExchangeAnalytics')),
  principal_agent: React.lazy(() => import('./sequential/PrincipalAgentAnalytics')),
  comparative_advantage: React.lazy(() => import('./specialized/ComparativeAdvantageAnalytics')),
  monopoly: React.lazy(() => import('./specialized/MonopolyAnalytics')),
  market_for_lemons: React.lazy(() => import('./sequential/MarketForLemonsAnalytics')),
  discovery_process: React.lazy(() => import('./specialized/DiscoveryProcessAnalytics')),
  prisoner_dilemma: React.lazy(() => import('./simultaneous/PrisonerDilemmaAnalytics')),
  beauty_contest: React.lazy(() => import('./simultaneous/BeautyContestAnalytics')),
  common_pool_resource: React.lazy(() => import('./simultaneous/CommonPoolResourceAnalytics')),
  stag_hunt: React.lazy(() => import('./simultaneous/StagHuntAnalytics')),
  dictator: React.lazy(() => import('./simultaneous/DictatorAnalytics')),
  trust_game: React.lazy(() => import('./sequential/TrustGameAnalytics')),
  bargaining: React.lazy(() => import('./sequential/BargainingAnalytics')),
  auction: React.lazy(() => import('./simultaneous/AuctionAnalytics')),
  matching_pennies: React.lazy(() => import('./simultaneous/MatchingPenniesAnalytics')),
};

export function getAnalyticsComponent(gameType: string): React.LazyExoticComponent<React.ComponentType<AnalyticsProps>> | null {
  return analyticsRegistry[gameType] || null;
}

export default analyticsRegistry;
