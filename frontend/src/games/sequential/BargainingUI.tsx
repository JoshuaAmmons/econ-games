import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { Scale, Handshake, DollarSign, Users, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface PairResult {
  firstMoverId: string;
  firstMoverName: string;
  secondMoverId: string;
  secondMoverName: string;
  firstMoveAction: { keep: number };
  secondMoveAction: { accept: boolean };
  firstMoverProfit: number;
  secondMoverProfit: number;
}

/**
 * Bargaining Game UI
 * Proposer decides how much of the pie to keep. Responder accepts or rejects.
 * Similar to Ultimatum but framed as keeping (not offering) and includes
 * a discount factor that shrinks the pie each round.
 */
const BargainingUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [keep, setKeep] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [partnerKeep, setPartnerKeep] = useState<number | null>(null);
  const [results, setResults] = useState<PairResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const pieSize = Number(gameConfig.pieSize ?? 10);
  const discountFactor = Number(gameConfig.discountFactor ?? 0.9);
  const isProposer = player?.role === 'proposer';

  // Derived preview values
  const keepNum = parseFloat(keep) || 0;
  const partnerGets = pieSize - keepNum;

  // What the responder sees
  const proposerKeeps = partnerKeep ?? 0;
  const responderGets = pieSize - proposerKeeps;

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setKeep('');
      setPartnerKeep(null);
      setResults(null);
    }
  }, [roundId, roundActive]);

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    // Recover game state on page load / reconnect
    cleanups.push(onEvent('game-state', (state: any) => {
      if (state.myAction) {
        setSubmitted(true);
      }
      if (!isProposer && state.partnerAction) {
        setPartnerKeep(state.partnerAction.keep);
      }
      if (state.pairs) {
        setResults(Array.isArray(state.pairs) ? state.pairs : []);
      }
    }));

    cleanups.push(onEvent('partner-first-move', (data: { action: { keep: number } }) => {
      setPartnerKeep(data.action.keep);
      const offer = pieSize - Number(data.action.keep);
      toast(`Your partner proposes to keep $${Number(data.action.keep).toFixed(2)} (you get $${offer.toFixed(2)})`, { icon: '⚖️' });
    }));

    cleanups.push(onEvent('second-move-submitted', () => {
      // Progress tracking only
    }));

    cleanups.push(onEvent('round-results', (data: { pairs: PairResult[] }) => {
      setResults(data.pairs);
      refreshPlayer();
      const myPair = data.pairs.find(p => p.firstMoverId === playerId || p.secondMoverId === playerId);
      if (myPair) {
        const myProfit = myPair.firstMoverId === playerId ? myPair.firstMoverProfit : myPair.secondMoverProfit;
        if (myPair.secondMoveAction?.accept) {
          toast.success(`Proposal accepted! Your profit: $${Number(myProfit).toFixed(2)}`);
        } else {
          toast(`Proposal rejected. Both earn $0.`, { icon: '❌' });
        }
      }
    }));

    // Rollback submitted state on server error so player can retry
    cleanups.push(onEvent('error', () => {
      setSubmitted(false);
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer, isProposer, pieSize]);

  const handleProposerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !keep || submitted) return;
    const keepVal = parseFloat(keep);
    if (isNaN(keepVal) || keepVal < 0 || keepVal > pieSize) {
      toast.error(`Amount to keep must be between $0 and $${pieSize}`);
      return;
    }
    submitAction({ type: 'first_move', keep: keepVal });
    setSubmitted(true);
    toast.success(`Proposed to keep $${keepVal.toFixed(2)}`);
  };

  const handleResponderDecision = (accept: boolean) => {
    if (!roundId || submitted) return;
    submitAction({ type: 'second_move', accept });
    setSubmitted(true);
    toast.success(accept ? 'Proposal accepted!' : 'Proposal rejected!');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Game & Action */}
      <div className="space-y-4">
        <Card>
          <div className="text-center">
            <div className="text-sm text-gray-500 mb-1">Pie to Split</div>
            <div className="text-3xl font-bold text-sky-700">${pieSize.toFixed(2)}</div>
            <div className="mt-2 px-3 py-1 inline-block rounded-full text-sm font-medium bg-purple-100 text-purple-700">
              You are the {isProposer ? 'Proposer' : 'Responder'}
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-400 p-2 bg-gray-50 rounded text-center">
            <Scale className="w-4 h-4 inline mr-1" />
            The pie shrinks by {discountFactor} each round
          </div>
        </Card>

        <Card title={isProposer ? 'Make Your Proposal' : 'Respond to Proposal'}>
          {roundActive && roundId ? (
            isProposer ? (
              // Proposer UI
              submitted ? (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium mb-2">Proposal Sent!</div>
                  <p className="text-sm text-gray-500">Waiting for your partner to respond...</p>
                </div>
              ) : (
                <form onSubmit={handleProposerSubmit} className="space-y-3">
                  <Input
                    label={`Amount to keep ($0 - $${pieSize})`}
                    type="number"
                    step="0.50"
                    min="0"
                    max={pieSize}
                    value={keep}
                    onChange={(e) => setKeep(e.target.value)}
                    placeholder={`$0 - $${pieSize}`}
                    required
                  />
                  {keep && !isNaN(keepNum) && keepNum >= 0 && (
                    <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
                      <div className="flex justify-between">
                        <span>You keep:</span>
                        <span className="font-medium">${keepNum.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Partner gets:</span>
                        <span className="font-medium">${partnerGets.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={!keep}>
                    <Handshake className="w-4 h-4 inline mr-2" />
                    Submit Proposal
                  </Button>
                </form>
              )
            ) : (
              // Responder UI
              submitted ? (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium">Response Submitted!</div>
                </div>
              ) : partnerKeep !== null ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-500 mb-1">Your partner proposes to keep:</p>
                    <p className="text-3xl font-bold text-amber-700">${proposerKeeps.toFixed(2)}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      You would receive: <span className="font-bold text-green-700">${responderGets.toFixed(2)}</span>
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => handleResponderDecision(true)}
                      className="bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" /> Accept
                    </Button>
                    <Button
                      onClick={() => handleResponderDecision(false)}
                      className="bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4" /> Reject
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 text-center">
                    Reject = both get $0. Accept = you get ${responderGets.toFixed(2)}.
                  </p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Users className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">Waiting for your partner to make a proposal...</p>
                </div>
              )
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
            <span className={`text-2xl font-bold ${(Number(player?.total_profit ?? 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${Number(player?.total_profit ?? 0).toFixed(2)}
            </span>
          </div>
        </Card>
      </div>

      {/* Right: Results */}
      <div>
        <Card title="Round Results">
          {results ? (
            <div className="space-y-3">
              {results.map((pair, i) => {
                const isMyPair = pair.firstMoverId === playerId || pair.secondMoverId === playerId;
                const kept = Number(pair.firstMoveAction?.keep ?? 0);
                const offered = pieSize - kept;
                const accepted = pair.secondMoveAction?.accept;
                return (
                  <div
                    key={i}
                    className={`rounded-lg p-4 ${isMyPair ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">
                        {pair.firstMoverName || 'Proposer'}
                      </span>
                      <Handshake className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">
                        {pair.secondMoverName || 'Responder'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>Proposer keeps: ${kept.toFixed(2)} / ${pieSize.toFixed(2)}</div>
                      <div>Responder offered: ${offered.toFixed(2)}</div>
                      <div className="flex items-center gap-1">
                        {accepted ? (
                          <><Check className="w-3 h-3 text-green-600" /> <span className="text-green-600">Accepted</span></>
                        ) : (
                          <><X className="w-3 h-3 text-red-600" /> <span className="text-red-600">Rejected</span></>
                        )}
                      </div>
                      <div className="flex justify-between text-xs mt-1">
                        <span>Proposer: ${Number(pair.firstMoverProfit).toFixed(2)}</span>
                        <span>Responder: ${Number(pair.secondMoverProfit).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Scale className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all pairs complete</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default BargainingUI;
