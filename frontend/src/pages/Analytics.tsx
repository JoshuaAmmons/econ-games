import React, { Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Spinner } from '../components/shared/Spinner';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import { getAnalyticsComponent } from '../analytics/AnalyticsRegistry';
import {
  CumulativeProfitChart,
  ProfitDistributionChart,
  PlayerRankingChart,
  RoundSummaryChart,
} from '../analytics/UniversalCharts';
import { ArrowLeft, BarChart3, Users, RefreshCw } from 'lucide-react';
import { AdminPasswordGate } from '../components/shared/AdminPasswordGate';

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
  discovery_process: 'Exchange & Specialization',
  prisoner_dilemma: "Prisoner's Dilemma",
  beauty_contest: 'Beauty Contest',
  common_pool_resource: 'Common Pool Resource',
  stag_hunt: 'Stag Hunt',
  dictator: 'Dictator Game',
  matching_pennies: 'Matching Pennies',
  trust_game: 'Trust Game',
  bargaining: 'Bargaining Game',
  auction: 'Sealed-Bid Auction',
};

const AnalyticsContent: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { data, loading, error, refresh, completedRounds } = useAnalyticsData(code);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <p className="text-gray-500">{error || 'Analytics not available'}</p>
          <Button onClick={() => navigate(`/session/${code}/monitor`)} className="mt-4">
            Back to Monitor
          </Button>
        </Card>
      </div>
    );
  }

  const GameAnalytics = getAnalyticsComponent(data.session.gameType);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Navigation */}
        <div className="flex gap-2 mb-4">
          <Button variant="secondary" onClick={() => navigate(`/session/${code}/monitor`)}>
            <ArrowLeft className="w-4 h-4 inline mr-2" />
            Back to Monitor
          </Button>
          <Button variant="secondary" onClick={() => navigate(`/session/${code}/results`)}>
            Results Table
          </Button>
        </div>

        {/* Header */}
        <Card className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-6 h-6 text-sky-600" />
                <h1 className="text-2xl font-bold">Analytics</h1>
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
            <Button variant="secondary" onClick={refresh}>
              <RefreshCw className="w-4 h-4 inline mr-1" />
              Refresh
            </Button>
          </div>
        </Card>

        {completedRounds.length === 0 ? (
          <Card>
            <div className="text-center py-12 text-gray-400">
              <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <h2 className="text-xl font-medium mb-2">No Data Yet</h2>
              <p>Analytics will appear after at least one round is completed.</p>
            </div>
          </Card>
        ) : (
          <>
            {/* Universal Charts */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Overall Performance</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CumulativeProfitChart data={data} completedRounds={completedRounds} />
                <RoundSummaryChart data={data} completedRounds={completedRounds} />
                <PlayerRankingChart data={data} completedRounds={completedRounds} />
                <ProfitDistributionChart data={data} completedRounds={completedRounds} />
              </div>
            </div>

            {/* Game-Specific Charts */}
            {GameAnalytics && (
              <div>
                <h2 className="text-lg font-semibold text-gray-700 mb-4">
                  {GAME_TYPE_LABELS[data.session.gameType] || data.session.gameType} Analysis
                </h2>
                <Suspense fallback={
                  <div className="flex items-center justify-center py-12">
                    <Spinner />
                  </div>
                }>
                  <GameAnalytics data={data} completedRounds={completedRounds} />
                </Suspense>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const Analytics: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  return (
    <AdminPasswordGate sessionCode={code || ''}>
      <AnalyticsContent />
    </AdminPasswordGate>
  );
};
