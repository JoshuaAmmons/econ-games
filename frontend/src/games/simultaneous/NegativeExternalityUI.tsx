import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Factory, CloudRain } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  production: number;
  revenue: number;
  privateCost: number;
  privateProfit: number;
  totalProduction: number;
  totalDamage: number;
  damagePerFirm: number;
  taxPaid: number;
  taxRedistribution: number;
  taxEnabled: boolean;
  taxRate: number;
  numFirms: number;
}

/**
 * Negative Externality Game UI (Week 8)
 * Firms choose production levels that create negative externalities.
 */
const NegativeExternalityUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [production, setProduction] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const revenuePerUnit = gameConfig.revenuePerUnit ?? 20;
  const costPerUnit = gameConfig.costPerUnit ?? 5;
  const damageRate = gameConfig.damageRate ?? 0.1;
  const maxProduction = gameConfig.maxProduction ?? 50;
  const taxEnabled = gameConfig.taxEnabled ?? false;
  const taxRate = gameConfig.taxRate ?? 0;

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setProduction('');
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
        toast.success(`Net profit: $${Number(myResult.profit).toFixed(2)} (damage: -$${Number(myResult.damagePerFirm).toFixed(2)})`);
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || production === '' || submitted) return;

    const pNum = parseFloat(production);
    if (isNaN(pNum) || pNum < 0) {
      toast.error('Please enter a valid production level');
      return;
    }

    setSubmitting(true);
    submitAction({ type: 'decision', production: pNum });
    setSubmitted(true);
    toast.success(`Production of ${pNum} units submitted!`);
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
              <span className="text-gray-500">Revenue per Unit:</span>
              <span className="font-medium">${revenuePerUnit}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Private Cost per Unit:</span>
              <span className="font-medium">${costPerUnit}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Damage Rate:</span>
              <span className="font-medium">{damageRate} (per Q&sup2;)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max Production:</span>
              <span className="font-medium">{maxProduction} units</span>
            </div>
            {taxEnabled && (
              <div className="mt-2 p-2 bg-amber-50 rounded text-amber-700 text-xs">
                <strong>Pigouvian Tax Active:</strong> ${taxRate}/unit
                <br />Tax revenue is redistributed equally to all firms.
              </div>
            )}
          </div>
        </Card>

        {/* Submit Form */}
        <Card title="Choose Production Level">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Production Submitted!</div>
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
                  max={maxProduction}
                  value={production}
                  onChange={(e) => setProduction(e.target.value)}
                  placeholder={`0 - ${maxProduction}`}
                  required
                />
                {production && (
                  <div className="text-xs text-gray-500 space-y-1 bg-gray-50 p-2 rounded">
                    <div>Revenue: ${(revenuePerUnit * (parseFloat(production) || 0)).toFixed(2)}</div>
                    <div>Cost: ${(costPerUnit * (parseFloat(production) || 0)).toFixed(2)}</div>
                    <div>Private Profit: ${((revenuePerUnit - costPerUnit) * (parseFloat(production) || 0)).toFixed(2)}</div>
                    <div className="text-amber-600">Social damage depends on total output by all firms</div>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting || production === ''}>
                  {submitting ? 'Submitting...' : 'Submit Production'}
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
              {/* Environmental Summary */}
              <div className="bg-red-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CloudRain className="w-5 h-5 text-red-600" />
                  <span className="font-medium text-red-700">Environmental Impact</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-500">Total Production</div>
                    <div className="text-xl font-bold text-gray-700">
                      {myResult?.totalProduction || 0} units
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Total Damage</div>
                    <div className="text-xl font-bold text-red-600">
                      ${myResult?.totalDamage != null ? Number(myResult.totalDamage).toFixed(2) : '0'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Damage per Firm</div>
                    <div className="text-xl font-bold text-red-600">
                      ${myResult?.damagePerFirm != null ? Number(myResult.damagePerFirm).toFixed(2) : '0'}
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
                      <Factory className="w-5 h-5 text-gray-400" />
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName || `Firm ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          Produced: {r.production} | Private: ${Number(r.privateProfit).toFixed(2)} | Damage: -${Number(r.damagePerFirm).toFixed(2)}
                          {r.taxEnabled && ` | Tax: -$${Number(r.taxPaid).toFixed(2)} | Rebate: +$${Number(r.taxRedistribution).toFixed(2)}`}
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
              <Factory className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all firms submit their production levels</p>
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

export default NegativeExternalityUI;
