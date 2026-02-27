import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  urn: string;
  color: string;
  draw: string;
  correct: boolean;
  prize: number;
  knownDraw: string;
  ambiguousDraw: string;
  ambiguousComposition: number;
  knownCount: number;
  ambiguousCount: number;
  totalPlayers: number;
}

/**
 * Ellsberg Urn Choice Task UI
 * Players choose between a known urn (50/50) and an ambiguous urn (unknown mix),
 * then bet on a color. Reveals ambiguity aversion.
 */
const EllsbergUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [selectedUrn, setSelectedUrn] = useState<'known' | 'ambiguous' | null>(null);
  const [selectedColor, setSelectedColor] = useState<'red' | 'black' | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const prize = gameConfig.prize ?? 10;

  // Reset state on new round
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setSelectedUrn(null);
      setSelectedColor(null);
      setResults(null);
      setWaitingCount({ submitted: 0, total: 0 });
    }
  }, [roundId, roundActive]);

  // Socket events
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(onEvent('game-state', (state: any) => {
      if (state.myAction) {
        setSubmitted(true);
        setSelectedUrn(state.myAction.urn);
        setSelectedColor(state.myAction.color);
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
        if (myResult.correct) {
          toast.success(`Correct! You won $${myResult.prize}!`);
        } else {
          toast(`Wrong color drawn. You win $0 this round.`, { icon: '😞' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = () => {
    if (!roundId || !selectedUrn || !selectedColor || submitted) return;

    submitAction({ type: 'decision', urn: selectedUrn, color: selectedColor });
    setSubmitted(true);
    toast.success(`Chose ${selectedUrn} urn, bet on ${selectedColor}!`);
  };

  const myResult = results?.find(r => r.playerId === playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Game Info & Submit */}
      <div className="space-y-4">
        <Card>
          <div className="text-center mb-3">
            <HelpCircle className="w-8 h-8 mx-auto text-purple-600 mb-1" />
            <div className="text-sm text-gray-500">Ellsberg Urn Choice</div>
            <div className="text-lg font-bold text-purple-700">Prize: ${prize}</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-xs text-purple-800 space-y-1">
            <p><strong>Known Urn:</strong> Exactly 50 red + 50 black balls</p>
            <p><strong>Ambiguous Urn:</strong> 100 balls, unknown red/black split</p>
            <p className="italic mt-2">Pick an urn, bet on a color. Win ${prize} if the draw matches!</p>
          </div>
        </Card>

        <Card title="Make Your Choice">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Choice Submitted!</div>
                <div className="text-sm text-gray-600 mb-2">
                  {selectedUrn === 'known' ? '🏺 Known Urn' : '❓ Ambiguous Urn'} — {selectedColor === 'red' ? '🔴 Red' : '⚫ Black'}
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} submitted</span>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Step 1: Choose Urn */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Step 1: Choose an Urn</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setSelectedUrn('known')}
                      className={`p-4 rounded-lg border-2 text-center transition-all ${
                        selectedUrn === 'known'
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">🏺</div>
                      <div className="font-medium text-sm">Known Urn</div>
                      <div className="text-xs text-gray-500">50/50 red & black</div>
                    </button>
                    <button
                      onClick={() => setSelectedUrn('ambiguous')}
                      className={`p-4 rounded-lg border-2 text-center transition-all ${
                        selectedUrn === 'ambiguous'
                          ? 'border-purple-500 bg-purple-50 shadow-md'
                          : 'border-gray-200 hover:border-purple-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">❓</div>
                      <div className="font-medium text-sm">Ambiguous Urn</div>
                      <div className="text-xs text-gray-500">Unknown mix</div>
                    </button>
                  </div>
                </div>

                {/* Step 2: Choose Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Step 2: Bet on a Color</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setSelectedColor('red')}
                      className={`p-4 rounded-lg border-2 text-center transition-all ${
                        selectedColor === 'red'
                          ? 'border-red-500 bg-red-50 shadow-md'
                          : 'border-gray-200 hover:border-red-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">🔴</div>
                      <div className="font-medium text-sm">Red</div>
                    </button>
                    <button
                      onClick={() => setSelectedColor('black')}
                      className={`p-4 rounded-lg border-2 text-center transition-all ${
                        selectedColor === 'black'
                          ? 'border-gray-700 bg-gray-100 shadow-md'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-2xl mb-1">⚫</div>
                      <div className="font-medium text-sm">Black</div>
                    </button>
                  </div>
                </div>

                <Button
                  onClick={handleSubmit}
                  className="w-full"
                  disabled={!selectedUrn || !selectedColor}
                >
                  Submit Choice
                </Button>
              </div>
            )
          ) : (
            <p className="text-center text-gray-500 py-4">Waiting for round to start...</p>
          )}
        </Card>

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
              {/* Draw Results */}
              {myResult && (
                <div className={`p-4 rounded-lg ${myResult.correct ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{myResult.correct ? '🎉' : '😞'}</span>
                    <span className="font-medium">
                      {myResult.correct ? `Correct! You won $${myResult.prize}` : 'Wrong color — you win $0'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>You chose: <strong>{myResult.urn === 'known' ? 'Known Urn' : 'Ambiguous Urn'}</strong>, bet on <strong>{myResult.color}</strong></p>
                    <p>Ball drawn: <strong>{myResult.draw}</strong></p>
                  </div>
                </div>
              )}

              {/* Urn Draws */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-sm font-medium text-blue-700 mb-1">Known Urn Draw</div>
                  <div className="text-2xl">{myResult?.knownDraw === 'red' ? '🔴' : '⚫'}</div>
                  <div className="text-xs text-gray-500 mt-1">Composition: 50 red / 50 black</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <div className="text-sm font-medium text-purple-700 mb-1">Ambiguous Urn Draw</div>
                  <div className="text-2xl">{myResult?.ambiguousDraw === 'red' ? '🔴' : '⚫'}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Revealed: {myResult?.ambiguousComposition} red / {100 - (myResult?.ambiguousComposition ?? 50)} black
                  </div>
                </div>
              </div>

              {/* Aggregate Choices */}
              {myResult && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Group Choices</div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span>🏺 Known:</span>
                      <span className="font-bold">{myResult.knownCount}</span>
                      <span className="text-gray-400">({Math.round(myResult.knownCount / myResult.totalPlayers * 100)}%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>❓ Ambiguous:</span>
                      <span className="font-bold">{myResult.ambiguousCount}</span>
                      <span className="text-gray-400">({Math.round(myResult.ambiguousCount / myResult.totalPlayers * 100)}%)</span>
                    </div>
                  </div>
                  {myResult.knownCount > myResult.ambiguousCount && (
                    <p className="text-xs text-purple-600 mt-2 italic">
                      More players chose the known urn — consistent with the Ellsberg Paradox (ambiguity aversion)!
                    </p>
                  )}
                </div>
              )}

              {/* All players */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">All Players</div>
                {results.map((r) => (
                  <div
                    key={r.playerId}
                    className={`flex items-center justify-between px-4 py-2 rounded-lg ${
                      r.playerId === playerId ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'
                    }`}
                  >
                    <div>
                      <span className="font-medium text-sm">
                        {r.playerId === playerId ? 'You' : r.playerName}
                      </span>
                      <div className="text-xs text-gray-500">
                        {r.urn === 'known' ? '🏺 Known' : '❓ Ambiguous'} / {r.color === 'red' ? '🔴 Red' : '⚫ Black'}
                        {r.correct ? ' ✓' : ' ✗'}
                      </div>
                    </div>
                    <div className={`font-bold ${r.profit > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      ${r.profit.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <HelpCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all choices are submitted</p>
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

export default EllsbergUI;
