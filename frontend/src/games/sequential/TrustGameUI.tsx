import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { HandCoins, ArrowRight, DollarSign, Users } from 'lucide-react';
import toast from 'react-hot-toast';

interface PairResult {
  firstMoverId: string;
  firstMoverName: string;
  secondMoverId: string;
  secondMoverName: string;
  firstMoveAction: { amountSent: number };
  secondMoveAction: { amountReturned: number };
  firstMoverProfit: number;
  secondMoverProfit: number;
}

/**
 * Trust Game UI
 * Sender sends an amount (0 to endowment). It is multiplied.
 * Receiver sees the tripled amount and decides how much to return.
 */
const TrustGameUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [amountSent, setAmountSent] = useState('');
  const [amountReturned, setAmountReturned] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [partnerAmount, setPartnerAmount] = useState<number | null>(null);
  const [results, setResults] = useState<PairResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const endowment = Number(gameConfig.endowment ?? 10);
  const multiplier = Number(gameConfig.multiplier ?? 3);
  const isSender = player?.role === 'sender';

  // Derived values for sender preview
  const sentNum = parseFloat(amountSent) || 0;
  const tripledAmount = sentNum * multiplier;

  // Derived values for receiver
  const receivedTripled = partnerAmount !== null ? partnerAmount * multiplier : 0;

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setAmountSent('');
      setAmountReturned('');
      setPartnerAmount(null);
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
      if (!isSender && state.partnerAction) {
        setPartnerAmount(state.partnerAction.amountSent);
      }
      if (state.pairs) {
        setResults(Array.isArray(state.pairs) ? state.pairs : []);
      }
    }));

    cleanups.push(onEvent('partner-first-move', (data: { action: { amountSent: number } }) => {
      setPartnerAmount(data.action.amountSent);
      const tripled = Number(data.action.amountSent) * multiplier;
      toast(`Your partner sent $${Number(data.action.amountSent).toFixed(2)} (you receive $${tripled.toFixed(2)})`, { icon: '💰' });
    }));

    cleanups.push(onEvent('second-move-submitted', () => {
      // Progress tracking only — toast handled by round-results
    }));

    cleanups.push(onEvent('round-results', (data: { pairs: PairResult[] }) => {
      setResults(data.pairs);
      refreshPlayer();
      const myPair = data.pairs.find(p => p.firstMoverId === playerId || p.secondMoverId === playerId);
      if (myPair) {
        const myProfit = myPair.firstMoverId === playerId ? myPair.firstMoverProfit : myPair.secondMoverProfit;
        toast.success(`Round complete! Your profit: $${Number(myProfit).toFixed(2)}`);
      }
    }));

    // Rollback submitted state on server error so player can retry
    cleanups.push(onEvent('error', () => {
      setSubmitted(false);
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer, isSender, multiplier]);

  const handleSenderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !amountSent || submitted) return;
    const amount = parseFloat(amountSent);
    if (isNaN(amount) || amount < 0 || amount > endowment) {
      toast.error(`Amount must be between $0 and $${endowment}`);
      return;
    }
    submitAction({ type: 'first_move', amountSent: amount });
    setSubmitted(true);
    toast.success(`Sent $${amount.toFixed(2)} to your partner`);
  };

  const handleReceiverSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !amountReturned || submitted || partnerAmount === null) return;
    const amount = parseFloat(amountReturned);
    const maxReturn = partnerAmount * multiplier;
    if (isNaN(amount) || amount < 0 || amount > maxReturn) {
      toast.error(`Amount must be between $0 and $${maxReturn.toFixed(2)}`);
      return;
    }
    submitAction({ type: 'second_move', amountReturned: amount });
    setSubmitted(true);
    toast.success(`Returned $${amount.toFixed(2)} to your partner`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Game & Action */}
      <div className="space-y-4">
        <Card>
          <div className="text-center">
            <div className="text-sm text-gray-500 mb-1">Endowment</div>
            <div className="text-3xl font-bold text-sky-700">${endowment.toFixed(2)}</div>
            <div className="mt-2 px-3 py-1 inline-block rounded-full text-sm font-medium bg-purple-100 text-purple-700">
              You are the {isSender ? 'Sender' : 'Receiver'}
            </div>
            <div className="mt-2 text-xs text-gray-400 p-2 bg-gray-50 rounded">
              Amounts sent are multiplied by {multiplier}x before reaching the receiver.
            </div>
          </div>
        </Card>

        <Card title={isSender ? 'Send Money' : 'Return Money'}>
          {roundActive && roundId ? (
            isSender ? (
              // Sender UI
              submitted ? (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium mb-2">Amount Sent!</div>
                  <p className="text-sm text-gray-500">Waiting for your partner to respond...</p>
                </div>
              ) : (
                <form onSubmit={handleSenderSubmit} className="space-y-3">
                  <Input
                    label={`Amount to send ($0 - $${endowment})`}
                    type="number"
                    step="0.50"
                    min="0"
                    max={endowment}
                    value={amountSent}
                    onChange={(e) => setAmountSent(e.target.value)}
                    placeholder={`$0 - $${endowment}`}
                    required
                  />
                  {amountSent && !isNaN(sentNum) && sentNum >= 0 && (
                    <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
                      <div className="flex justify-between">
                        <span>You send:</span>
                        <span className="font-medium">${sentNum.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sky-700">
                        <span>Amount will be tripled:</span>
                        <span className="font-medium">${sentNum.toFixed(2)} &times; {multiplier} = ${tripledAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>You keep (before return):</span>
                        <span className="font-medium">${(endowment - sentNum).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={!amountSent}>
                    <HandCoins className="w-4 h-4 inline mr-2" />
                    Send Amount
                  </Button>
                </form>
              )
            ) : (
              // Receiver UI
              submitted ? (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium">Response Submitted!</div>
                </div>
              ) : partnerAmount !== null ? (
                <form onSubmit={handleReceiverSubmit} className="space-y-3">
                  <div className="bg-amber-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-500 mb-1">Your partner sent:</p>
                    <p className="text-xl font-bold text-amber-700">${Number(partnerAmount).toFixed(2)}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Tripled: ${Number(partnerAmount).toFixed(2)} &times; {multiplier} ={' '}
                      <span className="font-bold text-green-700">${receivedTripled.toFixed(2)}</span>
                    </p>
                  </div>
                  <Input
                    label={`Amount to return ($0 - $${receivedTripled.toFixed(2)})`}
                    type="number"
                    step="0.50"
                    min="0"
                    max={receivedTripled}
                    value={amountReturned}
                    onChange={(e) => setAmountReturned(e.target.value)}
                    placeholder={`$0 - $${receivedTripled.toFixed(2)}`}
                    required
                  />
                  {amountReturned && (
                    <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span>You return:</span>
                        <span className="font-medium">${(parseFloat(amountReturned) || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>You keep:</span>
                        <span className="font-medium">${(receivedTripled - (parseFloat(amountReturned) || 0)).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={!amountReturned}>
                    <HandCoins className="w-4 h-4 inline mr-2" />
                    Return Amount
                  </Button>
                </form>
              ) : (
                <div className="text-center py-4">
                  <Users className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">Waiting for your partner to send...</p>
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
                const sent = Number(pair.firstMoveAction?.amountSent ?? 0);
                const tripled = sent * multiplier;
                const returned = Number(pair.secondMoveAction?.amountReturned ?? 0);
                return (
                  <div
                    key={i}
                    className={`rounded-lg p-4 ${isMyPair ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">
                        {pair.firstMoverName || 'Sender'}
                      </span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">
                        {pair.secondMoverName || 'Receiver'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>Sent: ${sent.toFixed(2)}</div>
                      <div>Tripled: ${sent.toFixed(2)} &times; {multiplier} = ${tripled.toFixed(2)}</div>
                      <div>Returned: ${returned.toFixed(2)}</div>
                      <div className="flex justify-between text-xs mt-1">
                        <span>Sender: ${Number(pair.firstMoverProfit).toFixed(2)}</span>
                        <span>Receiver: ${Number(pair.secondMoverProfit).toFixed(2)}</span>
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

export default TrustGameUI;
