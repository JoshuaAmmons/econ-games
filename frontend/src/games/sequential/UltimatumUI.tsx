import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Check, X, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface PairResult {
  firstMoverId: string;
  firstMoverName: string;
  secondMoverId: string;
  secondMoverName: string;
  firstMoveAction: { offer: number };
  secondMoveAction: { accept: boolean };
  firstMoverProfit: number;
  secondMoverProfit: number;
}

/**
 * Ultimatum Game UI (Week 9)
 */
const UltimatumUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [offer, setOffer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [partnerOffer, setPartnerOffer] = useState<number | null>(null);
  const [results, setResults] = useState<PairResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const endowment = gameConfig.endowment ?? 10;
  const minOffer = gameConfig.minOffer ?? 0;
  const isProposer = player?.role === 'proposer';

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setOffer('');
      setPartnerOffer(null);
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
        setPartnerOffer(state.partnerAction.offer);
      }
      if (state.results) {
        setResults(state.results.map ? state.results : []);
      }
    }));

    cleanups.push(onEvent('first-move-submitted', (data: { partnerId: string; action: { offer: number } }) => {
      if (data.partnerId === playerId) {
        setPartnerOffer(data.action.offer);
        toast(`Your partner offered $${Number(data.action.offer).toFixed(2)}`, { icon: '💰' });
      }
    }));

    cleanups.push(onEvent('second-move-submitted', (data: { partnerId: string }) => {
      if (data.partnerId === playerId) {
        toast('Your partner has responded!', { icon: '⏳' });
      }
    }));

    cleanups.push(onEvent('round-results', (data: { pairs: PairResult[] }) => {
      setResults(data.pairs);
      refreshPlayer();
      const myPair = data.pairs.find(p => p.firstMoverId === playerId || p.secondMoverId === playerId);
      if (myPair) {
        const myProfit = myPair.firstMoverId === playerId ? myPair.firstMoverProfit : myPair.secondMoverProfit;
        if (myPair.secondMoveAction.accept) {
          toast.success(`Offer accepted! Your profit: $${Number(myProfit).toFixed(2)}`);
        } else {
          toast(`Offer rejected. Both earn $0.`, { icon: '❌' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer, isProposer]);

  const handleProposerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !offer || submitted) return;
    const offerNum = parseFloat(offer);
    if (isNaN(offerNum) || offerNum < minOffer || offerNum > endowment) {
      toast.error(`Offer must be between $${minOffer} and $${endowment}`);
      return;
    }
    submitAction({ type: 'first_move', offer: offerNum });
    setSubmitted(true);
    toast.success(`Offered $${offerNum.toFixed(2)} to your partner`);
  };

  const handleResponderDecision = (accept: boolean) => {
    if (!roundId || submitted) return;
    submitAction({ type: 'second_move', accept });
    setSubmitted(true);
    toast.success(accept ? 'Offer accepted!' : 'Offer rejected!');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Game & Action */}
      <div className="space-y-4">
        <Card>
          <div className="text-center">
            <div className="text-sm text-gray-500 mb-1">Endowment to Split</div>
            <div className="text-3xl font-bold text-sky-700">${endowment.toFixed(2)}</div>
            <div className="mt-2 px-3 py-1 inline-block rounded-full text-sm font-medium bg-purple-100 text-purple-700">
              You are the {isProposer ? 'Proposer' : 'Responder'}
            </div>
          </div>
        </Card>

        <Card title={isProposer ? 'Make Your Offer' : 'Respond to Offer'}>
          {roundActive && roundId ? (
            isProposer ? (
              // Proposer UI
              submitted ? (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium mb-2">Offer Sent!</div>
                  <p className="text-sm text-gray-500">Waiting for your partner to respond...</p>
                </div>
              ) : (
                <form onSubmit={handleProposerSubmit} className="space-y-3">
                  <Input
                    label={`Amount to offer (min $${minOffer})`}
                    type="number"
                    step="0.50"
                    min={minOffer}
                    max={endowment}
                    value={offer}
                    onChange={(e) => setOffer(e.target.value)}
                    placeholder={`$${minOffer} - $${endowment}`}
                    required
                  />
                  {offer && (
                    <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
                      <div className="flex justify-between">
                        <span>You offer:</span>
                        <span className="font-medium">${parseFloat(offer).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>You keep:</span>
                        <span className="font-medium">${(endowment - parseFloat(offer)).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={!offer}>
                    Send Offer
                  </Button>
                </form>
              )
            ) : (
              // Responder UI
              submitted ? (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium">Response Submitted!</div>
                </div>
              ) : partnerOffer !== null ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-500 mb-1">Your partner offers you:</p>
                    <p className="text-3xl font-bold text-amber-700">${Number(partnerOffer).toFixed(2)}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      (They keep ${(endowment - Number(partnerOffer)).toFixed(2)})
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
                    Reject = both get $0. Accept = you get ${Number(partnerOffer).toFixed(2)}.
                  </p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Users className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">Waiting for your partner to make an offer...</p>
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
            <span className={`text-2xl font-bold ${(Number(player?.total_profit) || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${Number(player?.total_profit || 0).toFixed(2)}
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
                return (
                  <div
                    key={i}
                    className={`rounded-lg p-4 ${isMyPair ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">
                        {pair.firstMoverName || 'Proposer'}
                      </span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">
                        {pair.secondMoverName || 'Responder'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>Offer: ${Number(pair.firstMoveAction.offer).toFixed(2)} / ${endowment.toFixed(2)}</div>
                      <div className="flex items-center gap-1">
                        {pair.secondMoveAction.accept ? (
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
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all pairs complete</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default UltimatumUI;
