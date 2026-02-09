import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Globe } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  laborGood1: number;
  laborGood2: number;
  good1Produced: number;
  good2Produced: number;
  utility: number;
  productivity1: number;
  productivity2: number;
  autarkyUtility: number;
  good1Name: string;
  good2Name: string;
  comparativeAdvantage: string;
}

const ComparativeAdvantageUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [laborGood1, setLaborGood1] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const laborUnits = gameConfig.laborUnits ?? 100;
  const good1Name = gameConfig.good1Name ?? 'Food';
  const good2Name = gameConfig.good2Name ?? 'Clothing';

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setLaborGood1('');
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
        toast.success(`Utility: ${myResult.utility.toFixed(1)} (autarky optimal: ${myResult.autarkyUtility.toFixed(1)})`);
      }
    }));
    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || laborGood1 === '' || submitted) return;
    const l1 = parseFloat(laborGood1);
    if (isNaN(l1) || l1 < 0 || l1 > laborUnits) {
      toast.error(`Labor must be between 0 and ${laborUnits}`);
      return;
    }
    setSubmitting(true);
    submitAction({ type: 'decision', laborGood1: l1 });
    setSubmitted(true);
    toast.success('Labor allocation submitted!');
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);
  const laborGood2 = laborGood1 ? laborUnits - parseFloat(laborGood1) : laborUnits;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-4">
        <Card>
          <div className="text-center">
            <Globe className="w-8 h-8 mx-auto text-sky-600 mb-2" />
            <div className="text-sm text-gray-500">Your Country</div>
            <div className="text-lg font-bold">{laborUnits} Labor Units</div>
          </div>
          {myResult && (
            <div className="mt-3 p-2 bg-blue-50 rounded text-sm">
              <div>Your {good1Name} productivity: {myResult.productivity1}x</div>
              <div>Your {good2Name} productivity: {myResult.productivity2}x</div>
              <div className="font-medium mt-1">
                Comparative advantage: {myResult.comparativeAdvantage}
              </div>
            </div>
          )}
        </Card>

        <Card title="Allocate Labor">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Allocation Submitted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} countries submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label={`Labor for ${good1Name} (0 - ${laborUnits})`}
                  type="number"
                  step="1"
                  min="0"
                  max={laborUnits}
                  value={laborGood1}
                  onChange={(e) => setLaborGood1(e.target.value)}
                  placeholder={`0 - ${laborUnits}`}
                  required
                />
                <div className="text-sm text-gray-500 bg-gray-50 rounded p-2">
                  Labor for {good2Name}: {laborGood2}
                </div>
                <Button type="submit" className="w-full" disabled={submitting || laborGood1 === ''}>
                  {submitting ? 'Submitting...' : 'Submit Allocation'}
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
              <span className="font-medium">Total Utility</span>
            </div>
            <span className="text-2xl font-bold text-green-600">
              {player?.total_profit?.toFixed(2) || '0.00'}
            </span>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card title="Round Results">
          {results ? (
            <div className="space-y-3">
              {results.sort((a, b) => b.utility - a.utility).map((r, i) => (
                <div key={r.playerId} className={`rounded-lg p-4 ${r.playerId === playerId ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{r.playerId === playerId ? 'You' : r.playerName || `Country ${i + 1}`}</span>
                    <span className="font-bold text-green-600">Utility: {r.utility.toFixed(1)}</span>
                  </div>
                  <div className="text-sm text-gray-500 grid grid-cols-2 gap-2">
                    <div>{good1Name}: {r.good1Produced} (labor: {r.laborGood1})</div>
                    <div>{good2Name}: {r.good2Produced} (labor: {r.laborGood2})</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all countries submit allocations</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ComparativeAdvantageUI;
