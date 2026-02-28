import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { Building2, DoorOpen, DollarSign, Users, Trophy, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ActiveSeller {
  playerId: string;
  playerName: string;
  isIncumbent: boolean;
}

interface SellerResult {
  playerId: string;
  playerName: string;
  isIncumbent: boolean;
  price: number;
  isWinner: boolean;
  quantity: number;
  revenue: number;
  variableCost: number;
  fixedCost: number;
  totalCost: number;
  profit: number;
  entered: boolean;
}

interface MarketBenchmarks {
  monopolyPrice: number;
  competitivePrice: number;
  monopolyProfit: number;
}

interface RoundResults {
  sellers: SellerResult[];
  benchmarks: MarketBenchmarks;
  totalDemand: number;
  efficiency: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const ContestableMarketUI: React.FC<GameUIProps> = ({
  session: _session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [phase, setPhase] = useState<'entry' | 'posting' | 'results' | 'waiting'>('waiting');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [price, setPrice] = useState('');

  // Game data
  const [isIncumbent, setIsIncumbent] = useState(false);
  const [activeSellers, setActiveSellers] = useState<ActiveSeller[]>([]);
  const [results, setResults] = useState<RoundResults | null>(null);

  // Config (received from game-state)
  const [fixedCost, setFixedCost] = useState(0);
  const [variableCost, setVariableCost] = useState(0);
  const [demandIntercept, setDemandIntercept] = useState(100);
  const [demandSlope, setDemandSlope] = useState(1);

  const priceNum = parseFloat(price) || 0;
  const isActive = activeSellers.some((s) => s.playerId === playerId);

  // Reset on new round
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setPrice('');
      setResults(null);
      setActiveSellers([]);
      setPhase('waiting');
      setWaitingCount({ submitted: 0, total: 0 });
      refreshPlayer();
    }
  }, [roundId, roundActive, refreshPlayer]);

  // Socket events
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      onEvent('game-state', (state: any) => {
        if (state.phase) setPhase(state.phase);
        if (state.incumbentId) {
          setIsIncumbent(state.incumbentId === playerId);
        }
        if (state.isIncumbent != null) {
          setIsIncumbent(state.isIncumbent);
        }
        if (state.activeSellers) setActiveSellers(state.activeSellers);
        if (state.results) setResults(state.results);
        if (state.myAction) setSubmitted(true);
        if (state.fixedCost != null) setFixedCost(state.fixedCost);
        if (state.variableCost != null) setVariableCost(state.variableCost);
        if (state.demandIntercept != null) setDemandIntercept(state.demandIntercept);
        if (state.demandSlope != null) setDemandSlope(state.demandSlope);
        if (state.totalSubmitted !== undefined && state.totalPlayers !== undefined) {
          setWaitingCount({ submitted: state.totalSubmitted, total: state.totalPlayers });
        }
      })
    );

    cleanups.push(
      onEvent('phase-change', (data: any) => {
        if (data.phase) setPhase(data.phase);
        if (data.activeSellers) setActiveSellers(data.activeSellers);
        if (data.results) setResults(data.results);
        if (data.entryResults) {
          // Could display entry decision results here if needed
        }
        // Reset submission status when entering posting phase
        if (data.phase === 'posting') {
          setSubmitted(false);
          setWaitingCount({ submitted: 0, total: 0 });
        }
      })
    );

    cleanups.push(
      onEvent('action-submitted', (data: { submitted: number; total: number; phase?: string }) => {
        setWaitingCount({ submitted: data.submitted, total: data.total });
      })
    );

    cleanups.push(
      onEvent('action-confirmed', () => {
        // Server confirmed our action
      })
    );

    cleanups.push(
      onEvent('round-results', (data: any) => {
        if (data.results) setResults(data.results);
        // Also accept flattened shape
        if (data.sellers) setResults(data as RoundResults);
        setPhase('results');
        refreshPlayer();

        const myResult = (data.results?.sellers ?? data.sellers ?? []).find(
          (s: SellerResult) => s.playerId === playerId
        );
        if (myResult) {
          if (myResult.isWinner) {
            toast.success(`You won! Profit: $${Number(myResult.profit).toFixed(2)}`);
          } else if (myResult.entered) {
            toast(`You entered but didn't win. Profit: $${Number(myResult.profit).toFixed(2)}`, {
              icon: '😞',
            });
          } else {
            toast('You stayed out this round.', { icon: '🚪' });
          }
        }
      })
    );

    return () => cleanups.forEach((fn) => fn());
  }, [onEvent, playerId, refreshPlayer]);

  // Entry actions
  const handleEnter = () => {
    if (!roundId || submitted) return;
    setSubmitting(true);
    submitAction({ type: 'enter' });
    setSubmitted(true);
    toast.success('Entering the market!');
    setTimeout(() => setSubmitting(false), 500);
  };

  const handleStayOut = () => {
    if (!roundId || submitted) return;
    setSubmitting(true);
    submitAction({ type: 'stay_out' });
    setSubmitted(true);
    toast('Staying out this round', { icon: '🚪' });
    setTimeout(() => setSubmitting(false), 500);
  };

  // Post price
  const handlePostPrice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !price || submitted) return;

    const p = parseFloat(price);
    if (isNaN(p) || p < 0) {
      toast.error('Please enter a valid price');
      return;
    }

    setSubmitting(true);
    submitAction({ type: 'post_price', price: p });
    setSubmitted(true);
    toast.success(`Price of $${p.toFixed(2)} posted!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  // Preview calculations for posting phase
  const previewQ = priceNum > 0 ? Math.max(0, (demandIntercept - priceNum) / demandSlope) : 0;
  const previewRevenue = priceNum * previewQ;
  const previewTotalCost = fixedCost + variableCost * previewQ;
  const previewProfit = previewRevenue - previewTotalCost;

  // Derive my result from results
  const allSellers = results?.sellers ?? [];
  const myResult = allSellers.find((s) => s.playerId === playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ====== LEFT: Role & Action ====== */}
      <div className="space-y-4">
        {/* Role Card */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="text-center mb-3">
            {isIncumbent ? (
              <Building2 className="w-8 h-8 mx-auto text-amber-500 mb-1" />
            ) : (
              <DoorOpen className="w-8 h-8 mx-auto text-blue-400 mb-1" />
            )}
            <div className="text-sm text-gray-400">Contestable Market</div>
            <div
              className={`text-xl font-bold mt-1 ${
                isIncumbent ? 'text-amber-400' : 'text-blue-400'
              }`}
            >
              {isIncumbent ? 'Incumbent' : 'Potential Entrant'}
            </div>
          </div>

          {/* Cost structure */}
          <div className="bg-gray-700/40 rounded-lg p-3 space-y-2 text-sm">
            <div className="text-xs text-amber-400/70 font-medium uppercase tracking-wide mb-1">
              Cost Structure
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Fixed Cost:</span>
              <span className="font-mono font-medium">${fixedCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Variable Cost (per unit):</span>
              <span className="font-mono font-medium">${variableCost.toFixed(2)}</span>
            </div>
          </div>

          {/* Demand curve */}
          <div className="bg-gray-700/40 rounded-lg p-3 mt-3 text-center">
            <div className="text-xs text-amber-400/70 font-medium uppercase tracking-wide mb-1">
              Demand
            </div>
            <div className="font-mono text-gray-300 text-sm">
              Q = {demandIntercept} - {demandSlope} x P
            </div>
          </div>

          {/* Phase Indicator */}
          <div className="mt-3 flex gap-1">
            {(['entry', 'posting', 'results'] as const).map((p) => (
              <div
                key={p}
                className={`flex-1 text-center py-1 rounded text-[10px] font-medium capitalize ${
                  phase === p
                    ? 'bg-amber-600/40 text-amber-200 ring-1 ring-amber-500/50'
                    : 'bg-gray-700/40 text-gray-500'
                }`}
              >
                {p}
              </div>
            ))}
          </div>
        </Card>

        {/* Action Card */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="font-semibold text-amber-200 mb-3">
            {phase === 'entry' && 'Entry Decision'}
            {phase === 'posting' && 'Post Your Price'}
            {phase === 'results' && 'Round Complete'}
            {phase === 'waiting' && 'Waiting'}
          </div>

          {!roundActive || !roundId ? (
            <p className="text-center text-gray-500 py-4">Waiting for round to start...</p>
          ) : phase === 'entry' ? (
            isIncumbent ? (
              /* Incumbent auto-participates */
              <div className="text-center py-4">
                <Building2 className="w-6 h-6 mx-auto text-amber-500 mb-2" />
                <div className="text-amber-300 font-medium mb-1">You automatically participate</div>
                <div className="text-xs text-gray-500">
                  Waiting for entrants to decide...
                </div>
                {waitingCount.total > 0 && (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-400 mt-2">
                    <Users className="w-4 h-4" />
                    <span>
                      {waitingCount.submitted}/{waitingCount.total} decided
                    </span>
                  </div>
                )}
              </div>
            ) : submitted ? (
              <div className="text-center py-4">
                <div className="text-green-400 font-medium mb-2">Decision Submitted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                  <Users className="w-4 h-4" />
                  <span>
                    {waitingCount.submitted}/{waitingCount.total} decided
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 text-center mb-2">
                  Enter the market (and pay the fixed cost) or stay out?
                </p>
                <Button
                  onClick={handleEnter}
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={submitting}
                >
                  <div className="flex items-center justify-center gap-2">
                    <DoorOpen className="w-4 h-4" />
                    Enter Market (pay ${fixedCost.toFixed(2)} entry cost)
                  </div>
                </Button>
                <Button
                  onClick={handleStayOut}
                  className="w-full bg-gray-600 hover:bg-gray-500"
                  disabled={submitting}
                >
                  Stay Out
                </Button>
              </div>
            )
          ) : phase === 'posting' ? (
            !isActive ? (
              <div className="text-center py-4">
                <div className="text-gray-400 font-medium mb-1">You stayed out this round</div>
                <div className="text-xs text-gray-500">
                  Waiting for active sellers to post prices...
                </div>
                {waitingCount.total > 0 && (
                  <div className="text-sm text-gray-500 mt-2">
                    {waitingCount.submitted}/{waitingCount.total} posted
                  </div>
                )}
              </div>
            ) : submitted ? (
              <div className="text-center py-4">
                <div className="text-green-400 font-medium mb-2">Price Posted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                  <Users className="w-4 h-4" />
                  <span>
                    {waitingCount.submitted}/{waitingCount.total} sellers posted
                  </span>
                </div>
              </div>
            ) : (
              <form onSubmit={handlePostPrice} className="space-y-3">
                <Input
                  label="Your Price ($)"
                  type="number"
                  step="0.01"
                  min="0"
                  max={demandIntercept}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Set your price"
                  className="bg-gray-700 border-gray-600 text-amber-100"
                  required
                />

                {/* Preview */}
                {price && !isNaN(priceNum) && priceNum >= 0 && (
                  <div className="bg-gray-700/50 rounded p-2 text-xs space-y-1 text-gray-300">
                    <div className="flex justify-between">
                      <span>Quantity demanded:</span>
                      <span className="font-medium">{previewQ.toFixed(1)} units</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Revenue:</span>
                      <span className="font-medium">${previewRevenue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total cost:</span>
                      <span className="font-medium">${previewTotalCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-600 pt-1 mt-1">
                      <span>Profit (if you win):</span>
                      <span
                        className={`font-medium ${
                          previewProfit >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        ${previewProfit.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={submitting || !price}>
                  {submitting ? 'Posting...' : 'Post Price'}
                </Button>
              </form>
            )
          ) : phase === 'results' ? (
            <p className="text-center text-gray-400 py-4">See results on the right</p>
          ) : (
            <p className="text-center text-gray-500 py-4">Waiting...</p>
          )}
        </Card>

        {/* Active Sellers (posting phase) */}
        {phase === 'posting' && activeSellers.length > 0 && (
          <Card className="bg-gray-800/80 border border-gray-700/50">
            <div className="font-semibold text-amber-200 text-sm mb-2">
              Active Sellers ({activeSellers.length})
            </div>
            <div className="space-y-1">
              {activeSellers.map((s) => (
                <div
                  key={s.playerId}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                    s.playerId === playerId
                      ? 'bg-amber-900/30 border border-amber-700/40'
                      : 'bg-gray-700/20'
                  }`}
                >
                  {s.isIncumbent ? (
                    <Building2 className="w-3 h-3 text-amber-500" />
                  ) : (
                    <DoorOpen className="w-3 h-3 text-blue-400" />
                  )}
                  <span className="text-gray-300">
                    {s.playerId === playerId ? 'You' : s.playerName}
                  </span>
                  <span className="text-[10px] text-gray-500 ml-auto">
                    {s.isIncumbent ? 'Incumbent' : 'Entrant'}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Total Profit */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              <span className="font-medium text-amber-200">Total Profit</span>
            </div>
            <span
              className={`text-2xl font-bold ${
                (Number(player?.total_profit) || 0) >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              ${Number(player?.total_profit || 0).toFixed(2)}
            </span>
          </div>
        </Card>
      </div>

      {/* ====== CENTER & RIGHT: Results ====== */}
      <div className="lg:col-span-2">
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            <span className="font-semibold text-amber-200">Market Results</span>
          </div>

          {results && allSellers.length > 0 ? (
            <div className="space-y-4">
              {/* Benchmarks */}
              {results.benchmarks && (
                <div className="bg-indigo-900/30 border border-indigo-700/40 rounded-lg p-4">
                  <div className="text-xs text-indigo-400 font-medium uppercase tracking-wide mb-2">
                    Benchmark Prices
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-[10px] text-gray-500">Monopoly Price</div>
                      <div className="text-lg font-bold text-red-400">
                        ${Number(results.benchmarks.monopolyPrice).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500">Competitive (Zero-Profit)</div>
                      <div className="text-lg font-bold text-green-400">
                        ${Number(results.benchmarks.competitivePrice).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500">Efficiency</div>
                      <div className="text-lg font-bold text-amber-300">
                        {(Number(results.efficiency) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Total demand */}
              {results.totalDemand != null && (
                <div className="text-sm text-gray-400 text-center">
                  Total Market Demand at Winning Price:{' '}
                  <span className="font-medium text-amber-300">
                    {Number(results.totalDemand).toFixed(1)} units
                  </span>
                </div>
              )}

              {/* Sellers Table */}
              <div>
                <h4 className="text-sm font-semibold text-amber-300/80 mb-2">All Sellers</h4>
                <div className="space-y-1">
                  {[...allSellers]
                    .sort((a, b) => {
                      // Winners first, then by price
                      if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
                      return Number(a.price) - Number(b.price);
                    })
                    .map((s) => (
                      <div
                        key={s.playerId}
                        className={`rounded-lg p-3 ${
                          s.playerId === playerId
                            ? 'bg-sky-900/30 border border-sky-700/40'
                            : s.isWinner
                            ? 'bg-green-900/20 border border-green-800/30'
                            : s.entered
                            ? 'bg-gray-700/30'
                            : 'bg-gray-800/30 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {s.isWinner && <Trophy className="w-4 h-4 text-yellow-500" />}
                            {s.isIncumbent ? (
                              <Building2 className="w-3 h-3 text-amber-500" />
                            ) : (
                              <DoorOpen className="w-3 h-3 text-blue-400" />
                            )}
                            <span className="font-medium text-sm text-gray-300">
                              {s.playerId === playerId ? 'You' : s.playerName}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              ({s.isIncumbent ? 'Incumbent' : 'Entrant'})
                            </span>
                          </div>
                          <div
                            className={`font-bold text-sm ${
                              Number(s.profit) > 0
                                ? 'text-green-400'
                                : Number(s.profit) < 0
                                ? 'text-red-400'
                                : 'text-gray-500'
                            }`}
                          >
                            ${Number(s.profit).toFixed(2)}
                          </div>
                        </div>

                        {s.entered ? (
                          <div className="text-xs text-gray-500 grid grid-cols-4 gap-2">
                            <div>
                              Price: <span className="text-gray-300">${Number(s.price).toFixed(2)}</span>
                            </div>
                            <div>
                              Qty: <span className="text-gray-300">{Number(s.quantity).toFixed(1)}</span>
                            </div>
                            <div>
                              Rev: <span className="text-gray-300">${Number(s.revenue).toFixed(2)}</span>
                            </div>
                            <div>
                              Cost: <span className="text-gray-300">${Number(s.totalCost).toFixed(2)}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 italic">Stayed out</div>
                        )}

                        {s.isWinner && (
                          <div className="mt-1 text-[10px] text-green-400 font-medium">
                            Winner - served the market
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* My result summary */}
              {myResult && (
                <div
                  className={`rounded-lg p-3 text-sm border ${
                    myResult.isWinner
                      ? 'bg-green-900/30 border-green-700/40'
                      : 'bg-gray-700/30 border-gray-600/40'
                  }`}
                >
                  <div className="font-medium text-amber-200 mb-1">Your Summary</div>
                  {myResult.entered ? (
                    <div className="text-xs text-gray-400 space-y-0.5">
                      <div>
                        Posted price: ${Number(myResult.price).toFixed(2)}
                        {myResult.isWinner ? ' (lowest!)' : ''}
                      </div>
                      {myResult.isWinner && (
                        <>
                          <div>Quantity sold: {Number(myResult.quantity).toFixed(1)}</div>
                          <div>Revenue: ${Number(myResult.revenue).toFixed(2)}</div>
                          <div>
                            Total cost: ${Number(myResult.totalCost).toFixed(2)} (Fixed: $
                            {Number(myResult.fixedCost).toFixed(2)} + Variable: $
                            {Number(myResult.variableCost).toFixed(2)})
                          </div>
                        </>
                      )}
                      <div
                        className={`font-medium ${
                          Number(myResult.profit) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        Profit: ${Number(myResult.profit).toFixed(2)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">
                      You stayed out this round. Profit: $0
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-gray-400">
                {phase === 'entry'
                  ? 'Entrants are making entry decisions...'
                  : phase === 'posting'
                  ? 'Active sellers are posting prices...'
                  : 'Waiting for round to start'}
              </p>
              {waitingCount.total > 0 && (
                <p className="text-sm mt-2 text-gray-500">
                  {waitingCount.submitted}/{waitingCount.total} submitted
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ContestableMarketUI;
