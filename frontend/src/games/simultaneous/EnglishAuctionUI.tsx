import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { Gavel, DollarSign, Trophy, Users } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  maxBid: number;
  isWinner: boolean;
  pricePaid: number;
  valuation: number;
  winnerMaxBid: number;
  secondHighestBid: number;
  winnerName: string;
  numBidders: number;
}

/**
 * English Auction UI
 * Players submit their maximum willingness to pay (proxy bid).
 * Winner pays the second-highest bid. Truthful bidding is dominant strategy.
 */
const EnglishAuctionUI: React.FC<GameUIProps> = ({
  session: _session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [maxBid, setMaxBid] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });
  const [results, setResults] = useState<RoundResult[] | null>(null);

  const privateValue = Number(player?.valuation ?? 0);
  const bidNum = parseFloat(maxBid) || 0;
  const isBiddingAboveValue = maxBid !== '' && bidNum > privateValue;

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setMaxBid('');
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
          toast.success(`You won! Paid $${Number(myResult.pricePaid).toFixed(2)}. Profit: $${Number(myResult.profit).toFixed(2)}`);
        } else {
          toast(`You did not win. Profit: $0`, { icon: '😞' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !maxBid || submitted) return;
    const val = parseFloat(maxBid);
    if (isNaN(val) || val < 0) {
      toast.error('Please enter a valid maximum bid');
      return;
    }
    setSubmitting(true);
    submitAction({ type: 'decision', maxBid: val });
    setSubmitted(true);
    toast.success(`Maximum bid of $${val.toFixed(2)} submitted!`);
    setTimeout(() => setSubmitting(false), 500);
  };

  const myResult = results?.find(r => r.playerId === playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-4">
        <Card>
          <div className="text-center mb-3">
            <Gavel className="w-8 h-8 mx-auto text-emerald-600 mb-1" />
            <div className="text-sm text-gray-500">English Auction</div>
            <div className="text-lg font-bold text-emerald-700">Ascending / Proxy Bid</div>
          </div>
          <div className="text-xs p-2 rounded text-center bg-emerald-50 text-emerald-700">
            Second-price rule: winner pays the second-highest bid
          </div>
          <div className="mt-3 bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-sm text-gray-500">Your Private Value</div>
            <div className="text-3xl font-bold text-amber-700">${privateValue.toFixed(2)}</div>
            <p className="text-xs text-gray-400 mt-1">Only you know this value</p>
          </div>
          <div className="mt-2 bg-emerald-50 rounded p-2 text-xs text-emerald-800 text-center italic">
            Tip: In a second-price auction, bidding your true value is the dominant strategy!
          </div>
        </Card>

        <Card title="Set Your Maximum Bid">
          {roundActive && roundId ? (
            submitted ? (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">Maximum Bid Submitted!</div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{waitingCount.submitted}/{waitingCount.total} submitted</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label="Maximum Bid ($)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={maxBid}
                  onChange={(e) => setMaxBid(e.target.value)}
                  placeholder="Maximum you'd pay"
                  required
                />
                {isBiddingAboveValue && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                    <span className="font-medium">Warning:</span> Bidding above your value risks a loss!
                  </div>
                )}
                {maxBid && !isNaN(bidNum) && bidNum >= 0 && (
                  <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Your max bid:</span>
                      <span className="font-medium">${bidNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Your value:</span>
                      <span className="font-medium">${privateValue.toFixed(2)}</span>
                    </div>
                    <div className="text-gray-400 italic">
                      You pay the 2nd highest bid, not your own
                    </div>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting || !maxBid}>
                  {submitting ? 'Submitting...' : 'Submit Maximum Bid'}
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
              {myResult && (
                <div className={`p-3 rounded-lg text-sm ${myResult.isWinner ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {myResult.isWinner && <Trophy className="w-4 h-4 text-yellow-500" />}
                    <span className="font-medium text-gray-700">
                      {myResult.isWinner ? 'You won the auction!' : 'You did not win this round.'}
                    </span>
                  </div>
                  {myResult.isWinner && (
                    <p className="text-gray-600 text-xs">
                      Price paid (2nd highest): ${Number(myResult.pricePaid).toFixed(2)} | Your value: ${Number(myResult.valuation).toFixed(2)} | Profit: ${Number(myResult.profit).toFixed(2)}
                    </p>
                  )}
                  {myResult.isWinner && (
                    <p className="text-xs text-emerald-600 mt-1 italic">
                      You saved ${(Number(myResult.maxBid) - Number(myResult.pricePaid)).toFixed(2)} compared to paying your own bid
                    </p>
                  )}
                </div>
              )}

              {[...results]
                .filter(r => r.maxBid != null)
                .sort((a, b) => Number(b.maxBid) - Number(a.maxBid))
                .map((r, i) => (
                  <div
                    key={r.playerId}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                      r.playerId === playerId ? 'bg-sky-50 border border-sky-200' : r.isWinner ? 'bg-green-50' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {r.isWinner && <Trophy className="w-5 h-5 text-yellow-500" />}
                      <div>
                        <span className="font-medium">
                          {r.playerId === playerId ? 'You' : r.playerName || `Bidder ${i + 1}`}
                        </span>
                        <div className="text-xs text-gray-500">
                          Max Bid: ${Number(r.maxBid).toFixed(2)}
                          {r.isWinner && ` | Paid (2nd price): $${Number(r.pricePaid).toFixed(2)}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${Number(r.profit) > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                        ${Number(r.profit).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-400">profit</div>
                    </div>
                  </div>
                ))}
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

export default EnglishAuctionUI;
