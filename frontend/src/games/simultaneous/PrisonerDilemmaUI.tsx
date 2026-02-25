import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, ShieldCheck, ShieldAlert, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  choice: 'cooperate' | 'defect';
  avgPayoff: number;
  numCooperators: number;
  numDefectors: number;
  totalPlayers: number;
}

/**
 * Prisoner's Dilemma UI
 * Players simultaneously choose to Cooperate or Defect.
 */
const PrisonerDilemmaUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [myChoice, setMyChoice] = useState<'cooperate' | 'defect' | null>(null);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const reward = Number(gameConfig.reward ?? 3);
  const punishment = Number(gameConfig.punishment ?? 1);
  const temptation = Number(gameConfig.temptation ?? 5);
  const sucker = Number(gameConfig.sucker ?? 0);

  // Reset state when new round starts
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setMyChoice(null);
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
        if (state.myAction.choice) setMyChoice(state.myAction.choice);
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
        toast.success(`Payoff: $${Number(myResult.profit).toFixed(2)}`);
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleChoice = (choice: 'cooperate' | 'defect') => {
    if (!roundId || submitted) return;

    setSubmitting(true);
    setMyChoice(choice);
    submitAction({ type: 'decision', choice });
    setSubmitted(true);
    toast.success(`You chose to ${choice === 'cooperate' ? 'Cooperate' : 'Defect'}!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Game Info & Submit */}
      <div className="space-y-4">
        {/* Payoff Matrix */}
        <Card title="Payoff Matrix">
          <div className="text-xs text-gray-500 mb-3">Your payoff based on your choice vs. opponent's choice</div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="p-2 border border-gray-200 bg-gray-50"></th>
                <th className="p-2 border border-gray-200 bg-gray-50 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-green-600" />
                    <span>Opp. C</span>
                  </div>
                </th>
                <th className="p-2 border border-gray-200 bg-gray-50 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-red-600" />
                    <span>Opp. D</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border border-gray-200 bg-gray-50 font-medium">
                  <div className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-green-600" />
                    <span>You C</span>
                  </div>
                </td>
                <td className="p-2 border border-gray-200 text-center bg-green-50 font-bold text-green-700">
                  ${reward}
                </td>
                <td className="p-2 border border-gray-200 text-center bg-red-50 font-bold text-red-600">
                  ${sucker}
                </td>
              </tr>
              <tr>
                <td className="p-2 border border-gray-200 bg-gray-50 font-medium">
                  <div className="flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-red-600" />
                    <span>You D</span>
                  </div>
                </td>
                <td className="p-2 border border-gray-200 text-center bg-yellow-50 font-bold text-yellow-700">
                  ${temptation}
                </td>
                <td className="p-2 border border-gray-200 text-center bg-orange-50 font-bold text-orange-600">
                  ${punishment}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 space-y-1 text-xs text-gray-400">
            <div>Both Cooperate: ${reward} each (Reward)</div>
            <div>Both Defect: ${punishment} each (Punishment)</div>
            <div>C vs D: Cooperator gets ${sucker} (Sucker), Defector gets ${temptation} (Temptation)</div>
          </div>
        </Card>

        {/* Decision Buttons */}
        <Card title="Make Your Choice">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">
                  {myChoice === 'cooperate' ? (
                    <span className="flex items-center justify-center gap-2">
                      <ShieldCheck className="w-5 h-5" />
                      You chose to Cooperate
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <ShieldAlert className="w-5 h-5" />
                      You chose to Defect
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} players submitted</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  className="w-full flex items-center justify-center gap-2"
                  onClick={() => handleChoice('cooperate')}
                  disabled={submitting}
                >
                  <ShieldCheck className="w-5 h-5" />
                  Cooperate
                </Button>
                <Button
                  variant="danger"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={() => handleChoice('defect')}
                  disabled={submitting}
                >
                  <ShieldAlert className="w-5 h-5" />
                  Defect
                </Button>
                <p className="text-xs text-gray-400 text-center">
                  Choose wisely. Your payoff depends on what others choose.
                </p>
              </div>
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
              {/* Group Summary */}
              <div className="bg-sky-50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-500">Cooperators</div>
                    <div className="text-xl font-bold text-green-700">
                      {myResult?.numCooperators ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Defectors</div>
                    <div className="text-xl font-bold text-red-600">
                      {myResult?.numDefectors ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Avg. Payoff</div>
                    <div className="text-xl font-bold text-sky-700">
                      ${myResult?.avgPayoff != null ? Number(myResult.avgPayoff).toFixed(2) : '0.00'}
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
                      {r.choice === 'cooperate' ? (
                        <ShieldCheck className="w-5 h-5 text-green-600" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-red-500" />
                      )}
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName || `Player ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          Choice: {r.choice === 'cooperate' ? 'Cooperate' : 'Defect'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${Number(r.profit) > 0 ? 'text-green-600' : Number(r.profit) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
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
                    You chose to <strong>{myResult.choice === 'cooperate' ? 'Cooperate' : 'Defect'}</strong>.{' '}
                    {myResult.numCooperators === myResult.totalPlayers
                      ? 'Everyone cooperated — mutual trust!'
                      : myResult.numDefectors === myResult.totalPlayers
                      ? 'Everyone defected — a classic dilemma outcome.'
                      : `${myResult.numCooperators} cooperated and ${myResult.numDefectors} defected.`}
                    {' '}Your payoff: ${Number(myResult.profit).toFixed(2)}.
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
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all players make their choices</p>
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

export default PrisonerDilemmaUI;
