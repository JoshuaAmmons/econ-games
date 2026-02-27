import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, ArrowDownUp, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  role: 'buyer' | 'seller';
  bid?: number;
  ask?: number;
  valuation?: number;
  cost?: number;
  clearingPrice: number;
  clearingQuantity: number;
  isTrader: boolean;
  rank: number;
  numBuyers: number;
  numSellers: number;
  efficiency: number;
  actualSurplus: number;
  maxSurplus: number;
}

/**
 * Sealed Bid-Offer Auction UI (Week 31)
 * Two-sided clearing market: buyers submit bids, sellers submit asks.
 * Market clears at the intersection.
 */
const SealedBidOfferUI: React.FC<GameUIProps> = ({
  session: _session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [amount, setAmount] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const role = player?.role as 'buyer' | 'seller';
  const isBuyer = role === 'buyer';
  const privateValue = isBuyer
    ? Number(player?.valuation ?? 0)
    : Number((player as any)?.cost ?? player?.production_cost ?? 0);

  const amountNum = parseFloat(amount) || 0;

  // Reset state when new round starts
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setAmount('');
      setResults(null);
      setWaitingCount({ submitted: 0, total: 0 });
      refreshPlayer();
    }
  }, [roundId, roundActive, refreshPlayer]);

  // Socket events
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(onEvent('game-state', (state: any) => {
      if (state.myAction) setSubmitted(true);
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
        if (myResult.isTrader) {
          toast.success(`Trade executed! Profit: $${Number(myResult.profit).toFixed(2)}`);
        } else {
          toast(`No trade this round. Profit: $0`, { icon: '😞' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || amount === '' || submitted) return;

    const val = parseFloat(amount);
    if (isNaN(val) || val < 0) {
      toast.error(`Please enter a valid ${isBuyer ? 'bid' : 'ask'}`);
      return;
    }

    setSubmitting(true);
    if (isBuyer) {
      submitAction({ type: 'decision', bid: val });
    } else {
      submitAction({ type: 'decision', ask: val });
    }
    setSubmitted(true);
    toast.success(`${isBuyer ? 'Bid' : 'Ask'} of $${val.toFixed(2)} submitted!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Game Info & Submit */}
      <div className="space-y-4">
        {/* Role & Value */}
        <Card>
          <div className="text-center mb-3">
            <ArrowDownUp className="w-8 h-8 mx-auto text-indigo-600 mb-1" />
            <div className="text-sm text-gray-500">Sealed Bid-Offer Market</div>
            <div className={`text-xl font-bold mt-1 ${isBuyer ? 'text-blue-700' : 'text-orange-700'}`}>
              You are a {isBuyer ? 'Buyer' : 'Seller'}
            </div>
          </div>
          <div className={`p-2 rounded text-xs text-center ${isBuyer ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>
            {isBuyer
              ? 'Submit a sealed bid — the max you\'ll pay'
              : 'Submit a sealed ask — the min you\'ll accept'}
          </div>
          <div className="mt-3 bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-sm text-gray-500">
              {isBuyer ? 'Your Valuation' : 'Your Cost'}
            </div>
            <div className="text-3xl font-bold text-amber-700">${privateValue.toFixed(2)}</div>
            <p className="text-xs text-gray-400 mt-1">
              {isBuyer ? 'Max value to you' : 'Your production cost'}
            </p>
          </div>
        </Card>

        {/* Submit Form */}
        <Card title={isBuyer ? 'Place Your Bid' : 'Set Your Ask'}>
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">
                  {isBuyer ? 'Bid' : 'Ask'} Submitted!
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} players submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label={isBuyer ? 'Your Bid ($)' : 'Your Ask ($)'}
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={isBuyer ? 'Max willingness to pay' : 'Min willingness to accept'}
                  required
                />
                {amount && !isNaN(amountNum) && amountNum >= 0 && (
                  <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Your {isBuyer ? 'bid' : 'ask'}:</span>
                      <span className="font-medium">${amountNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Your {isBuyer ? 'valuation' : 'cost'}:</span>
                      <span className="font-medium">${privateValue.toFixed(2)}</span>
                    </div>
                    {isBuyer && amountNum > privateValue && (
                      <div className="text-red-600 font-medium mt-1">
                        Warning: Bidding above your valuation risks a loss!
                      </div>
                    )}
                    {!isBuyer && amountNum < privateValue && (
                      <div className="text-red-600 font-medium mt-1">
                        Warning: Asking below your cost risks a loss!
                      </div>
                    )}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting || amount === ''}>
                  {submitting ? 'Submitting...' : `Submit ${isBuyer ? 'Bid' : 'Ask'}`}
                </Button>
              </form>
            )
          ) : (
            <p className="text-center text-gray-500 py-4">Waiting for round to start...</p>
          )}
        </Card>

        {/* Profit */}
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
        <Card title="Market Results">
          {results ? (
            <div className="space-y-4">
              {/* Clearing Summary */}
              <div className="bg-indigo-50 rounded-lg p-4">
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div>
                    <div className="text-xs text-gray-500">Clearing Price</div>
                    <div className="text-lg font-bold text-indigo-700">
                      ${myResult ? Number(myResult.clearingPrice).toFixed(2) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Trades</div>
                    <div className="text-lg font-bold text-indigo-700">
                      {myResult?.clearingQuantity ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Efficiency</div>
                    <div className="text-lg font-bold text-green-700">
                      {myResult ? Number(myResult.efficiency).toFixed(1) : 0}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Surplus</div>
                    <div className="text-lg font-bold text-green-700">
                      ${myResult ? Number(myResult.actualSurplus).toFixed(2) : 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Buyers */}
              <div>
                <h4 className="text-sm font-semibold text-blue-700 mb-2">Buyers (sorted by bid ↓)</h4>
                {[...results]
                  .filter(r => r.role === 'buyer')
                  .sort((a, b) => Number(b.bid) - Number(a.bid))
                  .map((r, i) => (
                    <div
                      key={r.playerId}
                      className={`flex items-center justify-between px-4 py-2 rounded-lg mb-1 ${
                        r.playerId === playerId
                          ? 'bg-sky-50 border border-sky-200'
                          : r.isTrader
                          ? 'bg-green-50'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {r.isTrader && <Trophy className="w-4 h-4 text-yellow-500" />}
                        <div>
                          <span className="font-medium text-sm">
                            {r.playerId === playerId ? 'You' : r.playerName || `Buyer ${i + 1}`}
                          </span>
                          <div className="text-xs text-gray-500">
                            Bid: ${Number(r.bid).toFixed(2)}
                            {r.isTrader && ` → Traded at $${Number(r.clearingPrice).toFixed(2)}`}
                          </div>
                        </div>
                      </div>
                      <div className={`font-bold text-sm ${Number(r.profit) > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                        ${Number(r.profit).toFixed(2)}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Sellers */}
              <div>
                <h4 className="text-sm font-semibold text-orange-700 mb-2">Sellers (sorted by ask ↑)</h4>
                {[...results]
                  .filter(r => r.role === 'seller')
                  .sort((a, b) => Number(a.ask) - Number(b.ask))
                  .map((r, i) => (
                    <div
                      key={r.playerId}
                      className={`flex items-center justify-between px-4 py-2 rounded-lg mb-1 ${
                        r.playerId === playerId
                          ? 'bg-sky-50 border border-sky-200'
                          : r.isTrader
                          ? 'bg-green-50'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {r.isTrader && <Trophy className="w-4 h-4 text-yellow-500" />}
                        <div>
                          <span className="font-medium text-sm">
                            {r.playerId === playerId ? 'You' : r.playerName || `Seller ${i + 1}`}
                          </span>
                          <div className="text-xs text-gray-500">
                            Ask: ${Number(r.ask).toFixed(2)}
                            {r.isTrader && ` → Traded at $${Number(r.clearingPrice).toFixed(2)}`}
                          </div>
                        </div>
                      </div>
                      <div className={`font-bold text-sm ${Number(r.profit) > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                        ${Number(r.profit).toFixed(2)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <ArrowDownUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all players submit</p>
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

export default SealedBidOfferUI;
