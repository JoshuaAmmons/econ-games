import React, { useEffect, useState, useRef, useCallback, Suspense } from 'react';
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

// Paired games in which a student without a partner is matched with the next student who joins
const LATE_PAIRING_GAMES = new Set(['ultimatum', 'market_for_lemons', 'principal_agent', 'gift_exchange', 'trust_game']);

/**
 * Asks the server for this player's game state once the game panel has mounted (19 Nov 2026).
 * The panels are loaded lazily, so the request Market makes on connecting is often answered before the
 * panel has registered its 'game-state' listener, and the answer was lost: an agent whose page opened
 * after the contract was sent saw "Waiting for principal..." all round, even after a reload. React runs
 * a child's effects before its parent's, so when this effect runs the panel's listeners exist. Applies
 * to every game panel; later requests (reconnect, new round, pairing) are still made by Market.
 */
const RequestStateWhenMounted: React.FC<{
  roundId: string | null;
  connected: boolean;
  requestGameState: (roundId: string) => void;
  children: React.ReactNode;
}> = ({ roundId, connected, requestGameState, children }) => {
  useEffect(() => {
    if (connected && roundId) requestGameState(roundId);
    // Once, on mount: Market's own effect covers every later change of round or connection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
};

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
  // Paired games: true while this player has no partner (odd player out, or a late joiner waiting)
  const [unpaired, setUnpaired] = useState(false);

  // DA-specific state (passed to DA game UIs)
  const [bids, setBids] = useState<Bid[]>([]);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);

  // Local countdown timer ref
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playerId = localStorage.getItem('playerId') || '';
  const { connected, submitBid, submitAsk, submitAction: socketSubmitAction, requestGameState, requestRoundTimer, onEvent } = useSocket(code || '', playerId);

  // Determine if current game is DA-based (for order book loading)
  const gameType = session?.game_type || 'double_auction';
  const isDAGame = gameType.startsWith('double_auction');

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

      if (s.status !== 'active' && s.status !== 'completed') {
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

        // If session is active but no active round found (timing issue with
        // round 1 which starts via HTTP without a socket event), retry after
        // a short delay to pick up the round once it appears in the DB.
        if (fullSession.status === 'active' && completedRounds.length === 0) {
          setTimeout(() => {
            sessionsApi.getRounds(fullSession.id).then((retryRounds: any[]) => {
              const retryActive = retryRounds.find((r: any) => r.status === 'active');
              if (retryActive) {
                setRoundId(retryActive.id);
                setRoundActive(true);
                setRoundNumber(retryActive.round_number);
                if (retryActive.started_at) {
                  const elapsed = Math.floor((Date.now() - new Date(retryActive.started_at).getTime()) / 1000);
                  const remaining = Math.max(0, fullSession.time_per_round - elapsed);
                  setTimeRemaining(remaining);
                }
                refreshPlayer();
              }
            }).catch(console.error);
          }, 1500);
        }
      }
    } catch (err) {
      console.error('Failed to load player:', err);
      navigate('/join');
    } finally {
      setLoading(false);
    }
  };

  // Reload player data to get updated profit (memoized to prevent
  // socket listener useEffect from tearing down/re-registering on every render)
  const refreshPlayer = useCallback(async () => {
    try {
      const { player: p } = await playersApi.getStatus(playerId);
      setPlayer(p);
    } catch (err) {
      console.error('Failed to refresh player:', err);
    }
  }, [playerId]);

  // Keep a ref to session so socket handlers always have the latest value
  // without requiring re-registration of event listeners.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const roundIdRef = useRef(roundId);
  roundIdRef.current = roundId;

  // On (re)connect, recover the active round and request full game state.
  // This handles both initial page load recovery and mid-round socket reconnects.
  const prevConnectedRef = useRef(false);
  useEffect(() => {
    if (!connected) {
      prevConnectedRef.current = false;
      return;
    }

    // Always request game state for the current roundId
    if (roundId) {
      requestGameState(roundId);
    }

    // On reconnect (was disconnected, now connected again), refresh active round
    // in case a round started or ended while we were offline
    if (!prevConnectedRef.current && session) {
      prevConnectedRef.current = true;
      sessionsApi.getRounds(session.id).then((rounds: any[]) => {
        const activeRound = rounds.find((r: any) => r.status === 'active');
        if (activeRound) {
          if (activeRound.id !== roundId) {
            setRoundId(activeRound.id);
            setRoundNumber(activeRound.round_number);
            setRoundActive(true);
          }
          // Refresh order book for DA games on reconnect
          if (isDAGame) {
            loadOrderBook(activeRound.id);
          }
        }
      }).catch(() => { /* ignore — best effort */ });
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

  // Socket event handlers
  useEffect(() => {
    if (!connected) return;

    const cleanups: (() => void)[] = [];

    // DA-specific events
    cleanups.push(onEvent('bid-submitted', (data: { bid: Bid }) => {
      setBids(prev => [{ ...data.bid, price: Number(data.bid.price) }, ...prev]);
    }));

    cleanups.push(onEvent('ask-submitted', (data: { ask: Ask }) => {
      setAsks(prev => [{ ...data.ask, price: Number(data.ask.price) }, ...prev]);
    }));

    cleanups.push(onEvent('trade-executed', (data: { trade: Trade; buyer: { id: string }; seller: { id: string } }) => {
      const normalizedTrade = {
        ...data.trade,
        price: Number(data.trade.price),
        buyer_profit: Number(data.trade.buyer_profit),
        seller_profit: Number(data.trade.seller_profit),
      };
      setTrades(prev => [normalizedTrade, ...prev]);
      // One trade per player per round: the server withdraws both traders' other open orders
      setBids(prev => prev.filter(b => b.id !== data.trade.bid_id && b.player_id !== data.trade.buyer_id && b.player_id !== data.trade.seller_id));
      setAsks(prev => prev.filter(a => a.id !== data.trade.ask_id && a.player_id !== data.trade.buyer_id && a.player_id !== data.trade.seller_id));

      refreshPlayer();

      const tradeId = data.trade.id || data.trade.bid_id;
      if (data.trade.buyer_id === playerId) {
        toast.success(`Trade! You bought at $${Number(data.trade.price).toFixed(2)} — Profit: $${Number(data.trade.buyer_profit).toFixed(2)}`, { id: `trade-${tradeId}` });
      } else if (data.trade.seller_id === playerId) {
        toast.success(`Trade! You sold at $${Number(data.trade.price).toFixed(2)} — Profit: $${Number(data.trade.seller_profit).toFixed(2)}`, { id: `trade-${tradeId}` });
      } else {
        toast('Trade executed at $' + Number(data.trade.price).toFixed(2), { icon: '🤝', id: `trade-${tradeId}` });
      }
    }));

    // DA game-state handler: refresh full order book on reconnect
    cleanups.push(onEvent('game-state', (state: any) => {
      if (state.bids) setBids(state.bids);
      if (state.asks) setAsks(state.asks);
      if (state.trades) setTrades(state.trades);
      // Paired games report whether this player has a partner
      if (typeof state.paired === 'boolean') setUnpaired(!state.paired);
    }));

    // Paired games: a partner was found (a late joiner arrived). Reload the round's state,
    // which carries the partner's first move if they have already made it.
    cleanups.push(onEvent('pairing-update', (data: { paired: boolean }) => {
      setUnpaired(!data.paired);
      if (roundIdRef.current) requestGameState(roundIdRef.current);
    }));

    // Universal round events
    cleanups.push(onEvent('round-started', (data: { round: { id: string }; roundNumber: number }) => {
      setRoundId(data.round.id);
      setRoundNumber(data.roundNumber);
      setRoundActive(true);
      // Initialize countdown timer from session's time_per_round
      // Use ref to avoid stale closure when session loads after socket connects
      if (sessionRef.current?.time_per_round) {
        setTimeRemaining(sessionRef.current.time_per_round);
      }
      setBids([]);
      setAsks([]);
      setTrades([]);
      // Refresh player to get updated valuations/costs for the new round
      refreshPlayer();
      toast(`Round ${data.roundNumber} started!`, { icon: '🔔', id: `round-started-${data.roundNumber}` });
    }));

    cleanups.push(onEvent('round-ended', (data?: { trades?: Trade[] }) => {
      // Keep roundId so results can still be displayed; just mark round inactive
      setRoundActive(false);
      setTimeRemaining(0);
      // Accept any server-sent trade data (e.g., final settlement trades)
      if (data?.trades) {
        setTrades(data.trades.map(t => ({
          ...t,
          price: Number(t.price),
          buyer_profit: Number(t.buyer_profit),
          seller_profit: Number(t.seller_profit),
        })));
      }
      toast('Round ended!', { icon: '🏁', id: 'round-ended' });
    }));

    cleanups.push(onEvent('timer-update', (data: { seconds_remaining: number }) => {
      setTimeRemaining(data.seconds_remaining);
    }));

    // The server's time left for the active round (asked for on connecting, so a page opened mid-round is right)
    cleanups.push(onEvent('round-timer', (data: { secondsRemaining: number | null }) => {
      if (data && data.secondsRemaining != null) setTimeRemaining(data.secondsRemaining);
    }));
    requestRoundTimer();

    cleanups.push(onEvent('auto-advance-scheduled', (data: { delayMs: number; lastRound?: boolean }) => {
      if (data.lastRound) return;   // no next round: "Session complete!" follows when the pause is over
      const seconds = Math.ceil(data.delayMs / 1000);
      toast(`Next round starting in ${seconds}s...`, { icon: '⏭️', duration: data.delayMs, id: 'auto-advance' });
    }));

    cleanups.push(onEvent('session-ended', () => {
      setRoundActive(false);
      toast.success('Session complete!', { id: 'session-ended' });
      navigate(`/session/${code}/results`);
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

  if (loading || !session || !player) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const GameUIComponent = getGameUI(gameType);

  // Discovery Process runs its own hunt/camp phase clock inside the game HUD,
  // and its DB role ('producer') is just a constraint workaround — show 'gatherer'.
  const isDiscovery = gameType === 'discovery_process';
  const showHeaderTimer = timeRemaining > 0 && !isDiscovery;
  const roleLabel = isDiscovery ? 'gatherer' : player?.role;

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
    prisoner_dilemma: "Prisoner's Dilemma",
    beauty_contest: 'Beauty Contest',
    common_pool_resource: 'Common Pool Resource',
    stag_hunt: 'Stag Hunt',
    dictator: 'Dictator Game',
    matching_pennies: 'Matching Pennies',
    trust_game: 'Trust Game',
    bargaining: 'Bargaining Game',
    auction: 'Sealed-Bid Auction',
    ellsberg: 'Ellsberg Paradox',
    newsvendor: 'Newsvendor',
    dutch_auction: 'Dutch Auction',
    discriminative_auction: 'Discriminative Auction',
    lindahl: 'Lindahl Pricing',
    pg_auction: 'Public Goods Auction',
    sealed_bid_offer: 'Sealed-Bid Offer',
    sponsored_search: 'Sponsored Search',
    offer_auction: 'Offer Auction',
    bid_auction: 'Bid Auction',
    electricity_market: 'Electricity Market',
    posted_offer: 'Posted Offer',
    three_village_trade: 'Three Village Trade',
    contestable_market: 'Contestable Market',
    double_dutch_auction: 'Double Dutch Auction',
    wool_export_punishment: 'Wool Export Punishment',
    english_auction: 'English Auction',
    asset_bubble: 'Asset Bubble',
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Floating mobile timer — visible when scrolled */}
      {showHeaderTimer && <Timer seconds={timeRemaining} floating />}

      {/* Header — responsive two-row layout on mobile */}
      <div className="bg-white shadow-sm border-b safe-top">
        <div className="max-w-7xl mx-auto px-3 md:px-4 py-2 md:py-3">
          {/* Desktop: single row with everything */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              <h1 className="text-lg md:text-xl font-bold shrink-0">Session {code}</h1>
              <span className="px-2 py-1 rounded bg-purple-100 text-purple-800 text-xs font-medium hidden md:inline-block">
                {gameNames[gameType] || gameType}
              </span>
              {roundActive && (
                <span className="px-2 py-1 rounded bg-sky-100 text-sky-800 text-sm font-medium hidden md:inline-block">
                  Round {roundNumber}{numRounds > 0 ? ` / ${numRounds}` : ''}
                </span>
              )}
              <span className={`px-2 py-1 rounded text-sm font-medium hidden md:inline-block ${
                connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              {/* Timer (visible in header on all sizes; also has floating duplicate for mobile scroll) */}
              {showHeaderTimer && <Timer seconds={timeRemaining} />}
              <div className="text-sm text-gray-600 hidden md:block">
                <span className="font-medium capitalize px-2 py-0.5 rounded bg-sky-100 text-sky-700">
                  {roleLabel}
                </span>
                {player?.name && <span className="ml-2">({player.name})</span>}
              </div>
            </div>
          </div>
          {/* Row 2 (mobile only): Round, Role, Connection dot */}
          <div className="flex items-center gap-2 mt-1.5 md:hidden flex-wrap">
            {roundActive && (
              <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-xs font-medium">
                Round {roundNumber}{numRounds > 0 ? `/${numRounds}` : ''}
              </span>
            )}
            <span className="font-medium capitalize px-2 py-0.5 rounded bg-sky-100 text-sky-700 text-xs">
              {roleLabel}
            </span>
            {player?.name && <span className="text-xs text-gray-500">{player.name}</span>}
            <span
              className={`w-2 h-2 rounded-full ml-auto shrink-0 ${connected ? 'bg-green-500' : 'bg-red-500'}`}
              title={connected ? 'Connected' : 'Disconnected'}
            />
          </div>
        </div>
      </div>

      {/* Game UI */}
      <div className="max-w-7xl mx-auto px-3 md:px-4 py-4 md:py-6 safe-bottom touch-game">
        <GameInstructions gameType={gameType} variant="student" gameConfig={session?.game_config} />
        {unpaired && (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {LATE_PAIRING_GAMES.has(gameType)
              ? "You don't have a partner yet. You will be paired with the next student who joins."
              : "You don't have a partner in this game: the number of players is odd."}
          </div>
        )}
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        }>
          <RequestStateWhenMounted roundId={roundId} connected={connected} requestGameState={requestGameState}>
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
          </RequestStateWhenMounted>
        </Suspense>
      </div>
    </div>
  );
};
