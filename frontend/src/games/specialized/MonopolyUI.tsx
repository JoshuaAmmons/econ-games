import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Crown } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  price: number;
  quantity: number;
  revenue: number;
  totalCost: number;
  consumerSurplus: number;
  deadweightLoss: number;
  optimalPrice: number;
  optimalQuantity: number;
  optimalProfit: number;
  marginalCost: number;
}

const MonopolyUI: React.FC<GameUIProps> = ({
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
  const demandIntercept = gameConfig.demandIntercept ?? 100;
  const demandSlope = gameConfig.demandSlope ?? 1;
  const marginalCost = gameConfig.marginalCost ?? 20;
  const fixedCost = gameConfig.fixedCost ?? 0;

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setPrice('');
      setResults(null);
      setWaitingCount({ submitted: 0, total: 0 });
    }
  }, [roundId, roundActive]);

  useEffect(() => {
    const cleanups: (() => void)[] = [];
    cleanups.push(onEvent('action-submitted', (data: { submitted: number; total: number }) => {
      setWaitingCount({ submitted: data.submitted, total: data.total });
    }));
    cleanups.push(onEvent('round-results', (data: { results: RoundResult[] }) => {
      setResults(data.results);
      refreshPlayer();
      const myResult = data.results.find(r => r.playerId === playerId);
      if (myResult) {
        toast.success(`Profit: $${myResult.profit.toFixed(2)} (optimal: $${myResult.optimalProfit.toFixed(2)})`);
      }
    }));
    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !price || submitted) return;
    const p = parseFloat(price);
    if (isNaN(p) || p < 0) {
      toast.error('Please enter a valid price');
      return;
    }
    setSubmitting(true);
    submitAction({ type: 'decision', price: p });
    setSubmitted(true);
    toast.success(`Price of $${p.toFixed(2)} set!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  // Preview calculation
  const previewPrice = parseFloat(price) || 0;
  const previewQ = Math.max(0, (demandIntercept - previewPrice) / demandSlope);
  const previewRevenue = previewPrice * previewQ;
  const previewProfit = previewRevenue - marginalCost * previewQ - fixedCost;

  const myResult = results?.find(r => r.playerId === playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-4">
        <Card>
          <div className="text-center mb-2">
            <Crown className="w-8 h-8 mx-auto text-yellow-500 mb-1" />
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
            {fixedCost > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Fixed Cost:</span>
                <span className="font-medium">${fixedCost}</span>
              </div>
            )}
          </div>
        </Card>

        <Card title="Set Your Price">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Price Set!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} monopolists submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label="Your Price ($)"
                  type="number"
                  step="0.50"
                  min="0"
                  max={demandIntercept}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={`$0 - $${demandIntercept}`}
                  required
                />
                {price && (
                  <div className="text-xs space-y-1 bg-gray-50 rounded p-2">
                    <div>Quantity demanded: {previewQ.toFixed(1)} units</div>
                    <div>Revenue: ${previewRevenue.toFixed(2)}</div>
                    <div className={`font-medium ${previewProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Expected Profit: ${previewProfit.toFixed(2)}
                    </div>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting || !price}>
                  {submitting ? 'Submitting...' : 'Set Price'}
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
            <span className={`text-2xl font-bold ${(player?.total_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${player?.total_profit?.toFixed(2) || '0.00'}
            </span>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card title="Round Results">
          {results ? (
            <div className="space-y-4">
              {myResult && (
                <div className="bg-blue-50 rounded-lg p-4 text-sm">
                  <div className="font-medium text-blue-700 mb-2">Optimal Benchmark</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-gray-500">Optimal Price</div>
                      <div className="font-bold">${myResult.optimalPrice.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Optimal Qty</div>
                      <div className="font-bold">{myResult.optimalQuantity.toFixed(1)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Max Profit</div>
                      <div className="font-bold">${myResult.optimalProfit.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              )}

              {results.sort((a, b) => b.profit - a.profit).map((r, i) => (
                <div key={r.playerId} className={`rounded-lg p-4 ${r.playerId === playerId ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{r.playerId === playerId ? 'You' : r.playerName || `Monopolist ${i + 1}`}</span>
                    <span className={`font-bold text-lg ${r.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${r.profit.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 grid grid-cols-4 gap-2">
                    <div>P: ${r.price.toFixed(2)}</div>
                    <div>Q: {r.quantity.toFixed(1)}</div>
                    <div>CS: ${r.consumerSurplus.toFixed(2)}</div>
                    <div>DWL: ${r.deadweightLoss.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Crown className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all monopolists set prices</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default MonopolyUI;
