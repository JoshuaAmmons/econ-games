import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Target, Hash, Trophy, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  number: number;
  groupAverage: number;
  target: number;
  isWinner: boolean;
  distance: number;
  prize: number;
  numWinners: number;
}

/**
 * Beauty Contest (Keynesian p-Beauty Contest) UI
 * Players pick a number; closest to fraction * average wins.
 */
const BeautyContestUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [number, setNumber] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const fraction = Number(gameConfig.fraction ?? 2 / 3);
  const maxNumber = Number(gameConfig.maxNumber ?? 100);
  const prize = Number(gameConfig.prize ?? 10);

  // Reset state when new round starts
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setNumber('');
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
        if (myResult.isWinner) {
          toast.success(`You won! Prize: $${Number(myResult.prize).toFixed(2)}`);
        } else {
          toast(`Target was ${Number(myResult.target).toFixed(2)}. Your distance: ${Number(myResult.distance).toFixed(2)}`, { icon: '\uD83C\uDFAF' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || number === '' || submitted) return;

    const numVal = parseFloat(number);
    if (isNaN(numVal) || numVal < 0) {
      toast.error('Please enter a valid number');
      return;
    }
    if (numVal > maxNumber) {
      toast.error(`Number cannot exceed ${maxNumber}`);
      return;
    }

    setSubmitting(true);
    submitAction({ type: 'decision', number: numVal });
    setSubmitted(true);
    toast.success(`Number ${numVal} submitted!`);
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
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-sky-600" />
              <span className="font-semibold text-sky-700">
                Closest to {fraction} x average wins!
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Number Range:</span>
              <span className="font-medium">0 - {maxNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Target Fraction:</span>
              <span className="font-medium">{fraction}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Winner's Prize:</span>
              <span className="font-medium">${prize.toFixed(2)}</span>
            </div>
            <div className="text-xs text-gray-400 mt-2 p-2 bg-gray-50 rounded">
              Pick a number between 0 and {maxNumber}. The player whose number is closest
              to {fraction} times the group average wins the prize.
            </div>
          </div>
        </Card>

        {/* Submit Form */}
        <Card title="Pick Your Number">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Number Submitted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} players submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label={`Your Number (0 - ${maxNumber})`}
                  type="number"
                  step="0.01"
                  min="0"
                  max={maxNumber}
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder={`0 - ${maxNumber}`}
                  required
                />
                <p className="text-xs text-gray-400">
                  Think strategically: what number will others pick? Target = {fraction} x average.
                </p>
                <Button type="submit" className="w-full" disabled={submitting || number === ''}>
                  {submitting ? 'Submitting...' : 'Submit Number'}
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
              <div className="bg-sky-50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-500">Group Average</div>
                    <div className="text-xl font-bold text-sky-700">
                      {myResult?.groupAverage != null ? Number(myResult.groupAverage).toFixed(2) : '---'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Target ({fraction} x avg)</div>
                    <div className="text-xl font-bold text-sky-700">
                      {myResult?.target != null ? Number(myResult.target).toFixed(2) : '---'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Winner's Prize</div>
                    <div className="text-xl font-bold text-green-700">
                      ${myResult?.prize != null ? Number(myResult.prize).toFixed(2) : prize.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Individual Results */}
              {[...results]
                .filter(r => r.number != null)
                .sort((a, b) => Number(a.distance) - Number(b.distance))
                .map((r, i) => (
                  <div
                    key={r.playerId}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                      r.playerId === playerId
                        ? 'bg-sky-50 border border-sky-200'
                        : r.isWinner
                        ? 'bg-green-50'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {r.isWinner && <Trophy className="w-5 h-5 text-yellow-500" />}
                      {!r.isWinner && <Hash className="w-5 h-5 text-gray-400" />}
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName || `Player ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          Number: {Number(r.number).toFixed(2)} | Distance: {Number(r.distance).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${Number(r.profit) > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                        ${Number(r.profit).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-400">earnings</div>
                    </div>
                  </div>
                ))}
              {results.filter(r => r.number == null).length > 0 && (
                <div className="text-xs text-gray-400 italic mt-2">
                  {results.filter(r => r.number == null).length} player(s) did not submit
                </div>
              )}

              {/* Your Summary */}
              {myResult && myResult.number != null && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    <span className="font-medium text-blue-700">Your Summary</span>
                  </div>
                  <p className="text-blue-600">
                    {myResult.isWinner
                      ? `You won! Your number ${Number(myResult.number).toFixed(2)} was closest to the target of ${Number(myResult.target).toFixed(2)}${myResult.numWinners > 1 ? ` (tied with ${myResult.numWinners - 1} other(s))` : ''}.`
                      : `The target was ${Number(myResult.target).toFixed(2)}. Your number ${Number(myResult.number).toFixed(2)} was ${Number(myResult.distance).toFixed(2)} away.`}
                  </p>
                </div>
              )}
              {myResult && myResult.number == null && (
                <div className="mt-4 p-3 bg-amber-50 rounded-lg text-sm">
                  <p className="text-amber-700">You did not submit a number this round. Earnings: $0.00</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all players submit their numbers</p>
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

export default BeautyContestUI;
