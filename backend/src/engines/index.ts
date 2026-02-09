/**
 * Engine initialization — registers all game engines with the registry.
 * Import this file once at startup (in app.ts or server.ts).
 */
import { GameRegistry } from './GameRegistry';
import { DoubleAuctionEngine } from './doubleAuction/DoubleAuctionEngine';

// Register all available game engines
GameRegistry.register(new DoubleAuctionEngine());

// Future engines will be registered here as they are implemented:
// GameRegistry.register(new TaxSubsidyEngine());
// GameRegistry.register(new PriceControlsEngine());
// GameRegistry.register(new BertrandEngine());
// GameRegistry.register(new CournotEngine());
// GameRegistry.register(new PublicGoodsEngine());
// GameRegistry.register(new NegativeExternalityEngine());
// GameRegistry.register(new UltimatumEngine());
// GameRegistry.register(new GiftExchangeEngine());
// GameRegistry.register(new PrincipalAgentEngine());
// GameRegistry.register(new ComparativeAdvantageEngine());
// GameRegistry.register(new MonopolyEngine());
// GameRegistry.register(new MarketForLemonsEngine());

export { GameRegistry } from './GameRegistry';
export type { GameEngine, GameType, UIConfig } from './GameEngine';
