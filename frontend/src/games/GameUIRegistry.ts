import React from 'react';
import type { Player, Bid, Ask, Trade, Session } from '../types';

/**
 * Props that every game UI component receives from the Market page.
 */
export interface GameUIProps {
  session: Session;
  player: Player;
  playerId: string;
  code: string;
  connected: boolean;
  roundId: string | null;
  roundNumber: number;
  numRounds: number;
  roundActive: boolean;
  timeRemaining: number;
  onEvent: (event: string, handler: (...args: any[]) => void) => () => void;
  submitAction: (action: Record<string, any>) => void;
  refreshPlayer: () => Promise<void>;
  requestGameState: (roundId: string) => void;
}

/**
 * Extended props for DA-based games that also need order book data
 */
export interface DAGameUIProps extends GameUIProps {
  bids: Bid[];
  asks: Ask[];
  trades: Trade[];
  submitBid: (roundId: string, price: number) => void;
  submitAsk: (roundId: string, price: number) => void;
}

/**
 * Registry mapping game type strings to their React UI components.
 * Components are lazy-loaded to keep bundle size manageable.
 */
const gameUIRegistry: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  double_auction: React.lazy(() => import('./doubleAuction/DoubleAuctionUI')),
  double_auction_tax: React.lazy(() => import('./doubleAuction/TaxSubsidyUI')),
  double_auction_price_controls: React.lazy(() => import('./doubleAuction/PriceControlsUI')),
  bertrand: React.lazy(() => import('./simultaneous/BertrandUI')),
  cournot: React.lazy(() => import('./simultaneous/CournotUI')),
  public_goods: React.lazy(() => import('./simultaneous/PublicGoodsUI')),
  negative_externality: React.lazy(() => import('./simultaneous/NegativeExternalityUI')),
  prisoner_dilemma: React.lazy(() => import('./simultaneous/PrisonerDilemmaUI')),
  beauty_contest: React.lazy(() => import('./simultaneous/BeautyContestUI')),
  common_pool_resource: React.lazy(() => import('./simultaneous/CommonPoolResourceUI')),
  stag_hunt: React.lazy(() => import('./simultaneous/StagHuntUI')),
  dictator: React.lazy(() => import('./simultaneous/DictatorUI')),
  matching_pennies: React.lazy(() => import('./simultaneous/MatchingPenniesUI')),
  auction: React.lazy(() => import('./simultaneous/AuctionUI')),
  ultimatum: React.lazy(() => import('./sequential/UltimatumUI')),
  gift_exchange: React.lazy(() => import('./sequential/GiftExchangeUI')),
  principal_agent: React.lazy(() => import('./sequential/PrincipalAgentUI')),
  trust_game: React.lazy(() => import('./sequential/TrustGameUI')),
  bargaining: React.lazy(() => import('./sequential/BargainingUI')),
  comparative_advantage: React.lazy(() => import('./specialized/ComparativeAdvantageUI')),
  monopoly: React.lazy(() => import('./specialized/MonopolyUI')),
  market_for_lemons: React.lazy(() => import('./specialized/MarketForLemonsUI')),
  discovery_process: React.lazy(() => import('./specialized/DiscoveryProcessUI')),
  ellsberg: React.lazy(() => import('./simultaneous/EllsbergUI')),
  newsvendor: React.lazy(() => import('./simultaneous/NewsvendorUI')),
  dutch_auction: React.lazy(() => import('./simultaneous/DutchAuctionUI')),
  english_auction: React.lazy(() => import('./simultaneous/EnglishAuctionUI')),
  discriminative_auction: React.lazy(() => import('./simultaneous/DiscriminativeAuctionUI')),
  posted_offer: React.lazy(() => import('./specialized/PostedOfferUI')),
  lindahl: React.lazy(() => import('./simultaneous/LindahlUI')),
  pg_auction: React.lazy(() => import('./simultaneous/PGAuctionUI')),
  sealed_bid_offer: React.lazy(() => import('./simultaneous/SealedBidOfferUI')),
  sponsored_search: React.lazy(() => import('./simultaneous/SponsoredSearchUI')),
  asset_bubble: React.lazy(() => import('./specialized/AssetBubbleUI')),
  contestable_market: React.lazy(() => import('./specialized/ContestableMarketUI')),
  double_dutch_auction: React.lazy(() => import('./simultaneous/DoubleDutchAuctionUI')),
  wool_export_punishment: React.lazy(() => import('./specialized/WoolExportPunishmentUI')),
  three_village_trade: React.lazy(() => import('./specialized/ThreeVillageTradeUI')),
};

/**
 * Get the UI component for a given game type.
 * Falls back to DoubleAuctionUI if type not found.
 */
export function getGameUI(gameType: string): React.LazyExoticComponent<React.ComponentType<any>> {
  return gameUIRegistry[gameType] || gameUIRegistry['double_auction'];
}

/**
 * Check if a game type has a registered UI
 */
export function hasGameUI(gameType: string): boolean {
  return gameType in gameUIRegistry;
}

export default gameUIRegistry;
