import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar, getPlayerColor } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const NegExternalityAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {

  // Production per player per round
  const productionData = useMemo(() => {
    return completedRounds.map(round => {
      const row: Record<string, any> = { round: round.roundNumber };
      for (const r of round.results || []) {
        const name = data.players.find(p => p.id === r.playerId)?.name || r.playerId.slice(0, 6);
        row[name] = r.resultData?.production ?? 0;
      }
      return row;
    });
  }, [completedRounds, data.players]);

  // Private profit vs social damage
  const profitVsDamage = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const totalPrivateProfit = results.reduce((s, r) => s + (r.resultData?.privateProfit ?? 0), 0);
      const totalDamage = results.length > 0 ? (results[0].resultData?.totalDamage ?? 0) : 0;
      const totalTaxPaid = results.reduce((s, r) => s + (r.resultData?.taxPaid ?? 0), 0);
      const taxEnabled = results.length > 0 ? (results[0].resultData?.taxEnabled ?? false) : false;
      return {
        round: `R${round.roundNumber}`,
        privateProfit: parseFloat(totalPrivateProfit.toFixed(2)),
        socialDamage: parseFloat(totalDamage.toFixed(2)),
        netWelfare: parseFloat((totalPrivateProfit - totalDamage).toFixed(2)),
        taxRevenue: parseFloat(totalTaxPaid.toFixed(2)),
        taxEnabled,
      };
    });
  }, [completedRounds]);

  // Tax effect comparison
  const taxCompare = useMemo(() => {
    const taxRounds = profitVsDamage.filter(r => r.taxEnabled);
    const noTaxRounds = profitVsDamage.filter(r => !r.taxEnabled);
    if (taxRounds.length === 0 && noTaxRounds.length === 0) return null;
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    return [
      {
        label: 'Without Tax',
        avgProfit: parseFloat(avg(noTaxRounds.map(r => r.privateProfit)).toFixed(2)),
        avgDamage: parseFloat(avg(noTaxRounds.map(r => r.socialDamage)).toFixed(2)),
        avgWelfare: parseFloat(avg(noTaxRounds.map(r => r.netWelfare)).toFixed(2)),
      },
      {
        label: 'With Tax',
        avgProfit: parseFloat(avg(taxRounds.map(r => r.privateProfit)).toFixed(2)),
        avgDamage: parseFloat(avg(taxRounds.map(r => r.socialDamage)).toFixed(2)),
        avgWelfare: parseFloat(avg(taxRounds.map(r => r.netWelfare)).toFixed(2)),
      },
    ];
  }, [profitVsDamage]);

  // Damage vs total production scatter
  const damageScatter = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const totalProd = results.length > 0 ? (results[0].resultData?.totalProduction ?? 0) : 0;
      const totalDamage = results.length > 0 ? (results[0].resultData?.totalDamage ?? 0) : 0;
      return {
        totalProduction: parseFloat(totalProd.toFixed(1)),
        totalDamage: parseFloat(totalDamage.toFixed(2)),
        round: round.roundNumber,
      };
    });
  }, [completedRounds]);

  const playerNames = useMemo(() => data.players.map(p => p.name || p.id.slice(0, 6)), [data.players]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Production per player per round */}
      {productionData.length > 0 && (
        <ChartCard title="Production Choices Over Rounds" description="Individual firm production levels across rounds">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={productionData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis label={{ value: 'Production', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              {playerNames.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={getPlayerColor(i)} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Private profit vs social damage */}
      {profitVsDamage.length > 0 && (
        <ChartCard title="Private Profit vs Social Damage" description="Total private profits vs. externality damage each round">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={profitVsDamage} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <Bar dataKey="privateProfit" name="Private Profit" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="socialDamage" name="Social Damage" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
              <ReferenceLine y={0} stroke="#999" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Tax effect comparison */}
      {taxCompare && taxCompare[0].avgDamage + taxCompare[1].avgDamage > 0 && (
        <ChartCard title="Tax Effect Comparison" description="Average outcomes with and without Pigouvian tax">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={taxCompare} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <Bar dataKey="avgProfit" name="Avg Profit" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="avgDamage" name="Avg Damage" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="avgWelfare" name="Avg Net Welfare" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Damage-Production scatter */}
      {damageScatter.length > 0 && (
        <ChartCard title="Damage vs Production" description="Total damage grows quadratically with total production">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ScatterChart margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="totalProduction" type="number" name="Total Production" label={{ value: 'Total Production', position: 'insideBottom', offset: -2 }} />
              <YAxis dataKey="totalDamage" type="number" name="Total Damage" tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any, name: any) => name === 'Total Damage' ? formatDollar(value) : value} />
              <Scatter data={damageScatter} fill={CHART_COLORS[3]} name="Round Outcomes" r={6} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default NegExternalityAnalytics;
