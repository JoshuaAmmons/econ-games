import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { TrendingUp, Coins, ArrowUpDown, History, X } from 'lucide-react';
import toast from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Order {
  id: string;
  playerId: string;
  playerName: string;
  price: number;
  timestamp: string;
}

interface TradeRecord {
  id: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  price: number;
  timestamp: string;
  round: number;
}

interface Portfolio {
  cash: number;
  shares: number;
}

interface DividendRecord {
  roundNumber: number;
  dividend: number;
  fundamentalValueAfter: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const AssetBubbleUI: React.FC<GameUIProps> = ({
  session: _session,
  player,
  playerId,
  roundId,
  roundActive,
  roundNumber,
  numRounds,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  // Order book
  const [bids, setBids] = useState<Order[]>([]);
  const [asks, setAsks] = useState<Order[]>([]);

  // Trades
  const [trades, setTrades] = useState<TradeRecord[]>([]);

  // Portfolio
  const [portfolio, setPortfolio] = useState<Portfolio>({ cash: 0, shares: 0 });

  // Fundamental value info
  const [fundamentalValue, setFundamentalValue] = useState<number>(0);
  const [dividendHistory, setDividendHistory] = useState<DividendRecord[]>([]);

  // Order form
  const [orderType, setOrderType] = useState<'bid' | 'ask'>('bid');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Price history for chart (trade prices per round)
  const [priceHistory, setPriceHistory] = useState<{ round: number; price: number }[]>([]);

  const priceNum = parseFloat(price) || 0;

  // Derive portfolio from player data as fallback
  useEffect(() => {
    if (player) {
      setPortfolio((prev) => ({
        cash: (player as any).cash ?? prev.cash,
        shares: (player as any).shares ?? prev.shares,
      }));
    }
  }, [player]);

  // Reset form on new round
  useEffect(() => {
    if (roundActive && roundId) {
      setPrice('');
      setSubmitting(false);
    }
  }, [roundId, roundActive]);

  // Socket events
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    // Full game state on connect / reconnect
    cleanups.push(
      onEvent('game-state', (state: any) => {
        if (state.bids) setBids(state.bids);
        if (state.asks) setAsks(state.asks);
        if (state.trades) {
          setTrades(state.trades);
          // Rebuild price history from existing trades
          const history: { round: number; price: number }[] = state.trades.map(
            (t: TradeRecord) => ({ round: t.round, price: t.price })
          );
          setPriceHistory(history);
        }
        if (state.fundamentalValue != null) setFundamentalValue(state.fundamentalValue);
        if (state.dividendHistory) setDividendHistory(state.dividendHistory);
        if (state.portfolio) {
          setPortfolio(state.portfolio);
        }
      })
    );

    // New order placed
    cleanups.push(
      onEvent('order-submitted', (data: { orderType: 'bid' | 'ask'; order: Order }) => {
        if (data.orderType === 'bid') {
          setBids((prev) => [...prev, data.order]);
        } else {
          setAsks((prev) => [...prev, data.order]);
        }
      })
    );

    // Trade executed
    cleanups.push(
      onEvent('trade-executed', (data: any) => {
        const trade: TradeRecord = data.trade;
        setTrades((prev) => [trade, ...prev]);
        setPriceHistory((prev) => [...prev, { round: trade.round, price: trade.price }]);

        // Update portfolio if we are part of the trade
        if (data.portfolioUpdates && data.portfolioUpdates[playerId]) {
          setPortfolio(data.portfolioUpdates[playerId]);
        }

        // Remove matched orders from book
        setBids((prev) => prev.filter((b) => b.id !== (data.matchedBidId ?? '')));
        setAsks((prev) => prev.filter((a) => a.id !== (data.matchedAskId ?? '')));

        if (trade.buyerId === playerId) {
          toast.success(`Bought at ${trade.price}c!`);
        } else if (trade.sellerId === playerId) {
          toast.success(`Sold at ${trade.price}c!`);
        }
      })
    );

    // Order cancelled
    cleanups.push(
      onEvent('order-cancelled', (data: { orderType: 'bid' | 'ask'; orderId: string }) => {
        if (data.orderType === 'bid') {
          setBids((prev) => prev.filter((b) => b.id !== data.orderId));
        } else {
          setAsks((prev) => prev.filter((a) => a.id !== data.orderId));
        }
      })
    );

    // Full order book refresh
    cleanups.push(
      onEvent('order-book-update', (data: { bids: Order[]; asks: Order[] }) => {
        setBids(data.bids);
        setAsks(data.asks);
      })
    );

    // Dividend drawn at end of round
    cleanups.push(
      onEvent('dividend-drawn', (data: any) => {
        const record: DividendRecord = {
          roundNumber: data.roundNumber,
          dividend: data.dividend,
          fundamentalValueAfter: data.fundamentalValueAfter,
        };
        setDividendHistory((prev) => [...prev, record]);
        setFundamentalValue(data.fundamentalValueAfter);

        // Update portfolio from server
        if (data.portfolios && data.portfolios[playerId]) {
          setPortfolio(data.portfolios[playerId]);
        }

        toast(`Round ${data.roundNumber} dividend: ${data.dividend}c`, { icon: '💰' });
        refreshPlayer();
      })
    );

    return () => cleanups.forEach((fn) => fn());
  }, [onEvent, playerId, refreshPlayer]);

