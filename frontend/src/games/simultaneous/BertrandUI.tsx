import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Trophy, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  price: number;
  isWinner: boolean;
  quantity: number;
  revenue: number;
  cost: number;
  minPrice: number;
  numWinners: number;
}

/**
 * Bertrand Competition UI (Week 4)
 * Firms simultaneously set prices. Lowest price wins the market.
 */
const BertrandUI: React.FC<GameUIProps> = ({
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
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const marginalCost = Number(gameConfig.marginalCost ?? 10);
  const marketDemand = Number(gameConfig.marketDemand ?? 100);
  const maxPrice = Number(gameConfig.maxPrice ?? 100);

  // Reset state when new round starts
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setPrice('');
      setResults(null);
      setWaitingCount({ submitted: 0, total: 0 });
    }
  }, [roundId, roundActive]);

  // Socket events
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    // Recover game state on reconnect
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
          toast.success(`You won! Profit: $${Number(myResult.profit).toFixed(2)}`);
        } else {
          toast(`You didn't have the lowest price. Profit: $0`, { icon: '😞' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !price || submitted) return;

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error('Please enter a valid price');
      return;
    }
    if (priceNum > maxPrice) {
      toast.error(`Price cannot exceed $${maxPrice}`);
      return;
    }

    setSubmitting(true);
    submitAction({ type: 'decision', price: priceNum });
    setSubmitted(true);
    toast.success(`Price of $${priceNum.toFixed(2)} submitted!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Game Info & Submit */}
      <div className="space-y-4">
        {/* Game Parameters */}
        <Card>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Marginal Cost:</span>
              <span className="font-medium">${marginalCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Market Demand:</span>
              <span className="font-medium">{marketDemand} units</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max Price:</span>
              <span className="font-medium">${maxPrice.toFixed(2)}</span>
            </div>
          </div>
        </Card>

        {/* Submit Form */}
        <Card title="Set Your Price">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Price Submitted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>Waiting: {waitingCount.submitted}/{waitingCount.total} players submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label="Your Price ($)"
                  type="number"
                  step="0.01"
                  min="0"
                  max={maxPrice}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={`$0 - $${maxPrice}`}
                  required
                />
                <p className="text-xs text-gray-400">
                  Lowest price wins the entire market. Set above ${marginalCost} to make profit.
                </p>
                <Button type="submit" className="w-full" disabled={submitting || !price}>
                  {submitting ? 'Submitting...' : 'Submit Price'}
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
        <Card title="Round Results">
          {results ? (
            <div className="space-y-3">
              {[...results]
                .filter(r => r.price != null)
                .sort((a, b) => Number(a.price) - Number(b.price))
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
                          {r.playerId === playerId ? 'You' : r.playerName || `Firm ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          Price: ${Number(r.price).toFixed(2)} | Qty: {Number(r.quantity || 0).toFixed(0)}
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
              {/* Non-submitting players */}
              {results.filter(r => r.price == null).length > 0 && (
                <div className="text-xs text-gray-400 italic mt-2">
                  {results.filter(r => r.price == null).length} player(s) did not submit
                </div>
              )}
              {myResult && myResult.price != null && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    <span className="font-medium text-blue-700">Your Summary</span>
                  </div>
                  <p className="text-blue-600">
                    {myResult.isWinner
                      ? `You won with the lowest price of $${Number(myResult.price).toFixed(2)} (${myResult.numWinners > 1 ? `tied with ${myResult.numWinners - 1} other(s)` : 'sole winner'})`
                      : `The winning price was $${Number(myResult.minPrice).toFixed(2)}. Your price of $${Number(myResult.price).toFixed(2)} was too high.`}
                  </p>
                </div>
              )}
              {myResult && myResult.price == null && (
                <div className="mt-4 p-3 bg-amber-50 rounded-lg text-sm">
                  <p className="text-amber-700">You did not submit a price this round. Profit: $0.00</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all firms submit their prices</p>
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

export default BertrandUI;
