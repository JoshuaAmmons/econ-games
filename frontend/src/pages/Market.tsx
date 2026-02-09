import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Input } from '../components/shared/Input';
import { Timer } from '../components/shared/Timer';
import { Spinner } from '../components/shared/Spinner';
import { useSocket } from '../hooks/useSocket';
import { playersApi } from '../api/players';
import { gameApi } from '../api/game';
import type { Player, Bid, Ask, Trade } from '../types';
import { ArrowUpCircle, ArrowDownCircle, TrendingUp, DollarSign } from 'lucide-react';

export const Market: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState('');
  const [bids, setBids] = useState<Bid[]>([]);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const playerId = localStorage.getItem('playerId') || '';
  const { connected, submitBid, submitAsk, onEvent } = useSocket(code || '', playerId);

  // Load player data
  useEffect(() => {
    if (!playerId) {
      navigate('/join');
      return;
    }
    loadPlayer();
  }, []);

  const loadPlayer = async () => {
    try {
      const { player: p, session } = await playersApi.getStatus(playerId);
      setPlayer(p);

      if (session.status !== 'active') {
        navigate(`/session/${code}/lobby`);
        return;
      }

      // Load current round data
      // The round ID will come from WebSocket events
    } catch (err) {
      console.error('Failed to load player:', err);
      navigate('/join');
    } finally {
      setLoading(false);
    }
  };

  // Socket event handlers
  useEffect(() => {
    if (!connected) return;

    const cleanups: (() => void)[] = [];

    cleanups.push(onEvent('bid-submitted', (data: { bid: Bid }) => {
      setBids(prev => [data.bid, ...prev]);
    }));

    cleanups.push(onEvent('ask-submitted', (data: { ask: Ask }) => {
      setAsks(prev => [data.ask, ...prev]);
    }));

    cleanups.push(onEvent('trade-executed', (data: { trade: Trade }) => {
      setTrades(prev => [data.trade, ...prev]);
      // Remove matched bids and asks
      setBids(prev => prev.filter(b => b.is_active));
      setAsks(prev => prev.filter(a => a.is_active));
    }));

    cleanups.push(onEvent('round-started', (data: { round: { id: string }; roundNumber: number }) => {
      setRoundId(data.round.id);
      setBids([]);
      setAsks([]);
      setTrades([]);
      setError('');
    }));

    cleanups.push(onEvent('round-ended', () => {
      setRoundId(null);
      setTimeRemaining(0);
    }));

    cleanups.push(onEvent('timer-update', (data: { seconds_remaining: number }) => {
      setTimeRemaining(data.seconds_remaining);
    }));

    cleanups.push(onEvent('error', (data: { message: string }) => {
      setError(data.message);
      setSubmitting(false);
    }));

    return () => {
      cleanups.forEach(fn => fn());
    };
  }, [connected, onEvent]);

  // Load order book when round starts
  useEffect(() => {
    if (roundId) {
      loadOrderBook(roundId);
    }
  }, [roundId]);

  const loadOrderBook = async (rId: string) => {
    try {
      const orderBook = await gameApi.getOrderBook(rId);
      setBids(orderBook.bids);
      setAsks(orderBook.asks);
      const roundTrades = await gameApi.getTrades(rId);
      setTrades(roundTrades);
    } catch (err) {
      console.error('Failed to load order book:', err);
    }
  };

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

    if (player?.role === 'buyer') {
      submitBid(roundId, priceNum);
    } else {
      submitAsk(roundId, priceNum);
    }

    setPrice('');
    setTimeout(() => setSubmitting(false), 500);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const isBuyer = player?.role === 'buyer';
  const privateValue = isBuyer ? player?.valuation : player?.production_cost;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">Session {code}</h1>
            <span className={`px-2 py-1 rounded text-sm font-medium ${
              connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {timeRemaining > 0 && <Timer seconds={timeRemaining} />}
            <div className="text-sm text-gray-600">
              <span className="font-medium capitalize">{player?.role}</span>
              {player?.name && <span> ({player.name})</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Player Info & Submit */}
          <div className="space-y-4">
            {/* Private Value */}
            <Card>
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-1">
                  Your {isBuyer ? 'Valuation' : 'Production Cost'}
                </p>
                <p className="text-3xl font-bold text-sky-700">${privateValue}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {isBuyer
                    ? 'Max you should pay'
                    : 'Min you should accept'}
                </p>
              </div>
            </Card>

            {/* Submit Form */}
            <Card title={isBuyer ? 'Submit Bid' : 'Submit Ask'}>
              {roundId ? (
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
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={submitting || !price}
                    variant={isBuyer ? 'primary' : 'primary'}
                  >
                    {submitting ? 'Submitting...' : `Submit ${isBuyer ? 'Bid' : 'Ask'}`}
                  </Button>
                </form>
              ) : (
                <p className="text-center text-gray-500 py-4">
                  Waiting for round to start...
                </p>
              )}
            </Card>

            {/* Profit */}
            <Card>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  <span className="font-medium">Total Profit</span>
                </div>
                <span className="text-2xl font-bold text-green-600">
                  ${player?.total_profit?.toFixed(2) || '0.00'}
                </span>
              </div>
            </Card>
          </div>

          {/* Center: Order Book */}
          <div className="space-y-4">
            <Card title="Order Book">
              <div className="space-y-4">
                {/* Asks (sells) - sorted high to low */}
                <div>
                  <h4 className="text-sm font-medium text-red-600 mb-2 flex items-center gap-1">
                    <ArrowUpCircle className="w-4 h-4" />
                    Asks (Sellers)
                  </h4>
                  {asks.filter(a => a.is_active).length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">No active asks</p>
                  ) : (
                    <div className="space-y-1">
                      {asks
                        .filter(a => a.is_active)
                        .sort((a, b) => b.price - a.price)
                        .map((ask) => (
                          <div key={ask.id} className="flex justify-between items-center bg-red-50 px-3 py-1 rounded text-sm">
                            <span className="text-red-700 font-mono">${ask.price.toFixed(2)}</span>
                            <span className="text-xs text-gray-400">
                              {new Date(ask.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-dashed"></div>

                {/* Bids (buys) - sorted high to low */}
                <div>
                  <h4 className="text-sm font-medium text-green-600 mb-2 flex items-center gap-1">
                    <ArrowDownCircle className="w-4 h-4" />
                    Bids (Buyers)
                  </h4>
                  {bids.filter(b => b.is_active).length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">No active bids</p>
                  ) : (
                    <div className="space-y-1">
                      {bids
                        .filter(b => b.is_active)
                        .sort((a, b) => b.price - a.price)
                        .map((bid) => (
                          <div key={bid.id} className="flex justify-between items-center bg-green-50 px-3 py-1 rounded text-sm">
                            <span className="text-green-700 font-mono">${bid.price.toFixed(2)}</span>
                            <span className="text-xs text-gray-400">
                              {new Date(bid.created_at).toLocaleTimeString()}
                            </span>
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
                <p className="text-center text-gray-400 py-4 text-sm">
                  No trades yet this round
                </p>
              ) : (
                <div className="space-y-2">
                  {trades.map((trade) => (
                    <div key={trade.id} className="bg-gray-50 rounded px-3 py-2">
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-medium">${trade.price.toFixed(2)}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(trade.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Buyer profit: ${trade.buyer_profit.toFixed(2)} |
                        Seller profit: ${trade.seller_profit.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
