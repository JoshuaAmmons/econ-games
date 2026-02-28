import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { Gavel, DollarSign, Users, TrendingUp, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MatchResult {
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  price: number;
  buyerProfit: number;
  sellerProfit: number;
}

interface RoundResult {
  playerId: string;
  playerName: string;
  role: 'buyer' | 'seller';
  profit: number;
  stopPrice: number;
  valuation?: number;
  cost?: number;
  isMatched: boolean;
  clearingPrice: number;
  matches: MatchResult[];
  efficiency: number;
  totalBuyers: number;
  totalSellers: number;
  totalMatches: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const DoubleDutchAuctionUI: React.FC<GameUIProps> = ({
  session: _session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [stopPrice, setStopPrice] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const isBuyer = player?.role === 'buyer';
  const privateValue = isBuyer
    ? Number(player?.valuation ?? 0)
    : Number(player?.production_cost ?? 0);
  const priceNum = parseFloat(stopPrice) || 0;

  // Warning conditions
  const isBuyerAboveValue = isBuyer && stopPrice !== '' && priceNum > privateValue;
  const isSellerBelowCost = !isBuyer && stopPrice !== '' && priceNum < privateValue;

  // Reset on new round
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setStopPrice('');
      setResults(null);
      setWaitingCount({ submitted: 0, total: 0 });
      refreshPlayer();
    }
  }, [roundId, roundActive, refreshPlayer]);

  // Socket events
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      onEvent('game-state', (state: any) => {
        if (state.myAction) setSubmitted(true);
        if (state.totalSubmitted !== undefined && state.totalPlayers !== undefined) {
          setWaitingCount({ submitted: state.totalSubmitted, total: state.totalPlayers });
        }
        if (state.results) setResults(state.results);
      })
    );

    cleanups.push(
      onEvent('action-submitted', (data: { submitted: number; total: number }) => {
        setWaitingCount({ submitted: data.submitted, total: data.total });
      })
    );

    cleanups.push(
      onEvent('action-confirmed', () => {
        // Confirmation received from server
      })
    );

    cleanups.push(
      onEvent('round-results', (data: { results: RoundResult[] }) => {
        setResults(data.results);
        refreshPlayer();
        const myResult = data.results.find((r) => r.playerId === playerId);
        if (myResult) {
          if (myResult.isMatched) {
            toast.success(
              `Matched! Profit: $${Number(myResult.profit).toFixed(2)} at clearing price $${Number(myResult.clearingPrice).toFixed(2)}`
            );
          } else {
            toast(`Not matched this round.`, { icon: '😞' });
          }
        }
      })
    );

    return () => cleanups.forEach((fn) => fn());
  }, [onEvent, playerId, refreshPlayer]);

  // Submit stop price
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !stopPrice || submitted) return;

    const val = parseFloat(stopPrice);
    if (isNaN(val) || val < 0) {
      toast.error('Please enter a valid price');
      return;
    }

    setSubmitting(true);
    submitAction({ type: 'submit_stop_price', stopPrice: val });
    setSubmitted(true);
    toast.success(`Stop price of $${val.toFixed(2)} submitted!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find((r) => r.playerId === playerId);
  const clearingPrice = myResult?.clearingPrice ?? null;
  const efficiency = myResult?.efficiency ?? null;
  const matches = myResult?.matches ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ====== LEFT: Role & Submit ====== */}
      <div className="space-y-4">
        {/* Role Card */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="text-center mb-3">
            <Gavel className="w-8 h-8 mx-auto text-amber-500 mb-1" />
            <div className="text-sm text-gray-400">Double Dutch Auction</div>
            <div className={`text-xl font-bold mt-1 ${isBuyer ? 'text-green-400' : 'text-red-400'}`}>
              You are a {isBuyer ? 'Buyer' : 'Seller'}
            </div>
          </div>
          <div className={`p-2 rounded text-xs text-center ${
            isBuyer ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'
          }`}>
            {isBuyer
              ? 'Submit the MAXIMUM price you would pay'
              : 'Submit the MINIMUM price you would accept'}
          </div>
          <div className="mt-3 bg-amber-900/30 rounded-lg p-3 text-center">
            <div className="text-sm text-amber-400/70">
              Your {isBuyer ? 'Valuation' : 'Production Cost'}
            </div>
            <div className="text-3xl font-bold text-amber-200">
              ${privateValue.toFixed(2)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {isBuyer ? 'Max you should pay' : 'Min you should accept'}
            </p>
          </div>
        </Card>

        {/* Submit Form */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="font-semibold text-amber-200 mb-3">
            {isBuyer ? 'Your Bid Price' : 'Your Ask Price'}
          </div>

          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-400 font-medium mb-2">Price Submitted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                  <Users className="w-4 h-4" />
                  <span>
                    {waitingCount.submitted}/{waitingCount.total} players submitted
                  </span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label={isBuyer ? 'Maximum Price ($)' : 'Minimum Price ($)'}
                  type="number"
                  step="0.01"
                  min="0"
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value)}
                  placeholder={
                    isBuyer ? 'Max price you would pay' : 'Min price you would accept'
                  }
                  className="bg-gray-700 border-gray-600 text-amber-100"
                  required
                />

                {/* Warnings */}
                {isBuyerAboveValue && (
                  <div className="bg-red-900/40 border border-red-700/50 rounded p-2 text-xs text-red-300">
                    Warning: Bidding above your valuation risks a loss!
                  </div>
                )}
                {isSellerBelowCost && (
                  <div className="bg-red-900/40 border border-red-700/50 rounded p-2 text-xs text-red-300">
                    Warning: Asking below your cost risks a loss!
                  </div>
                )}

                {/* Preview */}
                {stopPrice && !isNaN(priceNum) && priceNum >= 0 && (
                  <div className="bg-gray-700/50 rounded p-2 text-xs space-y-1 text-gray-300">
                    <div className="flex justify-between">
                      <span>Your price:</span>
                      <span className="font-medium">${priceNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Your {isBuyer ? 'valuation' : 'cost'}:</span>
                      <span className="font-medium">${privateValue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        Max profit {isBuyer ? '(if clearing < bid)' : '(if clearing > ask)'}:
                      </span>
                      <span
                        className={`font-medium ${
                          (isBuyer ? privateValue - priceNum : priceNum - privateValue) >= 0
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}
                      >
                        ${Math.abs(isBuyer ? privateValue - priceNum : priceNum - privateValue).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || !stopPrice}
                >
                  {submitting ? 'Submitting...' : 'Submit Price'}
                </Button>
              </form>
            )
          ) : (
            <p className="text-center text-gray-500 py-4">
              Waiting for round to start...
            </p>
          )}
        </Card>

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

          {results ? (
            <div className="space-y-4">
              {/* Clearing Price Banner */}
              {clearingPrice !== null && (
                <div className="bg-amber-900/40 border border-amber-600/50 rounded-lg p-4 text-center">
                  <div className="text-sm text-amber-400/70">Uniform Clearing Price</div>
                  <div className="text-4xl font-bold text-amber-200">
                    ${Number(clearingPrice).toFixed(2)}
                  </div>
                  {efficiency !== null && (
                    <div className="mt-2 text-sm text-amber-400/80">
                      Market Efficiency: {(Number(efficiency) * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              )}

              {/* My Result */}
              {myResult && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    myResult.isMatched
                      ? 'bg-green-900/30 border border-green-700/40'
                      : 'bg-gray-700/30 border border-gray-600/40'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {myResult.isMatched && <Trophy className="w-4 h-4 text-yellow-500" />}
                    <span className="font-medium text-amber-200">
                      {myResult.isMatched
                        ? 'You were matched!'
                        : 'You were not matched this round.'}
                    </span>
                  </div>
                  {myResult.isMatched && (
                    <div className="text-xs text-gray-400">
                      Your {isBuyer ? 'bid' : 'ask'}: $
                      {Number(myResult.stopPrice).toFixed(2)} | Clearing price: $
                      {Number(myResult.clearingPrice).toFixed(2)} | Profit:{' '}
                      <span className="text-green-400 font-medium">
                        ${Number(myResult.profit).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Matches Table */}
              {matches.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-amber-300/80 mb-2">
                    All Matches ({matches.length})
                  </h4>
                  <div className="space-y-1">
                    {matches.map((m, i) => {
                      const isMyMatch =
                        m.buyerId === playerId || m.sellerId === playerId;
                      return (
                        <div
                          key={i}
                          className={`flex items-center justify-between px-3 py-2 rounded text-xs ${
                            isMyMatch
                              ? 'bg-amber-900/30 border border-amber-700/40'
                              : 'bg-gray-700/20'
                          }`}
                        >
                          <div className="flex-1">
                            <span className="text-green-400">
                              {m.buyerId === playerId ? 'You' : m.buyerName}
                            </span>
                            <span className="text-gray-500 mx-2">bought from</span>
                            <span className="text-red-400">
                              {m.sellerId === playerId ? 'You' : m.sellerName}
                            </span>
                          </div>
                          <div className="text-right ml-3">
                            <span className="font-mono text-amber-200">
                              ${Number(m.price).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* All Players */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Buyers */}
                <div>
                  <h4 className="text-sm font-semibold text-green-400 mb-2">
                    Buyers ({results.filter((r) => r.role === 'buyer').length})
                  </h4>
                  <div className="space-y-1">
                    {[...results]
                      .filter((r) => r.role === 'buyer')
                      .sort((a, b) => Number(b.stopPrice) - Number(a.stopPrice))
                      .map((r) => (
                        <div
                          key={r.playerId}
                          className={`flex items-center justify-between px-3 py-2 rounded text-xs ${
                            r.playerId === playerId
                              ? 'bg-sky-900/30 border border-sky-700/40'
                              : r.isMatched
                              ? 'bg-green-900/20'
                              : 'bg-gray-700/20'
                          }`}
                        >
                          <div>
                            <span className="font-medium text-gray-300">
                              {r.playerId === playerId ? 'You' : r.playerName}
                            </span>
                            <div className="text-[10px] text-gray-500">
                              Bid: ${Number(r.stopPrice).toFixed(2)}
                              {r.isMatched ? ' - Matched' : ' - No match'}
                            </div>
                          </div>
                          <div
                            className={`font-bold ${
                              Number(r.profit) > 0 ? 'text-green-400' : 'text-gray-500'
                            }`}
                          >
                            ${Number(r.profit).toFixed(2)}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Sellers */}
                <div>
                  <h4 className="text-sm font-semibold text-red-400 mb-2">
                    Sellers ({results.filter((r) => r.role === 'seller').length})
                  </h4>
                  <div className="space-y-1">
                    {[...results]
                      .filter((r) => r.role === 'seller')
                      .sort((a, b) => Number(a.stopPrice) - Number(b.stopPrice))
                      .map((r) => (
                        <div
                          key={r.playerId}
                          className={`flex items-center justify-between px-3 py-2 rounded text-xs ${
                            r.playerId === playerId
                              ? 'bg-sky-900/30 border border-sky-700/40'
                              : r.isMatched
                              ? 'bg-green-900/20'
                              : 'bg-gray-700/20'
                          }`}
                        >
                          <div>
                            <span className="font-medium text-gray-300">
                              {r.playerId === playerId ? 'You' : r.playerName}
                            </span>
                            <div className="text-[10px] text-gray-500">
                              Ask: ${Number(r.stopPrice).toFixed(2)}
                              {r.isMatched ? ' - Matched' : ' - No match'}
                            </div>
                          </div>
                          <div
                            className={`font-bold ${
                              Number(r.profit) > 0 ? 'text-green-400' : 'text-gray-500'
                            }`}
                          >
                            ${Number(r.profit).toFixed(2)}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Gavel className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-gray-400">
                Results will appear after all players submit their prices
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

export default DoubleDutchAuctionUI;
