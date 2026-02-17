import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Check, X, HelpCircle, Car } from 'lucide-react';
import toast from 'react-hot-toast';

interface PairResult {
  firstMoverId: string;
  firstMoverName: string;
  secondMoverId: string;
  secondMoverName: string;
  firstMoveAction: { price: number; quality: number };
  secondMoveAction: { accept: boolean };
  firstMoverProfit: number;
  secondMoverProfit: number;
  firstMoverResultData: { quality: number; price: number; accepted: boolean; sellerCost: number; buyerValue: number };
  secondMoverResultData: { quality: number | null; price: number; accepted: boolean; buyerValue: number | null };
}

const MarketForLemonsUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [price, setPrice] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sellerQuality, setSellerQuality] = useState<number | null>(null);
  const [partnerPrice, setPartnerPrice] = useState<number | null>(null);
  const [results, setResults] = useState<PairResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const sellerCostFraction = gameConfig.sellerCostFraction ?? 0.5;
  const buyerValueFraction = gameConfig.buyerValueFraction ?? 1.5;
  const isSeller = player?.role === 'seller';

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setPrice('');
      setPartnerPrice(null);
      setResults(null);
      // Seller gets a random quality each round
      if (isSeller) {
        const qualities = [10, 20, 30, 40, 50, 60, 70, 80, 90];
        setSellerQuality(qualities[Math.floor(Math.random() * qualities.length)]);
      }
    }
  }, [roundId, roundActive, isSeller]);

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    // Recover game state on page load / reconnect
    cleanups.push(onEvent('game-state', (state: any) => {
      if (state.myAction) {
        setSubmitted(true);
        if (isSeller && state.myAction.quality) {
          setSellerQuality(state.myAction.quality);
        }
      }
      if (!isSeller && state.partnerAction) {
        setPartnerPrice(state.partnerAction.price);
      }
      if (state.results) {
        setResults(state.results.map ? state.results : []);
      }
    }));

    cleanups.push(onEvent('first-move-submitted', (data: { partnerId: string; action: { price: number } }) => {
      if (data.partnerId === playerId) {
        setPartnerPrice(data.action.price);
        toast(`Seller is offering at $${Number(data.action.price).toFixed(2)}`, { icon: '🏷️' });
      }
    }));

    cleanups.push(onEvent('second-move-submitted', (data: { partnerId: string }) => {
      if (data.partnerId === playerId) {
        toast('Buyer has decided!', { icon: '🤔' });
      }
    }));

    cleanups.push(onEvent('round-results', (data: { pairs: PairResult[] }) => {
      setResults(data.pairs);
      refreshPlayer();
      const myPair = data.pairs.find(p => p.firstMoverId === playerId || p.secondMoverId === playerId);
      if (myPair) {
        const myProfit = myPair.firstMoverId === playerId ? myPair.firstMoverProfit : myPair.secondMoverProfit;
        if (myPair.secondMoveAction?.accept) {
          toast.success(`Trade completed! Profit: $${Number(myProfit).toFixed(2)}`);
        } else {
          toast('No trade this round.', { icon: '🚫' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer, isSeller]);

  const handleSellerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !price || submitted || sellerQuality === null) return;
    const p = parseFloat(price);
    if (isNaN(p) || p < 0) {
      toast.error('Enter a valid price');
      return;
    }
    submitAction({ type: 'first_move', price: p, quality: sellerQuality });
    setSubmitted(true);
    toast.success(`Listed at $${p.toFixed(2)}`);
  };

  const handleBuyerDecision = (accept: boolean) => {
    if (!roundId || submitted) return;
    submitAction({ type: 'second_move', accept });
    setSubmitted(true);
    toast.success(accept ? 'Purchased!' : 'Passed');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card>
          <div className="text-center">
            <Car className="w-8 h-8 mx-auto text-sky-600 mb-2" />
            <div className="px-3 py-1 inline-block rounded-full text-sm font-medium bg-purple-100 text-purple-700">
              You are the {isSeller ? 'Seller' : 'Buyer'}
            </div>
          </div>
          <div className="mt-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Seller cost:</span>
              <span>quality &times; {sellerCostFraction}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Buyer value:</span>
              <span>quality &times; {buyerValueFraction}</span>
            </div>
          </div>
          {isSeller && sellerQuality !== null && (
            <div className="mt-3 bg-amber-50 rounded p-3 text-center">
              <div className="text-sm text-gray-500">Your Product Quality</div>
              <div className="text-2xl font-bold text-amber-700">{sellerQuality}</div>
              <div className="text-xs text-gray-400 mt-1">
                Your cost: ${(sellerQuality * sellerCostFraction).toFixed(2)} |
                Buyer would value at: ${(sellerQuality * buyerValueFraction).toFixed(2)}
              </div>
            </div>
          )}
          {!isSeller && (
            <div className="mt-3 bg-gray-50 rounded p-3 text-center text-sm text-gray-500">
              <HelpCircle className="w-5 h-5 mx-auto mb-1 text-gray-400" />
              Quality is hidden from you. You only see the price.
            </div>
          )}
        </Card>

        <Card title={isSeller ? 'Set Your Price' : 'Buy or Pass'}>
          {roundActive && roundId ? (
            isSeller ? (
              submitted ? (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium mb-2">Price Listed!</div>
                  <p className="text-sm text-gray-500">Waiting for buyer to decide...</p>
                </div>
              ) : (
                <form onSubmit={handleSellerSubmit} className="space-y-3">
                  <Input
                    label="Listing Price ($)"
                    type="number"
                    step="1"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Set your price..."
                    required
                  />
                  {price && sellerQuality !== null && (
                    <div className="text-xs bg-gray-50 p-2 rounded">
                      Your profit if sold: ${(parseFloat(price) - sellerQuality * sellerCostFraction).toFixed(2)}
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={!price}>
                    List for Sale
                  </Button>
                </form>
              )
            ) : (
              submitted ? (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium">Decision Submitted!</div>
                </div>
              ) : partnerPrice !== null ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-500 mb-1">Asking Price:</p>
                    <p className="text-3xl font-bold text-amber-700">${Number(partnerPrice).toFixed(2)}</p>
                    <p className="text-xs text-gray-400 mt-1">Quality: ???</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => handleBuyerDecision(true)}
                      className="bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" /> Buy
                    </Button>
                    <Button
                      onClick={() => handleBuyerDecision(false)}
                      className="bg-gray-600 hover:bg-gray-700 text-white flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4" /> Pass
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Users className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">Waiting for seller to set price...</p>
                </div>
              )
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

      <div>
        <Card title="Round Results">
          {results ? (
            <div className="space-y-3">
              {results.map((pair, i) => {
                const isMyPair = pair.firstMoverId === playerId || pair.secondMoverId === playerId;
                const traded = pair.secondMoveAction?.accept;
                return (
                  <div key={i} className={`rounded-lg p-4 ${isMyPair ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-medium px-2 py-0.5 rounded ${traded ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {traded ? 'Traded' : 'No Trade'}
                      </span>
                      <span className="text-sm text-gray-500">
                        Price: ${Number(pair.firstMoveAction?.price ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span>Quality: {pair.firstMoverResultData?.quality ?? "N/A"}</span>
                        <span>Value to buyer: ${Number(pair.firstMoverResultData?.buyerValue ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Seller: ${Number(pair.firstMoverProfit).toFixed(2)}</span>
                        <span>Buyer: ${Number(pair.secondMoverProfit).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Car className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all pairs complete</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default MarketForLemonsUI;
