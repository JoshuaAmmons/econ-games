import type { Server } from 'socket.io';
import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';
import { PlayerModel } from '../../models/Player';
import { RoundModel } from '../../models/Round';
import { SessionModel } from '../../models/Session';
import { pool } from '../../config/database';

/**
 * Offer Auction — Sellers Only
 * Based on Smith (1964) "Effect of Market Organization on Competitive Equilibrium"
 *
 * All players are sellers with private production costs.
 * A fixed number of units are demanded by the system.
 * Sellers submit sealed offer prices; lowest offers win.
 * Configurable: uniform pricing (all paid highest accepted offer) or
 * discriminative pricing (each paid their own offer).
 */
export class OfferAuctionEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'offer_auction';

  getUIConfig(): UIConfig {
    return {
      name: 'Offer Auction (Sellers Only)',
      description:
        'Sellers compete with sealed offers. Lowest offers win. Tests competitive supply behavior.',
      category: 'simultaneous',
      weekNumber: 32,
      roles: [
        { role: 'seller', label: 'Seller', description: 'Submit a sealed offer price' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        { name: 'market_size', label: 'Number of Sellers', type: 'number', default: 8, min: 2, max: 20 },
        { name: 'num_rounds', label: 'Number of Rounds', type: 'number', default: 10, min: 1, max: 30 },
        { name: 'time_per_round', label: 'Time per Round (seconds)', type: 'number', default: 60, min: 15, max: 300 },
        { name: 'numUnits', label: 'Units Demanded', type: 'number', default: 3, min: 1, max: 15, step: 1, description: 'Number of units the system demands each round' },
        { name: 'costMin', label: 'Minimum Cost ($)', type: 'number', default: 10, min: 0, max: 500, step: 1 },
        { name: 'costMax', label: 'Maximum Cost ($)', type: 'number', default: 100, min: 1, max: 1000, step: 1 },
        {
          name: 'pricingRule',
          label: 'Pricing Rule',
          type: 'select',
          default: 'uniform',
          options: [
            { value: 'uniform', label: 'Uniform (all paid clearing price)' },
            { value: 'discriminative', label: 'Discriminative (each paid own offer)' },
          ],
          description: 'How winning sellers are paid',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const costMin = config.costMin ?? 10;
    const costMax = config.costMax ?? 100;
    const numUnits = config.numUnits ?? 3;
    if (costMin < 0) return { valid: false, error: 'Minimum cost cannot be negative' };
    if (costMax <= 0) return { valid: false, error: 'Maximum cost must be positive' };
    if (costMin >= costMax) return { valid: false, error: 'Min cost must be less than max cost' };
    if (numUnits < 1) return { valid: false, error: 'Must demand at least 1 unit' };
    return { valid: true };
  }

  async setupPlayers(sessionId: string, _playerCount: number, config: Record<string, any>): Promise<void> {
    await this.assignCosts(sessionId, config);
  }

  async onRoundStart(roundId: string, _sessionCode: string, _io: Server): Promise<void> {
    const round = await RoundModel.findById(roundId);
    if (!round) return;
    const session = await SessionModel.findById(round.session_id);
    if (!session) return;
    await this.reassignCosts(session.id, session.game_config || {});
  }

  private async assignCosts(sessionId: string, config: Record<string, any>): Promise<void> {
    const costMin = config.costMin ?? 10;
    const costMax = config.costMax ?? 100;
    const players = await PlayerModel.findBySession(sessionId);
    for (const player of players) {
      const cost = Math.round(costMin + Math.random() * (costMax - costMin));
      await pool.query(
        'UPDATE players SET role = $1, production_cost = $2, valuation = NULL WHERE id = $3',
        ['seller', cost, player.id]
      );
    }
  }

  private async reassignCosts(sessionId: string, config: Record<string, any>): Promise<void> {
    const costMin = config.costMin ?? 10;
    const costMax = config.costMax ?? 100;
    const players = await PlayerModel.findBySession(sessionId);
    for (const player of players) {
      const cost = Math.round(costMin + Math.random() * (costMax - costMin));
      await pool.query('UPDATE players SET production_cost = $1 WHERE id = $2', [cost, player.id]);
    }
  }

  protected validateAction(action: Record<string, any>, _player: any, _config: Record<string, any>): string | null {
    const { ask } = action;
    if (ask === undefined || ask === null) return 'Offer price is required';
    if (typeof ask !== 'number' || isNaN(ask)) return 'Offer must be a valid number';
    if (ask < 0) return 'Offer cannot be negative';
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const numUnits = config.numUnits ?? 3;
    const pricingRule = config.pricingRule ?? 'uniform';

    const sellers = actions.map((a) => {
      const player = allPlayers.find((p) => p.id === a.playerId);
      return {
        playerId: a.playerId,
        playerName: a.playerName,
        ask: a.action.ask as number,
        cost: Number(player?.production_cost) || 0,
      };
    });

    // Sort by ask ascending (lowest offers first)
    const sorted = [...sellers].sort((a, b) => a.ask - b.ask);

    // Accept lowest numUnits offers
    const winnerIds = new Set<string>();
    for (const s of sorted) {
      if (winnerIds.size >= numUnits) break;
      winnerIds.add(s.playerId);
    }

    // Handle ties at the cutoff
    const cutoffAsk = sorted[Math.min(numUnits, sorted.length) - 1]?.ask;
    const tiedAtCutoff = sorted.filter(
      (s) => s.ask === cutoffAsk && !winnerIds.has(s.playerId) && winnerIds.size < numUnits
    );
    for (const tied of tiedAtCutoff.sort(() => Math.random() - 0.5)) {
      if (winnerIds.size >= numUnits) break;
      winnerIds.add(tied.playerId);
    }

    // Determine clearing price
    const acceptedSellers = sorted.filter((s) => winnerIds.has(s.playerId));
    const clearingPrice =
      pricingRule === 'uniform' && acceptedSellers.length > 0
        ? Math.max(...acceptedSellers.map((s) => s.ask))
        : 0;

    // Compute efficiency
    const sortedByCost = [...sellers].sort((a, b) => a.cost - b.cost);
    const efficientCosts = sortedByCost.slice(0, Math.min(numUnits, sortedByCost.length));
    const minTotalCost = efficientCosts.reduce((sum, s) => sum + s.cost, 0);
    const actualWinners = sellers.filter((s) => winnerIds.has(s.playerId));
    const actualTotalCost = actualWinners.reduce((sum, s) => sum + s.cost, 0);
    const efficiency = actualTotalCost > 0 ? Math.round((minTotalCost / actualTotalCost) * 10000) / 100 : 100;

    return sellers.map((seller) => {
      const isWinner = winnerIds.has(seller.playerId);
      const pricePaid = isWinner
        ? pricingRule === 'uniform'
          ? clearingPrice
          : seller.ask
        : 0;
      const profit = isWinner ? pricePaid - seller.cost : 0;
      const rank = sorted.findIndex((s) => s.playerId === seller.playerId) + 1;

      return {
        playerId: seller.playerId,
        profit: Math.round(profit * 100) / 100,
        resultData: {
          role: 'seller',
          ask: seller.ask,
          cost: seller.cost,
          isWinner,
          pricePaid: isWinner ? Math.round(pricePaid * 100) / 100 : null,
          rank,
          numUnits,
          numSellers: sellers.length,
          clearingPrice: Math.round(clearingPrice * 100) / 100,
          cutoffAsk: cutoffAsk ?? 0,
          efficiency,
          pricingRule,
        },
      };
    });
  }
}
