import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Store, ShoppingCart, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';

interface PostedPrice {
  sellerId: string;
  sellerName: string;
  price: number;
}

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  role: 'buyer' | 'seller';
  price?: number;
  cost?: number;
  valuation?: number;
  isMatched: boolean;
  tradedWith?: string;
  tradedWithName?: string;
  tradePrice?: number;
  numBuyers: number;
  numSellers: number;
  totalTrades: number;
  efficiency?: number;
}

/**
 * Posted-Offer Pricing UI (Week 28)
 * Two-phase game: sellers post prices, then buyers shop.
 * Sellers set take-it-or-leave-it prices; buyers choose which seller to buy from.
 */
const PostedOfferUI: React.FC<GameUIProps> = ({
  session: _session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [phase, setPhase] = useState<'posting' | 'shopping' | 'waiting'>('waiting');
  const [price, setPrice] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [postedPrices, setPostedPrices] = useState<PostedPrice[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null);
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const role = player?.role as 'buyer' | 'seller';
  const isSeller = role === 'seller';
  const privateValue = isSeller
    ? Number(player?.production_cost ?? 0)
    : Number(player?.valuation ?? 0);

  const priceNum = parseFloat(price) || 0;

  // Reset state when new round starts
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setPrice('');
      setSelectedSeller(null);
      setPostedPrices([]);
      setResults(null);
      setPhase('waiting');
      setWaitingCount({ submitted: 0, total: 0 });
      refreshPlayer();
    }
  }, [roundId, roundActive, refreshPlayer]);

  // Socket events
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(onEvent('game-state', (state: any) => {
      if (state.phase) {
        setPhase(state.phase);
      }
      if (state.myAction) setSubmitted(true);
      if (state.postedPrices) setPostedPrices(state.postedPrices);
      if (state.totalSubmitted !== undefined && state.totalPlayers !== undefined) {
        setWaitingCount({ submitted: state.totalSubmitted, total: state.totalPlayers });
      }
      if (state.results) setResults(state.results);
    }));

    cleanups.push(onEvent('phase-change', (data: { phase: string; postedPrices?: PostedPrice[] }) => {
      setPhase(data.phase as any);
      if (data.postedPrices) {
        setPostedPrices(data.postedPrices);
      }
      if (data.phase === 'shopping') {
        setSubmitted(false); // Reset for buyers in phase 2
        setWaitingCount({ submitted: 0, total: 0 });
      }
    }));

    cleanups.push(onEvent('action-submitted', (data: { submitted: number; total: number }) => {
      setWaitingCount({ submitted: data.submitted, total: data.total });
    }));

    cleanups.push(onEvent('round-results', (data: { results: RoundResult[] }) => {
      setResults(data.results);
      refreshPlayer();
      const myResult = data.results.find(r => r.playerId === playerId);
      if (myResult) {
        if (myResult.isMatched) {
          toast.success(`Trade! Profit: $${Number(myResult.profit).toFixed(2)}`);
        } else {
          toast(`No trade this round.`, { icon: '😞' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  // Seller: post price
  const handlePostPrice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || price === '' || submitted) return;

    const priceVal = parseFloat(price);
    if (isNaN(priceVal) || priceVal < 0) {
      toast.error('Please enter a valid price');
      return;
    }

    setSubmitting(true);
    submitAction({ type: 'decision', price: priceVal });
    setSubmitted(true);
    toast.success(`Price of $${priceVal.toFixed(2)} posted!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  // Buyer: choose seller
  const handleChooseSeller = (sellerId: string) => {
    if (!roundId || submitted) return;

    setSelectedSeller(sellerId);
    setSubmitting(true);
    submitAction({ type: 'decision', sellerId });
    setSubmitted(true);
    const seller = postedPrices.find(p => p.sellerId === sellerId);
    toast.success(`Selected ${seller?.sellerName || 'seller'} at $${seller?.price.toFixed(2)}`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Role Info & Action */}
      <div className="space-y-4">
        {/* Role & Value */}
        <Card>
          <div className="text-center mb-3">
            {isSeller
              ? <Store className="w-8 h-8 mx-auto text-orange-600 mb-1" />
              : <ShoppingCart className="w-8 h-8 mx-auto text-blue-600 mb-1" />
            }
            <div className="text-sm text-gray-500">Posted-Offer Market</div>
            <div className={`text-xl font-bold mt-1 ${isSeller ? 'text-orange-700' : 'text-blue-700'}`}>
              You are a {isSeller ? 'Seller' : 'Buyer'}
            </div>
          </div>
          <div className={`p-2 rounded text-xs text-center ${isSeller ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>
            {isSeller
              ? 'Phase 1: Post your take-it-or-leave-it price'
              : 'Phase 2: Choose a seller to buy from'}
          </div>
          <div className="mt-3 bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-sm text-gray-500">
              {isSeller ? 'Your Cost' : 'Your Valuation'}
            </div>
            <div className="text-3xl font-bold text-amber-700">${privateValue.toFixed(2)}</div>
            <p className="text-xs text-gray-400 mt-1">
              {isSeller ? 'Your production cost' : 'Max value to you'}
            </p>
          </div>
          {/* Phase Indicator */}
          <div className="mt-3 flex gap-2">
            <div className={`flex-1 text-center py-1 rounded text-xs font-medium ${
              phase === 'posting' ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-300' : 'bg-gray-100 text-gray-500'
            }`}>
              Phase 1: Posting
            </div>
            <div className={`flex-1 text-center py-1 rounded text-xs font-medium ${
              phase === 'shopping' ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300' : 'bg-gray-100 text-gray-500'
            }`}>
              Phase 2: Shopping
            </div>
          </div>
        </Card>

        {/* Action Card */}
        <Card title={isSeller ? 'Post Your Price' : 'Choose a Seller'}>
          {!roundActive || !roundId ? (
            <p className="text-center text-gray-500 py-4">Waiting for round to start...</p>
          ) : results ? (
            <p className="text-center text-gray-500 py-4">Round complete — see results</p>
          ) : isSeller && phase === 'posting' ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Price Posted!</div>
                <div className="text-sm text-gray-500">Waiting for all sellers to post...</div>
              </div>
            ) : (
              <form onSubmit={handlePostPrice} className="space-y-3">
                <Input
                  label="Your Price ($)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Set your price"
                  required
                />
                {price && !isNaN(priceNum) && priceNum >= 0 && (
                  <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Your price:</span>
                      <span className="font-medium">${priceNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Your cost:</span>
                      <span className="font-medium">${privateValue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Profit if sold:</span>
                      <span className={`font-medium ${priceNum - privateValue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${(priceNum - privateValue).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting || price === ''}>
                  {submitting ? 'Posting...' : 'Post Price'}
                </Button>
              </form>
            )
          ) : isSeller && phase === 'shopping' ? (
            <div className="text-center py-4">
              <div className="text-orange-600 font-medium mb-2">Price Posted!</div>
              <div className="text-sm text-gray-500">Buyers are shopping...</div>
            </div>
          ) : !isSeller && phase === 'posting' ? (
            <div className="text-center py-4">
              <div className="text-blue-600 font-medium mb-2">Sellers are posting prices...</div>
              <div className="text-sm text-gray-500">You will shop once all prices are posted</div>
            </div>
          ) : !isSeller && phase === 'shopping' ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Choice Submitted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} buyers chose</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 mb-2">Select a seller to buy from:</p>
                {postedPrices
                  .sort((a, b) => a.price - b.price)
                  .map((pp) => {
                    const affordable = pp.price <= privateValue;
                    return (
                      <button
                        key={pp.sellerId}
                        onClick={() => handleChooseSeller(pp.sellerId)}
                        disabled={submitting}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 transition ${
                          selectedSeller === pp.sellerId
                            ? 'border-blue-500 bg-blue-50'
                            : affordable
                            ? 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                            : 'border-gray-200 bg-gray-50 opacity-60'
                        }`}
                      >
                        <div className="text-left">
                          <div className="font-medium text-sm">{pp.sellerName}</div>
                          {!affordable && <div className="text-xs text-red-500">Above your valuation</div>}
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">${pp.price.toFixed(2)}</div>
                          {affordable && (
                            <div className="text-xs text-green-600">
                              Profit: ${(privateValue - pp.price).toFixed(2)}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                {postedPrices.length === 0 && (
                  <p className="text-center text-gray-400 py-3">No prices posted yet</p>
                )}
              </div>
            )
          ) : (
            <p className="text-center text-gray-500 py-4">Waiting...</p>
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
              {/* Summary */}
              <div className="bg-indigo-50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-gray-500">Total Trades</div>
                    <div className="text-lg font-bold text-indigo-700">
                      {myResult?.totalTrades ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Sellers</div>
                    <div className="text-lg font-bold text-orange-700">
                      {myResult?.numSellers ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Buyers</div>
                    <div className="text-lg font-bold text-blue-700">
                      {myResult?.numBuyers ?? 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sellers */}
              <div>
                <h4 className="text-sm font-semibold text-orange-700 mb-2">Sellers</h4>
                {[...results]
                  .filter(r => r.role === 'seller')
                  .sort((a, b) => Number(a.price) - Number(b.price))
                  .map((r, i) => (
                    <div
                      key={r.playerId}
                      className={`flex items-center justify-between px-4 py-2 rounded-lg mb-1 ${
                        r.playerId === playerId
                          ? 'bg-sky-50 border border-sky-200'
                          : r.isMatched
                          ? 'bg-green-50'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {r.isMatched && <Trophy className="w-4 h-4 text-yellow-500" />}
                        <div>
                          <span className="font-medium text-sm">
                            {r.playerId === playerId ? 'You' : r.playerName || `Seller ${i + 1}`}
                          </span>
                          <div className="text-xs text-gray-500">
                            Price: ${Number(r.price).toFixed(2)}
                            {r.isMatched && r.tradedWithName && ` → sold to ${r.tradedWithName}`}
                          </div>
                        </div>
                      </div>
                      <div className={`font-bold text-sm ${Number(r.profit) > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                        ${Number(r.profit).toFixed(2)}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Buyers */}
              <div>
                <h4 className="text-sm font-semibold text-blue-700 mb-2">Buyers</h4>
                {[...results]
                  .filter(r => r.role === 'buyer')
                  .sort((a, b) => Number(b.profit) - Number(a.profit))
                  .map((r, i) => (
                    <div
                      key={r.playerId}
                      className={`flex items-center justify-between px-4 py-2 rounded-lg mb-1 ${
                        r.playerId === playerId
                          ? 'bg-sky-50 border border-sky-200'
                          : r.isMatched
                          ? 'bg-green-50'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {r.isMatched && <Trophy className="w-4 h-4 text-yellow-500" />}
                        <div>
                          <span className="font-medium text-sm">
                            {r.playerId === playerId ? 'You' : r.playerName || `Buyer ${i + 1}`}
                          </span>
                          <div className="text-xs text-gray-500">
                            {r.isMatched && r.tradedWithName
                              ? `Bought from ${r.tradedWithName} at $${Number(r.tradePrice).toFixed(2)}`
                              : 'No trade'}
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
              <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>
                {phase === 'posting' ? 'Sellers are posting prices...' :
                 phase === 'shopping' ? 'Buyers are shopping...' :
                 'Waiting for round to start'}
              </p>
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

export default PostedOfferUI;
