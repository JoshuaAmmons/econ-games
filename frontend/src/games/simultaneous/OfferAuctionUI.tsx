import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { Gavel, DollarSign, Trophy, Package } from 'lucide-react';
import { WaitingIndicator } from '../../components/shared/WaitingIndicator';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  ask: number;
  cost: number;
  isWinner: boolean;
  pricePaid: number | null;
  rank: number;
  numUnits: number;
  numSellers: number;
  clearingPrice: number;
  cutoffAsk: number;
  efficiency: number;
  pricingRule: string;
}

/**
 * Offer Auction (Sellers Only) UI
 * Based on Smith (1964). Sellers submit sealed offers; lowest offers win.
 */
const OfferAuctionUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [ask, setAsk] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const numUnits = gameConfig.numUnits ?? 3;
  const pricingRule = gameConfig.pricingRule ?? 'uniform';
  const privateCost = Number(player?.production_cost ?? 0);
  const askNum = parseFloat(ask) || 0;
  const isOfferingBelowCost = ask !== '' && askNum < privateCost;

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setAsk('');
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
    }));

    cleanups.push(onEvent('action-submitted', (data: { submitted: number; total: number }) => {
      setWaitingCount({ submitted: data.submitted, total: data.total });
    }));

    cleanups.push(onEvent('round-results', (data: { results: RoundResult[] }) => {
      setResults(data.results);
      refreshPlayer();
      const myResult = data.results.find(r => r.playerId === playerId);
      if (myResult) {
        if (myResult.isWinner) {
          toast.success(`You sold a unit! Received $${Number(myResult.pricePaid).toFixed(2)}. Profit: $${Number(myResult.profit).toFixed(2)}`);
        } else {
          toast(`Your offer was not accepted. Profit: $0`, { icon: '😞' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !ask || submitted) return;
    const askVal = parseFloat(ask);
    if (isNaN(askVal) || askVal < 0) {
      toast.error('Please enter a valid offer price');
      return;
    }
    setSubmitting(true);
    submitAction({ type: 'decision', ask: askVal });
    setSubmitted(true);
    toast.success(`Offer of $${askVal.toFixed(2)} submitted!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);
  const winnersCount = results?.filter(r => r.isWinner).length ?? 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
      <div className="space-y-3 md:space-y-4">
        <Card>
          <div className="text-center mb-3">
            <Gavel className="w-8 h-8 mx-auto text-orange-600 mb-1" />
            <div className="text-sm text-gray-500">Offer Auction</div>
            <div className="text-lg font-bold text-orange-700">
              Sellers Only {pricingRule === 'uniform' ? '• Uniform Price' : '• Pay-As-Bid'}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 bg-orange-50 rounded-lg p-3 mb-3">
            <Package className="w-5 h-5 text-orange-600" />
            <span className="text-lg font-bold text-orange-700">{numUnits} units</span>
            <span className="text-sm text-gray-500">demanded</span>
          </div>
          <div className="text-xs p-2 rounded text-center bg-orange-50 text-orange-700">
            {pricingRule === 'uniform'
              ? `Lowest ${numUnits} offers win — all paid the highest accepted offer`
              : `Lowest ${numUnits} offers win — each paid their own offer`}
          </div>
          <div className="mt-3 bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-sm text-gray-500">Your Production Cost</div>
            <div className="text-3xl font-bold text-amber-700">${privateCost.toFixed(2)}</div>
            <p className="text-xs text-gray-400 mt-1">Only you know this cost</p>
          </div>
        </Card>

        <Card title="Submit Your Offer">
          {roundActive && roundId ? (
            submitted ? (
              <WaitingIndicator
                message="Offer Submitted!"
                submitted={waitingCount.submitted}
                total={waitingCount.total}
              />
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label="Your Offer Price ($)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  placeholder="Enter your offer price"
                  required
                />
                {isOfferingBelowCost && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                    <span className="font-medium">Warning:</span> Offering below your cost risks a loss!
                  </div>
                )}
                {ask && !isNaN(askNum) && askNum >= 0 && (
                  <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Your offer:</span>
                      <span className="font-medium">${askNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Your cost:</span>
                      <span className="font-medium">${privateCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Profit if you win{pricingRule === 'uniform' ? ' (min)' : ''}:</span>
                      <span className={`font-medium ${askNum - privateCost >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${(askNum - privateCost).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-gray-400 italic">
                      You need to be in the lowest {numUnits} offers to win
                    </div>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting || !ask}>
                  {submitting ? 'Submitting...' : 'Submit Offer'}
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

      <div className="lg:col-span-2">
        <Card title="Auction Results">
          {results ? (
            <div className="space-y-3">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-center">
                <strong>{winnersCount}</strong> of {numUnits} units sold
                {myResult && pricingRule === 'uniform' && (
                  <span className="ml-2">| Clearing price: ${Number(myResult.clearingPrice).toFixed(2)}</span>
                )}
                {myResult && (
                  <span className="ml-2">| Efficiency: {Number(myResult.efficiency).toFixed(1)}%</span>
                )}
              </div>

              {myResult && (
                <div className={`p-3 rounded-lg text-sm ${myResult.isWinner ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {myResult.isWinner && <Trophy className="w-4 h-4 text-yellow-500" />}
                    <span className="font-medium text-gray-700">
                      {myResult.isWinner ? `You sold a unit! (Rank #${myResult.rank})` : `Your offer was not accepted. (Rank #${myResult.rank})`}
                    </span>
                  </div>
                  {myResult.isWinner && (
                    <p className="text-gray-600 text-xs">
                      Price received: ${Number(myResult.pricePaid).toFixed(2)} | Your cost: ${Number(myResult.cost).toFixed(2)} | Profit: ${Number(myResult.profit).toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              {[...results]
                .filter(r => r.ask != null)
                .sort((a, b) => Number(a.ask) - Number(b.ask))
                .map((r, i) => (
                  <div
                    key={r.playerId}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                      r.playerId === playerId
                        ? 'bg-sky-50 border border-sky-200'
                        : r.isWinner
                        ? 'bg-green-50'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {r.isWinner && <Trophy className="w-5 h-5 text-yellow-500" />}
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName || `Seller ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          Rank #{r.rank} | Offer: ${Number(r.ask).toFixed(2)}
                          {r.isWinner && ` | Received: $${Number(r.pricePaid).toFixed(2)}`}
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

              {results.filter(r => r.ask == null).length > 0 && (
                <div className="text-xs text-gray-400 italic mt-2">
                  {results.filter(r => r.ask == null).length} seller(s) did not submit an offer
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Gavel className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all offers are submitted</p>
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

export default OfferAuctionUI;
