import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Droplets, Fish, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  extraction: number;
  effectiveExtraction: number;
  totalExtraction: number;
  remainingPool: number;
  sharedBonus: number;
  poolSize: number;
}

/**
 * Common Pool Resource UI
 * Players decide how much to extract from a shared resource pool.
 */
const CommonPoolResourceUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [extraction, setExtraction] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const poolSize = Number(gameConfig.poolSize ?? 100);
  const maxExtraction = Number(gameConfig.maxExtraction ?? 25);
  const regenerationRate = Number(gameConfig.regenerationRate ?? 0.5);
  const bonusRate = Number(gameConfig.bonusRate ?? 0.5);

  // Reset state when new round starts
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setExtraction('');
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
        toast.success(`Profit: $${Number(myResult.profit).toFixed(2)} (extracted ${Number(myResult.effectiveExtraction).toFixed(1)} + bonus $${Number(myResult.sharedBonus).toFixed(2)})`);
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || extraction === '' || submitted) return;

    const extNum = parseFloat(extraction);
    if (isNaN(extNum) || extNum < 0) {
      toast.error('Please enter a valid extraction amount');
      return;
    }
    if (extNum > maxExtraction) {
      toast.error(`Extraction cannot exceed ${maxExtraction}`);
      return;
    }

    setSubmitting(true);
    submitAction({ type: 'decision', extraction: extNum });
    setSubmitted(true);
    toast.success(`Extraction of ${extNum} submitted!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);

  // Calculate the pool depletion percentage for the visual indicator
  const depletionPercent = myResult
    ? Math.max(0, Math.min(100, ((myResult.poolSize - myResult.remainingPool) / myResult.poolSize) * 100))
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Game Info & Submit */}
      <div className="space-y-4">
        {/* Game Parameters */}
        <Card>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 mb-3">
              <Droplets className="w-5 h-5 text-sky-600" />
              <span className="font-semibold text-sky-700">Resource Pool</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Pool Size:</span>
              <span className="font-bold text-sky-700">{poolSize} units</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max Extraction:</span>
              <span className="font-medium">{maxExtraction} units</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Regeneration Rate:</span>
              <span className="font-medium">{(regenerationRate * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Shared Bonus Rate:</span>
              <span className="font-medium">{(bonusRate * 100).toFixed(0)}%</span>
            </div>
            <div className="text-xs text-gray-400 mt-2 p-2 bg-gray-50 rounded">
              Extract from the shared pool. If everyone takes too much, the pool is depleted
              and everyone suffers. Remaining resources generate a shared bonus.
            </div>
          </div>
        </Card>

        {/* Submit Form */}
        <Card title="Your Extraction">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Extraction Submitted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} players submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label={`Extraction Amount (0 - ${maxExtraction})`}
                  type="number"
                  step="0.1"
                  min="0"
                  max={maxExtraction}
                  value={extraction}
                  onChange={(e) => setExtraction(e.target.value)}
                  placeholder={`0 - ${maxExtraction}`}
                  required
                />
                {extraction && (
                  <div className="text-xs text-gray-500 space-y-1 bg-gray-50 p-2 rounded">
                    <div>
                      <Fish className="w-3 h-3 inline mr-1" />
                      Extracting: {parseFloat(extraction) || 0} units from pool
                    </div>
                    <div className="text-gray-400">
                      Higher extraction = more direct profit, but depletes the shared resource.
                    </div>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting || extraction === ''}>
                  {submitting ? 'Submitting...' : 'Submit Extraction'}
                </Button>
              </form>
            )
          ) : (
            <p className="text-center text-gray-500 py-4">Waiting for round to start...</p>
          )}
        </Card>

        {/* Total Profit */}
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
              {/* Pool Status */}
              <div className="bg-sky-50 rounded-lg p-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-500">Pool Size</div>
                    <div className="text-xl font-bold text-sky-700">
                      {myResult?.poolSize != null ? Number(myResult.poolSize).toFixed(0) : poolSize}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Total Extracted</div>
                    <div className="text-xl font-bold text-red-600">
                      {myResult?.totalExtraction != null ? Number(myResult.totalExtraction).toFixed(1) : '---'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Remaining</div>
                    <div className="text-xl font-bold text-green-700">
                      {myResult?.remainingPool != null ? Number(myResult.remainingPool).toFixed(1) : '---'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Shared Bonus</div>
                    <div className="text-xl font-bold text-green-700">
                      ${myResult?.sharedBonus != null ? Number(myResult.sharedBonus).toFixed(2) : '0.00'}
                    </div>
                  </div>
                </div>

                {/* Pool depletion bar */}
                {myResult && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Pool Health</span>
                      <span>{(100 - depletionPercent).toFixed(0)}% remaining</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          depletionPercent > 75
                            ? 'bg-red-500'
                            : depletionPercent > 50
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${100 - depletionPercent}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Individual Results */}
              {[...results]
                .filter(r => r.extraction != null)
                .sort((a, b) => Number(b.extraction) - Number(a.extraction))
                .map((r, i) => (
                  <div
                    key={r.playerId}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                      r.playerId === playerId
                        ? 'bg-sky-50 border border-sky-200'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Fish className={`w-5 h-5 ${
                        Number(r.extraction) > maxExtraction * 0.7
                          ? 'text-red-500'
                          : Number(r.extraction) > maxExtraction * 0.3
                          ? 'text-yellow-500'
                          : 'text-green-500'
                      }`} />
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName || `Player ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          Extracted: {Number(r.extraction).toFixed(1)}
                          {Number(r.effectiveExtraction) !== Number(r.extraction) && (
                            <span className="text-red-500"> (effective: {Number(r.effectiveExtraction).toFixed(1)})</span>
                          )}
                          {' '}| Bonus: ${Number(r.sharedBonus).toFixed(2)}
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
              {results.filter(r => r.extraction == null).length > 0 && (
                <div className="text-xs text-gray-400 italic mt-2">
                  {results.filter(r => r.extraction == null).length} player(s) did not submit
                </div>
              )}

              {/* Your Summary */}
              {myResult && myResult.extraction != null && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    <span className="font-medium text-blue-700">Your Summary</span>
                  </div>
                  <p className="text-blue-600">
                    You extracted {Number(myResult.effectiveExtraction).toFixed(1)} units
                    {Number(myResult.effectiveExtraction) !== Number(myResult.extraction)
                      ? ` (requested ${Number(myResult.extraction).toFixed(1)}, pool was over-harvested)`
                      : ''}.
                    {' '}The group extracted {Number(myResult.totalExtraction).toFixed(1)} total,
                    leaving {Number(myResult.remainingPool).toFixed(1)} in the pool.
                    {Number(myResult.remainingPool) > 0
                      ? ` The remaining pool generated a shared bonus of $${Number(myResult.sharedBonus).toFixed(2)} per player.`
                      : ' The pool was completely depleted — no shared bonus this round.'}
                  </p>
                </div>
              )}
              {myResult && myResult.extraction == null && (
                <div className="mt-4 p-3 bg-amber-50 rounded-lg text-sm">
                  <p className="text-amber-700">You did not submit an extraction this round. Profit: $0.00</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Droplets className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all players submit their extractions</p>
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

export default CommonPoolResourceUI;
