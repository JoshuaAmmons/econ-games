import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { Gavel, DollarSign, Trophy, Users, Package } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  bid: number;
  isWinner: boolean;
  pricePaid: number;
  valuation: number;
  rank: number;
  numUnits: number;
  numBidders: number;
  cutoffBid: number;
}

/**
 * Discriminative Multi-Unit Auction UI
 * Multiple units for sale — top N bidders each win one unit and pay their own bid.
 */
const DiscriminativeAuctionUI: React.FC<GameUIProps> = ({
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
  const numUnits = gameConfig.numUnits ?? 3;
  const privateValue = Number(player?.valuation ?? 0);
  const bidNum = parseFloat(bid) || 0;
  const isBiddingAboveValue = bid !== '' && bidNum > privateValue;

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setBid('');
      setResults(null);
      setWaitingCount({ submitted: 0, total: 0 });
      refreshPlayer();
    }
  }, [roundId, roundActive, refreshPlayer]);

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
        if (myResult.isWinner) {
          toast.success(`You won a unit! Paid $${Number(myResult.pricePaid).toFixed(2)}. Profit: $${Number(myResult.profit).toFixed(2)}`);
        } else {
          toast(`You did not win a unit. Profit: $0`, { icon: '😞' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !bid || submitted) return;
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
  const winnersCount = results?.filter(r => r.isWinner).length ?? 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-4">
        <Card>
          <div className="text-center mb-3">
            <Gavel className="w-8 h-8 mx-auto text-indigo-600 mb-1" />
            <div className="text-sm text-gray-500">Discriminative Auction</div>
            <div className="text-lg font-bold text-indigo-700">Multi-Unit • Pay-As-Bid</div>
          </div>
          <div className="flex items-center justify-center gap-2 bg-indigo-50 rounded-lg p-3 mb-3">
            <Package className="w-5 h-5 text-indigo-600" />
            <span className="text-lg font-bold text-indigo-700">{numUnits} units</span>
            <span className="text-sm text-gray-500">available</span>
          </div>
          <div className="text-xs p-2 rounded text-center bg-indigo-50 text-indigo-700">
            Top {numUnits} bidders each win 1 unit and pay their own bid
          </div>
          <div className="mt-3 bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-sm text-gray-500">Your Private Value</div>
            <div className="text-3xl font-bold text-amber-700">${privateValue.toFixed(2)}</div>
            <p className="text-xs text-gray-400 mt-1">Only you know this value</p>
          </div>
        </Card>

        <Card title="Place Your Bid">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Bid Submitted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label="Your Bid ($)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={bid}
                  onChange={(e) => setBid(e.target.value)}
                  placeholder="Enter your bid for one unit"
                  required
                />
                {isBiddingAboveValue && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                    <span className="font-medium">Warning:</span> Bidding above your value risks a loss!
                  </div>
                )}
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
                      <span>Profit if you win:</span>
                      <span className={`font-medium ${privateValue - bidNum >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${(privateValue - bidNum).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-gray-400 italic">
                      You need to be in the top {numUnits} bidders to win
                    </div>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting || !bid}>
                  {submitting ? 'Submitting...' : 'Submit Bid'}
                </Button>
              </form>
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

      <div className="lg:col-span-2">
        <Card title="Auction Results">
          {results ? (
            <div className="space-y-3">
              {/* Summary */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-center">
                <strong>{winnersCount}</strong> of {numUnits} units sold to top bidders
                {myResult && (
                  <span className="ml-2">
                    | Cutoff bid: ${Number(myResult.cutoffBid).toFixed(2)}
                  </span>
                )}
              </div>

              {myResult && (
                <div className={`p-3 rounded-lg text-sm ${myResult.isWinner ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {myResult.isWinner && <Trophy className="w-4 h-4 text-yellow-500" />}
                    <span className="font-medium text-gray-700">
                      {myResult.isWinner ? `You won a unit! (Rank #${myResult.rank})` : `You did not win. (Rank #${myResult.rank})`}
                    </span>
                  </div>
                  {myResult.isWinner && (
                    <p className="text-gray-600 text-xs">
                      Price paid: ${Number(myResult.pricePaid).toFixed(2)} | Your value: ${Number(myResult.valuation).toFixed(2)} | Profit: ${Number(myResult.profit).toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              {/* All bids sorted */}
              {[...results]
                .filter(r => r.bid != null)
                .sort((a, b) => Number(b.bid) - Number(a.bid))
                .map((r, i) => (
                  <div
                    key={r.playerId}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                      r.playerId === playerId
                        ? 'bg-sky-50 border border-sky-200'
                        : r.isWinner
                        ? 'bg-green-50'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {r.isWinner && <Trophy className="w-5 h-5 text-yellow-500" />}
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName || `Bidder ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          Rank #{r.rank} | Bid: ${Number(r.bid).toFixed(2)}
                          {r.isWinner && ` | Paid: $${Number(r.pricePaid).toFixed(2)}`}
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

              {results.filter(r => r.bid == null).length > 0 && (
                <div className="text-xs text-gray-400 italic mt-2">
                  {results.filter(r => r.bid == null).length} player(s) did not submit a bid
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Gavel className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all bids are submitted</p>
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

export default DiscriminativeAuctionUI;
