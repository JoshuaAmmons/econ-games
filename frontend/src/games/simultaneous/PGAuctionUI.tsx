import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Target, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  bid: number;
  valuation: number;
  totalBids: number;
  avgBid: number;
  provisionCost: number;
  isProvided: boolean;
  payment: number;
  shortfall: number;
  refundRule: string;
  groupSize: number;
}

/**
 * Public Goods Auction UI (Week 30)
 * Provision point mechanism for a binary public good.
 * Players bid their contribution; PG is provided if total bids ≥ provision cost.
 */
const PGAuctionUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [bid, setBid] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const provisionCost = gameConfig.provisionCost ?? 100;
  const refundRule = gameConfig.refundRule ?? 'money_back';
  const privateValue = Number(player?.valuation ?? 0);

  const bidNum = parseFloat(bid) || 0;

  // Reset state when new round starts
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setBid('');
      setResults(null);
      setWaitingCount({ submitted: 0, total: 0 });
      refreshPlayer();
    }
  }, [roundId, roundActive, refreshPlayer]);

  // Socket events
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(onEvent('game-state', (state: any) => {
      if (state.myAction) setSubmitted(true);
      if (state.totalSubmitted !== undefined && state.totalPlayers !== undefined) {
        setWaitingCount({ submitted: state.totalSubmitted, total: state.totalPlayers });
      }
      if (state.results) setResults(state.results);
    }));

    cleanups.push(onEvent('action-submitted', (data: { submitted: number; total: number }) => {
      setWaitingCount({ submitted: data.submitted, total: data.total });
    }));

    cleanups.push(onEvent('round-results', (data: { results: RoundResult[] }) => {
      setResults(data.results);
      refreshPlayer();
      const myResult = data.results.find(r => r.playerId === playerId);
      if (myResult) {
        if (myResult.isProvided) {
          toast.success(`Project funded! Profit: $${Number(myResult.profit).toFixed(2)}`);
        } else {
          toast(`Project not funded. ${refundRule === 'money_back' ? 'Bid refunded.' : 'Bid lost.'}`, { icon: '😞' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer, refundRule]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || bid === '' || submitted) return;

    const bidVal = parseFloat(bid);
    if (isNaN(bidVal) || bidVal < 0) {
      toast.error('Please enter a valid bid');
      return;
    }

    setSubmitting(true);
    submitAction({ type: 'decision', bid: bidVal });
    setSubmitted(true);
    toast.success(`Bid of $${bidVal.toFixed(2)} submitted!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Game Info & Submit */}
      <div className="space-y-4">
        {/* Parameters */}
        <Card>
          <div className="text-center mb-3">
            <Target className="w-8 h-8 mx-auto text-purple-600 mb-1" />
            <div className="text-sm text-gray-500">Public Goods Auction</div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Provision Cost:</span>
              <span className="font-bold text-purple-700">${provisionCost}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Refund Rule:</span>
              <span className={`font-medium ${refundRule === 'money_back' ? 'text-green-600' : 'text-red-600'}`}>
                {refundRule === 'money_back' ? 'Money Back' : 'No Refund'}
              </span>
            </div>
          </div>
          <div className={`mt-2 text-xs p-2 rounded text-center ${refundRule === 'money_back' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {refundRule === 'money_back'
              ? 'If not funded: your bid is refunded'
              : 'If not funded: your bid is LOST'}
          </div>
          <div className="mt-3 bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-sm text-gray-500">Your Private Value</div>
            <div className="text-3xl font-bold text-amber-700">${privateValue.toFixed(2)}</div>
            <p className="text-xs text-gray-400 mt-1">Your benefit if the project is funded</p>
          </div>
        </Card>

        {/* Submit Form */}
        <Card title="Your Bid">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Bid Submitted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} players submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label="Your Contribution Bid ($)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={bid}
                  onChange={(e) => setBid(e.target.value)}
                  placeholder="How much to contribute?"
                  required
                />
                {bid && !isNaN(bidNum) && bidNum >= 0 && (
                  <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Your bid:</span>
                      <span className="font-medium">${bidNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Your value:</span>
                      <span className="font-medium">${privateValue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Profit if funded:</span>
                      <span className={`font-medium ${privateValue - bidNum >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${(privateValue - bidNum).toFixed(2)}
                      </span>
                    </div>
                    {bidNum > privateValue && (
                      <div className="text-red-600 font-medium mt-1">
                        Warning: Bid exceeds your value!
                      </div>
                    )}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting || bid === ''}>
                  {submitting ? 'Submitting...' : 'Submit Bid'}
                </Button>
              </form>
            )
          ) : (
            <p className="text-center text-gray-500 py-4">Waiting for round to start...</p>
          )}
        </Card>

        {/* Profit */}
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

      {/* Center & Right: Results */}
      <div className="lg:col-span-2">
        <Card title="Round Results">
          {results ? (
            <div className="space-y-4">
              {/* Provision Result Banner */}
              <div className={`p-4 rounded-lg text-center ${myResult?.isProvided ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  {myResult?.isProvided
                    ? <CheckCircle className="w-6 h-6 text-green-600" />
                    : <XCircle className="w-6 h-6 text-red-600" />
                  }
                  <span className={`text-lg font-bold ${myResult?.isProvided ? 'text-green-700' : 'text-red-700'}`}>
                    {myResult?.isProvided ? 'Project Funded!' : 'Project NOT Funded'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm mt-2">
                  <div>
                    <div className="text-gray-500">Total Bids</div>
                    <div className="font-bold">${myResult ? Number(myResult.totalBids).toFixed(2) : 0}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Provision Cost</div>
                    <div className="font-bold">${provisionCost}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">{myResult?.isProvided ? 'Surplus' : 'Shortfall'}</div>
                    <div className={`font-bold ${myResult?.isProvided ? 'text-green-600' : 'text-red-600'}`}>
                      ${myResult ? (myResult.isProvided
                        ? (Number(myResult.totalBids) - provisionCost).toFixed(2)
                        : Number(myResult.shortfall).toFixed(2)) : 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Individual Results */}
              {[...results]
                .sort((a, b) => Number(b.bid) - Number(a.bid))
                .map((r, i) => (
                  <div
                    key={r.playerId}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                      r.playerId === playerId ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Target className={`w-5 h-5 ${Number(r.bid) > 0 ? 'text-purple-500' : 'text-gray-300'}`} />
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName || `Voter ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          Bid: ${Number(r.bid).toFixed(2)} | Payment: ${Number(r.payment).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${Number(r.profit) > 0 ? 'text-green-600' : Number(r.profit) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                        ${Number(r.profit).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-400">profit</div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all players submit their bids</p>
              {waitingCount.total > 0 && (
                <p className="text-sm mt-2">{waitingCount.submitted}/{waitingCount.total} submitted</p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default PGAuctionUI;
