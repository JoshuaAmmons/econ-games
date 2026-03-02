import type { Server } from 'socket.io';
import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';
import { PlayerModel } from '../../models/Player';
import { RoundModel } from '../../models/Round';
import { SessionModel } from '../../models/Session';
import { GameActionModel } from '../../models/GameAction';
import { GameResultModel } from '../../models/GameResult';
import { pool } from '../../config/database';

interface CapacityBlock {
  mw: number;
  marginalCost: number;
}

interface GeneratorData {
  blocks: CapacityBlock[];
  isDominant: boolean;
  totalCapacity: number;
}

/** Demand multipliers: off-peak, shoulder, peak, shoulder */
const DEMAND_CYCLE = [0.5, 0.75, 1.0, 0.75];

/**
 * Electricity Market Experiment
 * Based on Rassenti, Smith & Wilson (2003)
 *
 * Each player is a generator company (Genco) with 3 capacity blocks at
 * different marginal costs. Each round, generators submit per-block offer
 * prices. The system dispatches cheapest offers first (merit order) until
 * demand is met. Tests market power and uniform vs discriminative pricing.
 */
export class ElectricityMarketEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'electricity_market';

  /** Track round numbers per session for demand cycling */
  private sessionRoundNumbers = new Map<string, number>();

  getUIConfig(): UIConfig {
    return {
      name: 'Electricity Market',
      description:
        'Generators submit supply curves. System dispatches cheapest offers to meet demand. Tests market power and pricing rules.',
      category: 'simultaneous',
      weekNumber: 34,
      roles: [
        { role: 'generator', label: 'Generator', description: 'Submit offer prices for your capacity blocks' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        { name: 'market_size', label: 'Number of Generators', type: 'number', default: 4, min: 3, max: 8 },
        { name: 'num_rounds', label: 'Number of Rounds', type: 'number', default: 10, min: 1, max: 20 },
        { name: 'time_per_round', label: 'Time per Round (seconds)', type: 'number', default: 120, min: 60, max: 300 },
        {
          name: 'pricingRule',
          label: 'Pricing Rule',
          type: 'select',
          default: 'uniform',
          options: [
            { value: 'uniform', label: 'Uniform (all paid clearing price)' },
            { value: 'discriminative', label: 'Discriminative (each paid own offer)' },
          ],
        },
        {
          name: 'demandPattern',
          label: 'Demand Pattern',
          type: 'select',
          default: 'cycling',
          options: [
            { value: 'fixed', label: 'Fixed (same each round)' },
            { value: 'cycling', label: 'Cycling (off-peak / shoulder / peak / shoulder)' },
          ],
        },
        { name: 'baseDemand', label: 'Peak Demand (MW)', type: 'number', default: 400, min: 100, max: 1000, step: 10, description: 'Maximum demand level in MW' },
        { name: 'showMarketPower', label: 'Market Power Treatment', type: 'checkbox', default: false, description: 'Give one generator 40% of capacity to demonstrate withholding' },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const baseDemand = config.baseDemand ?? 400;
    if (baseDemand <= 0) return { valid: false, error: 'Peak demand must be positive' };
    return { valid: true };
  }

  async setupPlayers(sessionId: string, _playerCount: number, config: Record<string, any>): Promise<void> {
    await this.assignCapacityBlocks(sessionId, config);
  }

  async onRoundStart(roundId: string, _sessionCode: string, _io: Server): Promise<void> {
    const round = await RoundModel.findById(roundId);
    if (!round) return;
    // Track round number for demand computation
    this.sessionRoundNumbers.set(round.session_id, round.round_number);
  }

  private async assignCapacityBlocks(sessionId: string, config: Record<string, any>): Promise<void> {
    const baseDemand = config.baseDemand ?? 400;
    const showMarketPower = config.showMarketPower ?? false;
    const players = await PlayerModel.findBySession(sessionId);
    const numPlayers = players.length;

    // Total system capacity = 130% of peak demand (overcapacity so merit order matters)
    const totalCapacity = baseDemand * 1.3;

    // Shuffle players to randomize who gets market power
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    for (let i = 0; i < shuffled.length; i++) {
      const player = shuffled[i];
      const isDominant = showMarketPower && i === 0;

      // Assign capacity share
      let playerCapacity: number;
      if (showMarketPower) {
        playerCapacity = isDominant
          ? totalCapacity * 0.4
          : (totalCapacity * 0.6) / (numPlayers - 1);
      } else {
        playerCapacity = totalCapacity / numPlayers;
      }

      // Create 3 capacity blocks with ascending marginal costs
      const blocks: CapacityBlock[] = [
        {
          mw: Math.round(playerCapacity * 0.4),
          marginalCost: Math.round(10 + Math.random() * 15), // [10, 25]
        },
        {
          mw: Math.round(playerCapacity * 0.35),
          marginalCost: Math.round(30 + Math.random() * 25), // [30, 55]
        },
        {
          mw: Math.round(playerCapacity * 0.25),
          marginalCost: Math.round(60 + Math.random() * 40), // [60, 100]
        },
      ];

      const gameData: GeneratorData = {
        blocks,
        isDominant,
        totalCapacity: blocks.reduce((sum, b) => sum + b.mw, 0),
      };

      await pool.query(
        'UPDATE players SET role = $1, game_data = $2 WHERE id = $3',
        ['generator', JSON.stringify(gameData), player.id]
      );
    }
  }

  protected validateAction(action: Record<string, any>, player: any, _config: Record<string, any>): string | null {
    const { offers } = action;
    if (!Array.isArray(offers)) return 'Offers must be an array';
    if (offers.length !== 3) return 'Must submit an offer for each of your 3 capacity blocks';

    const gameData: GeneratorData = player.game_data;
    if (!gameData?.blocks) return 'Generator data not found. Please refresh.';

    const seenBlocks = new Set<number>();
    for (const offer of offers) {
      if (offer.block === undefined || offer.price === undefined) return 'Each offer needs a block index and price';
      if (typeof offer.block !== 'number' || offer.block < 0 || offer.block > 2) return 'Block must be 0, 1, or 2';
      if (seenBlocks.has(offer.block)) return 'Duplicate block index';
      seenBlocks.add(offer.block);

      const price = Number(offer.price);
      if (isNaN(price)) return 'Price must be a valid number';
      const blockCost = gameData.blocks[offer.block].marginalCost;
      if (price < blockCost) return `Block ${offer.block + 1} offer ($${price}) cannot be below marginal cost ($${blockCost})`;
    }

    return null;
  }

  /**
   * Override resolveRound to inject round number into config
   * so calculateResults can compute demand deterministically.
   */
  protected async resolveRound(
    roundId: string,
    sessionCode: string,
    io: Server,
    session: any,
    activePlayers: any[]
  ): Promise<void> {
    const round = await RoundModel.findById(roundId);
    const roundNumber = round?.round_number ?? this.sessionRoundNumbers.get(session.id) ?? 1;

    // Temporarily inject round number into config
    const origConfig = session.game_config;
    session.game_config = { ...origConfig, _roundNumber: roundNumber };
    await super.resolveRound(roundId, sessionCode, io, session, activePlayers);
    session.game_config = origConfig;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const baseDemand = config.baseDemand ?? 400;
    const pricingRule = config.pricingRule ?? 'uniform';
    const demandPattern = config.demandPattern ?? 'cycling';
    const roundNumber = config._roundNumber ?? 1;

    // Compute demand for this round
    const multiplier = demandPattern === 'cycling'
      ? DEMAND_CYCLE[(roundNumber - 1) % DEMAND_CYCLE.length]
      : 1.0;
    const demand = Math.round(baseDemand * multiplier);

    // Build the full offer stack
    interface OfferEntry {
      playerId: string;
      playerName: string;
      blockIndex: number;
      mw: number;
      marginalCost: number;
      offerPrice: number;
    }

    const offerStack: OfferEntry[] = [];
    for (const a of actions) {
      const player = allPlayers.find((p) => p.id === a.playerId);
      const gameData: GeneratorData = player?.game_data;
      if (!gameData?.blocks) continue;

      for (const offer of a.action.offers as Array<{ block: number; price: number }>) {
        const block = gameData.blocks[offer.block];
        offerStack.push({
          playerId: a.playerId,
          playerName: a.playerName,
          blockIndex: offer.block,
          mw: block.mw,
          marginalCost: block.marginalCost,
          offerPrice: Number(offer.price),
        });
      }
    }

    // Sort by offer price ascending (merit order dispatch)
    offerStack.sort((a, b) => a.offerPrice - b.offerPrice || a.marginalCost - b.marginalCost);

    // Dispatch until demand is met
    let remainingDemand = demand;
    const dispatched = new Map<string, { dispatchedMW: number; offerPrice: number; blockIndex: number }[]>();

    let highestDispatchedPrice = 0;
    for (const entry of offerStack) {
      if (remainingDemand <= 0) break;

      const dispatchMW = Math.min(entry.mw, remainingDemand);
      remainingDemand -= dispatchMW;

      if (!dispatched.has(entry.playerId)) dispatched.set(entry.playerId, []);
      dispatched.get(entry.playerId)!.push({
        dispatchedMW: dispatchMW,
        offerPrice: entry.offerPrice,
        blockIndex: entry.blockIndex,
      });

      if (dispatchMW > 0) {
        highestDispatchedPrice = Math.max(highestDispatchedPrice, entry.offerPrice);
      }
    }

    const clearingPrice = pricingRule === 'uniform' ? highestDispatchedPrice : 0;

    // Compute efficient dispatch (sort all blocks by marginal cost) for efficiency metric
    const allBlocks: Array<{ mw: number; marginalCost: number }> = [];
    for (const player of allPlayers) {
      const gd: GeneratorData = player?.game_data;
      if (!gd?.blocks) continue;
      for (const block of gd.blocks) {
        allBlocks.push({ mw: block.mw, marginalCost: block.marginalCost });
      }
    }
    allBlocks.sort((a, b) => a.marginalCost - b.marginalCost);
    let efficientRemaining = demand;
    let minTotalCost = 0;
    for (const block of allBlocks) {
      if (efficientRemaining <= 0) break;
      const used = Math.min(block.mw, efficientRemaining);
      minTotalCost += used * block.marginalCost;
      efficientRemaining -= used;
    }

    // Compute actual total cost
    let actualTotalCost = 0;
    for (const a of actions) {
      const player = allPlayers.find((p) => p.id === a.playerId);
      const gameData: GeneratorData = player?.game_data;
      if (!gameData?.blocks) continue;
      const playerDispatched = dispatched.get(a.playerId) || [];
      for (const d of playerDispatched) {
        actualTotalCost += d.dispatchedMW * gameData.blocks[d.blockIndex].marginalCost;
      }
    }

    const efficiency = actualTotalCost > 0
      ? Math.round((minTotalCost / actualTotalCost) * 10000) / 100
      : 100;

    // Build per-player results
    const results: Array<{ playerId: string; profit: number; resultData: Record<string, any> }> = [];

    // Build full supply curve data for the UI
    const supplyCurve = offerStack.map((entry) => {
      const playerDispatched = dispatched.get(entry.playerId) || [];
      const matchingDispatch = playerDispatched.find((d) => d.blockIndex === entry.blockIndex);
      return {
        playerId: entry.playerId,
        playerName: entry.playerName,
        blockIndex: entry.blockIndex,
        mw: entry.mw,
        marginalCost: entry.marginalCost,
        offerPrice: entry.offerPrice,
        dispatchedMW: matchingDispatch?.dispatchedMW ?? 0,
      };
    });

    for (const a of actions) {
      const player = allPlayers.find((p) => p.id === a.playerId);
      const gameData: GeneratorData = player?.game_data;
      if (!gameData?.blocks) continue;

      const playerDispatched = dispatched.get(a.playerId) || [];

      let totalProfit = 0;
      let totalDispatchedMW = 0;
      let totalRevenue = 0;

      const blockResults = gameData.blocks.map((block, idx) => {
        const d = playerDispatched.find((pd) => pd.blockIndex === idx);
        const dispatchedMW = d?.dispatchedMW ?? 0;
        const offerPrice = (a.action.offers as Array<{ block: number; price: number }>).find((o) => o.block === idx)?.price ?? 0;
        const priceReceived = dispatchedMW > 0
          ? pricingRule === 'uniform'
            ? clearingPrice
            : offerPrice
          : 0;
        const revenue = priceReceived * dispatchedMW;
        const blockProfit = (priceReceived - block.marginalCost) * dispatchedMW;

        totalDispatchedMW += dispatchedMW;
        totalRevenue += revenue;
        totalProfit += blockProfit;

        return {
          mw: block.mw,
          marginalCost: block.marginalCost,
          offerPrice,
          dispatchedMW,
          revenue: Math.round(revenue * 100) / 100,
          blockProfit: Math.round(blockProfit * 100) / 100,
        };
      });

      results.push({
        playerId: a.playerId,
        profit: Math.round(totalProfit * 100) / 100,
        resultData: {
          blocks: blockResults,
          totalDispatchedMW,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          clearingPrice: pricingRule === 'uniform' ? Math.round(clearingPrice * 100) / 100 : null,
          demand,
          pricingRule,
          efficiency,
          isDominant: gameData.isDominant,
          supplyCurve,
        },
      });
    }

    return results;
  }

  async getGameState(
    roundId: string,
    playerId?: string
  ): Promise<Record<string, any>> {
    const baseState = await super.getGameState(roundId, playerId);

    // Add demand info for the current round
    const round = await RoundModel.findById(roundId);
    if (round) {
      const session = await SessionModel.findById(round.session_id);
      if (session) {
        const config = session.game_config || {};
        const baseDemand = config.baseDemand ?? 400;
        const demandPattern = config.demandPattern ?? 'cycling';
        const roundNumber = round.round_number;
        const multiplier = demandPattern === 'cycling'
          ? DEMAND_CYCLE[(roundNumber - 1) % DEMAND_CYCLE.length]
          : 1.0;
        baseState.currentDemand = Math.round(baseDemand * multiplier);
        baseState.demandLabel = demandPattern === 'cycling'
          ? ['Off-Peak', 'Shoulder', 'Peak', 'Shoulder'][(roundNumber - 1) % 4]
          : 'Fixed';
      }
    }

    return baseState;
  }
}
