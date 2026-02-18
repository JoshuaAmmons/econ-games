import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  ScatterChart, Scatter,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar, getPlayerColor } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const BertrandAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const marginalCost = gameConfig.marginalCost ?? 0;

  // Price scatter per round
  const priceScatter = useMemo(() => {
    const points: { round: number; price: number; player: string; isWinner: boolean }[] = [];
    for (const round of completedRounds) {
      if (!round.results) continue;
      for (const r of round.results) {
        const rd = r.resultData || {};
        points.push({
          round: round.roundNumber,
          price: Number(rd.price ?? 0),
          player: data.players.find(p => p.id === r.playerId)?.name || 'Unknown',
          isWinner: rd.isWinner ?? false,
        });
      }
    }
    return points;
  }, [completedRounds, data.players]);

  // Average price per round (Nash convergence)
  const convergenceData = useMemo(() => {
    return completedRounds.map(round => {
      const prices = (round.results || []).map(r => Number(r.resultData?.price ?? 0));
      const avg = prices.length > 0 ? prices.reduce((s, p) => s + p, 0) / prices.length : 0;
      const min = prices.length > 0 ? Math.min(...prices) : 0;
      return {
        round: round.roundNumber,
        avgPrice: parseFloat(avg.toFixed(2)),
        minPrice: parseFloat(min.toFixed(2)),
      };
    });
  }, [completedRounds]);

  // Winner analysis per round
  const winnerData = useMemo(() => {
    return completedRounds.map(round => {
      const row: Record<string, any> = { round: `R${round.roundNumber}` };
      for (const r of round.results || []) {
        const playerName = data.players.find(p => p.id === r.playerId)?.name || r.playerId.slice(0, 6);
        row[playerName] = r.resultData?.isWinner ? 1 : 0;
      }
      return row;
    });
  }, [completedRounds, data.players]);

  const playerNames = useMemo(() => data.players.map(p => p.name || p.id.slice(0, 6)), [data.players]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Price scatter by round */}
      {priceScatter.length > 0 && (
        <ChartCard title="Price Choices Per Round" description="Each dot is one firm's price choice. Winners highlighted.">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ScatterChart margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" type="number" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis dataKey="price" tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <ReferenceLine y={marginalCost} stroke="#ef4444" strokeDasharray="5 5" label={{ value: `MC: ${formatDollar(marginalCost)}`, fill: '#ef4444', fontSize: 11, position: 'right' }} />
              <Scatter data={priceScatter.filter(p => !p.isWinner)} fill="#94a3b8" name="Losers" />
              <Scatter data={priceScatter.filter(p => p.isWinner)} fill={CHART_COLORS[2]} name="Winners" />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Nash Convergence */}
      {convergenceData.length > 0 && (
        <ChartCard title="Nash Convergence" description="Average and minimum price approaching marginal cost (Nash equilibrium)">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={convergenceData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <ReferenceLine y={marginalCost} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Nash (MC)', fill: '#ef4444', fontSize: 11, position: 'right' }} />
              <Line type="monotone" dataKey="avgPrice" name="Avg Price" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="minPrice" name="Min Price" stroke={CHART_COLORS[2]} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Winner Analysis */}
      {winnerData.length > 0 && playerNames.length > 0 && (
        <ChartCard title="Winner Analysis" description="Which firm(s) won each round (lowest price)">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={winnerData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis hide />
              <Tooltip />
              <Legend />
              {playerNames.map((name, i) => (
                <Bar key={name} dataKey={name} stackId="a" fill={getPlayerColor(i)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default BertrandAnalytics;
