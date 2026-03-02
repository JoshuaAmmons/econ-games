import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { Zap, DollarSign, TrendingUp, Activity } from 'lucide-react';
import { WaitingIndicator } from '../../components/shared/WaitingIndicator';
import toast from 'react-hot-toast';

interface CapacityBlock {
  mw: number;
  marginalCost: number;
}

interface BlockResult {
  mw: number;
  marginalCost: number;
  offerPrice: number;
  dispatchedMW: number;
  revenue: number;
  blockProfit: number;
}

interface SupplyCurveEntry {
  playerId: string;
  playerName: string;
  blockIndex: number;
  mw: number;
  marginalCost: number;
  offerPrice: number;
  dispatchedMW: number;
}

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  blocks: BlockResult[];
  totalDispatchedMW: number;
  totalRevenue: number;
  clearingPrice: number | null;
  demand: number;
  pricingRule: string;
  efficiency: number;
  isDominant: boolean;
  supplyCurve: SupplyCurveEntry[];
}

const BLOCK_COLORS = ['#22c55e', '#eab308', '#ef4444']; // green, yellow, red for base/mid/peak
const BLOCK_LABELS = ['Base', 'Mid', 'Peak'];

/**
 * Electricity Market UI
 * Based on Rassenti, Smith & Wilson (2003).
 * Generators submit per-block offer prices. System dispatches by merit order.
 */
const ElectricityMarketUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [offers, setOffers] = useState<string[]>(['', '', '']);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);
  const [currentDemand, setCurrentDemand] = useState(0);
  const [demandLabel, setDemandLabel] = useState('');

  const gameConfig = session?.game_config || {};
  const pricingRule = gameConfig.pricingRule ?? 'uniform';
  const gameData = player?.game_data as { blocks: CapacityBlock[]; isDominant: boolean; totalCapacity: number } | undefined;
  const blocks = gameData?.blocks || [];

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setOffers(['', '', '']);
      setResults(null);
      setWaitingCount({ submitted: 0, total: 0 });
      refreshPlayer();
    }
  }, [roundId, roundActive, refreshPlayer]);

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(onEvent('game-state', (state: any) => {
      if (state.myAction) setSubmitted(true);
      if (state.totalSubmitted !== undefined && state.totalPlayers !== undefined) {
        setWaitingCount({ submitted: state.totalSubmitted, total: state.totalPlayers });
      }
      if (state.results) setResults(state.results);
      if (state.currentDemand) setCurrentDemand(state.currentDemand);
      if (state.demandLabel) setDemandLabel(state.demandLabel);
    }));

    cleanups.push(onEvent('action-submitted', (data: { submitted: number; total: number }) => {
      setWaitingCount({ submitted: data.submitted, total: data.total });
    }));

    cleanups.push(onEvent('round-results', (data: { results: RoundResult[] }) => {
      setResults(data.results);
      refreshPlayer();
      const myResult = data.results.find(r => r.playerId === playerId);
      if (myResult) {
        if (myResult.totalDispatchedMW > 0) {
          toast.success(`Dispatched ${myResult.totalDispatchedMW} MW! Profit: $${Number(myResult.profit).toFixed(2)}`);
        } else {
          toast(`None of your plants were dispatched. Profit: $0`, { icon: '😞' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleOfferChange = (index: number, value: string) => {
    setOffers(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || submitted || blocks.length === 0) return;

    const offerData = offers.map((price, i) => ({
      block: i,
      price: parseFloat(price),
    }));

    for (let i = 0; i < offerData.length; i++) {
      if (isNaN(offerData[i].price)) {
        toast.error(`Please enter a valid price for Block ${i + 1}`);
        return;
      }
      if (offerData[i].price < blocks[i].marginalCost) {
        toast.error(`Block ${i + 1} offer cannot be below marginal cost ($${blocks[i].marginalCost})`);
        return;
      }
    }

    setSubmitting(true);
    submitAction({ type: 'decision', offers: offerData });
    setSubmitted(true);
    toast.success('Supply offers submitted!');
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);
  const supplyCurve = myResult?.supplyCurve || [];

  // Compute total capacity in supply curve for visualization scaling
  const totalSupplyMW = supplyCurve.reduce((sum, e) => sum + e.mw, 0);
  const demand = myResult?.demand ?? currentDemand;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
      <div className="space-y-3 md:space-y-4">
        <Card>
          <div className="text-center mb-3">
            <Zap className="w-8 h-8 mx-auto text-yellow-500 mb-1" />
            <div className="text-sm text-gray-500">Electricity Market</div>
            <div className="text-lg font-bold text-yellow-700">
              {pricingRule === 'uniform' ? 'Uniform Price' : 'Pay-As-Bid'}
            </div>
          </div>
          {currentDemand > 0 && (
            <div className="flex items-center justify-center gap-2 bg-yellow-50 rounded-lg p-3 mb-3">
              <Activity className="w-5 h-5 text-yellow-600" />
              <span className="text-lg font-bold text-yellow-700">{currentDemand} MW</span>
              <span className="text-sm text-gray-500">{demandLabel} demand</span>
            </div>
          )}
          {gameData?.isDominant && (
            <div className="text-xs p-2 rounded text-center bg-red-50 text-red-700 mb-3">
              You are the dominant generator (large market share)
            </div>
          )}
        </Card>

        {/* Capacity Blocks Display */}
        <Card title="Your Generation Portfolio">
          {blocks.length > 0 ? (
            <div className="space-y-2">
              {blocks.map((block, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2 rounded-lg"
                  style={{ backgroundColor: `${BLOCK_COLORS[i]}15` }}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: BLOCK_COLORS[i] }}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{BLOCK_LABELS[i]} Load</div>
                    <div className="text-xs text-gray-500">
                      {block.mw} MW @ ${block.marginalCost}/MWh
                    </div>
                  </div>
                </div>
              ))}
              <div className="text-xs text-gray-400 text-center pt-1">
                Total capacity: {blocks.reduce((s, b) => s + b.mw, 0)} MW
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-400 text-sm">Loading portfolio...</p>
          )}
        </Card>

        {/* Submit Offers */}
        <Card title="Submit Offer Prices">
          {roundActive && roundId ? (
            submitted ? (
              <WaitingIndicator
                message="Offers Submitted!"
                submitted={waitingCount.submitted}
                total={waitingCount.total}
              />
            ) : blocks.length > 0 ? (
              <form onSubmit={handleSubmit} className="space-y-3">
                {blocks.map((block, i) => (
                  <div key={i}>
                    <Input
                      label={`${BLOCK_LABELS[i]} (${block.mw} MW, cost $${block.marginalCost})`}
                      type="number"
                      step="0.01"
                      min={block.marginalCost}
                      value={offers[i]}
                      onChange={(e) => handleOfferChange(i, e.target.value)}
                      placeholder={`Min $${block.marginalCost}`}
                      required
                    />
                  </div>
                ))}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Supply Offers'}
                </Button>
              </form>
            ) : (
              <p className="text-center text-gray-400 py-4">Loading portfolio...</p>
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

      {/* Results */}
      <div className="lg:col-span-2 space-y-3 md:space-y-4">
        <Card title="Market Results">
          {results ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-center space-y-1">
                <div>
                  <strong>Demand:</strong> {myResult?.demand ?? 0} MW
                  {myResult?.clearingPrice != null && (
                    <span className="ml-3"><strong>Clearing Price:</strong> ${Number(myResult.clearingPrice).toFixed(2)}/MWh</span>
                  )}
                  <span className="ml-3"><strong>Efficiency:</strong> {Number(myResult?.efficiency ?? 0).toFixed(1)}%</span>
                </div>
              </div>

              {/* Supply Curve Visualization */}
              {supplyCurve.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Merit Order (Supply Curve)</h4>
                  <div className="relative bg-gray-50 rounded-lg p-3 overflow-hidden">
                    <div className="flex h-10 rounded overflow-hidden">
                      {supplyCurve.map((entry, i) => {
                        const widthPct = totalSupplyMW > 0 ? (entry.mw / totalSupplyMW) * 100 : 0;
                        const isDispatched = entry.dispatchedMW > 0;
                        const isMine = entry.playerId === playerId;
                        return (
                          <div
                            key={i}
                            className={`relative flex items-center justify-center text-xs font-medium border-r border-white ${
                              isDispatched
                                ? isMine ? 'bg-green-400 text-green-900' : 'bg-green-200 text-green-800'
                                : 'bg-gray-200 text-gray-500'
                            }`}
                            style={{ width: `${widthPct}%`, minWidth: widthPct > 2 ? undefined : '2px' }}
                            title={`${entry.playerName} B${entry.blockIndex + 1}: $${entry.offerPrice}/MWh, ${entry.mw}MW${isDispatched ? ` (${entry.dispatchedMW}MW dispatched)` : ' (not dispatched)'}`}
                          >
                            {widthPct > 6 && (
                              <span className="truncate px-0.5">${entry.offerPrice}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Demand line */}
                    {totalSupplyMW > 0 && demand > 0 && (
                      <div
                        className="absolute top-0 bottom-0 border-l-2 border-dashed border-red-500"
                        style={{ left: `calc(${Math.min((demand / totalSupplyMW) * 100, 100)}% + 12px)` }}
                      >
                        <span className="absolute -top-0 left-1 text-xs text-red-600 font-medium whitespace-nowrap">
                          Demand
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between mt-1 text-xs text-gray-400">
                      <span>Cheapest</span>
                      <span>Most expensive</span>
                    </div>
                  </div>
                </div>
              )}

              {/* My result highlight */}
              {myResult && (
                <div className={`p-3 rounded-lg text-sm ${(myResult.totalDispatchedMW ?? 0) > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    <span className="font-medium text-gray-700">
                      {(myResult.totalDispatchedMW ?? 0) > 0
                        ? `You dispatched ${myResult.totalDispatchedMW} MW`
                        : 'None of your plants were dispatched'}
                    </span>
                  </div>
                  {(myResult.blocks ?? []).map((block, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-600 ml-6">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: BLOCK_COLORS[i] }} />
                      <span>{BLOCK_LABELS[i]}: offered ${block.offerPrice}/MWh</span>
                      <span className="text-gray-400">|</span>
                      <span>{block.dispatchedMW > 0 ? `${block.dispatchedMW}MW dispatched` : 'not dispatched'}</span>
                      {block.dispatchedMW > 0 && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className={block.blockProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                            ${block.blockProfit.toFixed(2)}
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* All generators results */}
              <h4 className="text-sm font-medium text-gray-700">All Generators</h4>
              {[...results]
                .sort((a, b) => Number(b.profit) - Number(a.profit))
                .map((r) => (
                  <div
                    key={r.playerId}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                      r.playerId === playerId
                        ? 'bg-sky-50 border border-sky-200'
                        : (r.totalDispatchedMW ?? 0) > 0
                        ? 'bg-green-50'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <TrendingUp className={`w-5 h-5 ${(r.totalDispatchedMW ?? 0) > 0 ? 'text-green-500' : 'text-gray-400'}`} />
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName}
                          {r.isDominant && <span className="text-xs text-red-500 ml-1">(dominant)</span>}
                        </span>
                        <div className="text-xs text-gray-500">
                          {(r.totalDispatchedMW ?? 0) > 0
                            ? `Dispatched ${r.totalDispatchedMW} MW | Revenue: $${Number(r.totalRevenue ?? 0).toFixed(2)}`
                            : 'Not dispatched'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${Number(r.profit) > 0 ? 'text-green-600' : Number(r.profit) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                        ${Number(r.profit).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-400">profit</div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all generators submit offers</p>
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

export default ElectricityMarketUI;
