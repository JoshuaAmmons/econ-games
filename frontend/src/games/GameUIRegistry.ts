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
  ultimatum: React.lazy(() => import('./sequential/UltimatumUI')),
  gift_exchange: React.lazy(() => import('./sequential/GiftExchangeUI')),
  principal_agent: React.lazy(() => import('./sequential/PrincipalAgentUI')),
  // comparative_advantage: React.lazy(() => import('./specialized/ComparativeAdvantageUI')),
  // monopoly: React.lazy(() => import('./specialized/MonopolyUI')),
  // market_for_lemons: React.lazy(() => import('./specialized/MarketForLemonsUI')),
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
