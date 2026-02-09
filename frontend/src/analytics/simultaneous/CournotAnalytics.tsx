import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Scatter, ComposedChart,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar, getPlayerColor } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const CournotAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const a = gameConfig.demandIntercept ?? 100;
  const b = gameConfig.demandSlope ?? 1;
  const mc = gameConfig.marginalCost ?? 10;
  const n = data.players.length || 2;

  // Theoretical benchmarks
  const nashQtyPerFirm = (a - mc) / (b * (n + 1));
  const nashTotalQty = nashQtyPerFirm * n;
  const nashPrice = Math.max(0, a - b * nashTotalQty);
  const competitiveQty = (a - mc) / b;
  const competitivePrice = mc;
  const monopolyQty = (a - mc) / (2 * b);
  const monopolyPrice = a - b * monopolyQty;

  // Quantity per player per round
  const quantityData = useMemo(() => {
    return completedRounds.map(round => {
      const row: Record<string, any> = { round: round.roundNumber };
      for (const r of round.results || []) {
        const pName = data.players.find(p => p.id === r.playerId)?.name || r.playerId.slice(0, 6);
        row[pName] = r.resultData?.quantity ?? 0;
      }
      return row;
    });
  }, [completedRounds, data.players]);

  // Market price per round
  const priceData = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const price = results.length > 0 ? (results[0].resultData?.marketPrice ?? 0) : 0;
      return {
        round: round.roundNumber,
        marketPrice: parseFloat(price.toFixed(2)),
      };
    });
  }, [completedRounds]);

  // Demand curve with actual outcomes
  const demandCurve = useMemo(() => {
    const points: { qty: number; price: number }[] = [];
    const maxQ = Math.max(competitiveQty * 1.2, 10);
    for (let q = 0; q <= maxQ; q += maxQ / 50) {
      points.push({ qty: parseFloat(q.toFixed(1)), price: parseFloat(Math.max(0, a - b * q).toFixed(2)) });
    }
    return points;
  }, [a, b, competitiveQty]);

  const actualOutcomes = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      if (results.length === 0) return null;
      const totalQ = results.reduce((s, r) => s + (r.resultData?.quantity ?? 0), 0);
      const price = results[0]?.resultData?.marketPrice ?? 0;
      return { qty: parseFloat(totalQ.toFixed(1)), price: parseFloat(price.toFixed(2)), round: round.roundNumber };
    }).filter(Boolean);
  }, [completedRounds]);

  const playerNames = useMemo(() => data.players.map(p => p.name || p.id.slice(0, 6)), [data.players]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Quantity choices over rounds */}
      {quantityData.length > 0 && (
        <ChartCard title="Quantity Choices Over Rounds" description="Each line is one firm's output. Reference: Nash, competitive, monopoly quantities.">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={quantityData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis label={{ value: 'Quantity', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={nashQtyPerFirm} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Nash', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              {playerNames.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={getPlayerColor(i)} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Market price vs benchmarks */}
      {priceData.length > 0 && (
        <ChartCard title="Market Price vs Benchmarks" description="Actual market price compared to Nash, competitive, and monopoly predictions">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={priceData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <ReferenceLine y={nashPrice} stroke="#ef4444" strokeDasharray="5 5" label={{ value: `Nash: ${formatDollar(nashPrice)}`, fill: '#ef4444', fontSize: 10 }} />
              <ReferenceLine y={competitivePrice} stroke="#10b981" strokeDasharray="3 3" label={{ value: `Competitive: ${formatDollar(competitivePrice)}`, fill: '#10b981', fontSize: 10 }} />
              <ReferenceLine y={monopolyPrice} stroke="#8b5cf6" strokeDasharray="3 3" label={{ value: `Monopoly: ${formatDollar(monopolyPrice)}`, fill: '#8b5cf6', fontSize: 10 }} />
              <Line type="monotone" dataKey="marketPrice" name="Market Price" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Demand curve with actual outcomes */}
      {actualOutcomes.length > 0 && (
        <ChartCard title="Demand Curve & Outcomes" description="Actual total output and price plotted on the demand curve">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ComposedChart margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="qty" type="number" label={{ value: 'Total Quantity', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <Line data={demandCurve} type="monotone" dataKey="price" name="Demand (P=a-bQ)" stroke="#94a3b8" strokeWidth={2} dot={false} />
              <Scatter data={actualOutcomes} dataKey="price" name="Actual Outcomes" fill={CHART_COLORS[0]} r={6} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default CournotAnalytics;
