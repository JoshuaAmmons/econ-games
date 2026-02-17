import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Timer } from '../components/shared/Timer';
import { Spinner } from '../components/shared/Spinner';
import { sessionsApi } from '../api/sessions';
import { useSocket } from '../hooks/useSocket';
import type { Session, Player, Round } from '../types';
import { ArrowLeft, Play, Square, Users, Copy, Check, SkipForward, Clock, BarChart3 } from 'lucide-react';
import { GameInstructions } from '../components/shared/GameInstructions';
import { AdminPasswordGate } from '../components/shared/AdminPasswordGate';
import toast from 'react-hot-toast';

const DA_GAME_TYPES = ['double_auction', 'double_auction_tax', 'double_auction_price_controls'];

const GAME_TYPE_LABELS: Record<string, string> = {
  double_auction: 'Double Auction',
  double_auction_tax: 'DA + Tax/Subsidy',
  double_auction_price_controls: 'DA + Price Controls',
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

/** Friendly labels for game config fields displayed on the monitor */
const CONFIG_LABELS: Record<string, string> = {
  // Common
  market_size: 'Market Size',
  num_rounds: 'Number of Rounds',
  time_per_round: 'Time per Round (s)',
  // Discovery Process
  numGoods: 'Goods Count',
  productionLength: 'Production Phase (s)',
  allowChat: 'Chat Enabled',
  allowPrivateChat: 'Private Chat',
  allowStealing: 'Allow Stealing',
  good1Name: 'Good 1 Name',
  good2Name: 'Good 2 Name',
  good3Name: 'Good 3 Name',
  good1Color: 'Good 1 Color',
  good2Color: 'Good 2 Color',
  good3Color: 'Good 3 Color',
  // Simultaneous games
  marginalCost: 'Marginal Cost',
  marketDemand: 'Market Demand',
  maxPrice: 'Max Price',
  demandIntercept: 'Demand Intercept (a)',
  demandSlope: 'Demand Slope (b)',
  maxQuantity: 'Max Quantity',
  revenuePerUnit: 'Revenue per Unit',
  costPerUnit: 'Cost per Unit',
  damageRate: 'Damage Rate',
  maxProduction: 'Max Production',
  taxEnabled: 'Tax Enabled',
  taxRate: 'Tax Rate',
  mpcr: 'MPCR',
  // Sequential games
  endowment: 'Endowment',
  maxWage: 'Max Wage',
  maxEffort: 'Max Effort',
  productivityMultiplier: 'Productivity Multiplier',
  maxEffortCost: 'Max Effort Cost',
  highOutput: 'High Output',
  lowOutput: 'Low Output',
  highEffortProb: 'High Effort Prob',
  lowEffortProb: 'Low Effort Prob',
  effortCost: 'Effort Cost',
  maxBonus: 'Max Bonus',
  minOffer: 'Min Offer',
  // Specialized
  laborUnits: 'Labor Units',
  sellerCostFraction: 'Seller Cost Fraction',
  buyerValueFraction: 'Buyer Value Fraction',
  fixedCost: 'Fixed Cost',
};

const SessionMonitorContent: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Retrieve admin password from localStorage (saved by AdminPasswordGate on verification).
  // This is sent with admin-only socket events for server-side authorization.
  const storedAdminPassword = code ? localStorage.getItem(`admin_pw_${code}`) || undefined : undefined;

  // Use socket for admin controls — use 'admin' as playerId since this is the monitor
  const { socket: rawSocket, connected, onEvent } = useSocket(code || '', 'admin');

  // Admin-authorized socket emitters that include the admin password
  const startRound = useCallback((roundNumber: number) => {
    rawSocket?.emit('start-round', {
      sessionCode: code,
      roundNumber,
      adminPassword: storedAdminPassword,
    });
  }, [code, storedAdminPassword, rawSocket]);

  const endRound = useCallback((roundId: string) => {
    rawSocket?.emit('end-round', {
      sessionCode: code,
      roundId,
      adminPassword: storedAdminPassword,
    });
  }, [code, storedAdminPassword, rawSocket]);

  const sendTimerUpdate = useCallback((secondsRemaining: number) => {
    rawSocket?.emit('timer-update', {
      sessionCode: code,
      secondsRemaining,
      adminPassword: storedAdminPassword,
    });
  }, [code, storedAdminPassword, rawSocket]);

  useEffect(() => {
    loadSession();
    const interval = setInterval(loadSession, 5000);
    return () => clearInterval(interval);
  }, []);

  // Listen for socket events
  useEffect(() => {
    if (!connected) return;

    const cleanups: (() => void)[] = [];

    cleanups.push(onEvent('round-started', (data: { round: { id: string }; roundNumber: number }) => {
      loadSession();
      toast.success(`Round ${data.roundNumber} started!`);
    }));

    cleanups.push(onEvent('round-ended', () => {
      loadSession();
      toast('Round ended!', { icon: '🏁' });
    }));

    cleanups.push(onEvent('player-joined', () => {
      loadSession();
    }));

    cleanups.push(onEvent('trade-executed', () => {
      // Refresh players to see updated profits
      if (session) {
        sessionsApi.getPlayers(session.id).then(setPlayers).catch(console.error);
      }
    }));

    return () => {
      cleanups.forEach(fn => fn());
    };
  }, [connected, onEvent, session?.id]);

  // Timer countdown effect
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (currentRound && currentRound.status === 'active' && timeRemaining > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const next = prev - 1;
          // Broadcast timer to players every 5 seconds
          if (next > 0 && next % 5 === 0) {
            sendTimerUpdate(next);
          }
          if (next <= 0) {
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            // Auto-end round when timer expires
            handleEndRound();
            return 0;
          }
          return next;
        });
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [currentRound?.id, currentRound?.status]);

  const loadSession = async () => {
    try {
      if (!code) return;
      const data = await sessionsApi.getByCode(code);
      setSession(data);

      // Load players and rounds
      const [playerData, roundData] = await Promise.all([
        sessionsApi.getPlayers(data.id),
        sessionsApi.getRounds(data.id),
      ]);
      setPlayers(playerData);
      setRounds(roundData);

      // Find the current active round
      const activeRound = roundData.find(r => r.status === 'active');
      if (activeRound && (!currentRound || currentRound.id !== activeRound.id)) {
        setCurrentRound(activeRound);
        // Set timer based on session config
        if (activeRound.started_at) {
          const elapsed = Math.floor((Date.now() - new Date(activeRound.started_at).getTime()) / 1000);
          const remaining = Math.max(0, data.time_per_round - elapsed);
          setTimeRemaining(remaining);
        } else {
          setTimeRemaining(data.time_per_round);
        }
      } else if (!activeRound) {
        setCurrentRound(null);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (!session) return;
    try {
      await sessionsApi.start(session.id);
      toast.success('Session started!');
      // The session start also starts round 1, so set timer
      setTimeRemaining(session.time_per_round);
      // Send initial timer to players
      sendTimerUpdate(session.time_per_round);
      loadSession();
    } catch (error) {
      console.error('Failed to start session:', error);
      toast.error('Failed to start session');
    }
  };

  const handleEnd = async () => {
    if (!session) return;
    try {
      await sessionsApi.end(session.id);
      toast.success('Session ended!');
      loadSession();
    } catch (error) {
      console.error('Failed to end session:', error);
      toast.error('Failed to end session');
    }
  };

  const handleStartRound = useCallback((roundNumber: number) => {
    if (!session) return;
    startRound(roundNumber);
    setTimeRemaining(session.time_per_round);
    sendTimerUpdate(session.time_per_round);
  }, [session, startRound, sendTimerUpdate]);

  const handleEndRound = useCallback(() => {
    if (!currentRound) return;
    endRound(currentRound.id);
    setTimeRemaining(0);
  }, [currentRound, endRound]);

  const handleNextRound = useCallback(() => {
    if (!session || !rounds.length) return;
    // Find the next waiting round
    const nextRound = rounds.find(r => r.status === 'waiting');
    if (nextRound) {
      handleStartRound(nextRound.round_number);
    } else {
      toast('No more rounds available!', { icon: '⚠️' });
    }
  }, [session, rounds, handleStartRound]);

  const copyCode = async () => {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.code);
      setCopied(true);
      toast.success('Code copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      toast.error('Failed to copy — manually select the code');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <p className="text-gray-500">Session not found</p>
          <Button onClick={() => navigate('/admin')} className="mt-4">
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return 'bg-yellow-100 text-yellow-800';
      case 'active': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isDA = DA_GAME_TYPES.includes(session.game_type);
  const completedRounds = rounds.filter(r => r.status === 'completed').length;

  // Group players by role (generic for all game types)
  const roleGroups = new Map<string, Player[]>();
  for (const p of players) {
    const role = p.role || 'player';
    if (!roleGroups.has(role)) roleGroups.set(role, []);
    roleGroups.get(role)!.push(p);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <Button variant="secondary" onClick={() => navigate('/admin')} className="mb-4">
          <ArrowLeft className="w-4 h-4 inline mr-2" />
          Back to Dashboard
        </Button>

        {/* Session Header */}
        <Card className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-mono font-bold">{session.code}</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(session.status)}`}>
                  {session.status}
                </span>
                <span className="px-2 py-1 rounded bg-sky-100 text-sky-700 text-xs font-medium">
                  {GAME_TYPE_LABELS[session.game_type] || session.game_type}
                </span>
                {connected && (
                  <span className="px-2 py-1 rounded bg-green-100 text-green-700 text-xs font-medium">
                    WebSocket Connected
                  </span>
                )}
              </div>
              <div className="flex gap-6 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {players.length} / {session.market_size} players
                </span>
                <span>Round {session.current_round} / {session.num_rounds}</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {session.time_per_round}s per round
                </span>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {currentRound && timeRemaining > 0 && (
                <Timer seconds={timeRemaining} />
              )}
              <Button variant="secondary" onClick={() => navigate(`/session/${code}/analytics`)}>
                <BarChart3 className="w-4 h-4 inline mr-2" />
                Analytics
              </Button>
              <Button variant="secondary" onClick={() => navigate(`/session/${code}/results`)}>
                Results
              </Button>
              {session.status === 'waiting' && (
                <Button onClick={handleStart}>
                  <Play className="w-4 h-4 inline mr-2" />
                  Start Session
                </Button>
              )}
              {session.status === 'active' && !currentRound && (
                <Button onClick={handleNextRound}>
                  <SkipForward className="w-4 h-4 inline mr-2" />
                  Start Next Round
                </Button>
              )}
              {session.status === 'active' && currentRound && (
                <Button variant="danger" onClick={handleEndRound}>
                  <Square className="w-4 h-4 inline mr-2" />
                  End Round
                </Button>
              )}
              {session.status === 'active' && (
                <Button variant="danger" onClick={handleEnd}>
                  <Square className="w-4 h-4 inline mr-2" />
                  End Session
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Share Code (only when waiting) */}
        {session.status === 'waiting' && (
          <Card className="text-center mb-6">
            <p className="text-gray-600 mb-2">Share this code with students to join:</p>
            <div className="flex items-center justify-center gap-3">
              <p className="text-5xl font-mono font-bold text-sky-600 tracking-widest">{session.code}</p>
              <button
                onClick={copyCode}
                className="p-2 rounded hover:bg-gray-100 transition-colors"
                title="Copy code to clipboard"
              >
                {copied ? (
                  <Check className="w-6 h-6 text-green-600" />
                ) : (
                  <Copy className="w-6 h-6 text-gray-400" />
                )}
              </button>
            </div>
            <p className="text-sm text-gray-400 mt-2">
              Students can join at the home page by clicking &quot;Join Session as Student&quot;
            </p>
            {session.has_passcode && (
              <p className="text-sm text-amber-600 mt-2 font-medium">
                This session is passcode-protected
              </p>
            )}
          </Card>
        )}

        {/* Game Config - DA-specific valuations/costs */}
        {isDA && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card title="Buyer Valuations">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm text-gray-500">Min</p>
                  <p className="text-xl font-bold">${session.valuation_min}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Max</p>
                  <p className="text-xl font-bold">${session.valuation_max}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Increment</p>
                  <p className="text-xl font-bold">${session.valuation_increments}</p>
                </div>
              </div>
            </Card>

            <Card title="Seller Costs">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm text-gray-500">Min</p>
                  <p className="text-xl font-bold">${session.cost_min}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Max</p>
                  <p className="text-xl font-bold">${session.cost_max}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Increment</p>
                  <p className="text-xl font-bold">${session.cost_increments}</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Game Config - non-DA game config display */}
        {!isDA && session.game_config && Object.keys(session.game_config).length > 0 && (
          <Card title="Game Configuration" className="mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(session.game_config).map(([key, value]) => {
                const label = CONFIG_LABELS[key] || key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
                return (
                  <div key={key} className="text-center bg-gray-50 rounded p-3">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className="text-lg font-bold">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</p>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Instructor Notes */}
        <GameInstructions gameType={session.game_type} variant="instructor" />

        {/* Round Progress */}
        {session.status !== 'waiting' && (
          <Card title="Round Progress" className="mb-6">
            <div className="flex gap-2 flex-wrap">
              {rounds.map(round => (
                <div
                  key={round.id}
                  className={`px-3 py-2 rounded text-sm font-medium ${
                    round.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : round.status === 'active'
                        ? 'bg-sky-100 text-sky-800 ring-2 ring-sky-400'
                        : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  Round {round.round_number}
                  {round.status === 'active' && ' (Active)'}
                  {round.status === 'completed' && ' ✓'}
                </div>
              ))}
            </div>
            <div className="mt-3 text-sm text-gray-500">
              {completedRounds} of {session.num_rounds} rounds completed
            </div>
          </Card>
        )}

        {/* Players - grouped by role */}
        <div className={`grid grid-cols-1 ${roleGroups.size > 1 ? 'md:grid-cols-2' : ''} gap-6`}>
          {Array.from(roleGroups.entries()).map(([role, rolePlayers]) => (
            <Card key={role} title={`${role.charAt(0).toUpperCase() + role.slice(1)}s (${rolePlayers.length})`}>
              {rolePlayers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">None yet</p>
              ) : (
                <div className="space-y-2">
                  {rolePlayers
                    .sort((a, b) => Number(b.total_profit) - Number(a.total_profit))
                    .map(player => {
                      const profit = Number(player.total_profit) || 0;
                      return (
                    <div key={player.id} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded">
                      <div>
                        <span className="font-medium">{player.name || 'Anonymous'}</span>
                        {player.is_bot && <span className="ml-1 text-xs text-gray-400">(Bot)</span>}
                        {player.valuation != null && (
                          <span className="text-xs text-gray-500 ml-2">
                            Val: ${player.valuation}
                          </span>
                        )}
                        {player.production_cost != null && (
                          <span className="text-xs text-gray-500 ml-2">
                            Cost: ${player.production_cost}
                          </span>
                        )}
                      </div>
                      <span className={`font-mono font-medium ${
                        profit >= 0 ? 'text-green-700' : 'text-red-700'
                      }`}>
                        ${profit.toFixed(2)}
                      </span>
                    </div>
                      );
                    })}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export const SessionMonitor: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  return (
    <AdminPasswordGate sessionCode={code || ''}>
      <SessionMonitorContent />
    </AdminPasswordGate>
  );
};
