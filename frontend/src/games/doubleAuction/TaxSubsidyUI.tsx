import React, { useState } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { DAGameUIProps } from '../GameUIRegistry';
import { ArrowUpCircle, ArrowDownCircle, TrendingUp, DollarSign, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * DA + Tax/Subsidy UI (Week 2)
 * Same as standard DA but shows tax information and adjusted profits.
 */
const TaxSubsidyUI: React.FC<DAGameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  bids,
  asks,
  trades,
  submitBid,
  submitAsk,
}) => {
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isBuyer = player?.role === 'buyer';
  const privateValue = isBuyer ? player?.valuation : player?.production_cost;

  // Get tax config from session
  const gameConfig = session?.game_config || {};
  const taxType = gameConfig.taxType || 'buyer';
  const taxAmount = gameConfig.taxAmount || 0;
  const isSubsidy = taxAmount < 0;
  const taxLabel = isSubsidy ? 'Subsidy' : 'Tax';
  const absAmount = Math.abs(taxAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !price) return;

    setError('');
    setSubmitting(true);

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Please enter a valid price');
      setSubmitting(false);
      return;
    }

    if (isBuyer) {
      submitBid(roundId, priceNum);
      toast.success(`Bid of $${priceNum.toFixed(2)} submitted!`);
    } else {
      submitAsk(roundId, priceNum);
      toast.success(`Ask of $${priceNum.toFixed(2)} submitted!`);
    }

    setPrice('');
    setTimeout(() => setSubmitting(false), 500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Player Info & Submit */}
      <div className="space-y-4">
        {/* Tax/Subsidy Banner */}
        <Card>
          <div className={`text-center p-2 rounded-lg ${isSubsidy ? 'bg-green-50' : 'bg-amber-50'}`}>
            <div className="flex items-center justify-center gap-2 mb-1">
              <AlertTriangle className={`w-4 h-4 ${isSubsidy ? 'text-green-600' : 'text-amber-600'}`} />
              <span className={`text-sm font-semibold ${isSubsidy ? 'text-green-700' : 'text-amber-700'}`}>
                ${absAmount.toFixed(2)} {taxLabel} on {taxType === 'buyer' ? 'Buyers' : 'Sellers'}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {taxType === 'buyer'
                ? isSubsidy
                  ? `Buyers receive $${absAmount.toFixed(2)} subsidy per trade`
                  : `Buyers pay $${absAmount.toFixed(2)} tax per trade`
                : isSubsidy
                  ? `Sellers receive $${absAmount.toFixed(2)} subsidy per trade`
                  : `Sellers pay $${absAmount.toFixed(2)} tax per trade`
              }
            </p>
          </div>
        </Card>

        {/* Private Value */}
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-1">
              Your {isBuyer ? 'Valuation' : 'Production Cost'}
            </p>
            <p className="text-3xl font-bold text-sky-700">${privateValue != null ? Number(privateValue).toFixed(2) : '—'}</p>
            <p className="text-xs text-gray-400 mt-1">
              {isBuyer
                ? `Max you should pay${taxType === 'buyer' ? ` (before $${absAmount} ${taxLabel.toLowerCase()})` : ''}`
                : `Min you should accept${taxType === 'seller' ? ` (before $${absAmount} ${taxLabel.toLowerCase()})` : ''}`}
            </p>
          </div>
        </Card>

        {/* Submit Form */}
        <Card title={isBuyer ? 'Submit Bid' : 'Submit Ask'}>
          {roundActive && roundId ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                label={`${isBuyer ? 'Bid' : 'Ask'} Price`}
                type="number"
                step="0.01"
                min="0.01"
                max={isBuyer ? privateValue : undefined}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Enter price..."
                required
              />
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={submitting || !price}>
                {submitting ? 'Submitting...' : `Submit ${isBuyer ? 'Bid' : 'Ask'}`}
              </Button>
            </form>
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

      {/* Center: Order Book */}
      <div className="space-y-4">
        <Card title="Order Book">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-red-600 mb-2 flex items-center gap-1">
                <ArrowUpCircle className="w-4 h-4" /> Asks (Sellers)
              </h4>
              {asks.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">No active asks</p>
              ) : (
                <div className="space-y-1">
                  {[...asks].sort((a, b) => b.price - a.price).map((ask) => (
                    <div key={ask.id} className="flex justify-between items-center bg-red-50 px-3 py-1 rounded text-sm">
                      <span className="text-red-700 font-mono">${Number(ask.price).toFixed(2)}</span>
                      <span className="text-xs text-gray-400">{new Date(ask.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-dashed"></div>
            <div>
              <h4 className="text-sm font-medium text-green-600 mb-2 flex items-center gap-1">
                <ArrowDownCircle className="w-4 h-4" /> Bids (Buyers)
              </h4>
              {bids.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">No active bids</p>
              ) : (
                <div className="space-y-1">
                  {[...bids].sort((a, b) => b.price - a.price).map((bid) => (
                    <div key={bid.id} className="flex justify-between items-center bg-green-50 px-3 py-1 rounded text-sm">
                      <span className="text-green-700 font-mono">${Number(bid.price).toFixed(2)}</span>
                      <span className="text-xs text-gray-400">{new Date(bid.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Right: Trades */}
      <div>
        <Card title="Recent Trades">
          <div className="flex items-center gap-1 mb-3 text-sm text-gray-500">
            <TrendingUp className="w-4 h-4" />
            <span>{trades.length} trade{trades.length !== 1 ? 's' : ''}</span>
          </div>
          {trades.length === 0 ? (
            <p className="text-center text-gray-400 py-4 text-sm">No trades yet this round</p>
          ) : (
            <div className="space-y-2">
              {trades.map((trade) => (
                <div key={trade.id} className={`rounded px-3 py-2 ${
                  trade.buyer_id === playerId || trade.seller_id === playerId ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className="font-mono font-medium">${Number(trade.price).toFixed(2)}</span>
                    <span className="text-xs text-gray-400">{new Date(trade.created_at).toLocaleTimeString()}</span>
                  </div>
                  {(trade.buyer_id === playerId || trade.seller_id === playerId) && (
                    <div className="text-xs text-sky-600 mt-1 font-medium">
                      Your trade — Profit: ${
                        trade.buyer_id === playerId ? Number(trade.buyer_profit).toFixed(2) : Number(trade.seller_profit).toFixed(2)
                      }
                      <span className="text-gray-400 ml-1">(after {taxLabel.toLowerCase()})</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default TaxSubsidyUI;
