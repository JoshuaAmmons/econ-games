import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Heart, PieChart } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  contribution: number;
  kept: number;
  publicGoodReturn: number;
  totalContribution: number;
  avgContribution: number;
  groupSize: number;
  endowment: number;
  mpcr: number;
}

/**
 * Public Goods Game UI (Week 6)
 * Players decide how much to contribute to a public good.
 */
const PublicGoodsUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [contribution, setContribution] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const endowment = gameConfig.endowment ?? 20;
  const mpcr = gameConfig.mpcr ?? 0.4;

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setContribution('');
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
        toast.success(`Earnings: $${myResult.profit.toFixed(2)}`);
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || contribution === '' || submitted) return;

    const cNum = parseFloat(contribution);
    if (isNaN(cNum) || cNum < 0) {
      toast.error('Please enter a valid contribution');
      return;
    }
    if (cNum > endowment) {
      toast.error(`Cannot contribute more than your endowment of ${endowment}`);
      return;
    }

    setSubmitting(true);
    submitAction({ type: 'decision', contribution: cNum });
    setSubmitted(true);
    toast.success(`Contributed ${cNum} tokens!`);
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
              <span className="text-gray-500">Your Endowment:</span>
              <span className="font-bold text-sky-700">{endowment} tokens</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">MPCR:</span>
              <span className="font-medium">{mpcr}</span>
            </div>
            <div className="text-xs text-gray-400 mt-2 p-2 bg-gray-50 rounded">
              Each token contributed to the public good earns {mpcr} tokens for <em>every</em> player.
              Tokens kept earn 1 token only for you.
            </div>
          </div>
        </Card>

        {/* Submit Form */}
        <Card title="Your Contribution">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Contribution Submitted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} players submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label={`Tokens to Contribute (0 - ${endowment})`}
                  type="number"
                  step="1"
                  min="0"
                  max={endowment}
                  value={contribution}
                  onChange={(e) => setContribution(e.target.value)}
                  placeholder={`0 - ${endowment}`}
                  required
                />
                {contribution && (
                  <div className="text-xs text-gray-500 space-y-1 bg-gray-50 p-2 rounded">
                    <div>Keeping: {endowment - (parseFloat(contribution) || 0)} tokens</div>
                    <div>Contributing: {parseFloat(contribution) || 0} tokens to public good</div>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting || contribution === ''}>
                  {submitting ? 'Submitting...' : 'Submit Contribution'}
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
              <span className="font-medium">Total Earnings</span>
            </div>
            <span className={`text-2xl font-bold ${(player?.total_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${player?.total_profit?.toFixed(2) || '0.00'}
            </span>
          </div>
        </Card>
      </div>

      {/* Center & Right: Results */}
      <div className="lg:col-span-2">
        <Card title="Round Results">
          {results ? (
            <div className="space-y-4">
              {/* Group Summary */}
              <div className="bg-green-50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-500">Total Contributed</div>
                    <div className="text-xl font-bold text-green-700">
                      {myResult?.totalContribution || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Avg. Contribution</div>
                    <div className="text-xl font-bold text-green-700">
                      {myResult?.avgContribution?.toFixed(1) || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Public Good Return</div>
                    <div className="text-xl font-bold text-green-700">
                      {myResult?.publicGoodReturn?.toFixed(2) || 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Individual Results */}
              {results
                .sort((a, b) => b.contribution - a.contribution)
                .map((r, i) => (
                  <div
                    key={r.playerId}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                      r.playerId === playerId ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Heart className={`w-5 h-5 ${r.contribution > 0 ? 'text-red-400 fill-red-400' : 'text-gray-300'}`} />
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName || `Player ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          Contributed: {r.contribution} | Kept: {r.kept}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-600">${r.profit.toFixed(2)}</div>
                      <div className="text-xs text-gray-400">earnings</div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <PieChart className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all players submit their contributions</p>
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

export default PublicGoodsUI;
