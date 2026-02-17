import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Timer } from '../components/shared/Timer';
import { Spinner } from '../components/shared/Spinner';
import { useSocket } from '../hooks/useSocket';
import { playersApi } from '../api/players';
import { sessionsApi } from '../api/sessions';
import { gameApi } from '../api/game';
import { getGameUI } from '../games/GameUIRegistry';
import type { Player, Session, Bid, Ask, Trade } from '../types';
import { GameInstructions } from '../components/shared/GameInstructions';
import toast from 'react-hot-toast';

/**
 * Market page — game router.
 * Looks up the session's game_type and renders the appropriate game UI.
 * Handles shared concerns: socket events, round lifecycle, timer, header.
 */
export const Market: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [roundNumber, setRoundNumber] = useState(0);
  const [numRounds, setNumRounds] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [roundActive, setRoundActive] = useState(false);

  // DA-specific state (passed to DA game UIs)
  const [bids, setBids] = useState<Bid[]>([]);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);

  // Local countdown timer ref
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playerId = localStorage.getItem('playerId') || '';
  const { connected, submitBid, submitAsk, submitAction: socketSubmitAction, requestGameState, onEvent } = useSocket(code || '', playerId);

  // Load player and session data
  useEffect(() => {
    if (!playerId) {
      navigate('/join');
      return;
    }
    loadPlayerAndSession();
  }, []);

  const loadPlayerAndSession = async () => {
    try {
      const { player: p, session: s } = await playersApi.getStatus(playerId);
      setPlayer(p);
      setNumRounds(s.num_rounds);

      // Get full session info (includes game_type)
      const fullSession = await sessionsApi.getByCode(code || '');
      setSession(fullSession);

      if (s.status !== 'active') {
        navigate(`/session/${code}/lobby`);
        return;
      }

      setRoundNumber(s.current_round);

      // Find the current active round so we can set roundId on page load.
      // This is critical: sessionController.start() starts round 1 via HTTP
      // but doesn't emit a socket event, so we must recover roundId here.
      const rounds = await sessionsApi.getRounds(fullSession.id);
      const activeRound = rounds.find((r: any) => r.status === 'active');
      if (activeRound) {
        setRoundId(activeRound.id);
        setRoundActive(true);
        setRoundNumber(activeRound.round_number);

        // Estimate remaining time
        if (activeRound.started_at) {
          const elapsed = Math.floor((Date.now() - new Date(activeRound.started_at).getTime()) / 1000);
          const remaining = Math.max(0, fullSession.time_per_round - elapsed);
          setTimeRemaining(remaining);
        }
      } else {
        // No active round — find the most recent completed round so we can
        // request game state (needed for playerInfo on Discovery Process etc.)
        const completedRounds = rounds
          .filter((r: any) => r.status === 'completed')
          .sort((a: any, b: any) => b.round_number - a.round_number);
        if (completedRounds.length > 0) {
          setRoundId(completedRounds[0].id);
          setRoundNumber(completedRounds[0].round_number);
        }
      }
    } catch (err) {
      console.error('Failed to load player:', err);
      navigate('/join');
    } finally {
      setLoading(false);
    }
  };

  // Reload player data to get updated profit
  const refreshPlayer = async () => {
    try {
      const { player: p } = await playersApi.getStatus(playerId);
      setPlayer(p);
    } catch (err) {
      console.error('Failed to refresh player:', err);
    }
  };

  // Request game state when we recover a round on page load (reconnection support)
  // Also request when round exists but is completed (so playerInfo etc. are populated)
  useEffect(() => {
    if (connected && roundId) {
      requestGameState(roundId);
    }
  }, [connected, roundId, requestGameState]);

  // Generic action submission for non-DA games
  const submitAction = (action: Record<string, any>) => {
    if (roundId) {
      socketSubmitAction(roundId, action);
    }
  };

  // Local countdown timer
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (roundActive && timeRemaining > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [roundActive, roundId]);

  // Determine if current game is DA-based (for order book loading)
  const gameType = session?.game_type || 'double_auction';
  const isDAGame = gameType.startsWith('double_auction');

  // Socket event handlers
  useEffect(() => {
    if (!connected) return;

    const cleanups: (() => void)[] = [];

    // DA-specific events
    cleanups.push(onEvent('bid-submitted', (data: { bid: Bid }) => {
      setBids(prev => [data.bid, ...prev]);
    }));

    cleanups.push(onEvent('ask-submitted', (data: { ask: Ask }) => {
      setAsks(prev => [data.ask, ...prev]);
    }));

    cleanups.push(onEvent('trade-executed', (data: { trade: Trade; buyer: { id: string }; seller: { id: string } }) => {
      setTrades(prev => [data.trade, ...prev]);
      setBids(prev => prev.filter(b => b.id !== data.trade.bid_id));
      setAsks(prev => prev.filter(a => a.id !== data.trade.ask_id));

      refreshPlayer();

      if (data.trade.buyer_id === playerId) {
        toast.success(`Trade! You bought at $${Number(data.trade.price).toFixed(2)} — Profit: $${Number(data.trade.buyer_profit).toFixed(2)}`);
      } else if (data.trade.seller_id === playerId) {
        toast.success(`Trade! You sold at $${Number(data.trade.price).toFixed(2)} — Profit: $${Number(data.trade.seller_profit).toFixed(2)}`);
      } else {
        toast('Trade executed at $' + Number(data.trade.price).toFixed(2), { icon: '🤝' });
      }
    }));

    // Universal round events
    cleanups.push(onEvent('round-started', (data: { round: { id: string }; roundNumber: number }) => {
      setRoundId(data.round.id);
      setRoundNumber(data.roundNumber);
      setRoundActive(true);
      setBids([]);
      setAsks([]);
      setTrades([]);
      toast(`Round ${data.roundNumber} started!`, { icon: '🔔' });
    }));

    cleanups.push(onEvent('round-ended', () => {
      setRoundId(null);
      setRoundActive(false);
      setTimeRemaining(0);
      toast('Round ended!', { icon: '🏁' });
    }));

    cleanups.push(onEvent('timer-update', (data: { seconds_remaining: number }) => {
      setTimeRemaining(data.seconds_remaining);
    }));

    cleanups.push(onEvent('error', (data: { message: string }) => {
      toast.error(data.message);
    }));

    return () => {
      cleanups.forEach(fn => fn());
    };
  }, [connected, onEvent]);

  // Load order book when round starts (DA games)
  useEffect(() => {
    if (roundId && isDAGame) {
      loadOrderBook(roundId);
    }
  }, [roundId, isDAGame]);

  const loadOrderBook = async (rId: string) => {
    try {
      const orderBook = await gameApi.getOrderBook(rId);
      setBids(orderBook.bids);
      setAsks(orderBook.asks);
      const roundTrades = await gameApi.getTrades(rId);
      setTrades(roundTrades);
    } catch (err) {
      console.error('Failed to load order book:', err);
    }
  };

  if (loading || !session || !player) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const GameUIComponent = getGameUI(gameType);

  // Human-readable game names
  const gameNames: Record<string, string> = {
    double_auction: 'Double Auction',
    double_auction_tax: 'Double Auction + Tax',
    double_auction_price_controls: 'Price Controls',
    bertrand: 'Bertrand Competition',
    cournot: 'Cournot Competition',
    public_goods: 'Public Goods',
    negative_externality: 'Negative Externality',
    ultimatum: 'Ultimatum Game',
    gift_exchange: 'Gift Exchange',
    principal_agent: 'Principal-Agent',
    comparative_advantage: 'Comparative Advantage',
    monopoly: 'Monopoly',
    market_for_lemons: 'Market for Lemons',
    discovery_process: 'Exchange & Specialization',
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">Session {code}</h1>
            <span className="px-2 py-1 rounded bg-purple-100 text-purple-800 text-xs font-medium">
              {gameNames[gameType] || gameType}
            </span>
            {roundActive && (
              <span className="px-2 py-1 rounded bg-sky-100 text-sky-800 text-sm font-medium">
                Round {roundNumber}{numRounds > 0 ? ` / ${numRounds}` : ''}
              </span>
            )}
            <span className={`px-2 py-1 rounded text-sm font-medium ${
              connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {timeRemaining > 0 && <Timer seconds={timeRemaining} />}
            <div className="text-sm text-gray-600">
              <span className="font-medium capitalize px-2 py-0.5 rounded bg-sky-100 text-sky-700">
                {player?.role}
              </span>
              {player?.name && <span className="ml-2">({player.name})</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Game UI */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <GameInstructions gameType={gameType} variant="student" />
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        }>
          <GameUIComponent
            session={session}
            player={player}
            playerId={playerId}
            code={code || ''}
            connected={connected}
            roundId={roundId}
            roundNumber={roundNumber}
            numRounds={numRounds}
            roundActive={roundActive}
            timeRemaining={timeRemaining}
            onEvent={onEvent}
            submitAction={submitAction}
            refreshPlayer={refreshPlayer}
            requestGameState={requestGameState}
            bids={bids}
            asks={asks}
            trades={trades}
            submitBid={submitBid}
            submitAsk={submitAsk}
          />
        </Suspense>
      </div>
    </div>
  );
};
