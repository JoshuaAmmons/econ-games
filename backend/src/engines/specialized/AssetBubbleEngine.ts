import crypto from 'crypto';
import type { Server } from 'socket.io';
import type {
  GameEngine,
  GameType,
  UIConfig,
  ValidationResult,
  ActionResult,
  RoundResult,
} from '../GameEngine';
import { GameActionModel } from '../../models/GameAction';
import { GameResultModel } from '../../models/GameResult';
import { PlayerModel } from '../../models/Player';
import { RoundModel } from '../../models/Round';
import { SessionModel } from '../../models/Session';
import { pool } from '../../config/database';

// ============================================================================
// Types
// ============================================================================

interface OrderEntry {
  id: string;         // uuid
  playerId: string;
  playerName: string;
  price: number;      // cents
  timestamp: number;
}

interface TradeEntry {
  id: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  price: number;      // cents
  timestamp: number;
  round: number;
}

interface Portfolio {
  cash: number;       // cents
  shares: number;
}

interface RoundState {
  bids: OrderEntry[];
  asks: OrderEntry[];
  trades: TradeEntry[];
  portfolios: Map<string, Portfolio>;
  dividendDrawn: number | null;
  roundNumber: number;
  totalRounds: number;
  sessionId: string;
}

interface DividendHistoryEntry {
  round: number;
  dividend: number;
  fundamentalValue: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_NUM_ROUNDS = 15;
const DEFAULT_SHARES_PER_PLAYER = 3;
const DEFAULT_STARTING_CASH = 385; // cents — matches SSW 1988 average (Type A=550, Type B=180)
const DEFAULT_DIVIDEND_VALUES = [0, 8, 28, 60]; // cents, equally likely

// ============================================================================
// Engine
// ============================================================================

/**
 * Asset Market Bubble Engine (Week 29)
 *
 * Based on: Smith, Suchanek & Williams (1988) "Bubbles, Crashes, and
 * Endogenous Expectations in Experimental Spot Asset Markets",
 * Econometrica 56(5), pp. 1119-1151.
 *
 * Players trade a finitely-lived asset over multiple periods. Each period
 * the asset pays a random dividend drawn uniformly from a known set.
 * The fundamental value equals E[dividend] x periods remaining.
 *
 * Classic finding: even with common knowledge of the dividend process and
 * a finite horizon, prices consistently bubble above fundamental value
 * before crashing toward it in the final periods.
 *
 * All players are "traders" — anyone can submit bids (offers to buy) or
 * asks (offers to sell). Portfolios (cash + shares) persist across rounds.
 * After the final round the asset expires worthless and final wealth = cash.
 */
export class AssetBubbleEngine implements GameEngine {
  readonly gameType: GameType = 'asset_bubble';

  // In-memory round states keyed by roundId
  private roundStates = new Map<string, RoundState>();

  // Serialize trade matching per round to prevent duplicate trades
  private tradeMatchLocks = new Map<string, Promise<void>>();

  // ========================================================================
  // UIConfig
  // ========================================================================

