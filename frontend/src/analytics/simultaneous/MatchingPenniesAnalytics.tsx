import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const MatchingPenniesAnalytics: React.FC<AnalyticsProps> = ({ completedRounds }) => {
  // Heads frequency per round, split by matchers and mismatchers
  const headsFrequency = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const matchers = results.filter(r => r.resultData?.role === 'matcher');
      const mismatchers = results.filter(r => r.resultData?.role === 'mismatcher');

      const headsPct = (group: typeof results) => {
        if (group.length === 0) return 50;
        const heads = group.filter(r => r.resultData?.choice === 'heads').length;
        return parseFloat(((heads / group.length) * 100).toFixed(1));
      };

      return {
        round: round.roundNumber,
        matcherHeadsPct: headsPct(matchers),
        mismatcherHeadsPct: headsPct(mismatchers),
      };
    });
  }, [completedRounds]);

  // Payoff over rounds for matchers vs mismatchers
  const payoffOverRounds = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const matchers = results.filter(r => r.resultData?.role === 'matcher');
      const mismatchers = results.filter(r => r.resultData?.role === 'mismatcher');

      const avgPayoff = (group: typeof results) => {
        if (group.length === 0) return 0;
        const payoffs = group.map(r => r.profit ?? r.resultData?.avgPayoff ?? 0);
        return parseFloat((payoffs.reduce((s, v) => s + v, 0) / payoffs.length).toFixed(2));
      };

      return {
        round: round.roundNumber,
        matcherPayoff: avgPayoff(matchers),
        mismatcherPayoff: avgPayoff(mismatchers),
      };
    });
  }, [completedRounds]);

  // Choice distribution: heads/tails counts per round
  const choiceDistribution = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const heads = results.filter(r => r.resultData?.choice === 'heads').length;
      const tails = results.filter(r => r.resultData?.choice === 'tails').length;
      return {
        round: `R${round.roundNumber}`,
        roundNum: round.roundNumber,
        heads,
        tails,
      };
    });
  }, [completedRounds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Heads Frequency */}
      {headsFrequency.length > 0 && (
        <ChartCard title="Heads Frequency Over Rounds" description="% choosing heads by role. Nash equilibrium predicts 50% for both.">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={headsFrequency} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis
                domain={[0, 100]}
                label={{ value: 'Heads %', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Legend />
              <ReferenceLine y={50} stroke="#8b5cf6" strokeDasharray="5 5" label={{ value: 'Nash (50%)', fill: '#8b5cf6', fontSize: 10, position: 'right' }} />
              <Line
                type="monotone"
                dataKey="matcherHeadsPct"
                name="Matchers Heads %"
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="mismatcherHeadsPct"
                name="Mismatchers Heads %"
                stroke={CHART_COLORS[1]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Payoff Over Rounds */}
      {payoffOverRounds.length > 0 && (
        <ChartCard title="Average Payoff Over Rounds" description="Matchers vs mismatchers average payoff per round">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={payoffOverRounds} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <ReferenceLine y={0} stroke="#999" />
              <Line
                type="monotone"
                dataKey="matcherPayoff"
                name="Matcher Avg Payoff"
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="mismatcherPayoff"
                name="Mismatcher Avg Payoff"
                stroke={CHART_COLORS[1]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Choice Distribution */}
      {choiceDistribution.length > 0 && (
        <ChartCard title="Choice Distribution by Round" description="Heads vs tails counts per round across all players">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={choiceDistribution} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis allowDecimals={false} label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="heads" name="Heads" stackId="a" fill={CHART_COLORS[0]} radius={[0, 0, 0, 0]} />
              <Bar dataKey="tails" name="Tails" stackId="a" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default MatchingPenniesAnalytics;
