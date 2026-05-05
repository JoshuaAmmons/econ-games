import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '../components/shared/Card';
import { Spinner } from '../components/shared/Spinner';
import { Button } from '../components/shared/Button';
import { practiceApi } from '../api/practice';

/**
 * Practice bridge route: /practice/:gameType
 *
 * On mount, calls POST /api/practice/:gameType/start, stores the returned
 * playerId + sessionCode in localStorage (matching the JoinSession flow),
 * then navigates to /session/:code/market. The user only ever sees a
 * brief loading card.
 */
export const PracticeStart: React.FC = () => {
  const { gameType } = useParams<{ gameType: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!gameType || startedRef.current) return;
    startedRef.current = true;

    practiceApi
      .start(gameType, undefined)
      .then(({ sessionCode, playerId }) => {
        localStorage.setItem('playerId', playerId);
        localStorage.setItem('sessionCode', sessionCode);
        navigate(`/session/${sessionCode}/market`, { replace: true });
      })
      .catch((err) => {
        setError(err?.response?.data?.error || 'Failed to start practice session');
      });
  }, [gameType, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-[15vh] relative overflow-hidden safe-top safe-bottom">
      <div className="relative z-10 max-w-md w-full mx-4">
        <Card title="Setting up practice…">
          {!error && (
            <div className="flex items-center gap-3 py-4">
              <Spinner />
              <span className="opacity-80 text-sm">Seating bots and starting round 1…</span>
            </div>
          )}
          {error && (
            <>
              <div className="p-3 rounded bg-red-900/30 border border-red-700 text-red-200 text-sm mb-3">
                {error}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => navigate('/practice')}>
                  Back to practice
                </Button>
                <Button onClick={() => window.location.reload()}>Retry</Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};