  getUIConfig(): UIConfig {
    return {
      name: 'Asset Market Bubble',
      description: 'Trade a finitely-lived asset that pays random dividends. Watch for bubbles!',
      category: 'specialized',
      weekNumber: 29,
      roles: [
        {
          role: 'trader',
          label: 'Trader',
          description: 'Buy and sell shares of a dividend-paying asset',
        },
      ],
      usesOrderBook: false,  // We manage our own order book
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Number of Traders',
          type: 'number',
          default: 9,
          min: 3,
          max: 30,
        },
        {
          name: 'num_rounds',
          label: 'Number of Periods',
          type: 'number',
          default: DEFAULT_NUM_ROUNDS,
          min: 5,
          max: 30,
        },
        {
          name: 'time_per_round',
          label: 'Time per Period (seconds)',
          type: 'number',
          default: 120,
          min: 30,
          max: 300,
        },
        {
          name: 'shares_per_player',
          label: 'Starting Shares per Player',
          type: 'number',
          default: DEFAULT_SHARES_PER_PLAYER,
          min: 1,
          max: 10,
        },
        {
          name: 'starting_cash',
          label: 'Starting Cash (cents)',
          type: 'number',
          default: DEFAULT_STARTING_CASH,
          min: 50,
          max: 50000,
          description: 'SSW (1988) paper used avg ~385¢. Cash scarcity drives trading dynamics.',
        },
        {
          name: 'endowment_type',
          label: 'Endowment Type',
          type: 'select',
          default: 'equal',
          options: [
            { value: 'equal', label: 'Equal' },
            { value: 'ssw_1988', label: 'SSW 1988 (Asymmetric)' },
          ],
          description: 'SSW 1988: 5/9 get (2 shares, 550¢), 4/9 get (4 shares, 180¢)',
        },
        {
          name: 'show_fundamental_value',
          label: 'Show Fundamental Value',
          type: 'checkbox',
          default: true,
          description: 'Show the theoretical FV line on charts',
        },
      ],
    };
  }

  // ========================================================================
  // Validation
  // ========================================================================

  validateConfig(config: Record<string, any>): ValidationResult {
    const sharesPerPlayer = config.shares_per_player ?? DEFAULT_SHARES_PER_PLAYER;
    const startingCash = config.starting_cash ?? DEFAULT_STARTING_CASH;

    if (sharesPerPlayer < 1) {
      return { valid: false, error: 'Starting shares must be at least 1' };
    }
    if (startingCash < 100) {
      return { valid: false, error: 'Starting cash must be at least 100 cents' };
    }
    if (config.market_size !== undefined && config.market_size < 3) {
      return { valid: false, error: 'Need at least 3 traders' };
    }
    return { valid: true };
  }

  // ========================================================================
  // setupPlayers
  // ========================================================================

  /**
   * All players are traders. Initialize their game_data with starting portfolio.
   * Supports SSW (1988) asymmetric endowments: Type A (cash-rich, share-poor)
   * and Type B (share-rich, cash-poor).
   */
  async setupPlayers(
    sessionId: string,
    _playerCount: number,
    config: Record<string, any>
  ): Promise<void> {
    const endowmentType = config.endowment_type ?? 'equal';
    const players = await PlayerModel.findBySession(sessionId);
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    if (endowmentType === 'ssw_1988') {
      // SSW (1988) Design #2: 5/9 get Type A (2 shares, 550¢), 4/9 get Type B (4 shares, 180¢)
      // Scale proportionally if not exactly 9 players
      const typeACount = Math.ceil(shuffled.length * 5 / 9);
      for (let i = 0; i < shuffled.length; i++) {
        const isTypeA = i < typeACount;
        const portfolio: Portfolio = isTypeA
          ? { cash: 550, shares: 2 }
          : { cash: 180, shares: 4 };
        await pool.query(
          `UPDATE players SET role = 'trader', game_data = $1 WHERE id = $2`,
          [JSON.stringify(portfolio), shuffled[i].id]
        );
      }
      console.log(`[AssetBubble] SSW 1988 endowments: ${typeACount} Type A (2 shares, 550¢) + ${shuffled.length - typeACount} Type B (4 shares, 180¢)`);
    } else {
      // Equal endowments
      const sharesPerPlayer = config.shares_per_player ?? DEFAULT_SHARES_PER_PLAYER;
      const startingCash = config.starting_cash ?? DEFAULT_STARTING_CASH;
      for (const player of players) {
        const portfolio: Portfolio = { cash: startingCash, shares: sharesPerPlayer };
        await pool.query(
          `UPDATE players SET role = 'trader', game_data = $1 WHERE id = $2`,
          [JSON.stringify(portfolio), player.id]
        );
      }
      console.log(`[AssetBubble] Equal endowments: ${players.length} traders with ${sharesPerPlayer} shares and ${startingCash}c each`);
    }
  }

  // ========================================================================
  // onRoundStart
  // ========================================================================

  async onRoundStart(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<void> {
    const round = await RoundModel.findById(roundId);
    if (!round) return;

    const session = await SessionModel.findById(round.session_id);
    if (!session) return;

    const config = session.game_config || {};
    const totalRounds = session.num_rounds || config.num_rounds || DEFAULT_NUM_ROUNDS;

    // Load player portfolios
    const players = await PlayerModel.findActiveBySession(session.id);
    const portfolios = new Map<string, Portfolio>();

    if (round.round_number === 1) {
      // Round 1: read initial portfolios from game_data (set by setupPlayers)
      for (const p of players) {
        const gd = p.game_data as Portfolio | undefined;
        portfolios.set(p.id, {
          cash: gd?.cash ?? (config.starting_cash ?? DEFAULT_STARTING_CASH),
          shares: gd?.shares ?? (config.shares_per_player ?? DEFAULT_SHARES_PER_PLAYER),
        });
      }
    } else {
      // Round N>1: load portfolios from previous round's game_results
      const prevRound = await RoundModel.findBySessionAndNumber(session.id, round.round_number - 1);
      if (prevRound) {
        const prevResults = await GameResultModel.findByRound(prevRound.id);
        for (const result of prevResults) {
          const rd = result.result_data;
          portfolios.set(result.player_id, {
            cash: rd.cash ?? 0,
            shares: rd.shares ?? 0,
          });
        }
      }

      // Fill in any players missing from previous results (e.g., late joiners)
      for (const p of players) {
        if (!portfolios.has(p.id)) {
          const gd = p.game_data as Portfolio | undefined;
          portfolios.set(p.id, {
            cash: gd?.cash ?? 0,
            shares: gd?.shares ?? 0,
          });
        }
      }
    }

    // Create new round state with empty order book
    const state: RoundState = {
      bids: [],
      asks: [],
      trades: [],
      portfolios,
      dividendDrawn: null,
      roundNumber: round.round_number,
      totalRounds,
      sessionId: session.id,
    };

    this.roundStates.set(roundId, state);

    // Build dividend history from previous rounds
    const dividendHistory = await this.getDividendHistory(session.id, config);

    // Compute fundamental value info
    const dividendValues = config.dividend_values ?? DEFAULT_DIVIDEND_VALUES;
    const expectedDividend = dividendValues.reduce((s: number, v: number) => s + v, 0) / dividendValues.length;
    const periodsRemaining = totalRounds - round.round_number + 1;
    const fundamentalValue = Math.round(expectedDividend * periodsRemaining * 100) / 100;

    // Broadcast game state to all players
    io.to(`market-${sessionCode}`).emit('game-state', {
      gameType: 'asset_bubble',
      roundNumber: round.round_number,
      totalRounds,
      bids: [],
      asks: [],
      trades: [],
      dividendHistory,
      fundamentalValue: config.show_fundamental_value !== false ? fundamentalValue : null,
      expectedDividend,
      periodsRemaining,
      dividendValues,
      showFundamentalValue: config.show_fundamental_value !== false,
    });

    console.log(`[AssetBubble] Round ${round.round_number}/${totalRounds} started — FV=${fundamentalValue}c, ${players.length} traders`);
  }

  // ========================================================================
  // handleAction
  // ========================================================================

  async handleAction(
    roundId: string,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    const state = this.roundStates.get(roundId);
    if (!state) {
      return { success: false, error: 'Round not initialized' };
    }

    // Guard: only accept actions while round is active
    const round = await RoundModel.findById(roundId);
    if (!round || round.status !== 'active') {
      return { success: false, error: 'Round is not active' };
    }

    const player = await PlayerModel.findById(playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    const portfolio = state.portfolios.get(playerId);
    if (!portfolio) {
      return { success: false, error: 'Player portfolio not found' };
    }

    const { type } = action;

    switch (type) {
      case 'bid':
        return this.handleBid(state, roundId, playerId, player, portfolio, action, sessionCode, io);
      case 'ask':
        return this.handleAsk(state, roundId, playerId, player, portfolio, action, sessionCode, io);
      case 'cancel_bid':
        return this.handleCancelBid(state, roundId, playerId, action, sessionCode, io);
      case 'cancel_ask':
        return this.handleCancelAsk(state, roundId, playerId, action, sessionCode, io);
      default:
        return { success: false, error: `Unknown action type: ${type}` };
    }
  }

  // --------------------------------------------------------------------------
  // bid
  // --------------------------------------------------------------------------

  private async handleBid(
    state: RoundState,
    roundId: string,
    playerId: string,
    player: any,
    portfolio: Portfolio,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    const price = Number(action.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { success: false, error: 'Price must be a positive number' };
    }
    if (Math.round(price) !== price) {
      return { success: false, error: 'Price must be a whole number (cents)' };
    }

    // Check player has enough cash: price <= cash minus value of outstanding bids
    const outstandingBidValue = state.bids
      .filter(b => b.playerId === playerId)
      .reduce((sum, b) => sum + b.price, 0);
    const availableCash = portfolio.cash - outstandingBidValue;

    if (price > availableCash) {
      return {
        success: false,
        error: `Insufficient cash. Available: ${availableCash}c (${portfolio.cash}c total - ${outstandingBidValue}c in outstanding bids)`,
      };
    }

    // Create the bid entry
    const bid: OrderEntry = {
      id: crypto.randomUUID(),
      playerId,
      playerName: player.name || 'Trader',
      price,
      timestamp: Date.now(),
    };

    state.bids.push(bid);

    // Store action in DB
    await GameActionModel.create(roundId, playerId, 'bid', {
      orderId: bid.id,
      price,
    });

    // Broadcast new bid
    io.to(`market-${sessionCode}`).emit('order-submitted', {
      orderType: 'bid',
      order: {
        id: bid.id,
        playerId: bid.playerId,
        playerName: bid.playerName,
        price: bid.price,
        timestamp: bid.timestamp,
      },
    });

    // Check for trade matches
    await this.checkAndExecuteTrades(state, roundId, sessionCode, io);

    return { success: true };
  }

  // --------------------------------------------------------------------------
  // ask
  // --------------------------------------------------------------------------

  private async handleAsk(
    state: RoundState,
    roundId: string,
    playerId: string,
    player: any,
    portfolio: Portfolio,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    const price = Number(action.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { success: false, error: 'Price must be a positive number' };
    }
    if (Math.round(price) !== price) {
      return { success: false, error: 'Price must be a whole number (cents)' };
    }

    // Check player has available shares: shares > number of outstanding asks
    const outstandingAskCount = state.asks.filter(a => a.playerId === playerId).length;
    const availableShares = portfolio.shares - outstandingAskCount;

    if (availableShares <= 0) {
      return {
        success: false,
        error: `No shares available to sell. You have ${portfolio.shares} share(s) with ${outstandingAskCount} outstanding ask(s)`,
      };
    }

    // Create the ask entry
    const ask: OrderEntry = {
      id: crypto.randomUUID(),
      playerId,
      playerName: player.name || 'Trader',
      price,
      timestamp: Date.now(),
    };

    state.asks.push(ask);

    // Store action in DB
    await GameActionModel.create(roundId, playerId, 'ask', {
      orderId: ask.id,
      price,
    });

    // Broadcast new ask
    io.to(`market-${sessionCode}`).emit('order-submitted', {
      orderType: 'ask',
      order: {
        id: ask.id,
        playerId: ask.playerId,
        playerName: ask.playerName,
        price: ask.price,
        timestamp: ask.timestamp,
      },
    });

    // Check for trade matches
    await this.checkAndExecuteTrades(state, roundId, sessionCode, io);

    return { success: true };
  }

  // --------------------------------------------------------------------------
  // cancel_bid
  // --------------------------------------------------------------------------

  private async handleCancelBid(
    state: RoundState,
    roundId: string,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    const { orderId } = action;
    if (!orderId) {
      return { success: false, error: 'orderId is required to cancel a bid' };
    }

    const bidIndex = state.bids.findIndex(b => b.id === orderId && b.playerId === playerId);
    if (bidIndex === -1) {
      return { success: false, error: 'Bid not found or does not belong to you' };
    }

    state.bids.splice(bidIndex, 1);

    // Store cancellation in DB
    await GameActionModel.create(roundId, playerId, 'cancel_bid', { orderId });

    // Broadcast cancellation
    io.to(`market-${sessionCode}`).emit('order-cancelled', {
      orderType: 'bid',
      orderId,
      playerId,
    });

    return { success: true };
  }

  // --------------------------------------------------------------------------
  // cancel_ask
  // --------------------------------------------------------------------------

  private async handleCancelAsk(
    state: RoundState,
    roundId: string,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    const { orderId } = action;
    if (!orderId) {
      return { success: false, error: 'orderId is required to cancel an ask' };
    }

    const askIndex = state.asks.findIndex(a => a.id === orderId && a.playerId === playerId);
    if (askIndex === -1) {
      return { success: false, error: 'Ask not found or does not belong to you' };
    }

    state.asks.splice(askIndex, 1);

    // Store cancellation in DB
    await GameActionModel.create(roundId, playerId, 'cancel_ask', { orderId });

    // Broadcast cancellation
    io.to(`market-${sessionCode}`).emit('order-cancelled', {
      orderType: 'ask',
      orderId,
      playerId,
    });

    return { success: true };
  }

  // ========================================================================
  // Trade matching (with lock serialization)
  // ========================================================================

  private async checkAndExecuteTrades(
    state: RoundState,
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<void> {
    const prevLock = this.tradeMatchLocks.get(roundId) || Promise.resolve();
    const currentLock = prevLock.then(() =>
      this.executeTradeMatching(state, roundId, sessionCode, io)
    );
    this.tradeMatchLocks.set(roundId, currentLock.catch(() => {}));
    await currentLock;
  }

  private async executeTradeMatching(
    state: RoundState,
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<void> {
    try {
      // Sort bids DESC by price (highest bid first), then by timestamp ASC (FIFO)
      const sortedBids = [...state.bids].sort((a, b) =>
        b.price - a.price || a.timestamp - b.timestamp
      );

      // Sort asks ASC by price (lowest ask first), then by timestamp ASC (FIFO)
      const sortedAsks = [...state.asks].sort((a, b) =>
        a.price - b.price || a.timestamp - b.timestamp
      );

      let bidIdx = 0;
      let askIdx = 0;

      while (bidIdx < sortedBids.length && askIdx < sortedAsks.length) {
        const bid = sortedBids[bidIdx];
        const ask = sortedAsks[askIdx];

        // Cannot trade with yourself
        if (bid.playerId === ask.playerId) {
          // Skip this ask, try the next one
          askIdx++;
          continue;
        }

        // Check if trade is possible
        if (bid.price < ask.price) {
          break; // No more matches possible
        }

        // Execute trade at the ask price (the ask was there as a standing offer)
        const tradePrice = ask.price;

        // Get portfolios
        const buyerPortfolio = state.portfolios.get(bid.playerId);
        const sellerPortfolio = state.portfolios.get(ask.playerId);

        if (!buyerPortfolio || !sellerPortfolio) {
          bidIdx++;
          askIdx++;
          continue;
        }

        // Final safety checks
        // Buyer must still have enough cash (accounting for other pending bids that may have executed)
        if (buyerPortfolio.cash < tradePrice) {
          bidIdx++;
          continue;
        }

        // Seller must still have shares
        if (sellerPortfolio.shares <= 0) {
          askIdx++;
          continue;
        }

        // Execute: update in-memory portfolios
        buyerPortfolio.cash -= tradePrice;
        buyerPortfolio.shares += 1;
        sellerPortfolio.cash += tradePrice;
        sellerPortfolio.shares -= 1;

        // Create trade record
        const trade: TradeEntry = {
          id: crypto.randomUUID(),
          buyerId: bid.playerId,
          buyerName: bid.playerName,
          sellerId: ask.playerId,
          sellerName: ask.playerName,
          price: tradePrice,
          timestamp: Date.now(),
          round: state.roundNumber,
        };

        state.trades.push(trade);

        // Remove matched bid and ask from the order book
        const bidBookIdx = state.bids.findIndex(b => b.id === bid.id);
        if (bidBookIdx !== -1) state.bids.splice(bidBookIdx, 1);
        const askBookIdx = state.asks.findIndex(a => a.id === ask.id);
        if (askBookIdx !== -1) state.asks.splice(askBookIdx, 1);

        // Store trade action in DB
        await GameActionModel.create(roundId, bid.playerId, 'trade', {
          tradeId: trade.id,
          price: tradePrice,
          role: 'buyer',
          counterpartyId: ask.playerId,
          bidId: bid.id,
          askId: ask.id,
        });
        await GameActionModel.create(roundId, ask.playerId, 'trade', {
          tradeId: trade.id,
          price: tradePrice,
          role: 'seller',
          counterpartyId: bid.playerId,
          bidId: bid.id,
          askId: ask.id,
        });

        // Broadcast trade
        io.to(`market-${sessionCode}`).emit('trade-executed', {
          trade: {
            id: trade.id,
            buyerId: trade.buyerId,
            buyerName: trade.buyerName,
            sellerId: trade.sellerId,
            sellerName: trade.sellerName,
            price: trade.price,
            timestamp: trade.timestamp,
            round: trade.round,
          },
          // Send updated portfolio info to all players (each player checks their own)
          portfolioUpdates: {
            [bid.playerId]: { cash: buyerPortfolio.cash, shares: buyerPortfolio.shares },
            [ask.playerId]: { cash: sellerPortfolio.cash, shares: sellerPortfolio.shares },
          },
        });

        console.log(
          `[AssetBubble] Trade: ${bid.playerName} bought from ${ask.playerName} at ${tradePrice}c`
        );

        // Move to next pair (both bid and ask consumed)
        bidIdx++;
        askIdx++;
      }

      // Also cancel any bids/asks from players who can no longer afford them
      // after trades have executed (stale orders)
      this.pruneStaleOrders(state);

      // Broadcast updated order book
      io.to(`market-${sessionCode}`).emit('order-book-update', {
        bids: state.bids.map(b => ({
          id: b.id,
          playerId: b.playerId,
          playerName: b.playerName,
          price: b.price,
          timestamp: b.timestamp,
        })),
        asks: state.asks.map(a => ({
          id: a.id,
          playerId: a.playerId,
          playerName: a.playerName,
          price: a.price,
          timestamp: a.timestamp,
        })),
      });
    } catch (error) {
      console.error('[AssetBubble] Error in trade matching:', error);
    }
  }

  /**
   * Remove orders that are no longer valid after trades have executed.
   * - Bids where the player can no longer afford them
   * - Asks where the player no longer has enough shares
   */
  private pruneStaleOrders(state: RoundState): void {
    // Prune bids: check cumulative bid exposure vs cash
    const bidsByPlayer = new Map<string, OrderEntry[]>();
    for (const bid of state.bids) {
      const list = bidsByPlayer.get(bid.playerId) || [];
      list.push(bid);
      bidsByPlayer.set(bid.playerId, list);
    }
    for (const [pid, bids] of bidsByPlayer) {
      const portfolio = state.portfolios.get(pid);
      if (!portfolio) continue;

      // Sort by price DESC (keep higher bids, prune cheaper ones first — but
      // actually prune those that push us over budget)
      bids.sort((a, b) => a.timestamp - b.timestamp); // FIFO: keep earliest
      let cumulative = 0;
      for (const bid of bids) {
        cumulative += bid.price;
        if (cumulative > portfolio.cash) {
          // Remove this bid and all subsequent
          const idx = state.bids.findIndex(b => b.id === bid.id);
          if (idx !== -1) state.bids.splice(idx, 1);
        }
      }
    }

    // Prune asks: check outstanding asks vs shares held
    const asksByPlayer = new Map<string, OrderEntry[]>();
    for (const ask of state.asks) {
      const list = asksByPlayer.get(ask.playerId) || [];
      list.push(ask);
      asksByPlayer.set(ask.playerId, list);
    }
    for (const [pid, asks] of asksByPlayer) {
      const portfolio = state.portfolios.get(pid);
      if (!portfolio) continue;

      asks.sort((a, b) => a.timestamp - b.timestamp); // FIFO
      while (asks.length > portfolio.shares) {
        const stale = asks.pop()!;
        const askIdx = state.asks.findIndex(a => a.id === stale.id);
        if (askIdx !== -1) state.asks.splice(askIdx, 1);
      }
    }
  }

  // ========================================================================
  // processRoundEnd
  // ========================================================================

  async processRoundEnd(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<RoundResult> {
    const state = this.roundStates.get(roundId);
    const round = await RoundModel.findById(roundId);
    if (!round) return { playerResults: [], summary: {} };

    const session = await SessionModel.findById(round.session_id);
    if (!session) return { playerResults: [], summary: {} };

    const config = session.game_config || {};
    const totalRounds = session.num_rounds || config.num_rounds || DEFAULT_NUM_ROUNDS;
    const dividendValues = config.dividend_values ?? DEFAULT_DIVIDEND_VALUES;
    const isFinalRound = round.round_number >= totalRounds;

    // 1. Draw random dividend
    const dividend = dividendValues[Math.floor(Math.random() * dividendValues.length)];
    if (state) {
      state.dividendDrawn = dividend;
    }

    // Get all players
    const players = await PlayerModel.findActiveBySession(session.id);

    // Build portfolios map (use state if available, otherwise fall back to game_data)
    const portfolios = new Map<string, Portfolio>();
    for (const p of players) {
      if (state && state.portfolios.has(p.id)) {
        portfolios.set(p.id, { ...state.portfolios.get(p.id)! });
      } else {
        const gd = p.game_data as Portfolio | undefined;
        portfolios.set(p.id, { cash: gd?.cash ?? 0, shares: gd?.shares ?? 0 });
      }
    }

    // 2. Pay dividend to each player: cash += dividend * shares_held
    for (const [pid, portfolio] of portfolios) {
      portfolio.cash += dividend * portfolio.shares;
    }

    // 3. Compute fundamental value info
    const expectedDividend = dividendValues.reduce((s: number, v: number) => s + v, 0) / dividendValues.length;
    const periodsRemaining = totalRounds - round.round_number; // After this round
    const fundamentalValueAfter = Math.round(expectedDividend * periodsRemaining * 100) / 100;
    const fundamentalValueBefore = Math.round(expectedDividend * (periodsRemaining + 1) * 100) / 100;

    // 4. Compute trade stats for this round
    const tradesThisRound = state?.trades ?? [];
    const avgPrice = tradesThisRound.length > 0
      ? Math.round(tradesThisRound.reduce((s, t) => s + t.price, 0) / tradesThisRound.length * 100) / 100
      : 0;

    // 5. Build player results and save
    const playerResults: Array<{ playerId: string; profit: number; resultData: Record<string, any> }> = [];

    // Compute starting cash for profit calculation
    const startingCash = config.starting_cash ?? DEFAULT_STARTING_CASH;
    const startingShares = config.shares_per_player ?? DEFAULT_SHARES_PER_PLAYER;
    const initialWealth = startingCash + startingShares * expectedDividend * totalRounds;

    for (const player of players) {
      const portfolio = portfolios.get(player.id)!;

      // On final round: asset expires, final wealth = cash only
      const finalWealth = isFinalRound ? portfolio.cash : (portfolio.cash + portfolio.shares * fundamentalValueAfter);
      const totalProfit = Math.round((portfolio.cash - startingCash) * 100) / 100;

      // Count trades this player was involved in this round
      const playerTradesThisRound = tradesThisRound.filter(
        t => t.buyerId === player.id || t.sellerId === player.id
      ).length;

      // Dividend income this round
      const dividendIncome = dividend * portfolio.shares;

      const resultData: Record<string, any> = {
        cash: portfolio.cash,
        shares: portfolio.shares,
        dividend,
        dividendIncome,
        trades_this_round: playerTradesThisRound,
        round_number: round.round_number,
        total_rounds: totalRounds,
        is_final_round: isFinalRound,
        fundamental_value_before: fundamentalValueBefore,
        fundamental_value_after: fundamentalValueAfter,
        avg_trade_price: avgPrice,
        final_wealth: isFinalRound ? portfolio.cash : null,
      };

      // Profit for this round: change in total wealth from initial endowment
      // For GameResultModel we store the incremental profit this round
      // We compute it as the change in wealth vs what it would have been if holding
      const roundProfit = isFinalRound
        ? portfolio.cash - startingCash // Total P&L over entire game
        : 0; // Intermediate rounds: profit is deferred to final round

      playerResults.push({
        playerId: player.id,
        profit: Math.round(roundProfit * 100) / 100,
        resultData,
      });

      // Save result to DB
      await GameResultModel.create(
        roundId,
        player.id,
        resultData,
        Math.round(roundProfit * 100) / 100,
      );

      // Update player's game_data with current portfolio for cross-round persistence
      await pool.query(
        `UPDATE players SET game_data = $1 WHERE id = $2`,
        [JSON.stringify({ cash: portfolio.cash, shares: portfolio.shares }), player.id]
      );

      // On final round: update total_profit to reflect total wealth change
      if (isFinalRound) {
        await pool.query(
          'UPDATE players SET total_profit = $1 WHERE id = $2',
          [Math.round(roundProfit * 100) / 100, player.id]
        );
      }
    }

    // 6. Broadcast round-end summary with dividend info
    const summary: Record<string, any> = {
      roundNumber: round.round_number,
      totalRounds,
      dividend,
      expectedDividend,
      fundamentalValueBefore,
      fundamentalValueAfter,
      isFinalRound,
      totalTrades: tradesThisRound.length,
      averagePrice: avgPrice,
      tradePrices: tradesThisRound.map(t => t.price),
      portfolios: Object.fromEntries(
        Array.from(portfolios.entries()).map(([pid, p]) => [pid, { cash: p.cash, shares: p.shares }])
      ),
    };

    // Emit dedicated dividend event for UI
    io.to(`market-${sessionCode}`).emit('dividend-drawn', {
      dividend,
      roundNumber: round.round_number,
      fundamentalValueAfter,
      isFinalRound,
      portfolios: summary.portfolios,
    });

    // Clean up in-memory state
    this.roundStates.delete(roundId);
    this.tradeMatchLocks.delete(roundId);

    console.log(
      `[AssetBubble] Round ${round.round_number}/${totalRounds} ended — dividend=${dividend}c, ` +
      `trades=${tradesThisRound.length}, avgPrice=${avgPrice}c, FV_after=${fundamentalValueAfter}c` +
      (isFinalRound ? ' [FINAL]' : '')
    );

    return { playerResults, summary };
  }

  // ========================================================================
  // getGameState
  // ========================================================================

  async getGameState(
    roundId: string,
    playerId?: string
  ): Promise<Record<string, any>> {
    const state = this.roundStates.get(roundId);

    // If no in-memory state, check for saved results (round already ended)
    if (!state) {
      const results = await GameResultModel.findByRound(roundId);
      if (results && results.length > 0) {
        const round = await RoundModel.findById(roundId);
        const playerResult = playerId
          ? results.find(r => r.player_id === playerId)
          : null;
        return {
          phase: 'complete',
          results: results.map(r => ({
            playerId: r.player_id,
            ...r.result_data,
          })),
          myResult: playerResult?.result_data ?? null,
          roundNumber: round?.round_number ?? 0,
        };
      }
      return { phase: 'waiting' };
    }

    // Lookup session config for FV calculation
    const session = await SessionModel.findById(state.sessionId);
    const config = session?.game_config || {};
    const dividendValues = config.dividend_values ?? DEFAULT_DIVIDEND_VALUES;
    const expectedDividend = dividendValues.reduce((s: number, v: number) => s + v, 0) / dividendValues.length;
    const periodsRemaining = state.totalRounds - state.roundNumber + 1;
    const fundamentalValue = Math.round(expectedDividend * periodsRemaining * 100) / 100;

    // Build dividend history
    const dividendHistory = session
      ? await this.getDividendHistory(session.id, config)
      : [];

    const gameState: Record<string, any> = {
      gameType: 'asset_bubble',
      phase: 'trading',
      roundNumber: state.roundNumber,
      totalRounds: state.totalRounds,
      bids: state.bids.map(b => ({
        id: b.id,
        playerId: b.playerId,
        playerName: b.playerName,
        price: b.price,
        timestamp: b.timestamp,
      })),
      asks: state.asks.map(a => ({
        id: a.id,
        playerId: a.playerId,
        playerName: a.playerName,
        price: a.price,
        timestamp: a.timestamp,
      })),
      trades: state.trades.map(t => ({
        id: t.id,
        buyerId: t.buyerId,
        buyerName: t.buyerName,
        sellerId: t.sellerId,
        sellerName: t.sellerName,
        price: t.price,
        timestamp: t.timestamp,
        round: t.round,
      })),
      dividendHistory,
      dividendValues,
      expectedDividend,
      periodsRemaining,
      fundamentalValue: config.show_fundamental_value !== false ? fundamentalValue : null,
      showFundamentalValue: config.show_fundamental_value !== false,
    };

    // Add requesting player's portfolio
    if (playerId) {
      const portfolio = state.portfolios.get(playerId);
      if (portfolio) {
        gameState.myPortfolio = {
          cash: portfolio.cash,
          shares: portfolio.shares,
        };

        // Outstanding orders by this player
        gameState.myBids = state.bids
          .filter(b => b.playerId === playerId)
          .map(b => ({ id: b.id, price: b.price, timestamp: b.timestamp }));
        gameState.myAsks = state.asks
          .filter(a => a.playerId === playerId)
          .map(a => ({ id: a.id, price: a.price, timestamp: a.timestamp }));
      }
    }

    return gameState;
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  /**
   * Build dividend history from all completed rounds of this session.
   */
  private async getDividendHistory(
    sessionId: string,
    config: Record<string, any>
  ): Promise<DividendHistoryEntry[]> {
    const dividendValues = config.dividend_values ?? DEFAULT_DIVIDEND_VALUES;
    const expectedDividend = dividendValues.reduce((s: number, v: number) => s + v, 0) / dividendValues.length;

    const rounds = await RoundModel.findBySession(sessionId);
    const history: DividendHistoryEntry[] = [];

    for (const round of rounds) {
      if (round.status !== 'completed') continue;

      // Get any result from this round to read the dividend
      const results = await GameResultModel.findByRound(round.id);
      if (results.length === 0) continue;

      const dividend = results[0].result_data?.dividend;
      if (dividend === undefined || dividend === null) continue;

      const totalRounds = config.num_rounds ?? DEFAULT_NUM_ROUNDS;
      const periodsRemaining = totalRounds - round.round_number;
      const fundamentalValue = Math.round(expectedDividend * periodsRemaining * 100) / 100;

      history.push({
        round: round.round_number,
        dividend,
        fundamentalValue,
      });
    }

    return history.sort((a, b) => a.round - b.round);
  }
}
