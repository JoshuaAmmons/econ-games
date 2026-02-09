import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar, PROFIT_COLORS } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const UltimatumAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const endowment = gameConfig.endowment ?? 10;
  const minOffer = gameConfig.minOffer ?? 0;

  // All offers with accept/reject info
  const allOffers = useMemo(() => {
    const offers: { offer: number; accepted: boolean; round: number }[] = [];
    for (const round of completedRounds) {
      for (const r of round.results || []) {
        if (r.resultData?.role === 'proposer') {
          offers.push({
            offer: r.resultData.offer ?? 0,
            accepted: r.resultData.accepted ?? false,
            round: round.roundNumber,
          });
        }
      }
    }
    return offers;
  }, [completedRounds]);

  // Offer distribution histogram
  const offerDistribution = useMemo(() => {
    if (allOffers.length === 0) return [];
    const bins: Record<number, { total: number; accepted: number }> = {};
    const step = Math.max(1, Math.round(endowment / 10));
    for (let i = 0; i <= endowment; i += step) {
      bins[i] = { total: 0, accepted: 0 };
    }
    for (const o of allOffers) {
      const bin = Math.round(o.offer / step) * step;
      const key = Math.min(bin, endowment);
      if (!bins[key]) bins[key] = { total: 0, accepted: 0 };
      bins[key].total++;
      if (o.accepted) bins[key].accepted++;
    }
    return Object.entries(bins).map(([k, v]) => ({
      offer: `$${k}`,
      offerNum: parseFloat(k),
      count: v.total,
      accepted: v.accepted,
      rejected: v.total - v.accepted,
    })).sort((a, b) => a.offerNum - b.offerNum);
  }, [allOffers, endowment]);

  // Acceptance rate by offer size
  const acceptanceByOffer = useMemo(() => {
    return offerDistribution.map(d => ({
      ...d,
      acceptRate: d.count > 0 ? parseFloat(((d.accepted / d.count) * 100).toFixed(1)) : 0,
    }));
  }, [offerDistribution]);

  // Offers over rounds
  const offersOverRounds = useMemo(() => {
    return completedRounds.map(round => {
      const proposerResults = (round.results || []).filter(r => r.resultData?.role === 'proposer');
      const offers = proposerResults.map(r => r.resultData?.offer ?? 0);
      const avg = offers.length > 0 ? offers.reduce((s, o) => s + o, 0) / offers.length : 0;
      const acceptRate = proposerResults.length > 0
        ? (proposerResults.filter(r => r.resultData?.accepted).length / proposerResults.length) * 100
        : 0;
      return {
        round: round.roundNumber,
        avgOffer: parseFloat(avg.toFixed(2)),
        acceptRate: parseFloat(acceptRate.toFixed(1)),
      };
    });
  }, [completedRounds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Offer distribution */}
      {offerDistribution.length > 0 && (
        <ChartCard title="Offer Distribution" description="Frequency of offer amounts with acceptance breakdown">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={offerDistribution} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="offer" />
              <YAxis allowDecimals={false} label={{ value: 'Frequency', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="accepted" name="Accepted" stackId="a" fill={PROFIT_COLORS.positive} radius={[0, 0, 0, 0]} />
              <Bar dataKey="rejected" name="Rejected" stackId="a" fill={PROFIT_COLORS.negative} radius={[4, 4, 0, 0]} />
              <ReferenceLine x={`$${Math.round(endowment / 2)}`} stroke="#8b5cf6" strokeDasharray="5 5" label={{ value: 'Fair Split', fill: '#8b5cf6', fontSize: 10 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Acceptance rate by offer size */}
      {acceptanceByOffer.length > 0 && (
        <ChartCard title="Acceptance Rate by Offer Size" description="Higher offers are more likely to be accepted">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={acceptanceByOffer} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="offer" />
              <YAxis domain={[0, 100]} label={{ value: 'Accept %', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Bar dataKey="acceptRate" name="Acceptance Rate" radius={[4, 4, 0, 0]}>
                {acceptanceByOffer.map((entry, i) => (
                  <Cell key={i} fill={entry.acceptRate >= 50 ? PROFIT_COLORS.positive : PROFIT_COLORS.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Offers over rounds */}
      {offersOverRounds.length > 0 && (
        <ChartCard title="Offers & Acceptance Over Rounds" description="Do proposers learn to adjust their offers?">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={offersOverRounds} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis yAxisId="left" tickFormatter={formatDollar} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} label={{ value: 'Accept %', angle: 90, position: 'insideRight' }} />
              <Tooltip />
              <Legend />
              <ReferenceLine yAxisId="left" y={endowment / 2} stroke="#8b5cf6" strokeDasharray="5 5" label={{ value: 'Fair', fill: '#8b5cf6', fontSize: 10 }} />
              <ReferenceLine yAxisId="left" y={minOffer} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Nash', fill: '#ef4444', fontSize: 10 }} />
              <Line yAxisId="left" type="monotone" dataKey="avgOffer" name="Avg Offer" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
              <Line yAxisId="right" type="monotone" dataKey="acceptRate" name="Accept Rate %" stroke={CHART_COLORS[2]} strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default UltimatumAnalytics;
