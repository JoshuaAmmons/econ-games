import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const PrisonerDilemmaAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const cooperatePayoff = gameConfig.cooperateCooperatePayoff ?? gameConfig.mutualCooperatePayoff ?? 3;

  // Cooperation rate per round (% of players who chose cooperate)
  const cooperationRateData = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const choices = results.map(r => r.resultData?.choice ?? r.resultData?.action ?? '');
      const cooperators = choices.filter(c => c === 'cooperate').length;
      const rate = results.length > 0 ? (cooperators / results.length) * 100 : 0;
      return {
        round: round.roundNumber,
        cooperationRate: parseFloat(rate.toFixed(1)),
      };
    });
  }, [completedRounds]);

  // Choice distribution: cooperate vs defect counts per round
  const choiceDistribution = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const choices = results.map(r => r.resultData?.choice ?? r.resultData?.action ?? '');
      const cooperators = choices.filter(c => c === 'cooperate').length;
      const defectors = choices.filter(c => c === 'defect').length;
      return {
        round: `R${round.roundNumber}`,
        Cooperate: cooperators,
        Defect: defectors,
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
      {/* Cooperation Rate Over Rounds */}
      {cooperationRateData.length > 0 && (
        <ChartCard title="Cooperation Rate Over Rounds" description="Percentage of players choosing cooperate each round. Nash prediction: 0% (all defect).">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={cooperationRateData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis domain={[0, 100]} label={{ value: 'Cooperation %', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Legend />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Nash (0%)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <Line type="monotone" dataKey="cooperationRate" name="Cooperation Rate" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Choice Distribution */}
      {choiceDistribution.length > 0 && (
        <ChartCard title="Choice Distribution" description="Stacked bars showing cooperate/defect counts per round">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={choiceDistribution} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Cooperate" stackId="a" fill={CHART_COLORS[2]} />
              <Bar dataKey="Defect" stackId="a" fill={CHART_COLORS[3]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Average Payoff Over Rounds */}
      {avgPayoffData.length > 0 && (
        <ChartCard title="Average Payoff Over Rounds" description="Average payoff vs mutual cooperation payoff reference">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={avgPayoffData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <ReferenceLine y={cooperatePayoff} stroke="#10b981" strokeDasharray="5 5" label={{ value: `Mutual Coop: ${formatDollar(cooperatePayoff)}`, fill: '#10b981', fontSize: 10, position: 'right' }} />
              <Line type="monotone" dataKey="avgPayoff" name="Avg Payoff" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default PrisonerDilemmaAnalytics;
