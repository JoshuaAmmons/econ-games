import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Spinner } from '../components/shared/Spinner';
import { ArrowLeft, Play } from 'lucide-react';
import { practiceApi, type PracticeGame } from '../api/practice';

/**
 * Practice mode landing page.
 *
 * Lists every game enabled for solo + bots practice. Each tile links
 * to /practice/<gameType>, which auto-creates a session and drops the
 * student into the game.
 */
export const Practice: React.FC = () => {
  const navigate = useNavigate();
  const [games, setGames] = useState<PracticeGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    practiceApi
      .listGames()
      .then((list) => {
        setGames(list);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.response?.data?.error || 'Failed to load practice games');
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-[6vh] sm:pt-[8vh] relative overflow-hidden safe-top safe-bottom">
      <div className="relative z-10 max-w-3xl w-full mx-4">
        <Button variant="secondary" onClick={() => navigate('/')} className="mb-4">
          <ArrowLeft className="w-4 h-4 inline mr-2" />
          Back
        </Button>

        <Card title="Practice mode">
          <p className="text-sm opacity-80 mb-4">
            Pick a game, click play, and you will be dropped straight into a session against
            bots. No code, no admin, no waiting room. Each session lasts a few minutes.
          </p>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          )}

          {error && (
            <div className="p-3 rounded bg-red-900/30 border border-red-700 text-red-200 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && games.length === 0 && (
            <div className="p-3 rounded bg-amber-900/30 border border-amber-700 text-amber-200 text-sm">
              No practice games are configured yet.
            </div>
          )}

          {!loading && !error && games.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {games.map((g) => (
                <button
                  key={g.gameType}
                  onClick={() => navigate(`/practice/${g.gameType}`)}
                  className="text-left p-4 rounded border border-slate-700 bg-slate-900/40 hover:bg-slate-800/60 transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold">{g.name || g.gameType}</span>
                    <Play className="w-4 h-4 opacity-70" />
                  </div>
                  {g.description && (
                    <div className="text-xs opacity-70 mb-2">{g.description}</div>
                  )}
                  <div className="text-xs opacity-60">
                    {g.marketSize} players (you + {g.marketSize - 1} bots) · {g.numRounds}{' '}
                    {g.numRounds === 1 ? 'round' : 'rounds'} · {g.timePerRound}s each
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
