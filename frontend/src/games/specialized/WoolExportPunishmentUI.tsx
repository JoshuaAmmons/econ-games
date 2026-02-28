import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/shared/Card';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Anchor, Eye, Ship } from 'lucide-react';
import toast from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Role = 'smuggler' | 'port_merchant' | 'foreign_contact' | 'harbor_watch';
type Stage = 'smuggler_decision' | 'harbor_watch_decision' | 'complete' | 'waiting';

interface GroupMember {
  playerId: string;
  playerName: string;
  role: Role;
}

interface GroupResults {
  smugglerDecision: 'trade_locally' | 'smuggle_overseas';
  harborWatchDecision: 'blind_eye' | 'report' | null;
  payoffs: Record<Role, number>;
  narrative: string;
}

/* ------------------------------------------------------------------ */
/*  Payoff Matrix (reference display only)                             */
/* ------------------------------------------------------------------ */

const PAYOFF_MATRIX: {
  scenario: string;
  smuggler: number;
  port_merchant: number;
  foreign_contact: number;
  harbor_watch: number;
}[] = [
  { scenario: 'Trade Locally', smuggler: 6, port_merchant: 6, foreign_contact: 2, harbor_watch: 4 },
  { scenario: 'Smuggle + Blind Eye', smuggler: 12, port_merchant: 2, foreign_contact: 8, harbor_watch: 6 },
  { scenario: 'Smuggle + Report', smuggler: -4, port_merchant: 4, foreign_contact: 0, harbor_watch: 8 },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ROLE_ICONS: Record<Role, string> = {
  smuggler: '\u2693',         // Anchor
  port_merchant: '\uD83C\uDFEA',  // Shop
  foreign_contact: '\uD83C\uDF0A', // Wave
  harbor_watch: '\uD83D\uDC41',    // Eye
};

const ROLE_LABELS: Record<Role, string> = {
  smuggler: 'The Captain',
  port_merchant: 'Port Merchant',
  foreign_contact: 'Foreign Contact',
  harbor_watch: 'Harbor Watch',
};

const ROLE_COLORS: Record<Role, string> = {
  smuggler: 'text-amber-400',
  port_merchant: 'text-emerald-400',
  foreign_contact: 'text-blue-400',
  harbor_watch: 'text-purple-400',
};

/* ------------------------------------------------------------------ */
/*  Narrative generation                                               */
/* ------------------------------------------------------------------ */

function buildNarrative(
  smugglerDecision: string,
  harborWatchDecision: string | null,
  smugglerName: string
): string {
  if (smugglerDecision === 'trade_locally') {
    return `${smugglerName} chose the cautious path, trading goods at the local port. The harbor stays quiet tonight. All parties receive their modest share of the honest trade.`;
  }
  if (harborWatchDecision === 'blind_eye') {
    return `Under cover of darkness, ${smugglerName} slipped cargo past the harbor. The Watch saw everything... and looked the other way. Smuggled goods flow freely, and those in the know profit handsomely.`;
  }
  return `${smugglerName} attempted to smuggle cargo overseas, but the Harbor Watch sounded the alarm! Authorities seized the contraband. The Captain pays dearly while the Watch earns a reward for their vigilance.`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const WoolExportPunishmentUI: React.FC<GameUIProps> = ({
  session: _session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [stage, setStage] = useState<Stage>('waiting');
  const [role, setRole] = useState<Role>('smuggler');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [results, setResults] = useState<GroupResults | null>(null);
  const [, setSmugglerDecided] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });

  // Animation state for stage transitions
  const [fadeIn, setFadeIn] = useState(true);

  const triggerFade = useCallback(() => {
    setFadeIn(false);
    setTimeout(() => setFadeIn(true), 50);
  }, []);

  /* ---- Reset on new round ---- */
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setResults(null);
      setSmugglerDecided(false);
      setStage('waiting');
      setWaitingCount({ submitted: 0, total: 0 });
      refreshPlayer();
    }
  }, [roundId, roundActive, refreshPlayer]);

  /* ---- Socket events ---- */
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      onEvent('game-state', (state: any) => {
        if (state.stage) setStage(state.stage);
        if (state.role) setRole(state.role);
        if (state.groupMembers) setGroupMembers(state.groupMembers);
        if (state.myAction) setSubmitted(true);
        if (state.smugglerDecided) setSmugglerDecided(true);
        if (state.results) setResults(state.results);
        if (state.totalSubmitted !== undefined && state.totalPlayers !== undefined) {
          setWaitingCount({ submitted: state.totalSubmitted, total: state.totalPlayers });
        }
      })
    );

    cleanups.push(
      onEvent('smuggler-decided', (_data: any) => {
        setSmugglerDecided(true);
        triggerFade();
        toast('The Captain has made a decision...', { icon: '\u2693' });
      })
    );

    cleanups.push(
      onEvent('harbor-watch-decided', (_data: any) => {
        toast('The Harbor Watch has spoken...', { icon: '\uD83D\uDC41' });
      })
    );

    cleanups.push(
      onEvent('phase-change', (data: any) => {
        if (data.stage || data.phase) {
          setStage((data.stage || data.phase) as Stage);
          triggerFade();
          if ((data.stage || data.phase) === 'harbor_watch_decision') {
            setSubmitted(false);
            setWaitingCount({ submitted: 0, total: 0 });
          }
        }
      })
    );

    cleanups.push(
      onEvent('action-submitted', (data: { submitted: number; total: number }) => {
        setWaitingCount({ submitted: data.submitted, total: data.total });
      })
    );

    cleanups.push(
      onEvent('group-results', (data: any) => {
        const res = data.results || data;
        setResults(res);
        setStage('complete');
        triggerFade();
        refreshPlayer();

        const myPayoff = res.payoffs?.[role];
        if (myPayoff !== undefined) {
          if (myPayoff >= 0) {
            toast.success(`Round complete! You earned $${Number(myPayoff).toFixed(2)}`);
          } else {
            toast(`Round complete. You lost $${Math.abs(Number(myPayoff)).toFixed(2)}`, { icon: '\uD83D\uDCA8' });
          }
        }
      })
    );

    cleanups.push(
      onEvent('round-results', (data: any) => {
        const res = data.results || data;
        if (res.payoffs) {
          setResults(res);
          setStage('complete');
          triggerFade();
          refreshPlayer();
        }
      })
    );

    cleanups.push(
      onEvent('error', () => {
        setSubmitted(false);
        setSubmitting(false);
      })
    );

    return () => cleanups.forEach((fn) => fn());
  }, [onEvent, playerId, refreshPlayer, role, triggerFade]);

  /* ---- Actions ---- */
  const handleSmugglerDecision = (decision: 'trade_locally' | 'smuggle_overseas') => {
    if (!roundId || submitted) return;
    setSubmitting(true);
    submitAction({ type: 'smuggler_decision', decision });
    setSubmitted(true);
    if (decision === 'trade_locally') {
      toast.success('You chose the safe route...');
    } else {
      toast('Cargo slips into the night...', { icon: '\uD83C\uDF19' });
    }
    setTimeout(() => setSubmitting(false), 500);
  };

  const handleHarborWatchDecision = (decision: 'blind_eye' | 'report') => {
    if (!roundId || submitted) return;
    setSubmitting(true);
    submitAction({ type: 'harbor_watch_decision', decision });
    setSubmitted(true);
    if (decision === 'blind_eye') {
      toast('You look the other way...', { icon: '\uD83D\uDC41' });
    } else {
      toast('The alarm sounds across the harbor!', { icon: '\uD83D\uDCE3' });
    }
    setTimeout(() => setSubmitting(false), 500);
  };

  /* ---- Derive smuggler name for narrative ---- */
  const smugglerMember = groupMembers.find((m) => m.role === 'smuggler');
  const smugglerName = smugglerMember
    ? smugglerMember.playerId === playerId
      ? 'You'
      : smugglerMember.playerName
    : 'The Captain';

  /* ---- Narrative for results ---- */
  const narrativeText =
    results?.narrative ||
    (results
      ? buildNarrative(results.smugglerDecision, results.harborWatchDecision, smugglerName)
      : '');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ====== LEFT: Role Card & Payoff Table ====== */}
      <div className="space-y-4">
        {/* Role Card */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">{ROLE_ICONS[role]}</div>
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
              Your Role
            </div>
            <div className={`text-xl font-bold ${ROLE_COLORS[role]}`}>
              {ROLE_LABELS[role]}
            </div>
          </div>

          {/* Stage Indicator */}
          <div className="flex gap-1 mb-4">
            {(['smuggler_decision', 'harbor_watch_decision', 'complete'] as const).map((s) => (
              <div
                key={s}
                className={`flex-1 text-center py-1 rounded text-[10px] font-medium ${
                  stage === s
                    ? 'bg-amber-600/40 text-amber-200 ring-1 ring-amber-500/50'
                    : 'bg-gray-700/40 text-gray-500'
                }`}
              >
                {s === 'smuggler_decision'
                  ? "Captain's Call"
                  : s === 'harbor_watch_decision'
                  ? "Watch's Verdict"
                  : 'Outcome'}
              </div>
            ))}
          </div>

          {/* Group Members */}
          {groupMembers.length > 0 && (
            <div className="bg-gray-700/40 rounded-lg p-3">
              <div className="text-xs text-amber-400/70 font-medium uppercase tracking-wide mb-2">
                Your Crew
              </div>
              <div className="space-y-1">
                {groupMembers.map((m) => (
                  <div
                    key={m.playerId}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                      m.playerId === playerId
                        ? 'bg-amber-900/30 border border-amber-700/40'
                        : 'bg-gray-700/20'
                    }`}
                  >
                    <span>{ROLE_ICONS[m.role]}</span>
                    <span className={`${ROLE_COLORS[m.role]} font-medium`}>
                      {m.playerId === playerId ? 'You' : m.playerName}
                    </span>
                    <span className="text-[10px] text-gray-500 ml-auto">
                      {ROLE_LABELS[m.role]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Payoff Reference Table */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="font-semibold text-amber-200 text-sm mb-3">Payoff Chart</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700/50">
                  <th className="text-left py-1 pr-2">Scenario</th>
                  <th className="text-center py-1 px-1">{'\u2693'}</th>
                  <th className="text-center py-1 px-1">{'\uD83C\uDFEA'}</th>
                  <th className="text-center py-1 px-1">{'\uD83C\uDF0A'}</th>
                  <th className="text-center py-1 px-1">{'\uD83D\uDC41'}</th>
                </tr>
              </thead>
              <tbody>
                {PAYOFF_MATRIX.map((row) => (
                  <tr key={row.scenario} className="border-b border-gray-700/30">
                    <td className="py-1.5 pr-2 text-gray-300 font-medium">{row.scenario}</td>
                    <td className={`text-center py-1.5 px-1 font-mono ${row.smuggler >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {row.smuggler}
                    </td>
                    <td className={`text-center py-1.5 px-1 font-mono ${row.port_merchant >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {row.port_merchant}
                    </td>
                    <td className={`text-center py-1.5 px-1 font-mono ${row.foreign_contact >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {row.foreign_contact}
                    </td>
                    <td className={`text-center py-1.5 px-1 font-mono ${row.harbor_watch >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {row.harbor_watch}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[10px] text-gray-500">
            {'\u2693'} Captain / {'\uD83C\uDFEA'} Merchant / {'\uD83C\uDF0A'} Contact / {'\uD83D\uDC41'} Watch
          </div>
        </Card>

        {/* Total Profit */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              <span className="font-medium text-amber-200">Total Profit</span>
            </div>
            <span
              className={`text-2xl font-bold ${
                (Number(player?.total_profit) || 0) >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              ${Number(player?.total_profit || 0).toFixed(2)}
            </span>
          </div>
        </Card>
      </div>

      {/* ====== CENTER + RIGHT: Decision Area & Results ====== */}
      <div className="lg:col-span-2 space-y-4">
        {/* Decision / Narrative Card */}
        <Card className="bg-gray-800/80 border border-gray-700/50 min-h-[300px]">
          <div
            className={`transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}
          >
            {!roundActive || !roundId ? (
              /* -- Waiting for round -- */
              <div className="text-center py-12">
                <Ship className="w-12 h-12 mx-auto text-gray-600 mb-4" />
                <p className="text-gray-400 text-lg">The harbor is quiet...</p>
                <p className="text-gray-500 text-sm mt-1">Waiting for the round to begin.</p>
              </div>
            ) : stage === 'smuggler_decision' ? (
              /* -- Smuggler Decision Stage -- */
              role === 'smuggler' ? (
                submitted ? (
                  <div className="text-center py-12">
                    <div className="text-amber-400 text-lg font-semibold mb-2">
                      Your orders have been given.
                    </div>
                    <p className="text-gray-500 text-sm">
                      The crew awaits what comes next...
                    </p>
                    {waitingCount.total > 0 && (
                      <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mt-4">
                        <Users className="w-4 h-4" />
                        <span>{waitingCount.submitted}/{waitingCount.total} decided</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="text-center">
                      <Anchor className="w-8 h-8 mx-auto text-amber-400 mb-3" />
                      <h3 className="text-xl font-bold text-amber-200 mb-2">
                        The Captain surveys the harbor...
                      </h3>
                      <p className="text-gray-400 text-sm max-w-md mx-auto">
                        Your ship is loaded with valuable wool. Do you sell through the proper
                        channels, or attempt to smuggle the cargo overseas for a greater reward?
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                      <button
                        onClick={() => handleSmugglerDecision('trade_locally')}
                        disabled={submitting}
                        className="group relative rounded-xl p-6 border-2 border-emerald-700/50 bg-emerald-900/20 hover:bg-emerald-900/40 hover:border-emerald-500/70 transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="text-3xl mb-3">{'\uD83C\uDFEA'}</div>
                        <div className="font-bold text-emerald-300 text-lg mb-1">
                          Trade Locally
                        </div>
                        <p className="text-xs text-gray-400">
                          Sell through the port. Safe and steady. Everyone gets a fair share.
                        </p>
                        <div className="mt-3 text-[10px] text-emerald-400/70 font-mono">
                          Payoff: $6
                        </div>
                      </button>

                      <button
                        onClick={() => handleSmugglerDecision('smuggle_overseas')}
                        disabled={submitting}
                        className="group relative rounded-xl p-6 border-2 border-amber-700/50 bg-amber-900/20 hover:bg-amber-900/40 hover:border-amber-500/70 transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="text-3xl mb-3">{'\uD83C\uDF19'}</div>
                        <div className="font-bold text-amber-300 text-lg mb-1">
                          Smuggle Overseas
                        </div>
                        <p className="text-xs text-gray-400">
                          Slip past the Watch under cover of darkness. Higher reward, but risky...
                        </p>
                        <div className="mt-3 text-[10px] text-amber-400/70 font-mono">
                          Payoff: $12 or -$4
                        </div>
                      </button>
                    </div>
                  </div>
                )
              ) : (
                /* Other roles waiting for smuggler */
                <div className="text-center py-12">
                  <div className="relative inline-block mb-4">
                    <Ship className="w-12 h-12 text-amber-500/60 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-300 mb-2">
                    Waiting for the Captain's decision...
                  </h3>
                  <p className="text-gray-500 text-sm max-w-sm mx-auto">
                    {role === 'harbor_watch'
                      ? 'You scan the horizon from your post, watching for any suspicious movement...'
                      : role === 'port_merchant'
                      ? 'You wait at the docks, hoping for a fair trade today...'
                      : 'Across the sea, you await word from your contact...'}
                  </p>
                  {waitingCount.total > 0 && (
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mt-4">
                      <Users className="w-4 h-4" />
                      <span>{waitingCount.submitted}/{waitingCount.total} decided</span>
                    </div>
                  )}
                </div>
              )
            ) : stage === 'harbor_watch_decision' ? (
              /* -- Harbor Watch Decision Stage -- */
              role === 'harbor_watch' ? (
                submitted ? (
                  <div className="text-center py-12">
                    <div className="text-purple-400 text-lg font-semibold mb-2">
                      Your decision has been made.
                    </div>
                    <p className="text-gray-500 text-sm">
                      The consequences will soon unfold...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="text-center">
                      <Eye className="w-8 h-8 mx-auto text-purple-400 mb-3" />
                      <h3 className="text-xl font-bold text-purple-200 mb-2">
                        Movement in the harbor...
                      </h3>
                      <p className="text-gray-400 text-sm max-w-md mx-auto">
                        You spotted the Captain loading cargo onto a foreign vessel under cover
                        of darkness. The smuggling attempt is underway. What do you do?
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                      <button
                        onClick={() => handleHarborWatchDecision('blind_eye')}
                        disabled={submitting}
                        className="group relative rounded-xl p-6 border-2 border-gray-600/50 bg-gray-700/20 hover:bg-gray-700/40 hover:border-gray-500/70 transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="text-3xl mb-3">{'\uD83D\uDC41'}</div>
                        <div className="font-bold text-gray-300 text-lg mb-1">
                          Turn a Blind Eye
                        </div>
                        <p className="text-xs text-gray-400">
                          Look the other way. The Captain will remember your silence...
                        </p>
                        <div className="mt-3 text-[10px] text-gray-400/70 font-mono">
                          Payoff: $6
                        </div>
                      </button>

                      <button
                        onClick={() => handleHarborWatchDecision('report')}
                        disabled={submitting}
                        className="group relative rounded-xl p-6 border-2 border-red-700/50 bg-red-900/20 hover:bg-red-900/40 hover:border-red-500/70 transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="text-3xl mb-3">{'\uD83D\uDCE3'}</div>
                        <div className="font-bold text-red-300 text-lg mb-1">
                          Report to Authorities
                        </div>
                        <p className="text-xs text-gray-400">
                          Sound the alarm. Justice will be served, and you'll earn a bounty.
                        </p>
                        <div className="mt-3 text-[10px] text-red-400/70 font-mono">
                          Payoff: $8
                        </div>
                      </button>
                    </div>
                  </div>
                )
              ) : role === 'smuggler' ? (
                /* Smuggler waiting for harbor watch */
                <div className="text-center py-12">
                  <div className="relative inline-block mb-4">
                    <Eye className="w-12 h-12 text-purple-400/60 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-300 mb-2">
                    The Harbor Watch is deciding your fate...
                  </h3>
                  <p className="text-gray-500 text-sm max-w-sm mx-auto">
                    Your cargo is halfway loaded. Did the Watch see you? Will they speak?
                    The night air is thick with tension...
                  </p>
                </div>
              ) : (
                /* Other roles waiting */
                <div className="text-center py-12">
                  <div className="relative inline-block mb-4">
                    <Eye className="w-12 h-12 text-purple-400/40 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-300 mb-2">
                    The Harbor Watch is deliberating...
                  </h3>
                  <p className="text-gray-500 text-sm max-w-sm mx-auto">
                    {role === 'port_merchant'
                      ? 'Rumors swirl along the docks. Something is afoot tonight...'
                      : 'You await the signal from across the water...'}
                  </p>
                </div>
              )
            ) : stage === 'complete' && results ? (
              /* -- Results Stage -- */
              <div className="space-y-6">
                {/* Narrative */}
                <div className="bg-gray-700/30 rounded-xl p-5 border border-gray-600/30">
                  <div className="text-xs text-amber-400/70 font-medium uppercase tracking-wider mb-2">
                    The Tale Unfolds
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed italic">
                    "{narrativeText}"
                  </p>
                </div>

                {/* Decisions Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-gray-700/20 rounded-lg p-3 border border-gray-700/30">
                    <div className="text-xs text-gray-500 mb-1">Captain's Decision</div>
                    <div className={`font-semibold text-sm ${
                      results.smugglerDecision === 'trade_locally'
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}>
                      {results.smugglerDecision === 'trade_locally'
                        ? '\uD83C\uDFEA Trade Locally'
                        : '\uD83C\uDF19 Smuggle Overseas'}
                    </div>
                  </div>
                  {results.harborWatchDecision && (
                    <div className="bg-gray-700/20 rounded-lg p-3 border border-gray-700/30">
                      <div className="text-xs text-gray-500 mb-1">Harbor Watch's Verdict</div>
                      <div className={`font-semibold text-sm ${
                        results.harborWatchDecision === 'blind_eye'
                          ? 'text-gray-300'
                          : 'text-red-400'
                      }`}>
                        {results.harborWatchDecision === 'blind_eye'
                          ? '\uD83D\uDC41 Turned a Blind Eye'
                          : '\uD83D\uDCE3 Reported'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Payoffs */}
                <div>
                  <div className="text-xs text-amber-400/70 font-medium uppercase tracking-wider mb-3">
                    Payoffs
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(Object.entries(results.payoffs) as [Role, number][]).map(([r, payoff]) => {
                      const isMe = r === role;
                      return (
                        <div
                          key={r}
                          className={`rounded-lg p-3 text-center ${
                            isMe
                              ? 'bg-sky-900/30 border-2 border-sky-600/50 ring-1 ring-sky-500/30'
                              : 'bg-gray-700/20 border border-gray-700/30'
                          }`}
                        >
                          <div className="text-lg mb-1">{ROLE_ICONS[r]}</div>
                          <div className="text-[10px] text-gray-500 mb-1">
                            {ROLE_LABELS[r]}
                            {isMe && (
                              <span className="text-sky-400 ml-1">(You)</span>
                            )}
                          </div>
                          <div
                            className={`text-lg font-bold font-mono ${
                              Number(payoff) > 0
                                ? 'text-green-400'
                                : Number(payoff) < 0
                                ? 'text-red-400'
                                : 'text-gray-500'
                            }`}
                          >
                            ${Number(payoff).toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* My result highlight */}
                {results.payoffs[role] !== undefined && (
                  <div
                    className={`rounded-lg p-4 text-center border ${
                      Number(results.payoffs[role]) >= 0
                        ? 'bg-green-900/20 border-green-700/40'
                        : 'bg-red-900/20 border-red-700/40'
                    }`}
                  >
                    <div className="text-sm text-gray-400 mb-1">Your Earnings This Round</div>
                    <div
                      className={`text-3xl font-bold font-mono ${
                        Number(results.payoffs[role]) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      ${Number(results.payoffs[role]).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* -- Default waiting -- */
              <div className="text-center py-12">
                <Ship className="w-12 h-12 mx-auto text-gray-600 mb-4" />
                <p className="text-gray-400">Waiting...</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default WoolExportPunishmentUI;
