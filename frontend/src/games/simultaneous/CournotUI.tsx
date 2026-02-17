import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, TrendingDown } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  quantity: number;
  marketPrice: number;
  totalQuantity: number;
  revenue: number;
  cost: number;
  numFirms: number;
}

/**
 * Cournot Competition UI (Week 5)
 * Firms simultaneously choose quantities. Market price depends on total output.
 */
const CournotUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [quantity, setQuantity] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const demandIntercept = gameConfig.demandIntercept ?? 100;
  const demandSlope = gameConfig.demandSlope ?? 1;
  const marginalCost = gameConfig.marginalCost ?? 10;
  const maxQuantity = gameConfig.maxQuantity ?? 100;

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setQuantity('');
      setResults(null);
      setWaitingCount({ submitted: 0, total: 0 });
    }
  }, [roundId, roundActive]);

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
        toast.success(`Market price: $${Number(myResult.marketPrice).toFixed(2)} | Your profit: $${Number(myResult.profit).toFixed(2)}`);
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !quantity || submitted) return;

    const qNum = parseFloat(quantity);
    if (isNaN(qNum) || qNum < 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    setSubmitting(true);
    submitAction({ type: 'decision', quantity: qNum });
    setSubmitted(true);
    toast.success(`Quantity of ${qNum} units submitted!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Game Info & Submit */}
      <div className="space-y-4">
        {/* Demand Function */}
        <Card>
          <div className="text-center mb-2">
            <span className="text-sm font-medium text-gray-700">Demand Function</span>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center font-mono text-lg">
            P = {demandIntercept} - {demandSlope} &times; Q
          </div>
          <div className="space-y-1 mt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Marginal Cost:</span>
              <span className="font-medium">${marginalCost}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max Quantity:</span>
              <span className="font-medium">{maxQuantity} units</span>
            </div>
          </div>
        </Card>

        {/* Submit Form */}
        <Card title="Choose Your Quantity">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Quantity Submitted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} firms submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label="Production Quantity"
                  type="number"
                  step="1"
                  min="0"
                  max={maxQuantity}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={`0 - ${maxQuantity}`}
                  required
                />
                <p className="text-xs text-gray-400">
                  More output means lower market price. Balance quantity against price.
                </p>
                <Button type="submit" className="w-full" disabled={submitting || !quantity}>
                  {submitting ? 'Submitting...' : 'Submit Quantity'}
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
            <div className="space-y-4">
              {/* Market Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-500">Market Price</div>
                    <div className="text-2xl font-bold text-sky-700">
                      ${myResult?.marketPrice != null ? Number(myResult.marketPrice).toFixed(2) : '0'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Total Output</div>
                    <div className="text-2xl font-bold text-gray-700">
                      {myResult?.totalQuantity || 0} units
                    </div>
                  </div>
                </div>
              </div>

              {/* Individual Results */}
              {[...results]
                .sort((a, b) => Number(b.profit) - Number(a.profit))
                .map((r, i) => (
                  <div
                    key={r.playerId}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                      r.playerId === playerId ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-gray-400">#{i + 1}</span>
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName || `Firm ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          Qty: {r.quantity} | Rev: ${Number(r.revenue).toFixed(2)} | Cost: ${Number(r.cost).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className={`font-bold text-lg ${Number(r.profit) > 0 ? 'text-green-600' : Number(r.profit) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      ${Number(r.profit).toFixed(2)}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <TrendingDown className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all firms submit their quantities</p>
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

export default CournotUI;
