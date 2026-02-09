import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar, linearRegression } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const GiftExchangeAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  // Wage-effort scatter
  const wageEffortData = useMemo(() => {
    const points: { wage: number; effort: number; player: string; round: number }[] = [];
    for (const round of completedRounds) {
      for (const r of round.results || []) {
        if (r.resultData?.role === 'worker' && r.resultData.wage != null && r.resultData.effort != null) {
          points.push({
            wage: r.resultData.wage,
            effort: r.resultData.effort,
            player: data.players.find(p => p.id === r.playerId)?.name || 'Unknown',
            round: round.roundNumber,
          });
        }
      }
    }
    return points;
  }, [completedRounds, data.players]);

  // Regression for wage-effort relationship
  const regression = useMemo(() => {
    if (wageEffortData.length < 2) return null;
    return linearRegression(wageEffortData.map(p => ({ x: p.wage, y: p.effort })));
  }, [wageEffortData]);

  // Regression line data points
  const regressionLine = useMemo(() => {
    if (!regression || wageEffortData.length < 2) return [];
    const wages = wageEffortData.map(p => p.wage);
    const minW = Math.min(...wages);
    const maxW = Math.max(...wages);
    return [
      { wage: minW, effort: regression.slope * minW + regression.intercept },
      { wage: maxW, effort: regression.slope * maxW + regression.intercept },
    ];
  }, [regression, wageEffortData]);

  // Average wage & effort per round
  const wageEffortOverRounds = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const workerResults = results.filter(r => r.resultData?.role === 'worker');
      const wages = workerResults.map(r => r.resultData?.wage ?? 0);
      const efforts = workerResults.map(r => r.resultData?.effort ?? 0);
      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
      return {
        round: round.roundNumber,
        avgWage: parseFloat(avg(wages).toFixed(2)),
        avgEffort: parseFloat(avg(efforts).toFixed(2)),
      };
    });
  }, [completedRounds]);

  // Employer vs worker profit per round
  const profitByRole = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const employers = results.filter(r => r.resultData?.role === 'employer');
      const workers = results.filter(r => r.resultData?.role === 'worker');
      const avg = (arr: { profit: number }[]) => arr.length > 0 ? arr.reduce((s, r) => s + r.profit, 0) / arr.length : 0;
      return {
        round: `R${round.roundNumber}`,
        employerProfit: parseFloat(avg(employers).toFixed(2)),
        workerProfit: parseFloat(avg(workers).toFixed(2)),
      };
    });
  }, [completedRounds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Wage-Effort scatter */}
      {wageEffortData.length > 0 && (
        <ChartCard title="Wage-Effort Relationship" description={`Reciprocity scatter. ${regression ? `R²=${regression.r2.toFixed(2)}, slope=${regression.slope.toFixed(2)}` : ''}`}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ScatterChart margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="wage" type="number" name="Wage" tickFormatter={formatDollar} label={{ value: 'Wage ($)', position: 'insideBottom', offset: -2 }} />
              <YAxis dataKey="effort" type="number" name="Effort" label={{ value: 'Effort', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(value: any, name: any) => name === 'Wage' ? formatDollar(value) : value} />
              <Scatter data={wageEffortData} fill={CHART_COLORS[0]} name="Wage-Effort Pair" r={5} fillOpacity={0.7} />
              {regressionLine.length === 2 && (
                <Scatter data={regressionLine} fill="none" line={{ stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '5 5' }} name="Trend" r={0} />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Average wage & effort over rounds */}
      {wageEffortOverRounds.length > 0 && (
        <ChartCard title="Average Wage & Effort Over Rounds" description="Co-movement indicates gift exchange reciprocity">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={wageEffortOverRounds} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis yAxisId="left" tickFormatter={formatDollar} label={{ value: 'Wage ($)', angle: -90, position: 'insideLeft' }} />
              <YAxis yAxisId="right" orientation="right" label={{ value: 'Effort', angle: 90, position: 'insideRight' }} />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="avgWage" name="Avg Wage" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
              <Line yAxisId="right" type="monotone" dataKey="avgEffort" name="Avg Effort" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Employer vs Worker profit */}
      {profitByRole.length > 0 && (
        <ChartCard title="Employer vs Worker Profit" description="Surplus distribution between roles each round">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={profitByRole} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <ReferenceLine y={0} stroke="#999" />
              <Bar dataKey="employerProfit" name="Employer" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="workerProfit" name="Worker" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default GiftExchangeAnalytics;
