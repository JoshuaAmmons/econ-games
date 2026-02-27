/**
 * Engine initialization — registers all game engines with the registry.
 * Import this file once at startup (in app.ts or server.ts).
 */
import { GameRegistry } from './GameRegistry';
import { DoubleAuctionEngine } from './doubleAuction/DoubleAuctionEngine';
import { TaxSubsidyEngine } from './doubleAuction/TaxSubsidyEngine';
import { PriceControlsEngine } from './doubleAuction/PriceControlsEngine';
import { BertrandEngine } from './simultaneous/BertrandEngine';
import { CournotEngine } from './simultaneous/CournotEngine';
import { PublicGoodsEngine } from './simultaneous/PublicGoodsEngine';
import { NegativeExternalityEngine } from './simultaneous/NegativeExternalityEngine';
import { UltimatumEngine } from './sequential/UltimatumEngine';
import { GiftExchangeEngine } from './sequential/GiftExchangeEngine';
import { PrincipalAgentEngine } from './sequential/PrincipalAgentEngine';
import { ComparativeAdvantageEngine } from './specialized/ComparativeAdvantageEngine';
import { MonopolyEngine } from './specialized/MonopolyEngine';
import { MarketForLemonsEngine } from './specialized/MarketForLemonsEngine';
import { DiscoveryProcessEngine } from './specialized/DiscoveryProcessEngine';
import { PrisonerDilemmaEngine } from './simultaneous/PrisonerDilemmaEngine';
import { BeautyContestEngine } from './simultaneous/BeautyContestEngine';
import { CommonPoolResourceEngine } from './simultaneous/CommonPoolResourceEngine';
import { StagHuntEngine } from './simultaneous/StagHuntEngine';
import { DictatorEngine } from './simultaneous/DictatorEngine';
import { MatchingPenniesEngine } from './simultaneous/MatchingPenniesEngine';
import { TrustGameEngine } from './sequential/TrustGameEngine';
import { BargainingEngine } from './sequential/BargainingEngine';
import { AuctionEngine } from './specialized/AuctionEngine';
import { EllsbergEngine } from './simultaneous/EllsbergEngine';
import { NewsvendorEngine } from './simultaneous/NewsvendorEngine';
import { DutchAuctionEngine } from './specialized/DutchAuctionEngine';
import { EnglishAuctionEngine } from './specialized/EnglishAuctionEngine';
import { DiscriminativeAuctionEngine } from './specialized/DiscriminativeAuctionEngine';

// Register all available game engines
GameRegistry.register(new DoubleAuctionEngine());
GameRegistry.register(new TaxSubsidyEngine());
GameRegistry.register(new PriceControlsEngine());
GameRegistry.register(new BertrandEngine());
GameRegistry.register(new CournotEngine());
GameRegistry.register(new PublicGoodsEngine());
GameRegistry.register(new NegativeExternalityEngine());
GameRegistry.register(new UltimatumEngine());
GameRegistry.register(new GiftExchangeEngine());
GameRegistry.register(new PrincipalAgentEngine());
GameRegistry.register(new ComparativeAdvantageEngine());
GameRegistry.register(new MonopolyEngine());
GameRegistry.register(new MarketForLemonsEngine());
GameRegistry.register(new DiscoveryProcessEngine());
GameRegistry.register(new PrisonerDilemmaEngine());
GameRegistry.register(new BeautyContestEngine());
GameRegistry.register(new CommonPoolResourceEngine());
GameRegistry.register(new StagHuntEngine());
GameRegistry.register(new DictatorEngine());
GameRegistry.register(new MatchingPenniesEngine());
GameRegistry.register(new TrustGameEngine());
GameRegistry.register(new BargainingEngine());
GameRegistry.register(new AuctionEngine());
GameRegistry.register(new EllsbergEngine());
GameRegistry.register(new NewsvendorEngine());
GameRegistry.register(new DutchAuctionEngine());
GameRegistry.register(new EnglishAuctionEngine());
GameRegistry.register(new DiscriminativeAuctionEngine());

export { GameRegistry } from './GameRegistry';
export type { GameEngine, GameType, UIConfig } from './GameEngine';
