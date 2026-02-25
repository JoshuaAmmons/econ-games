import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Target, Shield, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  choice: 'stag' | 'hare';
  allChoseStag: boolean;
  numStag: number;
  numHare: number;
  totalPlayers: number;
  stagPayoff: number;
  harePayoff: number;
}

/**
 * Stag Hunt UI
 * Players simultaneously choose to hunt Stag (risky cooperation) or Hare (safe defection).
 * All must choose Stag for the stag hunt to succeed. Hare guarantees a smaller payoff.
 */
const StagHuntUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [choice, setChoice] = useState<'stag' | 'hare' | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const stagPayoff = Number(gameConfig.stagPayoff ?? 5);
  const harePayoff = Number(gameConfig.harePayoff ?? 3);

  // Reset state when new round starts
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setChoice(null);
      setResults(null);
      setWaitingCount({ submitted: 0, total: 0 });
    }
  }, [roundId, roundActive]);

  // Socket events
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    // Recover game state on reconnect
    cleanups.push(onEvent('game-state', (state: any) => {
      if (state.myAction) {
        setSubmitted(true);
        if (state.myAction.choice) setChoice(state.myAction.choice);
      }
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
        if (myResult.allChoseStag) {
          toast.success(`The stag hunt succeeded! Payoff: $${Number(myResult.profit).toFixed(2)}`);
        } else if (myResult.choice === 'hare') {
          toast(`You hunted hare. Payoff: $${Number(myResult.profit).toFixed(2)}`, { icon: '🐇' });
        } else {
          toast(`The stag hunt failed. Payoff: $${Number(myResult.profit).toFixed(2)}`, { icon: '😞' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (selected: 'stag' | 'hare') => {
    if (!roundId || submitted) return;

    setChoice(selected);
    setSubmitting(true);
    submitAction({ type: 'decision', choice: selected });
    setSubmitted(true);
    toast.success(`You chose to hunt ${selected === 'stag' ? 'Stag' : 'Hare'}!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Game Info & Submit */}
      <div className="space-y-4">
        {/* Payoff Info */}
        <Card>
          <div className="space-y-3 text-sm">
            <div className="font-medium text-gray-700 mb-2">Payoff Structure</div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-green-700" />
                <span className="font-medium text-green-700">Hunt Stag (Cooperate)</span>
              </div>
              <div className="text-xs text-green-600 space-y-1 ml-6">
                <div>All choose Stag: <strong>${stagPayoff.toFixed(2)}</strong> each</div>
                <div>Someone defects: <strong>$0.00</strong></div>
              </div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-amber-700" />
                <span className="font-medium text-amber-700">Hunt Hare (Safe)</span>
              </div>
              <div className="text-xs text-amber-600 ml-6">
                <div>Guaranteed: <strong>${harePayoff.toFixed(2)}</strong></div>
              </div>
            </div>
            <div className="text-xs text-gray-400 p-2 bg-gray-50 rounded">
              The stag hunt requires <em>everyone</em> to cooperate. Hare is the safe choice, but stag pays more if all coordinate.
            </div>
          </div>
        </Card>

        {/* Submit Buttons */}
        <Card title="Make Your Choice">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-1">
                  {choice === 'stag' ? (
                    <span className="flex items-center justify-center gap-2">
                      <Target className="w-5 h-5" /> Hunting Stag
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Shield className="w-5 h-5" /> Hunting Hare
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mt-2">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} players submitted</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  className="w-full"
                  disabled={submitting}
                  onClick={() => handleSubmit('stag')}
                >
                  <Target className="w-4 h-4 mr-2" />
                  Hunt Stag (Risky, ${stagPayoff.toFixed(2)})
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => handleSubmit('hare')}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Hunt Hare (Safe, ${harePayoff.toFixed(2)})
                </Button>
              </div>
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
              {/* Hunt Outcome Summary */}
              <div className={`rounded-lg p-4 ${myResult?.allChoseStag ? 'bg-green-50' : 'bg-amber-50'}`}>
                <div className="text-center mb-3">
                  <div className={`text-lg font-bold ${myResult?.allChoseStag ? 'text-green-700' : 'text-amber-700'}`}>
                    {myResult?.allChoseStag ? 'Stag Hunt Succeeded!' : 'Stag Hunt Failed'}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-500">Chose Stag</div>
                    <div className="text-xl font-bold text-green-700">
                      {myResult?.numStag ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Chose Hare</div>
                    <div className="text-xl font-bold text-amber-700">
                      {myResult?.numHare ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Total Players</div>
                    <div className="text-xl font-bold text-gray-700">
                      {myResult?.totalPlayers ?? 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Individual Results */}
              {[...results]
                .filter(r => r.choice != null)
                .sort((a, b) => Number(b.profit) - Number(a.profit))
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
                      {r.choice === 'stag' ? (
                        <Target className={`w-5 h-5 ${r.allChoseStag ? 'text-green-600' : 'text-red-400'}`} />
                      ) : (
                        <Shield className="w-5 h-5 text-amber-500" />
                      )}
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName || `Player ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          Choice: {r.choice === 'stag' ? 'Stag' : 'Hare'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${Number(r.profit) > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                        ${Number(r.profit).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-400">payoff</div>
                    </div>
                  </div>
                ))}
              {results.filter(r => r.choice == null).length > 0 && (
                <div className="text-xs text-gray-400 italic mt-2">
                  {results.filter(r => r.choice == null).length} player(s) did not submit
                </div>
              )}

              {/* Your Summary */}
              {myResult && myResult.choice != null && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    <span className="font-medium text-blue-700">Your Summary</span>
                  </div>
                  <p className="text-blue-600">
                    {myResult.choice === 'stag'
                      ? myResult.allChoseStag
                        ? `Everyone cooperated! You earned $${Number(myResult.profit).toFixed(2)} from the stag hunt.`
                        : `You chose Stag, but ${myResult.numHare} player(s) chose Hare. The hunt failed and you earned $0.00.`
                      : `You safely hunted Hare and earned $${Number(myResult.profit).toFixed(2)}, regardless of others' choices.`}
                  </p>
                </div>
              )}
              {myResult && myResult.choice == null && (
                <div className="mt-4 p-3 bg-amber-50 rounded-lg text-sm">
                  <p className="text-amber-700">You did not submit a choice this round. Payoff: $0.00</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all players make their choice</p>
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

export default StagHuntUI;
