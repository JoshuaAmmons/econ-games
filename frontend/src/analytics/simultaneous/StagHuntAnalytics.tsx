import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  ScatterChart, Scatter,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar, getPlayerColor } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const StagHuntAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const stagPayoff = gameConfig.stagStagPayoff ?? gameConfig.stagPayoff ?? 4;

  // Stag/Hare choice counts per round
  const choiceDistribution = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const choices = results.map(r => r.resultData?.choice ?? r.resultData?.action ?? '');
      const stagCount = choices.filter(c => c === 'stag').length;
      const hareCount = choices.filter(c => c === 'hare').length;
      return {
        round: `R${round.roundNumber}`,
        Stag: stagCount,
        Hare: hareCount,
      };
    });
  }, [completedRounds]);

  // Coordination success rate: % of rounds where ALL players chose stag
  const coordinationData = useMemo(() => {
    let cumulativeSuccess = 0;
    return completedRounds.map((round, idx) => {
      const results = round.results || [];
      const choices = results.map(r => r.resultData?.choice ?? r.resultData?.action ?? '');
      const allStag = results.length > 0 && choices.every(c => c === 'stag');
      if (allStag) cumulativeSuccess += 1;
      const rate = ((cumulativeSuccess / (idx + 1)) * 100);
      return {
        round: round.roundNumber,
        coordinationRate: parseFloat(rate.toFixed(1)),
        allStagThisRound: allStag ? 100 : 0,
      };
    });
  }, [completedRounds]);

  // Average payoff per round
  const avgPayoffData = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const profits = results.map(r => r.profit ?? 0);
      const avg = profits.length > 0 ? profits.reduce((s, p) => s + p, 0) / profits.length : 0;
      return {
        round: round.roundNumber,
        avgPayoff: parseFloat(avg.toFixed(2)),
      };
    });
  }, [completedRounds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Stag/Hare Choices */}
      {choiceDistribution.length > 0 && (
        <ChartCard title="Stag/Hare Choices" description="Stacked bars showing stag vs hare choices per round">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={choiceDistribution} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Stag" stackId="a" fill={CHART_COLORS[2]} />
              <Bar dataKey="Hare" stackId="a" fill={CHART_COLORS[1]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Coordination Success Rate */}
      {coordinationData.length > 0 && (
        <ChartCard title="Coordination Success Rate" description="Cumulative percentage of rounds where all players chose stag (payoff-dominant equilibrium)">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={coordinationData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis domain={[0, 100]} label={{ value: 'Success %', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Legend />
              <Line type="monotone" dataKey="coordinationRate" name="Cumulative Coordination %" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
              <Line type="stepAfter" dataKey="allStagThisRound" name="All Stag This Round" stroke={CHART_COLORS[2]} strokeWidth={1} dot={{ r: 3 }} strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Average Payoff */}
      {avgPayoffData.length > 0 && (
        <ChartCard title="Average Payoff" description="Average payoff per round compared to the mutual stag (optimal) payoff">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={avgPayoffData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <ReferenceLine y={stagPayoff} stroke="#10b981" strokeDasharray="5 5" label={{ value: `Stag Payoff: ${formatDollar(stagPayoff)}`, fill: '#10b981', fontSize: 10, position: 'right' }} />
              <Line type="monotone" dataKey="avgPayoff" name="Avg Payoff" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default StagHuntAnalytics;
