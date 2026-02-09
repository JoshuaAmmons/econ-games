import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, Cell,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar, PROFIT_COLORS } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const MarketForLemonsAnalytics: React.FC<AnalyticsProps> = ({ data: _data, completedRounds }) => {
  // Quality-Price scatter (sellers)
  const qualityPriceData = useMemo(() => {
    const points: { quality: number; price: number; accepted: boolean; round: number }[] = [];
    for (const round of completedRounds) {
      for (const r of round.results || []) {
        if (r.resultData?.role === 'seller' && r.resultData.quality != null) {
          points.push({
            quality: r.resultData.quality,
            price: r.resultData.price ?? 0,
            accepted: r.resultData.accepted ?? false,
            round: round.roundNumber,
          });
        }
      }
    }
    return points;
  }, [completedRounds]);

  // Average traded quality over rounds (market unraveling)
  const qualityOverRounds = useMemo(() => {
    return completedRounds.map(round => {
      const sellers = (round.results || []).filter(r => r.resultData?.role === 'seller');
      const allQualities = sellers.map(r => r.resultData?.quality ?? 0);
      const accepted = sellers.filter(r => r.resultData?.accepted);
      const tradedQualities = accepted.map(r => r.resultData?.quality ?? 0);

      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

      return {
        round: round.roundNumber,
        avgTradedQuality: tradedQualities.length > 0 ? parseFloat(avg(tradedQualities)!.toFixed(1)) : null,
        avgAllQuality: allQualities.length > 0 ? parseFloat(avg(allQualities)!.toFixed(1)) : null,
        acceptRate: sellers.length > 0 ? parseFloat(((accepted.length / sellers.length) * 100).toFixed(1)) : 0,
      };
    });
  }, [completedRounds]);

  // Acceptance rate over rounds
  const acceptanceData = useMemo(() => {
    return completedRounds.map(round => {
      const sellers = (round.results || []).filter(r => r.resultData?.role === 'seller');
      const accepted = sellers.filter(r => r.resultData?.accepted).length;
      return {
        round: round.roundNumber,
        acceptRate: sellers.length > 0 ? parseFloat(((accepted / sellers.length) * 100).toFixed(1)) : 0,
        trades: accepted,
        total: sellers.length,
      };
    });
  }, [completedRounds]);

  // Buyer vs seller profit per round
  const profitByRole = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const sellers = results.filter(r => r.resultData?.role === 'seller');
      const buyers = results.filter(r => r.resultData?.role === 'buyer');
      const avg = (arr: { profit: number }[]) => arr.length > 0 ? arr.reduce((s, r) => s + r.profit, 0) / arr.length : 0;
      return {
        round: `R${round.roundNumber}`,
        sellerProfit: parseFloat(avg(sellers).toFixed(2)),
        buyerProfit: parseFloat(avg(buyers).toFixed(2)),
      };
    });
  }, [completedRounds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Quality-Price scatter */}
      {qualityPriceData.length > 0 && (
        <ChartCard title="Quality vs Price" description="True quality (admin view) vs asking price. Green = traded, red = rejected.">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ScatterChart margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="quality" type="number" name="Quality" label={{ value: 'True Quality', position: 'insideBottom', offset: -2 }} />
              <YAxis dataKey="price" type="number" name="Price" tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any, name: any) => name === 'Price' ? formatDollar(value) : value} />
              <Scatter data={qualityPriceData.filter(p => p.accepted)} fill={PROFIT_COLORS.positive} name="Traded" r={6} />
              <Scatter data={qualityPriceData.filter(p => !p.accepted)} fill={PROFIT_COLORS.negative} name="Rejected" r={5} fillOpacity={0.5} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Market unraveling */}
      {qualityOverRounds.length > 0 && (
        <ChartCard title="Market Unraveling" description="Average quality of traded goods declines (adverse selection)">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={qualityOverRounds} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis yAxisId="left" label={{ value: 'Quality', angle: -90, position: 'insideLeft' }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} label={{ value: 'Accept %', angle: 90, position: 'insideRight' }} />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="avgTradedQuality" name="Avg Traded Quality" stroke={CHART_COLORS[2]} strokeWidth={2} dot={{ r: 4 }} connectNulls />
              <Line yAxisId="left" type="monotone" dataKey="avgAllQuality" name="Avg All Quality" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" connectNulls />
              <Line yAxisId="right" type="monotone" dataKey="acceptRate" name="Accept Rate %" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Acceptance rate */}
      {acceptanceData.length > 0 && (
        <ChartCard title="Acceptance Rate Over Rounds" description="Market breakdown as buyers learn about adverse selection">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={acceptanceData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis domain={[0, 100]} label={{ value: 'Accept %', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Bar dataKey="acceptRate" name="Acceptance Rate" radius={[4, 4, 0, 0]}>
                {acceptanceData.map((entry, i) => (
                  <Cell key={i} fill={entry.acceptRate >= 50 ? CHART_COLORS[2] : CHART_COLORS[3]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Buyer vs seller profit */}
      {profitByRole.length > 0 && (
        <ChartCard title="Buyer vs Seller Profit" description="Information asymmetry advantage for sellers">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={profitByRole} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <ReferenceLine y={0} stroke="#999" />
              <Bar dataKey="sellerProfit" name="Seller" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="buyerProfit" name="Buyer" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default MarketForLemonsAnalytics;
