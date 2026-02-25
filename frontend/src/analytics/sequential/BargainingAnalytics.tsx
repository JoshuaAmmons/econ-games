import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar, PROFIT_COLORS } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const BargainingAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const pieSize = gameConfig.pieSize ?? 10;

  // Proposals over rounds: average keep / pieSize
  const proposalsOverRounds = useMemo(() => {
    return completedRounds.map(round => {
      const proposerResults = (round.results || []).filter(r => r.resultData?.role === 'proposer');
      const keepAmounts = proposerResults.map(r => r.resultData?.keep ?? 0);
      const actualPie = proposerResults.length > 0
        ? (proposerResults[0].resultData?.pieSize ?? pieSize)
        : pieSize;
      const avgKeep = keepAmounts.length > 0
        ? keepAmounts.reduce((s, v) => s + v, 0) / keepAmounts.length
        : 0;
      const keepPct = actualPie > 0 ? (avgKeep / actualPie) * 100 : 0;
      const avgOffer = proposerResults.length > 0
        ? proposerResults.map(r => r.resultData?.offer ?? 0).reduce((s, v) => s + v, 0) / proposerResults.length
        : 0;
      const offerPct = actualPie > 0 ? (avgOffer / actualPie) * 100 : 0;
      return {
        round: round.roundNumber,
        keepPct: parseFloat(keepPct.toFixed(1)),
        offerPct: parseFloat(offerPct.toFixed(1)),
        avgKeep: parseFloat(avgKeep.toFixed(2)),
        avgOffer: parseFloat(avgOffer.toFixed(2)),
      };
    });
  }, [completedRounds, pieSize]);

  // Acceptance rate per round
  const acceptanceRate = useMemo(() => {
    return completedRounds.map(round => {
      const proposerResults = (round.results || []).filter(r => r.resultData?.role === 'proposer');
      const total = proposerResults.length;
      const accepted = proposerResults.filter(r => r.resultData?.accepted).length;
      const rate = total > 0 ? (accepted / total) * 100 : 0;
      return {
        round: `R${round.roundNumber}`,
        roundNum: round.roundNumber,
        acceptRate: parseFloat(rate.toFixed(1)),
        accepted,
        rejected: total - accepted,
      };
    });
  }, [completedRounds]);

  // Proposer vs Responder earnings per round
  const earningsByRole = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const proposers = results.filter(r => r.resultData?.role === 'proposer');
      const responders = results.filter(r => r.resultData?.role === 'responder');
      const avg = (arr: { profit: number }[]) =>
        arr.length > 0 ? arr.reduce((s, r) => s + r.profit, 0) / arr.length : 0;
      return {
        round: round.roundNumber,
        proposerProfit: parseFloat(avg(proposers).toFixed(2)),
        responderProfit: parseFloat(avg(responders).toFixed(2)),
      };
    });
  }, [completedRounds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Proposals Over Rounds */}
      {proposalsOverRounds.length > 0 && (
        <ChartCard title="Proposals Over Rounds" description="Average proposer's keep and offer as % of pie size">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={proposalsOverRounds} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis
                domain={[0, 100]}
                label={{ value: '% of Pie', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Legend />
              <ReferenceLine y={50} stroke="#8b5cf6" strokeDasharray="5 5" label={{ value: 'Fair Split (50%)', fill: '#8b5cf6', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Nash (100%)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <Line
                type="monotone"
                dataKey="keepPct"
                name="Avg Keep %"
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="offerPct"
                name="Avg Offer %"
                stroke={CHART_COLORS[1]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Acceptance Rate */}
      {acceptanceRate.length > 0 && (
        <ChartCard title="Acceptance Rate by Round" description="% of proposals accepted each round">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={acceptanceRate} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis domain={[0, 100]} label={{ value: 'Accept %', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Bar dataKey="acceptRate" name="Acceptance Rate" radius={[4, 4, 0, 0]}>
                {acceptanceRate.map((entry, i) => (
                  <Cell key={i} fill={entry.acceptRate >= 50 ? PROFIT_COLORS.positive : PROFIT_COLORS.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Proposer vs Responder Earnings */}
      {earningsByRole.length > 0 && (
        <ChartCard title="Proposer vs Responder Earnings" description="Average profit by role per round">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={earningsByRole} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <ReferenceLine y={pieSize / 2} stroke="#8b5cf6" strokeDasharray="5 5" label={{ value: 'Fair Split', fill: '#8b5cf6', fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#999" />
              <Line
                type="monotone"
                dataKey="proposerProfit"
                name="Proposer Profit"
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="responderProfit"
                name="Responder Profit"
                stroke={CHART_COLORS[1]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default BargainingAnalytics;
