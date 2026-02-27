import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Globe, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  willingnessToPay: number;
  valuation: number;
  provisionLevel: number;
  payment: number;
  totalWTP: number;
  groupSize: number;
  marginalCostPG: number;
  efficientLevel: number;
  maxQuantity: number;
}

/**
 * Lindahl Mechanism UI (Week 29)
 * Players report willingness-to-pay per unit of a public good.
 * Provision level = min(ΣwTP / marginalCost, maxQuantity).
 */
const LindahlUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [wtp, setWtp] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const marginalCostPG = gameConfig.marginalCostPG ?? 10;
  const maxQuantity = gameConfig.maxQuantity ?? 50;
  const privateValue = Number(player?.valuation ?? 0);

  // Derived preview
  const wtpNum = parseFloat(wtp) || 0;

  // Reset state when new round starts
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setWtp('');
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
        toast.success(`Profit: $${Number(myResult.profit).toFixed(2)} | Provision: ${Number(myResult.provisionLevel).toFixed(1)} units`);
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || wtp === '' || submitted) return;

    const wtpVal = parseFloat(wtp);
    if (isNaN(wtpVal) || wtpVal < 0) {
      toast.error('Please enter a valid WTP');
      return;
    }

    setSubmitting(true);
    submitAction({ type: 'decision', willingnessToPay: wtpVal });
    setSubmitted(true);
    toast.success(`WTP of $${wtpVal.toFixed(2)}/unit submitted!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Game Info & Submit */}
      <div className="space-y-4">
        {/* Parameters */}
        <Card>
          <div className="text-center mb-3">
            <Globe className="w-8 h-8 mx-auto text-emerald-600 mb-1" />
            <div className="text-sm text-gray-500">Lindahl Public Good</div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Marginal Cost:</span>
              <span className="font-bold text-sky-700">${marginalCostPG}/unit</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max Quantity:</span>
              <span className="font-medium">{maxQuantity} units</span>
            </div>
          </div>
          <div className="mt-3 bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-sm text-gray-500">Your Value Per Unit</div>
            <div className="text-3xl font-bold text-amber-700">${privateValue.toFixed(2)}</div>
            <p className="text-xs text-gray-400 mt-1">Only you know this value</p>
          </div>
        </Card>

        {/* Submit Form */}
        <Card title="Report Your WTP">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">WTP Submitted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} players submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label="Willingness to Pay ($/unit)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={wtp}
                  onChange={(e) => setWtp(e.target.value)}
                  placeholder="How much per unit?"
                  required
                />
                {wtp && !isNaN(wtpNum) && wtpNum >= 0 && (
                  <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Your WTP:</span>
                      <span className="font-medium">${wtpNum.toFixed(2)}/unit</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Your value:</span>
                      <span className="font-medium">${privateValue.toFixed(2)}/unit</span>
                    </div>
                    {wtpNum > privateValue && (
                      <div className="text-red-600 font-medium mt-1">
                        Warning: WTP exceeds your value — you may lose money!
                      </div>
                    )}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting || wtp === ''}>
                  {submitting ? 'Submitting...' : 'Submit WTP'}
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
              {/* Provision Summary */}
              <div className="bg-emerald-50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-500">Provision Level</div>
                    <div className="text-xl font-bold text-emerald-700">
                      {myResult ? Number(myResult.provisionLevel).toFixed(1) : 0} units
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Efficient Level</div>
                    <div className="text-xl font-bold text-blue-700">
                      {myResult ? Number(myResult.efficientLevel).toFixed(1) : 0} units
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Total WTP</div>
                    <div className="text-xl font-bold text-emerald-700">
                      ${myResult ? Number(myResult.totalWTP).toFixed(2) : 0}
                    </div>
                  </div>
                </div>
                {myResult && Number(myResult.provisionLevel) < Number(myResult.efficientLevel) && (
                  <div className="text-xs text-amber-700 text-center mt-2 bg-amber-50 rounded p-1">
                    Under-provision: free-riding reduced the public good below the efficient level
                  </div>
                )}
              </div>

              {/* My Result */}
              {myResult && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Your Result</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>WTP reported: <span className="font-bold">${Number(myResult.willingnessToPay).toFixed(2)}/unit</span></div>
                    <div>True value: <span className="font-bold">${Number(myResult.valuation).toFixed(2)}/unit</span></div>
                    <div>Your payment: <span className="font-bold">${Number(myResult.payment).toFixed(2)}</span></div>
                    <div>Your profit: <span className={`font-bold ${Number(myResult.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${Number(myResult.profit).toFixed(2)}
                    </span></div>
                  </div>
                </div>
              )}

              {/* All Players */}
              {[...results]
                .sort((a, b) => Number(b.willingnessToPay) - Number(a.willingnessToPay))
                .map((r, i) => (
                  <div
                    key={r.playerId}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                      r.playerId === playerId ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <TrendingUp className={`w-5 h-5 ${Number(r.willingnessToPay) > 0 ? 'text-emerald-500' : 'text-gray-300'}`} />
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName || `Voter ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          WTP: ${Number(r.willingnessToPay).toFixed(2)}/unit | Payment: ${Number(r.payment).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${Number(r.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${Number(r.profit).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-400">profit</div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all players submit their WTP</p>
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

export default LindahlUI;
