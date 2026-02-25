import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  ScatterChart, Scatter,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const TrustGameAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const endowment = gameConfig.endowment ?? 10;

  // Average amount sent per round (as % of endowment)
  const amountSentOverRounds = useMemo(() => {
    return completedRounds.map(round => {
      const senderResults = (round.results || []).filter(r => r.resultData?.role === 'sender');
      const sentAmounts = senderResults.map(r => r.resultData?.amountSent ?? 0);
      const avg = sentAmounts.length > 0
        ? sentAmounts.reduce((s, v) => s + v, 0) / sentAmounts.length
        : 0;
      const pctOfEndowment = endowment > 0 ? (avg / endowment) * 100 : 0;
      return {
        round: round.roundNumber,
        avgSent: parseFloat(avg.toFixed(2)),
        pctOfEndowment: parseFloat(pctOfEndowment.toFixed(1)),
      };
    });
  }, [completedRounds, endowment]);

  // Average return rate per round (returned / tripled amount)
  const returnRateOverRounds = useMemo(() => {
    return completedRounds.map(round => {
      const receiverResults = (round.results || []).filter(r => r.resultData?.role === 'receiver');
      const rates: number[] = [];
      for (const r of receiverResults) {
        const returned = r.resultData?.amountReturned ?? 0;
        const tripled = r.resultData?.tripledAmount ?? 0;
        if (tripled > 0) {
          rates.push(returned / tripled);
        }
      }
      const avgRate = rates.length > 0
        ? rates.reduce((s, v) => s + v, 0) / rates.length
        : 0;
      return {
        round: round.roundNumber,
        returnRate: parseFloat((avgRate * 100).toFixed(1)),
      };
    });
  }, [completedRounds]);

  // Trust vs Reciprocity scatter (amount sent vs amount returned for each pair)
  const trustReciprocityData = useMemo(() => {
    const points: { amountSent: number; amountReturned: number; round: number }[] = [];
    for (const round of completedRounds) {
      const results = round.results || [];
      const senders = results.filter(r => r.resultData?.role === 'sender');
      const receivers = results.filter(r => r.resultData?.role === 'receiver');

      // Match senders to receivers by looking at the round data
      // Each sender's amountSent corresponds to a receiver's amountReturned
      // We pair them based on the order they appear or via matching pairs
      for (const sender of senders) {
        const sent = sender.resultData?.amountSent ?? 0;
        // Find the matching receiver: in a trust game, the receiver who got this sender's amount
        // Try matching by pairedWith or partnerId if available, otherwise use index matching
        const matchingReceiver = receivers.find(
          r => r.resultData?.partnerId === sender.playerId
            || sender.resultData?.partnerId === r.playerId
        );
        if (matchingReceiver) {
          points.push({
            amountSent: sent,
            amountReturned: matchingReceiver.resultData?.amountReturned ?? 0,
            round: round.roundNumber,
          });
        } else if (senders.length === receivers.length) {
          // Fallback: pair by index
          const idx = senders.indexOf(sender);
          if (idx < receivers.length) {
            points.push({
              amountSent: sent,
              amountReturned: receivers[idx].resultData?.amountReturned ?? 0,
              round: round.roundNumber,
            });
          }
        }
      }
    }
    return points;
  }, [completedRounds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Amount Sent Over Rounds */}
      {amountSentOverRounds.length > 0 && (
        <ChartCard title="Amount Sent Over Rounds" description="Average trust level as % of endowment per round">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={amountSentOverRounds} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis
                domain={[0, 100]}
                label={{ value: '% of Endowment', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Legend />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Nash (0%)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={50} stroke="#8b5cf6" strokeDasharray="5 5" label={{ value: '50%', fill: '#8b5cf6', fontSize: 10, position: 'right' }} />
              <Line
                type="monotone"
                dataKey="pctOfEndowment"
                name="Avg Sent (% of Endowment)"
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Amount Returned Over Rounds */}
      {returnRateOverRounds.length > 0 && (
        <ChartCard title="Return Rate Over Rounds" description="Average % of tripled amount returned (reciprocity measure)">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={returnRateOverRounds} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis
                domain={[0, 100]}
                label={{ value: 'Return Rate %', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Legend />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Nash (0%)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={33.3} stroke="#10b981" strokeDasharray="5 5" label={{ value: 'Break-even (33%)', fill: '#10b981', fontSize: 10, position: 'right' }} />
              <Line
                type="monotone"
                dataKey="returnRate"
                name="Avg Return Rate %"
                stroke={CHART_COLORS[1]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Trust vs Reciprocity Scatter */}
      {trustReciprocityData.length > 0 && (
        <ChartCard title="Trust vs Reciprocity" description="Each point is a sender-receiver pair: amount sent vs amount returned">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ScatterChart margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="amountSent"
                type="number"
                name="Amount Sent"
                tickFormatter={formatDollar}
                label={{ value: 'Amount Sent', position: 'insideBottom', offset: -2 }}
              />
              <YAxis
                dataKey="amountReturned"
                type="number"
                name="Amount Returned"
                tickFormatter={formatDollar}
                label={{ value: 'Amount Returned', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip formatter={(value: any, name: any) => formatDollar(value)} />
              <Scatter
                data={trustReciprocityData}
                fill={CHART_COLORS[2]}
                name="Sender-Receiver Pair"
                r={6}
                fillOpacity={0.7}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default TrustGameAnalytics;
