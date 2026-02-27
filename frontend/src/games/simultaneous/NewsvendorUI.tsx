import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { Package, DollarSign, Users, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  orderQuantity: number;
  demand: number;
  unitsSold: number;
  leftover: number;
  revenue: number;
  cost: number;
  salvageRevenue: number;
  optimalQuantity: number;
  demandMean: number;
  unitCost: number;
  sellingPrice: number;
  salvageValue: number;
}

/**
 * Newsvendor Problem UI
 * Players decide how many units to order before demand is revealed.
 * Demonstrates the pull-to-center bias.
 */
const NewsvendorUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [orderQty, setOrderQty] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const unitCost = gameConfig.unitCost ?? 5;
  const sellingPrice = gameConfig.sellingPrice ?? 10;
  const salvageValue = gameConfig.salvageValue ?? 1;
  const demandMin = gameConfig.demandMin ?? 0;
  const demandMax = gameConfig.demandMax ?? 100;

  const orderNum = parseInt(orderQty) || 0;

  // Reset state on new round
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setOrderQty('');
      setResults(null);
      setWaitingCount({ submitted: 0, total: 0 });
    }
  }, [roundId, roundActive]);

  // Socket events
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(onEvent('game-state', (state: any) => {
      if (state.myAction) {
        setSubmitted(true);
        setOrderQty(String(state.myAction.orderQuantity));
      }
      if (state.totalSubmitted !== undefined && state.totalPlayers !== undefined) {
        setWaitingCount({ submitted: state.totalSubmitted, total: state.totalPlayers });
      }
      if (state.results) setResults(state.results);
    }));

    cleanups.push(onEvent('action-submitted', (data: { submitted: number; total: number }) => {
      setWaitingCount({ submitted: data.submitted, total: data.total });
    }));

    cleanups.push(onEvent('round-results', (data: { results: RoundResult[] }) => {
      setResults(data.results);
      refreshPlayer();
      const myResult = data.results.find(r => r.playerId === playerId);
      if (myResult) {
        if (myResult.profit > 0) {
          toast.success(`Demand was ${myResult.demand}. Profit: $${myResult.profit.toFixed(2)}`);
        } else {
          toast(`Demand was ${myResult.demand}. Profit: $${myResult.profit.toFixed(2)}`, {
            icon: myResult.profit === 0 ? '😐' : '📉',
          });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !orderQty || submitted) return;

    const qty = parseInt(orderQty);
    if (isNaN(qty) || qty < 0) {
      toast.error('Please enter a valid order quantity');
      return;
    }

    setSubmitting(true);
    submitAction({ type: 'decision', orderQuantity: qty });
    setSubmitted(true);
    toast.success(`Ordered ${qty} units!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);

  // Preview calculations
  const previewCost = orderNum * unitCost;
  const avgDemand = Math.round((demandMin + demandMax) / 2);
  const criticalRatio = (sellingPrice - unitCost) / (sellingPrice - salvageValue);
  const optimalQty = Math.round(demandMin + (demandMax - demandMin) * criticalRatio);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Info & Submit */}
      <div className="space-y-4">
        <Card>
          <div className="text-center mb-3">
            <Package className="w-8 h-8 mx-auto text-orange-600 mb-1" />
            <div className="text-sm text-gray-500">Newsvendor Problem</div>
          </div>
          <div className="bg-orange-50 rounded-lg p-3 text-xs space-y-1">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-gray-500">Unit Cost:</span>
                <span className="font-bold ml-1">${unitCost}</span>
              </div>
              <div>
                <span className="text-gray-500">Sell Price:</span>
                <span className="font-bold ml-1">${sellingPrice}</span>
              </div>
              <div>
                <span className="text-gray-500">Salvage:</span>
                <span className="font-bold ml-1">${salvageValue}</span>
              </div>
              <div>
                <span className="text-gray-500">Margin:</span>
                <span className="font-bold ml-1">${sellingPrice - unitCost}/unit</span>
              </div>
            </div>
            <div className="border-t pt-1 mt-1">
              <span className="text-gray-500">Demand range:</span>
              <span className="font-bold ml-1">{demandMin} – {demandMax} units</span>
            </div>
          </div>
        </Card>

        <Card title="Place Your Order">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Order Placed!</div>
                <div className="text-xl font-bold text-gray-700 mb-2">{orderNum} units</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label={`Order Quantity (${demandMin}–${demandMax * 2})`}
                  type="number"
                  step="1"
                  min="0"
                  max={demandMax * 2}
                  value={orderQty}
                  onChange={(e) => setOrderQty(e.target.value)}
                  placeholder="How many units to order?"
                  required
                />
                {orderQty && !isNaN(orderNum) && orderNum >= 0 && (
                  <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Your order:</span>
                      <span className="font-medium">{orderNum} units</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Order cost:</span>
                      <span className="font-medium text-red-600">-${previewCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>If demand = {avgDemand} (mean):</span>
                      <span className="font-medium">
                        ${(Math.min(orderNum, avgDemand) * sellingPrice + Math.max(0, orderNum - avgDemand) * salvageValue - previewCost).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting || !orderQty}>
                  {submitting ? 'Submitting...' : 'Place Order'}
                </Button>
              </form>
            )
          ) : (
            <p className="text-center text-gray-500 py-4">Waiting for round to start...</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              <span className="font-medium">Total Profit</span>
            </div>
            <span className={`text-2xl font-bold ${(Number(player?.total_profit) || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${Number(player?.total_profit || 0).toFixed(2)}
            </span>
          </div>
        </Card>
      </div>

      {/* Center & Right: Results */}
      <div className="lg:col-span-2">
        <Card title="Round Results">
          {results ? (
            <div className="space-y-4">
              {/* Demand reveal */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <div className="text-sm text-blue-600 mb-1">Actual Demand This Round</div>
                <div className="text-4xl font-bold text-blue-800">{myResult?.demand ?? '?'}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Range: {demandMin}–{demandMax} | Mean: {avgDemand} | Optimal order: {optimalQty}
                </div>
              </div>

              {/* My breakdown */}
              {myResult && (
                <div className={`p-4 rounded-lg border ${myResult.profit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="text-sm font-medium mb-2">Your P&L Breakdown</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Ordered: <strong>{myResult.orderQuantity}</strong></div>
                    <div>Demand: <strong>{myResult.demand}</strong></div>
                    <div>Units sold: <strong>{myResult.unitsSold}</strong> × ${sellingPrice} = ${myResult.revenue.toFixed(2)}</div>
                    <div>Leftover: <strong>{myResult.leftover}</strong> × ${salvageValue} = ${myResult.salvageRevenue.toFixed(2)}</div>
                    <div className="col-span-2 border-t pt-1 mt-1">
                      Revenue: ${myResult.revenue.toFixed(2)} + Salvage: ${myResult.salvageRevenue.toFixed(2)} − Cost: ${myResult.cost.toFixed(2)} = <strong className={myResult.profit >= 0 ? 'text-green-700' : 'text-red-700'}>${myResult.profit.toFixed(2)}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* All players table */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">All Managers</div>
                {[...results]
                  .sort((a, b) => b.profit - a.profit)
                  .map((r) => (
                    <div
                      key={r.playerId}
                      className={`flex items-center justify-between px-4 py-2 rounded-lg ${
                        r.playerId === playerId ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'
                      }`}
                    >
                      <div>
                        <span className="font-medium text-sm">
                          {r.playerId === playerId ? 'You' : r.playerName}
                        </span>
                        <div className="text-xs text-gray-500">
                          Ordered {r.orderQuantity} | Sold {r.unitsSold} | Leftover {r.leftover}
                        </div>
                      </div>
                      <div className={`font-bold ${r.profit > 0 ? 'text-green-600' : r.profit < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                        ${r.profit.toFixed(2)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all orders are placed</p>
              {waitingCount.total > 0 && (
                <p className="text-sm mt-2">{waitingCount.submitted}/{waitingCount.total} submitted</p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default NewsvendorUI;
