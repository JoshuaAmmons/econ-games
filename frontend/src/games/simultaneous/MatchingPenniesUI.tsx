import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, CircleDot, Coins, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  choice: 'heads' | 'tails';
  role: 'matcher' | 'mismatcher';
  avgPayoff: number;
  winPayoff: number;
  numOpponents: number;
}

/**
 * Matching Pennies UI
 * Players are assigned a role: Matcher (wins if choices match) or Mismatcher (wins if choices differ).
 * Demonstrates mixed strategy Nash equilibrium.
 */
const MatchingPenniesUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [choice, setChoice] = useState<'heads' | 'tails' | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);
  const [myRole, setMyRole] = useState<'matcher' | 'mismatcher' | null>(null);

  const gameConfig = session?.game_config || {};
  const winPayoff = Number(gameConfig.winPayoff ?? 1);
  const losePayoff = -winPayoff;

  // Determine role from player game_data or results
  useEffect(() => {
    const role = (player as any)?.game_data?.role || (player as any)?.game_data?.subRole;
    if (role) setMyRole(role);
  }, [player]);

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
      if (state.results) {
        setResults(state.results);
        const myResult = state.results.find((r: RoundResult) => r.playerId === playerId);
        if (myResult?.role) setMyRole(myResult.role);
      }
      if (state.role) setMyRole(state.role);
      if (state.subRole) setMyRole(state.subRole);
    }));

    cleanups.push(onEvent('action-submitted', (data: { submitted: number; total: number }) => {
      setWaitingCount({ submitted: data.submitted, total: data.total });
    }));

    cleanups.push(onEvent('round-results', (data: { results: RoundResult[] }) => {
      setResults(data.results);
      refreshPlayer();
      const myResult = data.results.find(r => r.playerId === playerId);
      if (myResult) {
        if (myResult.role) setMyRole(myResult.role);
        if (Number(myResult.profit) > 0) {
          toast.success(`You win! Payoff: $${Number(myResult.profit).toFixed(2)}`);
        } else {
          toast(`You lose. Payoff: $${Number(myResult.profit).toFixed(2)}`, { icon: '😞' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (selected: 'heads' | 'tails') => {
    if (!roundId || submitted) return;

    setChoice(selected);
    setSubmitting(true);
    submitAction({ type: 'decision', choice: selected });
    setSubmitted(true);
    toast.success(`You chose ${selected === 'heads' ? 'Heads' : 'Tails'}!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Game Info & Submit */}
      <div className="space-y-4">
        {/* Role & Payoff Info */}
        <Card>
          <div className="space-y-3 text-sm">
            {/* Role Display */}
            {myRole ? (
              <div className={`rounded-lg p-3 ${myRole === 'matcher' ? 'bg-blue-50' : 'bg-orange-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {myRole === 'matcher' ? (
                    <Coins className="w-5 h-5 text-blue-600" />
                  ) : (
                    <CircleDot className="w-5 h-5 text-orange-600" />
                  )}
                  <span className={`font-bold ${myRole === 'matcher' ? 'text-blue-700' : 'text-orange-700'}`}>
                    Your Role: {myRole === 'matcher' ? 'Matcher' : 'Mismatcher'}
                  </span>
                </div>
                <p className={`text-xs ml-7 ${myRole === 'matcher' ? 'text-blue-600' : 'text-orange-600'}`}>
                  {myRole === 'matcher'
                    ? 'You win if your choice matches your opponent\'s.'
                    : 'You win if your choice differs from your opponent\'s.'}
                </p>
              </div>
            ) : (
              <div className="rounded-lg p-3 bg-gray-50">
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-500">Role will be assigned when the round starts</span>
                </div>
              </div>
            )}

            {/* Payoff Structure */}
            <div className="font-medium text-gray-700">Payoffs</div>
            <div className="flex justify-between">
              <span className="text-gray-500">Win:</span>
              <span className="font-medium text-green-600">${winPayoff.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Lose:</span>
              <span className="font-medium text-red-600">${losePayoff.toFixed(2)}</span>
            </div>
            <div className="text-xs text-gray-400 p-2 bg-gray-50 rounded">
              Matchers want choices to match. Mismatchers want choices to differ.
              The Nash equilibrium is to randomize 50/50.
            </div>
          </div>
        </Card>

        {/* Submit Buttons */}
        <Card title="Choose Your Side">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-1">
                  <span className="flex items-center justify-center gap-2">
                    <Coins className="w-5 h-5" />
                    {choice === 'heads' ? 'Heads' : 'Tails'} Selected
                  </span>
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
                  onClick={() => handleSubmit('heads')}
                >
                  <Coins className="w-4 h-4 mr-2" />
                  Heads
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => handleSubmit('tails')}
                >
                  <CircleDot className="w-4 h-4 mr-2" />
                  Tails
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
              {/* Match Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-500">Chose Heads</div>
                    <div className="text-xl font-bold text-blue-700">
                      {results.filter(r => r.choice === 'heads').length}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Chose Tails</div>
                    <div className="text-xl font-bold text-orange-700">
                      {results.filter(r => r.choice === 'tails').length}
                    </div>
                  </div>
                </div>
              </div>

              {/* Individual Results */}
              {[...results]
                .filter(r => r.choice != null)
                .sort((a, b) => Number(b.profit) - Number(a.profit))
                .map((r, i) => {
                  const won = Number(r.profit) > 0;
                  return (
                    <div
                      key={r.playerId}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                        r.playerId === playerId
                          ? 'bg-sky-50 border border-sky-200'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {r.choice === 'heads' ? (
                          <Coins className={`w-5 h-5 ${won ? 'text-green-500' : 'text-gray-400'}`} />
                        ) : (
                          <CircleDot className={`w-5 h-5 ${won ? 'text-green-500' : 'text-gray-400'}`} />
                        )}
                        <div>
                          <span className="font-medium">
                            {r.playerId === playerId ? 'You' : r.playerName || `Player ${i + 1}`}
                          </span>
                          <div className="text-xs text-gray-500">
                            {r.choice === 'heads' ? 'Heads' : 'Tails'}
                            {' | '}
                            <span className={r.role === 'matcher' ? 'text-blue-500' : 'text-orange-500'}>
                              {r.role === 'matcher' ? 'Matcher' : 'Mismatcher'}
                            </span>
                            {' | '}
                            <span className={won ? 'text-green-600' : 'text-red-500'}>
                              {won ? 'Won' : 'Lost'}
                            </span>
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
                  );
                })}
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
                    You played {myResult.choice === 'heads' ? 'Heads' : 'Tails'} as a{' '}
                    {myResult.role === 'matcher' ? 'Matcher' : 'Mismatcher'}.
                    {' '}{Number(myResult.profit) > 0 ? 'You win!' : 'You lose.'}
                    {myResult.avgPayoff != null && (
                      <> Average payoff this round: ${Number(myResult.avgPayoff).toFixed(2)}.</>
                    )}
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
              <Coins className="w-12 h-12 mx-auto mb-3 opacity-30" />
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

export default MatchingPenniesUI;
