import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import type { GameUIProps } from '../GameUIRegistry';
import { Send, Lock, X, Crosshair, PackagePlus, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import GameCanvas from './GameCanvas';
import type { GameTick, CanvasTarget, TickPlayer, TickPot } from './GameCanvas';
import { DEFAULT_RULES } from './discoveryProcessRules';
import type { GameRules } from './discoveryProcessRules';

const DISCOVERY_PROCESS_PASSWORD = 'password';
const STORAGE_KEY = 'discovery_process_unlocked';

// ============================================================================
// Types & helpers
// ============================================================================

interface ChatMessage {
  from: string;
  fromName: string;
  message: string;
  timestamp: number;
}

interface InterimResult {
  name: string;
  food: number;
  health: number;
  earnings: number;
}

/** The player or pot whose action menu is open, anchored at a point in the canvas. */
interface MenuTarget {
  kind: 'player' | 'pot';
  id: string;
  sx: number;
  sy: number;
}

type Phase = GameTick['phase'];

const PHASE_STYLE: Record<Phase, string> = {
  hunting: 'bg-amber-100 text-amber-800',
  trading: 'bg-green-100 text-green-800',
  interim: 'bg-sky-100 text-sky-800',
};

const PHASE_LABEL: Record<Phase, string> = {
  hunting: 'Hunt',
  trading: 'Camp (trade)',
  interim: 'Round over',
};

function phaseHelp(phase: Phase, r: GameRules): { title: string; text: string } {
  const pct = Math.round(r.largePreyCaptureProb * 100);
  if (phase === 'hunting') {
    return {
      title: 'Hunt!',
      text: `Tap an animal to chase and catch it. Big game (left) gives ${r.largePreyValue} food but you only catch it ${pct}% of the time. Small game (right) gives ${r.smallPreyValue} food and is always caught. Once you cross into a side you stay there until the hunt ends.`,
    };
  }
  if (phase === 'trading') {
    return {
      title: 'Back to camp',
      text: 'Tap another gatherer to give food, stun them, or take food. Use "Drop a food pot" to leave food anyone can pick up. At the end of the round your food becomes health.',
    };
  }
  return {
    title: 'Round over',
    text: `Everyone loses ${r.healthDecay} health, then eats: each food restores 1 health (up to ${r.maxHealth}). Your health is your score.`,
  };
}

/** Quick amount buttons: 1 / 5 / 10 / All, limited to what's available. */
function amountChoices(max: number): number[] {
  if (max <= 0) return [];
  const opts = [1, 5, 10].filter(v => v < max);
  opts.push(max);
  return opts;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

// ============================================================================
// Component
// ============================================================================

const DiscoveryProcessUI: React.FC<GameUIProps> = ({
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  requestGameState,
}) => {
  // Password gate state (must be before any early returns per React hook rules)
  // Auto-unlock if the player already has an active round (instructor has started the game)
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(STORAGE_KEY) === 'true' || (roundActive && !!roundId));
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // Game state
  const [tick, setTick] = useState<GameTick | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [interimResults, setInterimResults] = useState<Record<string, InterimResult> | null>(null);
  const [chasePreyId, setChasePreyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Phase | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const canvasBoxRef = useRef<HTMLDivElement>(null);

  // Refs so tick-driven logic always sees the latest values without re-subscribing
  const tickRef = useRef<GameTick | null>(null);
  const submitRef = useRef(submitAction);
  useEffect(() => { tickRef.current = tick; }, [tick]);
  useEffect(() => { submitRef.current = submitAction; }, [submitAction]);
  const [boxSize, setBoxSize] = useState({ w: 800, h: 500 });
  const chaseRef = useRef<string | null>(null);
  const captureSentRef = useRef<{ id: string; tick: number } | null>(null);
  const lastChaseMoveTick = useRef(-1);
  // Player/pot we're walking toward after tapping it (camp phase)
  const approachRef = useRef<{ kind: 'player' | 'pot'; id: string } | null>(null);
  const lastPhaseRef = useRef<Phase | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rules: GameRules = tick?.rules ?? DEFAULT_RULES;

  const setChase = useCallback((id: string | null) => {
    chaseRef.current = id;
    captureSentRef.current = null;
    setChasePreyId(id);
  }, []);

  const showBanner = useCallback((phase: Phase) => {
    setBanner(phase);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 7000);
  }, []);

  useEffect(() => () => { if (bannerTimer.current) clearTimeout(bannerTimer.current); }, []);

  // Track the canvas box size so the action menu can open toward the roomier side
  const hasCanvas = roundActive && !!roundId && unlocked;
  useEffect(() => {
    const box = canvasBoxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      setBoxSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [hasCanvas]);

  // Per-tick client logic: phase-change banner, and chase-and-catch for the selected prey
  const onTick = useCallback((t: GameTick) => {
    if (t.phase !== lastPhaseRef.current) {
      lastPhaseRef.current = t.phase;
      showBanner(t.phase);
      setMenu(null);
      approachRef.current = null;
      if (t.phase !== 'hunting') setChase(null);
    }

    // Walk toward a tapped player/pot until within reach, so its actions unlock
    const approach = approachRef.current;
    if (approach && t.phase === 'trading' && !t.you.stunned && !t.you.inTug) {
      const target = approach.kind === 'player'
        ? t.players.find(p => p.id === approach.id)
        : t.pots.find(p => p.id === approach.id);
      const reach = (t.rules ?? DEFAULT_RULES).interactRadius;
      if (!target || dist(target, t.you) <= reach * 0.6) {
        approachRef.current = null;
      } else if (t.tick - lastChaseMoveTick.current >= 2 || t.tick < lastChaseMoveTick.current) {
        lastChaseMoveTick.current = t.tick;
        submitRef.current({ type: 'set_target', x: target.x, y: target.y });
      }
    }

    const id = chaseRef.current;
    if (!id || t.phase !== 'hunting') return;
    const prey = t.prey.find(p => p.id === id);
    if (!prey) {
      // Caught, escaped, or out of sight
      setChase(null);
      return;
    }
    if (t.you.stunned) return;
    const captureRadius = (t.rules ?? DEFAULT_RULES).captureRadius;
    if (dist(prey, t.you) <= captureRadius - 5) {
      const sent = captureSentRef.current;
      // Retry after ~0.5 s in case the prey slipped out of range between ticks
      if (!sent || sent.id !== id || t.tick - sent.tick > 5) {
        captureSentRef.current = { id, tick: t.tick };
        submitRef.current({ type: 'capture_prey', preyId: id });
      }
    } else if (t.tick - lastChaseMoveTick.current >= 2 || t.tick < lastChaseMoveTick.current) {
      lastChaseMoveTick.current = t.tick;
      submitRef.current({ type: 'set_target', x: prey.x, y: prey.y });
    }
  }, [setChase, showBanner]);

  // Socket event listeners
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(onEvent('game-tick', (data: GameTick) => {
      setTick(data);
      onTick(data);
    }));

    cleanups.push(onEvent('phase-changed', (data: { phase: string; duration: number }) => {
      if (data.phase === 'hunting') {
        setInterimResults(null);
        setChatMessages([]);
      }
      if (data.phase === 'trading') {
        setChatOpen(true);
      }
    }));

    cleanups.push(onEvent('capture-result', (data: { preyId: string; preyType: string; captured: boolean; foodGained: number; totalFood: number }) => {
      if (data.captured) {
        toast.success(`Caught ${data.preyType} game! +${data.foodGained} food (you have ${data.totalFood})`, { id: 'capture', duration: 2000 });
      } else {
        toast(`The ${data.preyType} game got away!`, { id: 'capture', icon: '💨', duration: 2500 });
      }
    }));

    cleanups.push(onEvent('stun-event', (data: { stunnerId: string; targetId: string; stunnerName: string; targetName: string }) => {
      if (data.targetId === playerId) {
        toast.error(`${data.stunnerName} stunned you! You can't move for a few seconds.`);
      } else if (data.stunnerId === playerId) {
        toast.success(`You stunned ${data.targetName}. You can now take their food.`);
      }
    }));

    cleanups.push(onEvent('tug-start', (data: { initatorId: string; targetId: string; amount: number; initiatorName: string; targetName: string }) => {
      if (data.targetId === playerId) {
        toast.error(`${data.initiatorName} is trying to take ${data.amount} of your food! Yield to give it up, or hold on.`);
      } else if (data.initatorId === playerId) {
        toast(`Tug-of-war with ${data.targetName}! Both of you lose health until someone yields.`, { icon: '🪢' });
      }
    }));

    cleanups.push(onEvent('tug-end', (data: { yielderId: string; otherId: string; yielderName: string; otherName: string; initiatorYielded: boolean; amount?: number }) => {
      if (data.yielderId !== playerId && data.otherId !== playerId) return;
      const who = data.yielderId === playerId ? 'You' : data.yielderName;
      const outcome = data.initiatorYielded
        ? 'No food changed hands.'
        : `${data.amount ?? 0} food was taken.`;
      toast(`Tug-of-war over — ${who} yielded. ${outcome}`, { icon: '🪢' });
    }));

    cleanups.push(onEvent('transfer-event', (data: { fromId: string; toId: string; amount: number; fromName: string; toName: string }) => {
      if (data.toId === playerId) {
        toast.success(`${data.fromName} gave you ${data.amount} food!`);
      } else if (data.fromId === playerId) {
        toast(`You gave ${data.amount} food to ${data.toName}`, { icon: '🎁' });
      }
    }));

    cleanups.push(onEvent('take-event', (data: { takerId: string; targetId: string; amount: number; takerName: string; targetName: string }) => {
      if (data.targetId === playerId) {
        toast.error(`${data.takerName} took ${data.amount} of your food!`);
      } else if (data.takerId === playerId) {
        toast(`You took ${data.amount} food from ${data.targetName}`);
      }
    }));

    cleanups.push(onEvent('hit-event', (data: { hitterId: string; targetId: string; hitterName: string; targetName: string }) => {
      if (data.targetId === playerId) {
        toast.error(`You were hit by ${data.hitterName}!`);
      }
    }));

    cleanups.push(onEvent('pot-placed', (data: { ownerName: string }) => {
      toast(`${data.ownerName} dropped a food pot at camp`, { icon: '🍲', id: 'pot-placed' });
    }));

    cleanups.push(onEvent('chat-message', (data: ChatMessage) => {
      setChatMessages(prev => [...prev.slice(-99), data]);
    }));

    cleanups.push(onEvent('period-earnings', (data: Record<string, InterimResult>) => {
      setInterimResults(data);
    }));

    cleanups.push(onEvent('game-state', (data: any) => {
      if (data.phase && data.you) {
        setTick({
          tick: 0,
          phase: data.phase,
          timeLeft: data.timeLeft || 0,
          you: data.you,
          players: data.players || [],
          prey: data.prey || [],
          pots: data.pots || [],
          world: data.world || { width: 10080, height: 1050, leftZoneEnd: 3360, middleZoneEnd: 6720 },
          rules: data.rules,
        });
      }
    }));

    return () => cleanups.forEach(c => c());
  }, [onEvent, onTick, playerId]);

  // Request game state on mount/reconnect
  useEffect(() => {
    if (roundId && roundActive) {
      requestGameState(roundId);
      // Auto-unlock password gate when round is active
      if (!unlocked) {
        sessionStorage.setItem(STORAGE_KEY, 'true');
        setUnlocked(true);
      }
    }
  }, [roundId, roundActive, requestGameState, unlocked]);


  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ---- Handlers ----
  const send = useCallback((action: Record<string, any>) => submitRef.current(action), []);

  const preyInRange = useCallback((t: GameTick) => {
    const r = (t.rules ?? DEFAULT_RULES).captureRadius;
    return t.prey
      .map(p => ({ p, d: dist(p, t.you) }))
      .filter(x => x.d <= r)
      .sort((a, b) => a.d - b.d)[0]?.p ?? null;
  }, []);

  const catchNearest = useCallback(() => {
    const t = tickRef.current;
    if (!t || t.phase !== 'hunting') return;
    const p = preyInRange(t);
    if (!p) {
      toast('Nothing in reach — tap an animal to chase it.', { id: 'catch-hint' });
      return;
    }
    send({ type: 'capture_prey', preyId: p.id });
  }, [preyInRange, send]);

  // Space bar = catch nearest prey in reach
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space' && tickRef.current?.phase === 'hunting') {
        e.preventDefault();
        catchNearest();
      }
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [catchNearest]);

  const handleSelect = useCallback((target: CanvasTarget, sx: number, sy: number) => {
    const t = tickRef.current;
    if (!t) return;

    if (target.kind === 'prey') {
      const prey = t.prey.find(p => p.id === target.id);
      if (!prey) return;
      if (t.you.lockedZone === 'right' && prey.type === 'large') {
        toast("You're on the small-game side until the hunt ends.", { id: 'zone-lock' });
        return;
      }
      if (t.you.lockedZone === 'left' && prey.type === 'small') {
        toast("You're on the big-game side until the hunt ends.", { id: 'zone-lock' });
        return;
      }
      setMenu(null);
      setChase(target.id);
      lastChaseMoveTick.current = -1;
      send({ type: 'set_target', x: prey.x, y: prey.y });
      return;
    }

    if (target.kind === 'player' || target.kind === 'pot') {
      setMenu({ kind: target.kind, id: target.id, sx, sy });
      approachRef.current = { kind: target.kind, id: target.id };
      lastChaseMoveTick.current = -1;
      return;
    }

    // Ground: move there
    setMenu(null);
    setChase(null);
    approachRef.current = null;
    send({ type: 'set_target', x: target.x, y: target.y });
  }, [send, setChase]);

  const approach = useCallback((kind: 'player' | 'pot', id: string) => {
    approachRef.current = { kind, id };
    lastChaseMoveTick.current = -1;
  }, []);

  const closeMenu = useCallback(() => {
    setMenu(null);
    approachRef.current = null;
  }, []);

  const sendChat = useCallback(() => {
    const msg = chatInput.trim();
    if (!msg) return;
    send({ type: 'chat', message: msg });
    setChatInput('');
  }, [chatInput, send]);

  // ---- Password gate ----
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === DISCOVERY_PROCESS_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, 'true');
      setUnlocked(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  if (!unlocked) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card title="Discovery Process">
          <form onSubmit={handlePasswordSubmit} className="space-y-4 p-4 max-w-sm">
            <div className="flex justify-center"><Lock className="w-10 h-10 text-gray-400" /></div>
            <p className="text-sm text-gray-600 text-center">Enter the password to access this game.</p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
              placeholder="Password"
              className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-300 ${passwordError ? 'border-red-500' : 'border-gray-300'}`}
              autoFocus
            />
            {passwordError && (<p className="text-sm text-red-600 text-center">Incorrect password.</p>)}
            <Button type="submit" className="w-full">Enter</Button>
          </form>
        </Card>
      </div>
    );
  }

  const resultsTable = interimResults && (
    <Card title="Round Results">
      <p className="text-xs text-gray-500 mb-2">
        Health after the round = health − {rules.healthDecay} + food eaten (max {rules.maxHealth}). Earnings = health × ${rules.earningsMultiplier.toFixed(2)}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1 px-2">Player</th>
              <th className="text-right py-1 px-2">Food</th>
              <th className="text-right py-1 px-2">Health</th>
              <th className="text-right py-1 px-2">Earnings</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(interimResults).map(([id, r]) => (
              <tr key={id} className={id === playerId ? 'bg-amber-50 font-semibold' : ''}>
                <td className="py-1 px-2">{r.name}{id === playerId && r.name !== 'You' ? ' (You)' : ''}</td>
                <td className="text-right py-1 px-2">{r.food}</td>
                <td className="text-right py-1 px-2">{Math.round(r.health)}</td>
                <td className="text-right py-1 px-2">${r.earnings.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  // ---- Waiting for round ----
  if (!roundActive || !roundId) {
    return (
      <div className="space-y-4">
        <Card title="Exchange & Specialization (Hunter-Gatherer)">
          <div className="p-4 text-center text-gray-500">
            Waiting for the next round to start...
          </div>
        </Card>
        {resultsTable}
      </div>
    );
  }

  const phase: Phase = tick?.phase ?? 'hunting';
  const timeLeft = tick?.timeLeft ?? 0;
  const you = tick?.you;

  // What eating your food would do to your health right now
  const baseHealth = you ? Math.max(0, you.health - rules.healthDecay) : 0;
  const usableFood = Math.max(0, Math.min(rules.hearthCapacity, rules.maxHealth - baseHealth));
  const projHealth = you ? Math.min(rules.maxHealth, baseHealth + Math.min(you.food, rules.hearthCapacity)) : 0;
  const projEarnings = projHealth * rules.earningsMultiplier;
  const surplus = you ? Math.max(0, you.food - usableFood) : 0;
  const nearestInReach = tick && phase === 'hunting' ? preyInRange(tick) : null;

  const help = phaseHelp(phase, rules);

  return (
    <div className="space-y-2">
      {/* HUD Bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 bg-white rounded-lg shadow-sm border text-sm">
        <span className={`px-2 py-0.5 rounded font-semibold ${PHASE_STYLE[phase]}`}>{PHASE_LABEL[phase]}</span>
        <span className={timeLeft <= 5 ? 'text-red-600 font-bold' : 'font-medium'}>
          {Math.ceil(timeLeft)}s left
        </span>
        {you && (
          <>
            <span>Food: <strong>{you.food}</strong></span>
            <span>Health: <strong className={you.health <= 20 ? 'text-red-600' : ''}>{Math.round(you.health)}</strong></span>
            {phase !== 'interim' && (
              <span className="text-gray-500" title="If the round ended now: health − decay + food eaten, capped at max health">
                End-of-round health ≈ <strong>{Math.round(projHealth)}</strong> (${projEarnings.toFixed(2)})
              </span>
            )}
            {you.lockedZone && phase === 'hunting' && (
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">
                On the {you.lockedZone === 'left' ? 'big-game' : 'small-game'} side until the hunt ends
              </span>
            )}
            {you.stunned && <span className="text-red-500 font-bold">STUNNED</span>}
            {you.inTug && <span className="text-red-500 font-bold">TUG-OF-WAR</span>}
          </>
        )}
        <button
          onClick={() => showBanner(phase)}
          className="ml-auto text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
        >
          What do I do?
        </button>
      </div>

      {/* Tug-of-war yield bar */}
      {you?.inTug && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-red-700 font-medium text-sm">
            Tug-of-war! You and your opponent each lose {rules.tugOfWarCostPerSec} health per second until someone yields.
          </span>
          <Button size="sm" variant="danger" onClick={() => send({ type: 'yield_tug' })}>
            Yield
          </Button>
        </div>
      )}

      {/* Main canvas area */}
      <div ref={canvasBoxRef} className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ height: 'min(60vh, 500px)' }}>
        <GameCanvas tick={tick} chasePreyId={chasePreyId} onSelect={handleSelect} />

        {/* Phase banner */}
        {banner && banner === phase && (
          <div className="absolute left-1/2 top-12 -translate-x-1/2 z-10 w-[min(92%,560px)] bg-white/95 rounded-lg shadow-lg border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-bold text-base">{help.title}</div>
                <p className="text-sm text-gray-700 mt-1">{help.text}</p>
              </div>
              <button onClick={() => setBanner(null)} className="text-gray-400 hover:text-gray-600 shrink-0" aria-label="Dismiss">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Action menu for a tapped player or pot */}
        {menu && tick && phase === 'trading' && (
          <ActionMenu
            menu={menu}
            tick={tick}
            rules={rules}
            boxW={boxSize.w}
            boxH={boxSize.h}
            onAction={send}
            onApproach={approach}
            onClose={closeMenu}
          />
        )}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-sm border text-sm">
        {phase === 'hunting' && (
          <>
            <Button size="sm" onClick={catchNearest} disabled={!nearestInReach || !!you?.stunned} className="inline-flex items-center gap-1">
              <Crosshair className="w-4 h-4" />
              {nearestInReach ? `Catch ${nearestInReach.type} game` : 'Catch'}
            </Button>
            <span className="text-gray-600">
              {chasePreyId
                ? 'Chasing… you’ll try to catch it as soon as it’s in reach.'
                : 'Tap an animal to chase and catch it (or tap the ground to walk). Space bar = catch.'}
            </span>
          </>
        )}
        {phase === 'trading' && (
          <>
            <Button size="sm" variant="secondary" onClick={() => send({ type: 'place_pot' })} className="inline-flex items-center gap-1">
              <PackagePlus className="w-4 h-4" />
              Drop a food pot here
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setChatOpen(o => !o)} className="inline-flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              {chatOpen ? 'Hide chat' : 'Chat'}
            </Button>
            <span className="text-gray-600">
              Tap another gatherer to give, stun, or take food. Tap a pot to put food in or take it out.
            </span>
          </>
        )}
        {phase === 'interim' && (
          <span className="text-gray-600">Round over — food is being turned into health.</span>
        )}
        {phase !== 'interim' && surplus > 0 && (
          <span className="w-full text-amber-700">
            You have {surplus} more food than you can eat this round (health maxes out at {rules.maxHealth}). Extra food is wasted unless you give it to someone.
          </span>
        )}
      </div>

      {/* Chat panel (trading phase only) */}
      {phase === 'trading' && chatOpen && (
        <Card title="Chat (players near you)">
          <div className="h-32 overflow-y-auto p-2 space-y-1 text-sm bg-gray-50 rounded">
            {chatMessages.length === 0 && (
              <p className="text-gray-400 text-xs text-center">No messages yet</p>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={msg.from === playerId ? 'text-right' : ''}>
                <span className="font-semibold text-gray-700">{msg.from === playerId ? 'You' : msg.fromName}: </span>
                <span className="text-gray-600">{msg.message}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-2 py-1 border rounded text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
              maxLength={200}
            />
            <button onClick={sendChat} className="p-1 text-blue-600 hover:text-blue-800" aria-label="Send">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </Card>
      )}

      {/* Interim results */}
      {phase === 'interim' && resultsTable}
    </div>
  );
};

// ============================================================================
// Action menu (live: re-derived from every tick, so it updates as targets
// get stunned, move away, or change their food)
// ============================================================================

interface ActionMenuProps {
  menu: MenuTarget;
  tick: GameTick;
  rules: GameRules;
  /** Size of the canvas box the menu is positioned in. */
  boxW: number;
  boxH: number;
  onAction: (action: Record<string, any>) => void;
  /** Walk toward the menu's player/pot until within reach. */
  onApproach: (kind: 'player' | 'pot', id: string) => void;
  onClose: () => void;
}

const AmountButtons: React.FC<{ max: number; onPick: (n: number) => void }> = ({ max, onPick }) => (
  <div className="flex flex-wrap gap-1 mt-1">
    {amountChoices(max).map(n => (
      <button
        key={n}
        onClick={() => onPick(n)}
        className="px-2 py-1 text-xs rounded bg-sky-600 text-white hover:bg-sky-700"
      >
        {n === max && max > 1 ? `All ${n}` : n}
      </button>
    ))}
  </div>
);

const ActionMenu: React.FC<ActionMenuProps> = ({ menu, tick, rules, boxW, boxH, onAction, onApproach, onClose }) => {
  const you = tick.you;
  const entity: TickPlayer | TickPot | undefined = menu.kind === 'player'
    ? tick.players.find(p => p.id === menu.id)
    : tick.pots.find(p => p.id === menu.id);

  // Keep the menu on-screen: open toward whichever side of the tap has more room
  const style: React.CSSProperties = {
    maxHeight: boxH - 16,
    maxWidth: boxW - 16,
    overflowY: 'auto',
    ...(menu.sx > boxW / 2 ? { right: Math.max(8, boxW - menu.sx + 12) } : { left: menu.sx + 12 }),
    ...(menu.sy > boxH / 2 ? { bottom: Math.max(8, boxH - menu.sy - 20) } : { top: Math.max(8, menu.sy - 20) }),
  };

  const header = (title: string) => (
    <div className="flex justify-between items-center px-3 py-1.5 border-b">
      <span className="text-sm font-semibold">{title}</span>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  if (!entity) {
    return (
      <div className="absolute z-20 bg-white rounded-lg shadow-lg border w-64" style={style}>
        {header('Out of sight')}
        <p className="px-3 py-2 text-xs text-gray-500">They moved out of view.</p>
      </div>
    );
  }

  const d = dist(entity, you);
  const inReach = d <= rules.interactRadius;
  const reachNote = !inReach && (
    <div className="px-3 py-2 border-b bg-amber-50">
      <p className="text-xs text-amber-800">Walking over… these actions unlock once they're inside your reach (the dashed circle).</p>
      <button onClick={() => onApproach(menu.kind, menu.id)} className="mt-1 text-xs font-semibold text-sky-700 hover:underline">
        Not moving? Walk over
      </button>
    </div>
  );

  if (menu.kind === 'pot') {
    const pot = entity as TickPot;
    return (
      <div className="absolute z-20 bg-white rounded-lg shadow-lg border w-64" style={style}>
        {header(`Food pot (${pot.food} food)`)}
        {reachNote}
        <div className={`px-3 py-2 space-y-2 ${inReach ? '' : 'opacity-50 pointer-events-none'}`}>
          <div>
            <div className="text-xs font-medium text-gray-700">Put food in</div>
            {you.food > 0
              ? <AmountButtons max={you.food} onPick={n => onAction({ type: 'deposit_pot', potId: pot.id, amount: n })} />
              : <p className="text-xs text-gray-400">You have no food.</p>}
          </div>
          <div>
            <div className="text-xs font-medium text-gray-700">Take food out</div>
            {pot.food > 0
              ? <AmountButtons max={pot.food} onPick={n => onAction({ type: 'withdraw_pot', potId: pot.id, amount: n })} />
              : <p className="text-xs text-gray-400">The pot is empty.</p>}
          </div>
        </div>
      </div>
    );
  }

  const p = entity as TickPlayer;
  const stunBlocked =
    you.stunned ? "You're stunned" :
    you.inTug ? "You're in a tug-of-war" :
    you.stunCooldown > 0 ? `Recharging (${Math.ceil(you.stunCooldown / 10)}s)` :
    p.inTug ? 'They are in a tug-of-war' :
    p.stunned ? 'Already stunned' : null;

  return (
    <div className="absolute z-20 bg-white rounded-lg shadow-lg border w-72" style={style}>
      {header(`${p.name} — ${p.food} food`)}
      {reachNote}
      <div className={`px-3 py-2 space-y-3 ${inReach ? '' : 'opacity-50 pointer-events-none'}`}>
        <div>
          <div className="text-xs font-medium text-gray-700">Give food (a gift — no strings attached)</div>
          {you.food > 0
            ? <AmountButtons max={you.food} onPick={n => onAction({ type: 'transfer', targetId: p.id, amount: n })} />
            : <p className="text-xs text-gray-400">You have no food to give.</p>}
        </div>

        <div>
          <div className="text-xs font-medium text-gray-700">Stun (freezes them for {rules.stunSeconds}s)</div>
          <button
            onClick={() => onAction({ type: 'stun', targetId: p.id })}
            disabled={!!stunBlocked}
            className="mt-1 px-2 py-1 text-xs rounded bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {stunBlocked ?? `Stun ${p.name}`}
          </button>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-700">Take food</div>
          {!p.stunned ? (
            <p className="text-xs text-gray-400">Stun them first — you can only take from a stunned player.</p>
          ) : p.food <= 0 ? (
            <p className="text-xs text-gray-400">They have no food.</p>
          ) : (
            <>
              <AmountButtons max={p.food} onPick={n => onAction({ type: 'take', targetId: p.id, amount: n })} />
              {rules.enableTugOfWar && (
                <p className="text-[11px] text-gray-500 mt-1">
                  They can resist: a tug-of-war costs you both {rules.tugOfWarCostPerSec} health/sec until someone yields.
                </p>
              )}
            </>
          )}
        </div>

        {rules.enableHit && (
          <div>
            <button
              onClick={() => onAction({ type: 'hit', targetId: p.id })}
              className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
            >
              Hit {p.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscoveryProcessUI;