  // Submit order
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!roundId || !price || submitting) return;

      const p = parseFloat(price);
      if (isNaN(p) || p <= 0) {
        toast.error('Enter a valid price in cents');
        return;
      }

      if (orderType === 'bid' && p > portfolio.cash) {
        toast.error('Not enough cash for this bid');
        return;
      }

      if (orderType === 'ask' && portfolio.shares <= 0) {
        toast.error('No shares to sell');
        return;
      }

      setSubmitting(true);
      submitAction({ type: orderType, price: p });
      setPrice('');
      toast.success(`${orderType === 'bid' ? 'Bid' : 'Ask'} of ${p}c submitted`);
      setTimeout(() => setSubmitting(false), 400);
    },
    [roundId, price, submitting, orderType, portfolio, submitAction]
  );

  // Cancel order
  const handleCancel = useCallback(
    (type: 'bid' | 'ask', orderId: string) => {
      submitAction({ type: type === 'bid' ? 'cancel_bid' : 'cancel_ask', orderId });
      toast.success(`${type === 'bid' ? 'Bid' : 'Ask'} cancelled`);
    },
    [submitAction]
  );

  // My open orders
  const myBids = bids.filter((b) => b.playerId === playerId);
  const myAsks = asks.filter((a) => a.playerId === playerId);

  // Estimated value
  const estimatedValue = portfolio.cash + portfolio.shares * fundamentalValue;

  // Remaining rounds for FV context
  const remainingRounds = Math.max(0, numRounds - roundNumber);

  // Sort order book
  const sortedBids = [...bids].sort((a, b) => b.price - a.price);
  const sortedAsks = [...asks].sort((a, b) => a.price - b.price);

  // Build round summary for chart
  const roundSummary: {
    round: number;
    avgPrice: number | null;
    tradeCount: number;
    fv: number;
  }[] = [];

  for (let r = 1; r <= roundNumber; r++) {
    const roundTrades = priceHistory.filter((t) => t.round === r);
    const dividendEntry = dividendHistory.find((d) => d.roundNumber === r);
    const fv = dividendEntry ? dividendEntry.fundamentalValueAfter : fundamentalValue;
    roundSummary.push({
      round: r,
      avgPrice:
        roundTrades.length > 0
          ? roundTrades.reduce((s, t) => s + t.price, 0) / roundTrades.length
          : null,
      tradeCount: roundTrades.length,
      fv,
    });
  }

  // Chart bar scaling
  const allValues = [
    ...roundSummary.map((r) => r.avgPrice).filter((v): v is number => v !== null),
    ...roundSummary.map((r) => r.fv),
    fundamentalValue,
  ];
  const chartMax = allValues.length > 0 ? Math.max(...allValues) * 1.2 : 100;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ====== LEFT COLUMN ====== */}
      <div className="space-y-4">
        {/* Portfolio */}
        <Card className="bg-gradient-to-br from-amber-900/60 to-amber-800/40 border border-amber-700/50">
          <div className="flex items-center gap-2 mb-3">
            <Coins className="w-5 h-5 text-amber-400" />
            <span className="font-semibold text-amber-200">Portfolio</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-amber-950/40 rounded-lg p-2">
              <div className="text-xs text-amber-400/70">Cash</div>
              <div className="text-xl font-bold text-amber-200">{portfolio.cash}c</div>
            </div>
            <div className="bg-amber-950/40 rounded-lg p-2">
              <div className="text-xs text-amber-400/70">Shares</div>
              <div className="text-xl font-bold text-amber-200">{portfolio.shares}</div>
            </div>
          </div>
          <div className="mt-3 bg-amber-950/40 rounded-lg p-2 text-center">
            <div className="text-xs text-amber-400/70">Estimated Value (cash + shares x FV)</div>
            <div className="text-lg font-bold text-amber-100">{Math.round(estimatedValue)}c</div>
          </div>
          <div className="mt-2 text-xs text-amber-400/60 text-center">
            FV = {fundamentalValue}c | {remainingRounds} rounds left
          </div>
        </Card>

        {/* Submit Order */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="flex items-center gap-2 mb-3">
            <ArrowUpDown className="w-5 h-5 text-amber-400" />
            <span className="font-semibold text-amber-200">Place Order</span>
          </div>

          {roundActive && roundId ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Buy / Sell toggle */}
              <div className="flex rounded-lg overflow-hidden border border-gray-600">
                <button
                  type="button"
                  onClick={() => setOrderType('bid')}
                  className={`flex-1 py-2 text-sm font-medium transition ${
                    orderType === 'bid'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  Buy (Bid)
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('ask')}
                  className={`flex-1 py-2 text-sm font-medium transition ${
                    orderType === 'ask'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  Sell (Ask)
                </button>
              </div>

              {/* Available info */}
              <div className="text-xs text-gray-400 text-center">
                {orderType === 'bid'
                  ? `Available cash: ${portfolio.cash}c`
                  : `Available shares: ${portfolio.shares}`}
              </div>

              <Input
                label="Price (cents)"
                type="number"
                step="1"
                min="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Enter price in cents"
                className="bg-gray-700 border-gray-600 text-amber-100"
                required
              />

              {/* Validation warnings */}
              {orderType === 'bid' && priceNum > 0 && priceNum > portfolio.cash && (
                <div className="bg-red-900/40 border border-red-700/50 rounded p-2 text-xs text-red-300">
                  Not enough cash ({portfolio.cash}c available)
                </div>
              )}
              {orderType === 'ask' && portfolio.shares <= 0 && (
                <div className="bg-red-900/40 border border-red-700/50 rounded p-2 text-xs text-red-300">
                  No shares to sell
                </div>
              )}
              {orderType === 'bid' && priceNum > fundamentalValue && priceNum > 0 && (
                <div className="bg-yellow-900/40 border border-yellow-700/50 rounded p-2 text-xs text-yellow-300">
                  Price above fundamental value ({fundamentalValue}c)
                </div>
              )}

              <Button
                type="submit"
                className={`w-full ${
                  orderType === 'bid'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
                disabled={submitting || !price}
              >
                {submitting
                  ? 'Submitting...'
                  : `Submit ${orderType === 'bid' ? 'Bid' : 'Ask'}`}
              </Button>
            </form>
          ) : (
            <p className="text-center text-gray-500 py-4">Waiting for round to start...</p>
          )}
        </Card>

        {/* Your Open Orders */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="font-semibold text-amber-200 text-sm mb-2">Your Open Orders</div>
          {myBids.length === 0 && myAsks.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-2">No open orders</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {myBids.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between bg-green-900/30 rounded px-2 py-1 text-xs"
                >
                  <span className="text-green-400 font-mono">BID {b.price}c</span>
                  <button
                    onClick={() => handleCancel('bid', b.id)}
                    className="text-gray-400 hover:text-red-400 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {myAsks.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between bg-red-900/30 rounded px-2 py-1 text-xs"
                >
                  <span className="text-red-400 font-mono">ASK {a.price}c</span>
                  <button
                    onClick={() => handleCancel('ask', a.id)}
                    className="text-gray-400 hover:text-red-400 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ====== CENTER COLUMN ====== */}
      <div className="space-y-4">
        {/* Price History Chart */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            <span className="font-semibold text-amber-200">Price History</span>
          </div>

          {roundSummary.length === 0 ? (
            <p className="text-center text-gray-500 py-6 text-sm">
              No rounds completed yet
            </p>
          ) : (
            <div className="space-y-2">
              {/* Bar chart */}
              <div className="flex items-end gap-1" style={{ height: 160 }}>
                {roundSummary.map((r) => {
                  const avgH =
                    r.avgPrice !== null
                      ? Math.max(4, (r.avgPrice / chartMax) * 140)
                      : 0;
                  const fvH = Math.max(2, (r.fv / chartMax) * 140);
                  return (
                    <div
                      key={r.round}
                      className="flex-1 flex flex-col items-center justify-end relative"
                      style={{ height: 160 }}
                    >
                      {/* FV marker line */}
                      <div
                        className="absolute w-full border-t-2 border-dashed border-amber-500/60"
                        style={{ bottom: fvH }}
                        title={`FV: ${r.fv}c`}
                      />
                      {/* Trade price bar */}
                      {r.avgPrice !== null ? (
                        <div
                          className={`w-full rounded-t transition-all ${
                            r.avgPrice > r.fv
                              ? 'bg-red-500/70'
                              : 'bg-green-500/70'
                          }`}
                          style={{ height: avgH }}
                          title={`Avg: ${Math.round(r.avgPrice)}c (${r.tradeCount} trades)`}
                        />
                      ) : (
                        <div
                          className="w-full rounded-t bg-gray-600/40"
                          style={{ height: 4 }}
                          title="No trades"
                        />
                      )}
                      <div className="text-[10px] text-gray-500 mt-1">R{r.round}</div>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-[10px] text-gray-400 justify-center">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-2 rounded bg-green-500/70" /> Below FV
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-2 rounded bg-red-500/70" /> Above FV
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 border-t-2 border-dashed border-amber-500/60" />{' '}
                  FV
                </span>
              </div>

              {/* Table below chart */}
              <div className="mt-2 max-h-28 overflow-y-auto">
                <table className="w-full text-xs text-gray-400">
                  <thead>
                    <tr className="text-amber-400/70 border-b border-gray-700">
                      <th className="text-left py-1">Rd</th>
                      <th className="text-right py-1">Avg Price</th>
                      <th className="text-right py-1">FV</th>
                      <th className="text-right py-1">Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roundSummary.map((r) => (
                      <tr key={r.round} className="border-b border-gray-800">
                        <td className="py-1">{r.round}</td>
                        <td className="text-right font-mono">
                          {r.avgPrice !== null ? `${Math.round(r.avgPrice)}c` : '--'}
                        </td>
                        <td className="text-right font-mono text-amber-400/60">
                          {r.fv}c
                        </td>
                        <td className="text-right">{r.tradeCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>

        {/* Dividend History */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="flex items-center gap-2 mb-2">
            <History className="w-5 h-5 text-amber-400" />
            <span className="font-semibold text-amber-200">Dividend History</span>
          </div>
          {dividendHistory.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-3">
              No dividends drawn yet
            </p>
          ) : (
            <div className="max-h-40 overflow-y-auto">
              <table className="w-full text-xs text-gray-400">
                <thead>
                  <tr className="text-amber-400/70 border-b border-gray-700">
                    <th className="text-left py-1">Round</th>
                    <th className="text-right py-1">Dividend</th>
                    <th className="text-right py-1">FV After</th>
                  </tr>
                </thead>
                <tbody>
                  {dividendHistory.map((d) => (
                    <tr key={d.roundNumber} className="border-b border-gray-800">
                      <td className="py-1">{d.roundNumber}</td>
                      <td className="text-right font-mono text-green-400">
                        +{d.dividend}c
                      </td>
                      <td className="text-right font-mono text-amber-300/70">
                        {d.fundamentalValueAfter}c
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ====== RIGHT COLUMN ====== */}
      <div className="space-y-4">
        {/* Order Book */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="font-semibold text-amber-200 text-sm mb-3">Order Book</div>

          {/* Asks (lowest first = top of book) */}
          <div className="mb-2">
            <div className="text-[10px] font-medium text-red-400 mb-1 uppercase tracking-wide">
              Asks (Sell)
            </div>
            {sortedAsks.length === 0 ? (
              <p className="text-[10px] text-gray-500 text-center py-1">No asks</p>
            ) : (
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {sortedAsks.map((a) => (
                  <div
                    key={a.id}
                    className={`flex justify-between px-2 py-1 rounded text-xs ${
                      a.playerId === playerId
                        ? 'bg-red-800/40 border border-red-700/40'
                        : 'bg-red-900/20'
                    }`}
                  >
                    <span className="text-red-400 font-mono">{a.price}c</span>
                    <span className="text-gray-500 text-[10px] truncate ml-2">
                      {a.playerId === playerId ? 'You' : a.playerName}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-dashed border-gray-600 my-2" />

          {/* Bids (highest first = top of book) */}
          <div>
            <div className="text-[10px] font-medium text-green-400 mb-1 uppercase tracking-wide">
              Bids (Buy)
            </div>
            {sortedBids.length === 0 ? (
              <p className="text-[10px] text-gray-500 text-center py-1">No bids</p>
            ) : (
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {sortedBids.map((b) => (
                  <div
                    key={b.id}
                    className={`flex justify-between px-2 py-1 rounded text-xs ${
                      b.playerId === playerId
                        ? 'bg-green-800/40 border border-green-700/40'
                        : 'bg-green-900/20'
                    }`}
                  >
                    <span className="text-green-400 font-mono">{b.price}c</span>
                    <span className="text-gray-500 text-[10px] truncate ml-2">
                      {b.playerId === playerId ? 'You' : b.playerName}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Spread */}
          {sortedBids.length > 0 && sortedAsks.length > 0 && (
            <div className="mt-2 text-center text-[10px] text-gray-500">
              Spread: {sortedAsks[0].price - sortedBids[0].price}c
            </div>
          )}
        </Card>

        {/* Recent Trades */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpDown className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-amber-200 text-sm">Recent Trades</span>
            <span className="text-[10px] text-gray-500 ml-auto">{trades.length} total</span>
          </div>

          {trades.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">No trades yet</p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {trades.slice(0, 30).map((t) => {
                const isMyTrade = t.buyerId === playerId || t.sellerId === playerId;
                return (
                  <div
                    key={t.id}
                    className={`rounded px-2 py-1.5 text-xs ${
                      isMyTrade
                        ? 'bg-amber-900/30 border border-amber-700/40'
                        : 'bg-gray-700/30'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-medium text-amber-200">{t.price}c</span>
                      <span className="text-[10px] text-gray-500">
                        R{t.round}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {t.buyerId === playerId ? 'You' : t.buyerName} bought from{' '}
                      {t.sellerId === playerId ? 'You' : t.sellerName}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AssetBubbleUI;
