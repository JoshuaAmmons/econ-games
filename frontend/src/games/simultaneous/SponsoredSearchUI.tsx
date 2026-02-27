import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Search, Award, MousePointerClick } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoundResult {
  playerId: string;
  playerName: string;
  profit: number;
  bid: number;
  valuation: number;
  position?: number;
  clickRate?: number;
  paymentPerClick?: number;
  totalPayment?: number;
  numPositions: number;
  numAdvertisers: number;
  isWinner: boolean;
}

/**
 * Sponsored Search Auction UI (Week 32)
 * GSP position auction: bid for ad positions with declining click rates.
 * Highest bidder gets best position. Each position pays the next-lower bid.
 */
const SponsoredSearchUI: React.FC<GameUIProps> = ({
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
  const numPositions = gameConfig.numPositions ?? 3;
  const clickRates = gameConfig.clickRates || [];
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
        if (myResult.isWinner && myResult.position != null) {
          toast.success(`Position #${myResult.position + 1}! Profit: $${Number(myResult.profit).toFixed(2)}`);
        } else {
          toast(`No ad position this round. Profit: $0`, { icon: '😞' });
        }
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer]);

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
    toast.success(`Bid of $${bidVal.toFixed(2)}/click submitted!`);
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
            <Search className="w-8 h-8 mx-auto text-teal-600 mb-1" />
            <div className="text-sm text-gray-500">Sponsored Search Auction</div>
            <div className="text-xs text-gray-400 mt-1">Generalized Second Price (GSP)</div>
          </div>

          {/* Position Table */}
          <div className="text-sm mb-3">
            <div className="text-xs text-gray-500 font-medium mb-1">Available Positions</div>
            <div className="space-y-1">
              {Array.from({ length: numPositions }, (_, i) => (
                <div key={i} className="flex justify-between px-2 py-1 bg-gray-50 rounded text-xs">
                  <span>Position #{i + 1}</span>
                  <span className="font-medium">
                    {clickRates[i] != null ? `${clickRates[i]} clicks` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs p-2 bg-teal-50 text-teal-700 rounded text-center">
            GSP: each position pays the bid of the next-lower position
          </div>

          <div className="mt-3 bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-sm text-gray-500">Your Value Per Click</div>
            <div className="text-3xl font-bold text-amber-700">${privateValue.toFixed(2)}</div>
            <p className="text-xs text-gray-400 mt-1">Your revenue per ad click</p>
          </div>
        </Card>

        {/* Submit Form */}
        <Card title="Place Your Bid">
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
                  label="Bid Per Click ($)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={bid}
                  onChange={(e) => setBid(e.target.value)}
                  placeholder="Your bid per click"
                  required
                />
                {bid && !isNaN(bidNum) && bidNum >= 0 && (
                  <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Your bid:</span>
                      <span className="font-medium">${bidNum.toFixed(2)}/click</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Your value:</span>
                      <span className="font-medium">${privateValue.toFixed(2)}/click</span>
                    </div>
                    {bidNum > privateValue && (
                      <div className="text-red-600 font-medium mt-1">
                        Warning: Bidding above your value risks a loss!
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
        <Card title="Auction Results">
          {results ? (
            <div className="space-y-4">
              {/* My Result Banner */}
              {myResult && (
                <div className={`p-3 rounded-lg text-sm ${myResult.isWinner ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {myResult.isWinner && <Award className="w-4 h-4 text-yellow-500" />}
                    <span className="font-medium text-gray-700">
                      {myResult.isWinner
                        ? `You won Position #${(myResult.position ?? 0) + 1}!`
                        : 'You did not win a position this round.'}
                    </span>
                  </div>
                  {myResult.isWinner && (
                    <div className="text-xs text-gray-600 space-y-0.5">
                      <div>Clicks: {myResult.clickRate} | Payment: ${Number(myResult.paymentPerClick).toFixed(2)}/click</div>
                      <div>Total payment: ${Number(myResult.totalPayment).toFixed(2)} | Profit: ${Number(myResult.profit).toFixed(2)}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Position Allocation Table */}
              <div>
                <h4 className="text-sm font-semibold text-teal-700 mb-2">Position Allocation</h4>
                {[...results]
                  .filter(r => r.isWinner && r.position != null)
                  .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
                  .map((r) => (
                    <div
                      key={r.playerId}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg mb-1 ${
                        r.playerId === playerId ? 'bg-sky-50 border border-sky-200' : 'bg-green-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 font-bold flex items-center justify-center text-sm">
                          #{(r.position ?? 0) + 1}
                        </div>
                        <div>
                          <span className="font-medium">
                            {r.playerId === playerId ? 'You' : r.playerName || 'Advertiser'}
                          </span>
                          <div className="text-xs text-gray-500">
                            <MousePointerClick className="w-3 h-3 inline mr-1" />
                            {r.clickRate} clicks × ${Number(r.paymentPerClick).toFixed(2)}/click
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

              {/* Non-winners */}
              {results.filter(r => !r.isWinner).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-500 mb-2">No Position</h4>
                  {[...results]
                    .filter(r => !r.isWinner)
                    .sort((a, b) => Number(b.bid) - Number(a.bid))
                    .map((r, i) => (
                      <div
                        key={r.playerId}
                        className={`flex items-center justify-between px-4 py-2 rounded-lg mb-1 ${
                          r.playerId === playerId ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'
                        }`}
                      >
                        <div>
                          <span className="font-medium text-sm">
                            {r.playerId === playerId ? 'You' : r.playerName || `Advertiser ${i + 1}`}
                          </span>
                          <div className="text-xs text-gray-500">Bid: ${Number(r.bid).toFixed(2)}/click</div>
                        </div>
                        <div className="text-sm text-gray-500">$0.00</div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all advertisers submit bids</p>
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

export default SponsoredSearchUI;
