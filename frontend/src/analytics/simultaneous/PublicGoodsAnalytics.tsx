import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar, getPlayerColor } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const PublicGoodsAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const endowment = gameConfig.endowment ?? 20;

  // Contribution per player per round
  const contributionByRound = useMemo(() => {
    return completedRounds.map(round => {
      const row: Record<string, any> = { round: `R${round.roundNumber}` };
      for (const r of round.results || []) {
        const name = data.players.find(p => p.id === r.playerId)?.name || r.playerId.slice(0, 6);
        row[name] = r.resultData?.contribution ?? 0;
      }
      return row;
    });
  }, [completedRounds, data.players]);

  // Average contribution over rounds
  const avgContribution = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const contribs = results.map(r => r.resultData?.contribution ?? 0);
      const avg = contribs.length > 0 ? contribs.reduce((s, c) => s + c, 0) / contribs.length : 0;
      return {
        round: round.roundNumber,
        avgContribution: parseFloat(avg.toFixed(2)),
        totalContribution: parseFloat(contribs.reduce((s, c) => s + c, 0).toFixed(2)),
      };
    });
  }, [completedRounds]);

  // Free-rider index
  const freeRiderData = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const contribs = results.map(r => r.resultData?.contribution ?? 0);
      const freeRiders = contribs.filter(c => c <= endowment * 0.1).length;
      return {
        round: round.roundNumber,
        freeRiderPct: parseFloat(((freeRiders / Math.max(contribs.length, 1)) * 100).toFixed(1)),
        freeRiders,
        total: contribs.length,
      };
    });
  }, [completedRounds, endowment]);

  // Individual contribution vs profit scatter
  const contributionProfitScatter = useMemo(() => {
    const points: { contribution: number; profit: number; player: string; round: number }[] = [];
    for (const round of completedRounds) {
      for (const r of round.results || []) {
        points.push({
          contribution: r.resultData?.contribution ?? 0,
          profit: r.profit,
          player: data.players.find(p => p.id === r.playerId)?.name || 'Unknown',
          round: round.roundNumber,
        });
      }
    }
    return points;
  }, [completedRounds, data.players]);

  const playerNames = useMemo(() => data.players.map(p => p.name || p.id.slice(0, 6)), [data.players]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Contribution bars per round */}
      {contributionByRound.length > 0 && (
        <ChartCard title="Contributions Per Round" description="Each bar segment is one player's contribution">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={contributionByRound} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis label={{ value: 'Contribution', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              {playerNames.map((name, i) => (
                <Bar key={name} dataKey={name} stackId="a" fill={getPlayerColor(i)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Average contribution over rounds */}
      {avgContribution.length > 0 && (
        <ChartCard title="Average Contribution Over Rounds" description="Shows declining cooperation pattern (free-riding decay)">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={avgContribution} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis label={{ value: 'Avg Contribution', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Nash (0)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={endowment} stroke="#10b981" strokeDasharray="5 5" label={{ value: `Social Opt (${endowment})`, fill: '#10b981', fontSize: 10, position: 'right' }} />
              <Line type="monotone" dataKey="avgContribution" name="Avg Contribution" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Free-rider index */}
      {freeRiderData.length > 0 && (
        <ChartCard title="Free-Rider Index" description="Percentage of players contributing less than 10% of endowment">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={freeRiderData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis label={{ value: 'Free-Rider %', angle: -90, position: 'insideLeft' }} domain={[0, 100]} />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Line type="monotone" dataKey="freeRiderPct" name="Free-Rider %" stroke={CHART_COLORS[3]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Contribution vs Profit scatter */}
      {contributionProfitScatter.length > 0 && (
        <ChartCard title="Contribution vs Profit" description="Low contributors often profit more when others contribute (social dilemma)">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ScatterChart margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="contribution" type="number" name="Contribution" label={{ value: 'Contribution', position: 'insideBottom', offset: -2 }} />
              <YAxis dataKey="profit" type="number" name="Profit" tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any, name: any) => name === 'Profit' ? formatDollar(value) : value} />
              <Scatter data={contributionProfitScatter} fill={CHART_COLORS[0]} name="Player-Round" r={5} fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default PublicGoodsAnalytics;
