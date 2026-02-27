import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Home, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import TownView from './TownView';

// ============================================================================
// Types
// ============================================================================

interface PlayerInventory {
  field: Record<string, number>;
  house: Record<string, number>;
}

interface PlayerInfo {
  id: string;
  name: string;
  label: number;
  typeIndex: number;
  earningRequirements: Record<string, number>;
  earningAmount: number;
}

interface GoodConfig {
  name: string;
  color: string;
}

interface GameConfig {
  numGoods: number;
  good1Name: string;
  good1Color: string;
  good2Name: string;
  good2Color: string;
  good3Name?: string;
  good3Color?: string;
  productionLength: number;
  moveLength: number;
  allowStealing: boolean;
  allowChat: boolean;
  allowPrivateChat: boolean;
}

interface ChatMessage {
  from: string;
  fromName: string;
  message: string;
  recipients: string | string[];
  timestamp: number;
}

interface PeriodResult {
  playerId: string;
  playerName: string;
  profit: number;
  completeSets: number;
  earnings: number;
  inventory: PlayerInventory;
  wasted: Record<string, number>;
}

// ============================================================================
// Component
// ============================================================================

const DiscoveryProcessUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundNumber,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
  requestGameState,
}) => {
  // State
  const [phase, setPhase] = useState<'production' | 'move' | 'complete' | 'waiting'>('waiting');
  const [phaseTimeRemaining, setPhaseTimeRemaining] = useState(0);
  const [inventories, setInventories] = useState<Record<string, PlayerInventory>>({});
  const [allocation, setAllocation] = useState<number[]>([50, 50]);
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo[]>([]);
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatRecipient, setChatRecipient] = useState<string>('all');
  const [results, setResults] = useState<PeriodResult[] | null>(null);
  const [productionStarted, setProductionStarted] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Derive good configs
  const goods: GoodConfig[] = gameConfig
    ? [
        { name: gameConfig.good1Name, color: gameConfig.good1Color },
        { name: gameConfig.good2Name, color: gameConfig.good2Color },
        ...(gameConfig.numGoods >= 3 && gameConfig.good3Name
          ? [{ name: gameConfig.good3Name, color: gameConfig.good3Color || '#FF1493' }]
          : []),
      ]
    : [];

  // My player info
  const myInfo = playerInfo.find((p) => p.id === playerId);
  const myInventory = inventories[playerId] || { field: {}, house: {} };

  // Socket event listeners
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      onEvent('phase-changed', (data: { phase: string; timeRemaining: number }) => {
        setPhase(data.phase as any);
        setPhaseTimeRemaining(data.timeRemaining);
        if (data.phase === 'move') {
          setProductionStarted(false);
        } else if (data.phase === 'complete') {
          toast('Period complete!');
        }
      })
    );

    cleanups.push(
      onEvent('inventory-updated', (data: { playerId: string; inventory: PlayerInventory }) => {
        setInventories((prev) => ({
          ...prev,
          [data.playerId]: data.inventory,
        }));
      })
    );

    cleanups.push(
      onEvent('goods-moved', (_data: { fromPlayerId: string; toPlayerId: string; good: string; amount: number; movedBy: string }) => {
        // Intentionally silent — players must discover mechanics on their own
      })
    );

    cleanups.push(
      onEvent('production-updated', (_data: { playerId: string; allocation: number[] }) => {
        // Could update a display of other players' production settings if needed
      })
    );

    cleanups.push(
      onEvent('period-earnings', (data: { results: PeriodResult[] }) => {
        setResults(data.results);
        setPhase('complete');
        refreshPlayer();
        const myResult = data.results.find((r) => r.playerId === playerId);
        if (myResult) {
          toast.success(`Period earnings: ${myResult.earnings}¢ (${myResult.completeSets} complete sets)`);
        }
      })
    );

    cleanups.push(
      onEvent('chat-message', (msg: ChatMessage) => {
        if (
          msg.recipients === 'all' ||
          msg.from === playerId ||
          (Array.isArray(msg.recipients) && msg.recipients.includes(playerId))
        ) {
          setChatMessages((prev) => [...prev, msg]);
        }
      })
    );

    cleanups.push(
      onEvent('game-state', (data: any) => {
        if (data.phase) setPhase(data.phase);
        if (data.timeRemaining !== undefined) setPhaseTimeRemaining(data.timeRemaining);
        if (data.inventories) setInventories(data.inventories);
        if (data.playerInfo) setPlayerInfo(data.playerInfo);
        if (data.config) setGameConfig(data.config);
        if (data.chatMessages) setChatMessages(data.chatMessages);
        if (data.productionSettings && data.productionSettings[playerId]) {
          setAllocation(data.productionSettings[playerId]);
        }
        if (data.results) setResults(data.results);
      })
    );

    return () => cleanups.forEach((fn) => fn());
  }, [onEvent, playerId, refreshPlayer]);

  // Re-request game state after listeners are registered to avoid race condition
  // where Market.tsx fires requestGameState before this component mounts its listeners
  useEffect(() => {
    if (roundId && requestGameState) {
      requestGameState(roundId);
    }
  }, [roundId, requestGameState]);

  // Initialize config from session
  useEffect(() => {
    const cfg = session?.game_config || {};
    const numGoods = parseInt(cfg.numGoods, 10) || 2;
    setGameConfig({
      numGoods,
      good1Name: cfg.good1Name || 'Orange',
      good1Color: cfg.good1Color || '#FF5733',
      good2Name: cfg.good2Name || 'Blue',
      good2Color: cfg.good2Color || '#6495ED',
      good3Name: cfg.good3Name || 'Pink',
      good3Color: cfg.good3Color || '#FF1493',
      productionLength: cfg.productionLength ?? 10,
      moveLength: cfg.time_per_round ?? 90,
      allowStealing: cfg.allowStealing ?? false,
      allowChat: cfg.allowChat !== false,
      allowPrivateChat: cfg.allowPrivateChat !== false,
    });
    setAllocation(numGoods === 3 ? [34, 33, 33] : [50, 50]);
  }, [session]);

  // Reset local state when round changes (server state comes via Market.tsx requestGameState)
  useEffect(() => {
    if (roundId) {
      setResults(null);
      setPhase('production');
      setProductionStarted(false);
      setChatMessages([]);
      setInventories({});
    }
  }, [roundId]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Phase timer countdown
  useEffect(() => {
    if (phase === 'production' || phase === 'move') {
      const interval = setInterval(() => {
        setPhaseTimeRemaining((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [phase]);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  const handleSliderChange = (index: number, value: number) => {
    const newAlloc = [...allocation];
    newAlloc[index] = value;
    const remaining = 100 - value;

    // Collect indices of all OTHER sliders
    const otherIndices = newAlloc.map((_, i) => i).filter(i => i !== index);
    const otherSum = otherIndices.reduce((s, i) => s + newAlloc[i], 0);

    if (otherSum > 0) {
      let distributed = 0;
      otherIndices.forEach((i, oi) => {
        if (oi === otherIndices.length - 1) {
          // Last non-changed slider absorbs rounding remainder
          newAlloc[i] = remaining - distributed;
        } else {
          newAlloc[i] = Math.round((newAlloc[i] / otherSum) * remaining);
          distributed += newAlloc[i];
        }
      });
    } else {
      // Distribute evenly; last slider absorbs remainder
      const base = Math.floor(remaining / otherIndices.length);
      let distributed = 0;
      otherIndices.forEach((i, oi) => {
        if (oi === otherIndices.length - 1) {
          newAlloc[i] = remaining - distributed;
        } else {
          newAlloc[i] = base;
          distributed += base;
        }
      });
    }

    setAllocation(newAlloc);
  };

  const handleUpdateProduction = () => {
    submitAction({ type: 'set_production', allocation });
    toast.success('Production settings updated!');
  };

  const handleStartProduction = () => {
    submitAction({ type: 'start_production' });
    setProductionStarted(true);
  };

  const handleSimulateProduction = () => {
    if (!myInfo || !gameConfig) return;

    // Simple preview based on allocation
    const preview = goods.map((good, i) => {
      const pct = allocation[i];
      const time = (pct / 100) * (gameConfig.productionLength ?? 10);
      return `${good.name}: ~${Math.floor(time)} units (${pct}% time)`;
    });
    toast(`Production preview:\n${preview.join('\n')}`, { duration: 4000 });
  };

  const handleMoveGoods = useCallback(
    (good: string, amount: number, fromLocation: 'field' | 'house', fromPlayerId: string, toPlayerId: string) => {
      submitAction({
        type: 'move_goods',
        good,
        amount,
        fromLocation,
        fromPlayerId,
        toPlayerId,
      });
    },
    [submitAction]
  );

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    submitAction({
      type: 'chat',
      message: chatInput.trim(),
      recipients: chatRecipient,
    });
    setChatInput('');
  };

  // --------------------------------------------------------------------------
  // Earning info
  // --------------------------------------------------------------------------

  const getEarningInfo = () => {
    if (!myInfo) return null;
    const reqs = myInfo.earningRequirements;
    const parts = goods
      .map((good, i) => {
        const goodKey = `good${i + 1}`;
        const req = reqs[goodKey] || 0;
        return req > 0 ? `${req} ${good.name}` : null;
      })
      .filter(Boolean);
    return `For each set of ${parts.join(' and ')} goods in your house you earn ${myInfo.earningAmount}¢ each period.`;
  };

  const getHouseValue = () => {
    if (!myInfo || goods.length === 0) return 0;
    const reqs = myInfo.earningRequirements;
    const setAmounts = goods.map((good, i) => {
      const goodKey = `good${i + 1}`;
      const required = reqs[goodKey] || 1;
      const available = myInventory.house[good.name] || 0;
      return Math.floor(available / required);
    });
    const completeSets = Math.min(...setAmounts);
    return completeSets * myInfo.earningAmount;
  };

  const getWastedGoods = () => {
    if (!myInfo || goods.length === 0) return {};
    const reqs = myInfo.earningRequirements;
    const setAmounts = goods.map((good, i) => {
      const goodKey = `good${i + 1}`;
      const required = reqs[goodKey] || 1;
      const available = myInventory.house[good.name] || 0;
      return Math.floor(available / required);
    });
    const completeSets = Math.min(...setAmounts);
    const wasted: Record<string, number> = {};
    goods.forEach((good, i) => {
      const goodKey = `good${i + 1}`;
      const required = reqs[goodKey] || 1;
      const available = myInventory.house[good.name] || 0;
      wasted[good.name] = available - completeSets * required;
    });
    return wasted;
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  const phaseLabel =
    phase === 'production' ? 'Production' : phase === 'move' ? 'Active' : phase === 'complete' ? 'Complete' : 'Waiting';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {/* Town View — Left/Center */}
      <div className="lg:col-span-3 space-y-4">
        <Card title={`Town: Person ${playerInfo.find((p) => p.id === playerId)?.label || '?'}`}>
          {playerInfo.length > 0 && goods.length > 0 ? (
            <TownView
              players={playerInfo}
              currentPlayerId={playerId}
              inventories={inventories}
              goods={goods}
              phase={phase}
              allowStealing={gameConfig?.allowStealing}
              onMoveGoods={handleMoveGoods}
            />
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Home className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Waiting for game to start...</p>
            </div>
          )}
        </Card>

        {/* Chat Panel */}
        {gameConfig?.allowChat && (
          <Card title="Chat">
            <div className="space-y-2">
              {/* Recipient selector */}
              <div className="flex flex-wrap gap-1">
                <button
                  className={`px-3 py-1 text-xs rounded border ${
                    chatRecipient === 'all'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setChatRecipient('all')}
                >
                  Everyone
                </button>
                {gameConfig.allowPrivateChat &&
                  playerInfo
                    .filter((p) => p.id !== playerId)
                    .map((p) => (
                      <button
                        key={p.id}
                        className={`px-3 py-1 text-xs rounded border ${
                          chatRecipient === p.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                        onClick={() => setChatRecipient(p.id)}
                      >
                        {p.label}
                      </button>
                    ))}
              </div>

              {/* Messages */}
              <div className="h-32 overflow-y-auto bg-gray-50 rounded p-2 text-sm space-y-1">
                {chatMessages.length === 0 && (
                  <p className="text-gray-400 text-center">No messages yet</p>
                )}
                {chatMessages.map((msg, i) => {
                  const isPrivate = msg.recipients !== 'all';
                  const isSelf = msg.from === playerId;
                  return (
                    <div key={i} className={`${isSelf ? 'text-blue-700' : 'text-gray-800'}`}>
                      <span className="font-medium">{isSelf ? 'You' : msg.fromName}</span>
                      {isPrivate && <span className="text-xs text-purple-600 ml-1">(private)</span>}
                      : {msg.message}
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSendChat} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={chatRecipient === 'all' ? 'Chat Text' : `Message to ${playerInfo.find((p) => p.id === chatRecipient)?.label || '?'}`}
                  className="flex-1 px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
                  maxLength={500}
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm flex items-center gap-1"
                  disabled={!chatInput.trim()}
                >
                  <Send className="w-3 h-3" />
                </button>
              </form>
            </div>
          </Card>
        )}
      </div>

      {/* Right Sidebar */}
      <div className="space-y-4">
        {/* Production Settings */}
        <Card title="Your field's production">
          {phase === 'production' && roundActive ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Your {gameConfig?.productionLength ?? 10} seconds of growth time split between producing {goods.length} goods:
              </p>
              {goods.length === 2 ? (
                <div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={allocation[0]}
                    onChange={(e) => handleSliderChange(0, parseInt(e.target.value, 10))}
                    className="w-full"
                    disabled={productionStarted}
                  />
                  <div className="flex justify-between text-sm">
                    <span style={{ color: goods[0]?.color }}>{allocation[0]}%<br />{goods[0]?.name}</span>
                    <span style={{ color: goods[1]?.color }}>{allocation[1]}%<br />{goods[1]?.name}</span>
                  </div>
                </div>
              ) : (
                goods.map((good, i) => (
                  <div key={good.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: good.color }}>{good.name}</span>
                      <span>{allocation[i]}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={allocation[i]}
                      onChange={(e) => handleSliderChange(i, parseInt(e.target.value, 10))}
                      className="w-full"
                      disabled={productionStarted}
                    />
                  </div>
                ))
              )}
              <div className="flex gap-2">
                <Button
                  onClick={handleUpdateProduction}
                  className="flex-1 text-sm"
                  disabled={productionStarted}
                >
                  Update Production
                </Button>
                <Button
                  onClick={handleSimulateProduction}
                  className="flex-1 text-sm"
                  disabled={productionStarted}
                >
                  Simulate
                </Button>
              </div>
              {!productionStarted && (
                <Button
                  onClick={handleStartProduction}
                  className="w-full bg-green-600 hover:bg-green-700 text-sm"
                >
                  Start Production
                </Button>
              )}
              {productionStarted && (
                <p className="text-center text-sm text-green-600 font-medium">
                  Producing... ({phaseTimeRemaining}s remaining)
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-2">
              {phase === 'move' ? 'Production complete.' : 'Waiting for next period...'}
            </p>
          )}
        </Card>

        {/* Period Earnings */}
        <Card title="Period Earnings">
          <div className="text-sm space-y-2">
            {getEarningInfo() && (
              <p className="text-gray-700">{getEarningInfo()}</p>
            )}
            {goods.map((good) => {
              const wasted = getWastedGoods();
              return (
                <div key={good.name} className="flex justify-between text-xs">
                  <span style={{ color: good.color }}>{good.name} goods wasted in your house:</span>
                  <span>{wasted[good.name] || 0}</span>
                </div>
              );
            })}
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between">
                <span>Current value of goods in your house:</span>
                <span className="font-bold">{getHouseValue()}¢</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Summary */}
        <Card title="Summary">
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span>Current Period:</span>
              <span className="font-medium">{roundNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Time Remaining:</span>
              <span className="font-medium">{phaseTimeRemaining}s</span>
            </div>
            <div className="flex justify-between">
              <span>Phase:</span>
              <span className={`font-medium ${phase === 'production' ? 'text-amber-600' : phase === 'move' ? 'text-blue-600' : 'text-gray-600'}`}>
                {phaseLabel}
              </span>
            </div>
            <div className="flex justify-between items-center border-t pt-2 mt-2">
              <div className="flex items-center gap-1">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="font-medium">Total Profit (¢):</span>
              </div>
              <span className="text-xl font-bold text-green-600">
                {Number(player?.total_profit || 0).toFixed(0)}
              </span>
            </div>
          </div>
        </Card>

        {/* Period Results */}
        {results && (
          <Card title="Period Results">
            <div className="space-y-2 text-sm">
              {[...results]
                .sort((a, b) => b.earnings - a.earnings)
                .map((r) => {
                  const isSelf = r.playerId === playerId;
                  return (
                    <div
                      key={r.playerId}
                      className={`p-2 rounded ${isSelf ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}
                    >
                      <div className="flex justify-between">
                        <span className="font-medium">{isSelf ? 'You' : r.playerName}</span>
                        <span className="font-bold text-green-600">{r.earnings}¢</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {r.completeSets} complete set{r.completeSets !== 1 ? 's' : ''}
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default DiscoveryProcessUI;
