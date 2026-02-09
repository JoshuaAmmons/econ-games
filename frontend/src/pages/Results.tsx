import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Spinner } from '../components/shared/Spinner';
import { sessionsApi } from '../api/sessions';
import {
  ArrowLeft,
  Download,
  Trophy,
  Users,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

const DA_GAME_TYPES = ['double_auction', 'double_auction_tax', 'double_auction_price_controls'];

const GAME_TYPE_LABELS: Record<string, string> = {
  double_auction: 'Double Auction',
  double_auction_tax: 'DA + Tax/Subsidy',
  double_auction_price_controls: 'DA + Price Controls',
  bertrand: 'Bertrand Competition',
  cournot: 'Cournot Competition',
  public_goods: 'Public Goods',
  negative_externality: 'Negative Externality',
  ultimatum: 'Ultimatum Game',
  gift_exchange: 'Gift Exchange',
  principal_agent: 'Principal-Agent',
  comparative_advantage: 'Comparative Advantage',
  monopoly: 'Monopoly',
  market_for_lemons: 'Market for Lemons',
};

interface ResultsData {
  session: {
    id: string;
    code: string;
    gameType: string;
    gameConfig: Record<string, any>;
    numRounds: number;
    status: string;
    marketSize: number;
  };
  players: Array<{
    id: string;
    name: string;
    role: string;
    valuation?: number;
    productionCost?: number;
    totalProfit: number;
    isBot: boolean;
  }>;
  rounds: Array<{
    roundNumber: number;
    roundId: string;
    status: string;
    startedAt: string;
    endedAt: string;
    trades?: Array<{
      price: number;
      buyerId: string;
      sellerId: string;
      buyerProfit: number;
      sellerProfit: number;
      time: string;
    }>;
    actions?: Array<{
      playerId: string;
      actionType: string;
      actionData: Record<string, any>;
      time: string;
    }>;
    results?: Array<{
      playerId: string;
      profit: number;
      resultData: Record<string, any>;
    }>;
  }>;
  stats: {
    totalPlayers: number;
    completedRounds: number;
    avgProfit: number;
    maxProfit: number;
    minProfit: number;
  };
}

export const Results: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRound, setExpandedRound] = useState<number | null>(null);

  useEffect(() => {
    loadResults();
  }, [code]);

  const loadResults = async () => {
    try {
      if (!code) return;
      const session = await sessionsApi.getByCode(code);
      const results = await sessionsApi.getResults(session.id);
      setData(results);
    } catch (error) {
      console.error('Failed to load results:', error);
      toast.error('Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = (type: string) => {
    if (!data) return;
    const url = sessionsApi.getExportUrl(data.session.id, type);
    window.open(url, '_blank');
    toast.success(`Downloading ${type} CSV...`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <p className="text-gray-500">Results not available</p>
          <Button onClick={() => navigate('/admin')} className="mt-4">
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const isDA = DA_GAME_TYPES.includes(data.session.gameType);
  const sortedPlayers = [...data.players].sort((a, b) => b.totalProfit - a.totalProfit);
  const playerMap = new Map(data.players.map((p) => [p.id, p]));

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <Button variant="secondary" onClick={() => navigate(`/session/${code}/monitor`)} className="mb-4">
          <ArrowLeft className="w-4 h-4 inline mr-2" />
          Back to Monitor
        </Button>

        {/* Header */}
        <Card className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-6 h-6 text-sky-600" />
                <h1 className="text-2xl font-bold">Session Results</h1>
                <span className="font-mono text-lg text-gray-500">{data.session.code}</span>
              </div>
              <div className="flex gap-4 text-sm text-gray-600">
                <span className="px-2 py-1 bg-sky-100 text-sky-700 rounded font-medium">
                  {GAME_TYPE_LABELS[data.session.gameType] || data.session.gameType}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {data.stats.totalPlayers} players
                </span>
                <span>{data.stats.completedRounds} / {data.session.numRounds} rounds completed</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => handleExport('players')}>
                <Download className="w-4 h-4 inline mr-1" />
                Players CSV
              </Button>
              <Button variant="secondary" onClick={() => handleExport('rounds')}>
                <Download className="w-4 h-4 inline mr-1" />
                Rounds CSV
              </Button>
              {isDA && (
                <Button variant="secondary" onClick={() => handleExport('trades')}>
                  <Download className="w-4 h-4 inline mr-1" />
                  Trades CSV
                </Button>
              )}
              {!isDA && (
                <Button variant="secondary" onClick={() => handleExport('actions')}>
                  <Download className="w-4 h-4 inline mr-1" />
                  Actions CSV
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Aggregate Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <div className="text-center">
              <Users className="w-6 h-6 mx-auto text-sky-600 mb-1" />
              <div className="text-2xl font-bold">{data.stats.totalPlayers}</div>
              <div className="text-xs text-gray-500">Total Players</div>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <TrendingUp className="w-6 h-6 mx-auto text-green-600 mb-1" />
              <div className="text-2xl font-bold text-green-600">${data.stats.avgProfit.toFixed(2)}</div>
              <div className="text-xs text-gray-500">Average Profit</div>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <Trophy className="w-6 h-6 mx-auto text-yellow-500 mb-1" />
              <div className="text-2xl font-bold text-green-600">${data.stats.maxProfit.toFixed(2)}</div>
              <div className="text-xs text-gray-500">Highest Profit</div>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <TrendingDown className="w-6 h-6 mx-auto text-red-500 mb-1" />
              <div className={`text-2xl font-bold ${data.stats.minProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${data.stats.minProfit.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500">Lowest Profit</div>
            </div>
          </Card>
        </div>

        {/* Player Leaderboard */}
        <Card title="Player Leaderboard" className="mb-6">
          <div className="space-y-2">
            {sortedPlayers.map((player, i) => (
              <div
                key={player.id}
                className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                  i === 0 ? 'bg-yellow-50 border border-yellow-200' :
                  i === 1 ? 'bg-gray-100 border border-gray-200' :
                  i === 2 ? 'bg-orange-50 border border-orange-200' :
                  'bg-white border border-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                    i === 0 ? 'bg-yellow-400 text-white' :
                    i === 1 ? 'bg-gray-400 text-white' :
                    i === 2 ? 'bg-orange-400 text-white' :
                    'bg-gray-200 text-gray-600'
                  }`}>
                    {i + 1}
                  </span>
                  <div>
                    <span className="font-medium">{player.name || 'Anonymous'}</span>
                    {player.isBot && <span className="ml-1 text-xs text-gray-400">(Bot)</span>}
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                      {player.role}
                    </span>
                    {player.valuation != null && (
                      <span className="ml-1 text-xs text-gray-400">Val: ${player.valuation}</span>
                    )}
                    {player.productionCost != null && (
                      <span className="ml-1 text-xs text-gray-400">Cost: ${player.productionCost}</span>
                    )}
                  </div>
                </div>
                <span className={`text-lg font-bold font-mono ${
                  player.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  ${player.totalProfit.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Round-by-Round Details */}
        <Card title="Round Details">
          <div className="space-y-2">
            {data.rounds.filter(r => r.status === 'completed').map((round) => (
              <div key={round.roundId} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  onClick={() => setExpandedRound(expandedRound === round.roundNumber ? null : round.roundNumber)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">Round {round.roundNumber}</span>
                    {isDA && round.trades && (
                      <span className="text-sm text-gray-500">{round.trades.length} trades</span>
                    )}
                    {!isDA && round.results && (
                      <span className="text-sm text-gray-500">{round.results.length} results</span>
                    )}
                  </div>
                  {expandedRound === round.roundNumber ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {expandedRound === round.roundNumber && (
                  <div className="p-4">
                    {isDA && round.trades && (
                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-2">Trades</div>
                        {round.trades.length === 0 ? (
                          <p className="text-sm text-gray-400">No trades this round</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-gray-500">
                                  <th className="text-left py-2 px-2">#</th>
                                  <th className="text-left py-2 px-2">Buyer</th>
                                  <th className="text-left py-2 px-2">Seller</th>
                                  <th className="text-right py-2 px-2">Price</th>
                                  <th className="text-right py-2 px-2">Buyer Profit</th>
                                  <th className="text-right py-2 px-2">Seller Profit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {round.trades.map((trade, j) => {
                                  const buyer = playerMap.get(trade.buyerId);
                                  const seller = playerMap.get(trade.sellerId);
                                  return (
                                    <tr key={j} className="border-b border-gray-100">
                                      <td className="py-2 px-2 text-gray-400">{j + 1}</td>
                                      <td className="py-2 px-2">{buyer?.name || 'Unknown'}</td>
                                      <td className="py-2 px-2">{seller?.name || 'Unknown'}</td>
                                      <td className="py-2 px-2 text-right font-mono">${trade.price.toFixed(2)}</td>
                                      <td className={`py-2 px-2 text-right font-mono ${trade.buyerProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        ${trade.buyerProfit.toFixed(2)}
                                      </td>
                                      <td className={`py-2 px-2 text-right font-mono ${trade.sellerProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        ${trade.sellerProfit.toFixed(2)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {!isDA && round.results && (
                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-2">Player Results</div>
                        {round.results.length === 0 ? (
                          <p className="text-sm text-gray-400">No results this round</p>
                        ) : (
                          <div className="space-y-2">
                            {[...round.results]
                              .sort((a, b) => b.profit - a.profit)
                              .map((result, j) => {
                                const player = playerMap.get(result.playerId);
                                return (
                                  <div
                                    key={j}
                                    className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded"
                                  >
                                    <div>
                                      <span className="font-medium">{player?.name || 'Unknown'}</span>
                                      <span className="ml-2 text-xs text-gray-400">{player?.role}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <div className="text-xs text-gray-400">
                                        {Object.entries(result.resultData)
                                          .filter(([k]) => !['playerId', 'playerName'].includes(k))
                                          .slice(0, 4)
                                          .map(([k, v]) => `${k}: ${typeof v === 'number' ? (v as number).toFixed(2) : v}`)
                                          .join(' | ')}
                                      </div>
                                      <span className={`font-mono font-bold ${result.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        ${result.profit.toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {data.rounds.filter(r => r.status === 'completed').length === 0 && (
              <p className="text-center text-gray-400 py-8">No completed rounds yet</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
