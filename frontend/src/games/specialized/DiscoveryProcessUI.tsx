import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import type { GameUIProps } from '../GameUIRegistry';
import { Send, Lock, X } from 'lucide-react';
import toast from 'react-hot-toast';
import GameCanvas from './GameCanvas';
import type { GameTick, ContextMenuAction } from './GameCanvas';

const DISCOVERY_PROCESS_PASSWORD = 'password';
const STORAGE_KEY = 'discovery_process_unlocked';

// ============================================================================
// Types
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

interface ContextMenuState {
  x: number;
  y: number;
  actions: ContextMenuAction[];
}

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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [interimResults, setInterimResults] = useState<Record<string, InterimResult> | null>(null);
  const [amountInput, setAmountInput] = useState('1');
  const [pendingAction, setPendingAction] = useState<ContextMenuAction | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Socket event listeners
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(onEvent('game-tick', (data: GameTick) => {
      setTick(data);
    }));

    cleanups.push(onEvent('phase-changed', (data: { phase: string; duration: number }) => {
      if (data.phase === 'hunting') {
        setInterimResults(null);
        setChatMessages([]);
      }
      if (data.phase === 'trading') {
        setChatOpen(true);
      }
      toast(`Phase: ${data.phase} (${data.duration}s)`);
    }));

    cleanups.push(onEvent('capture-result', (data: { preyId: string; preyType: string; captured: boolean; foodGained: number; totalFood: number }) => {
      if (data.captured) {
        toast.success(`Captured ${data.preyType} prey! +${data.foodGained} food (total: ${data.totalFood})`);
      } else {
        toast(`${data.preyType} prey escaped!`);
      }
    }));

    cleanups.push(onEvent('stun-event', (data: { stunnerId: string; targetId: string; stunnerName: string; targetName: string }) => {
      if (data.targetId === playerId) {
        toast.error(`You were stunned by ${data.stunnerName}!`);
      } else if (data.stunnerId === playerId) {
        toast.success(`You stunned ${data.targetName}!`);
      }
    }));

    cleanups.push(onEvent('tug-start', (data: { initatorId: string; targetId: string; initiatorName: string; targetName: string }) => {
      if (data.targetId === playerId) {
        toast.error(`${data.initiatorName} is trying to take your food! Tug-of-war started!`);
      } else if (data.initatorId === playerId) {
        toast(`Tug-of-war with ${data.targetName}!`);
      }
    }));

    cleanups.push(onEvent('tug-end', (data: { yielderId: string; otherId: string; yielderName: string; otherName: string; initiatorYielded: boolean }) => {
      if (data.yielderId === playerId || data.otherId === playerId) {
        toast(`Tug-of-war ended. ${data.yielderName} yielded.`);
      }
    }));

    cleanups.push(onEvent('transfer-event', (data: { fromId: string; toId: string; amount: number; fromName: string; toName: string }) => {
      if (data.toId === playerId) {
        toast.success(`${data.fromName} gave you ${data.amount} food!`);
      } else if (data.fromId === playerId) {
        toast(`You gave ${data.amount} food to ${data.toName}`);
      }
    }));

    cleanups.push(onEvent('hit-event', (data: { hitterId: string; targetId: string; hitterName: string; targetName: string }) => {
      if (data.targetId === playerId) {
        toast.error(`You were hit by ${data.hitterName}!`);
      }
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
        });
      }
    }));

    return () => cleanups.forEach(c => c());
  }, [onEvent, playerId]);

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
  const handleMoveTo = useCallback((x: number, y: number) => {
    submitAction({ type: 'set_target', x, y });
    setContextMenu(null);
  }, [submitAction]);

  const handleContextAction = useCallback((actions: ContextMenuAction[], worldX: number, worldY: number) => {
    setContextMenu({ x: worldX, y: worldY, actions });
  }, []);

  const executeAction = useCallback((action: ContextMenuAction) => {
    // Some actions need an amount input
    if (action.type === 'transfer' || action.type === 'take' || action.type === 'deposit_pot' || action.type === 'withdraw_pot') {
      setPendingAction(action);
      setAmountInput('1');
      setContextMenu(null);
      return;
    }

    const payload: Record<string, any> = { type: action.type };
    if (action.targetId) payload.targetId = action.targetId;
    if (action.preyId) payload.preyId = action.preyId;
    if (action.potId) payload.potId = action.potId;

    submitAction(payload);
    setContextMenu(null);
  }, [submitAction]);

  const submitAmountAction = useCallback(() => {
    if (!pendingAction) return;
    const amount = parseInt(amountInput);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    const payload: Record<string, any> = { type: pendingAction.type, amount };
    if (pendingAction.targetId) payload.targetId = pendingAction.targetId;
    if (pendingAction.potId) payload.potId = pendingAction.potId;

    submitAction(payload);
    setPendingAction(null);
  }, [pendingAction, amountInput, submitAction]);

  const sendChat = useCallback(() => {
    const msg = chatInput.trim();
    if (!msg) return;
    submitAction({ type: 'chat', message: msg });
    setChatInput('');
  }, [chatInput, submitAction]);

  const yieldTug = useCallback(() => {
    submitAction({ type: 'yield_tug' });
  }, [submitAction]);

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

  // ---- Waiting for round ----
  if (!roundActive || !roundId) {
    return (
      <div className="space-y-4">
        <Card title="Discovery Process (Hunter-Gatherer)">
          <div className="p-4 text-center text-gray-500">
            Waiting for the round to start...
          </div>
        </Card>
      </div>
    );
  }

  const phase = tick?.phase ?? 'hunting';
  const timeLeft = tick?.timeLeft ?? 0;
  const you = tick?.you;

  return (
    <div className="space-y-2">
      {/* HUD Bar */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-white rounded-lg shadow-sm border text-sm">
        <span className="font-semibold capitalize">{phase}</span>
        <span className="text-gray-500">|</span>
        <span className={timeLeft <= 5 ? 'text-red-600 font-bold' : ''}>
          {Math.ceil(timeLeft)}s
        </span>
        <span className="text-gray-500">|</span>
        {you && (
          <>
            <span>Food: <strong>{you.food}</strong></span>
            <span className="text-gray-500">|</span>
            <span>Health: <strong className={you.health <= 20 ? 'text-red-600' : ''}>{Math.round(you.health)}</strong></span>
            {you.stunned && <span className="text-red-500 font-bold">STUNNED</span>}
            {you.inTug && <span className="text-red-500 font-bold">TUG-OF-WAR</span>}
          </>
        )}
        <div className="ml-auto flex gap-2">
          {phase === 'trading' && (
            <button onClick={() => setChatOpen(o => !o)} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">
              Chat {chatOpen ? '▾' : '▸'}
            </button>
          )}
        </div>
      </div>

      {/* Tug-of-war yield button */}
      {you?.inTug && (
        <div className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-red-700 font-medium text-sm">
            Tug-of-war! Health draining each tick.
          </span>
          <Button onClick={yieldTug} className="bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1">
            Yield
          </Button>
        </div>
      )}

      {/* Main canvas area */}
      <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ height: 'min(60vh, 500px)' }}>
        <GameCanvas
          tick={tick}
          onMoveTo={handleMoveTo}
          onContextAction={handleContextAction}
        />

        {/* Context menu overlay */}
        {contextMenu && (
          <div
            className="absolute z-20 bg-white rounded-lg shadow-lg border py-1 min-w-[160px]"
            style={{
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="flex justify-between items-center px-3 py-1 border-b">
              <span className="text-xs font-semibold text-gray-500">Actions</span>
              <button onClick={() => setContextMenu(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-3 h-3" />
              </button>
            </div>
            {contextMenu.actions.map((a, i) => (
              <button
                key={i}
                onClick={() => executeAction(a)}
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Amount input dialog */}
      {pendingAction && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm text-blue-700">{pendingAction.label} — Amount:</span>
          <input
            type="number"
            min="1"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="w-20 px-2 py-1 border rounded text-sm"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') submitAmountAction(); if (e.key === 'Escape') setPendingAction(null); }}
          />
          <Button onClick={submitAmountAction} className="text-sm px-3 py-1">Confirm</Button>
          <button onClick={() => setPendingAction(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      )}

      {/* Chat panel (trading phase only) */}
      {phase === 'trading' && chatOpen && (
        <Card title="Chat (nearby players)">
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
            <button onClick={sendChat} className="p-1 text-blue-600 hover:text-blue-800">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </Card>
      )}

      {/* Interim results */}
      {interimResults && phase === 'interim' && (
        <Card title="Round Results">
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
                    <td className="py-1 px-2">{r.name}{id === playerId ? ' (You)' : ''}</td>
                    <td className="text-right py-1 px-2">{r.food}</td>
                    <td className="text-right py-1 px-2">{Math.round(r.health)}</td>
                    <td className="text-right py-1 px-2">${r.earnings.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default DiscoveryProcessUI;
