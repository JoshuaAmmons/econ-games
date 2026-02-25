import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Heart, Gift, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  give: number;
  keep: number;
  endowment: number;
  avgGive: number;
  percentGiven: number;
}

/**
 * Dictator Game UI
 * Each player receives an endowment and decides how much to give to an anonymous recipient.
 * Tests altruism and fairness norms.
 */
const DictatorUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [give, setGive] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const endowment = Number(gameConfig.endowment ?? 10);

  const giveNum = parseFloat(give) || 0;
  const keepNum = endowment - giveNum;

  // Reset state when new round starts
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setGive('');
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
        if (state.myAction.give != null) setGive(String(state.myAction.give));
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
        toast.success(`You gave $${Number(myResult.give).toFixed(2)} and kept $${Number(myResult.keep).toFixed(2)}`);
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || give === '' || submitted) return;

    const giveVal = parseFloat(give);
    if (isNaN(giveVal) || giveVal < 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (giveVal > endowment) {
      toast.error(`Cannot give more than your endowment of $${endowment.toFixed(2)}`);
      return;
    }

    setSubmitting(true);
    submitAction({ type: 'decision', give: giveVal });
    setSubmitted(true);
    toast.success(`Decision submitted: give $${giveVal.toFixed(2)}`);
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
              <span className="font-bold text-sky-700">${endowment.toFixed(2)}</span>
            </div>
            <div className="text-xs text-gray-400 mt-2 p-2 bg-gray-50 rounded">
              You decide how to split your endowment. The amount you give goes to an anonymous recipient. The amount you keep is your earnings.
            </div>
          </div>
        </Card>

        {/* Submit Form */}
        <Card title="Your Decision">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">
                  <span className="flex items-center justify-center gap-2">
                    <Gift className="w-5 h-5" /> Decision Submitted!
                  </span>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mt-2">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} players submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label={`Amount to Give ($0 - $${endowment.toFixed(2)})`}
                  type="number"
                  step="0.01"
                  min="0"
                  max={endowment}
                  value={give}
                  onChange={(e) => setGive(e.target.value)}
                  placeholder={`$0 - $${endowment.toFixed(2)}`}
                  required
                />

                {/* Live Preview */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> You keep:
                    </span>
                    <span className={`font-bold ${keepNum >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${keepNum.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1">
                      <Gift className="w-3 h-3" /> You give:
                    </span>
                    <span className="font-bold text-purple-600">
                      ${giveNum.toFixed(2)}
                    </span>
                  </div>
                  {/* Visual bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                    <div
                      className="bg-purple-500 h-2.5 rounded-full transition-all duration-200"
                      style={{ width: `${endowment > 0 ? (giveNum / endowment) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Keep all</span>
                    <span>Give all</span>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={submitting || give === ''}>
                  {submitting ? 'Submitting...' : 'Submit Decision'}
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
              {/* Group Summary */}
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-500">Average Given</div>
                    <div className="text-xl font-bold text-purple-700">
                      ${myResult?.avgGive != null ? Number(myResult.avgGive).toFixed(2) : '0.00'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Avg % Given</div>
                    <div className="text-xl font-bold text-purple-700">
                      {myResult?.avgGive != null && endowment > 0
                        ? ((Number(myResult.avgGive) / endowment) * 100).toFixed(1)
                        : '0.0'}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Endowment</div>
                    <div className="text-xl font-bold text-gray-700">
                      ${endowment.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Distribution Bar Chart */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm font-medium text-gray-700 mb-3">Giving Distribution</div>
                <div className="space-y-2">
                  {[...results]
                    .filter(r => r.give != null)
                    .sort((a, b) => Number(b.give) - Number(a.give))
                    .map((r, i) => (
                      <div key={r.playerId} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-16 truncate">
                          {r.playerId === playerId ? 'You' : r.playerName || `P${i + 1}`}
                        </span>
                        <div className="flex-1 bg-gray-200 rounded-full h-4 relative">
                          <div
                            className={`h-4 rounded-full transition-all ${
                              r.playerId === playerId ? 'bg-sky-500' : 'bg-purple-400'
                            }`}
                            style={{ width: `${endowment > 0 ? (Number(r.give) / endowment) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium w-14 text-right">
                          ${Number(r.give).toFixed(2)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Individual Results */}
              {[...results]
                .filter(r => r.give != null)
                .sort((a, b) => Number(b.give) - Number(a.give))
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
                      <Heart className={`w-5 h-5 ${Number(r.give) > 0 ? 'text-red-400 fill-red-400' : 'text-gray-300'}`} />
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName || `Player ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          Gave: ${Number(r.give).toFixed(2)} | Kept: ${Number(r.keep).toFixed(2)}
                          {r.percentGiven != null && ` (${Number(r.percentGiven).toFixed(0)}%)`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-600">${Number(r.profit).toFixed(2)}</div>
                      <div className="text-xs text-gray-400">kept</div>
                    </div>
                  </div>
                ))}
              {results.filter(r => r.give == null).length > 0 && (
                <div className="text-xs text-gray-400 italic mt-2">
                  {results.filter(r => r.give == null).length} player(s) did not submit
                </div>
              )}

              {/* Your Summary */}
              {myResult && myResult.give != null && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    <span className="font-medium text-blue-700">Your Summary</span>
                  </div>
                  <p className="text-blue-600">
                    You gave ${Number(myResult.give).toFixed(2)} ({Number(myResult.percentGiven).toFixed(0)}% of your endowment).
                    The group average was ${Number(myResult.avgGive).toFixed(2)}.
                    {Number(myResult.give) > Number(myResult.avgGive)
                      ? ' You gave more than average.'
                      : Number(myResult.give) < Number(myResult.avgGive)
                      ? ' You gave less than average.'
                      : ' You gave exactly the average.'}
                  </p>
                </div>
              )}
              {myResult && myResult.give == null && (
                <div className="mt-4 p-3 bg-amber-50 rounded-lg text-sm">
                  <p className="text-amber-700">You did not submit a decision this round.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Gift className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all players submit their decisions</p>
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

export default DictatorUI;
