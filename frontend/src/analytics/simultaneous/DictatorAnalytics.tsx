import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  ScatterChart, Scatter,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar, getPlayerColor } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const DictatorAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const endowment = gameConfig.endowment ?? 10;

  // Giving distribution: histogram of give amounts in bins
  const givingDistribution = useMemo(() => {
    const allGiveAmounts: number[] = [];
    for (const round of completedRounds) {
      for (const r of round.results || []) {
        const rd = r.resultData || {};
        // Only count dictators (those who have a give/offer amount)
        const give = rd.give ?? rd.offer ?? rd.giveAmount ?? rd.amount;
        if (give !== undefined && give !== null) {
          allGiveAmounts.push(Number(give));
        }
      }
    }

    // Create bins from 0 to endowment
    const numBins = Math.min(endowment + 1, 11);
    const binSize = endowment / (numBins - 1);
    const bins: { bin: string; count: number }[] = [];
    for (let i = 0; i < numBins; i++) {
      const lower = parseFloat((i * binSize).toFixed(1));
      const upper = parseFloat(((i + 1) * binSize).toFixed(1));
      const label = i === numBins - 1
        ? `${lower}`
        : `${lower}-${upper}`;
      const count = allGiveAmounts.filter(g => {
        if (i === numBins - 1) return g >= lower;
        return g >= lower && g < upper;
      }).length;
      bins.push({ bin: label, count });
    }
    return bins;
  }, [completedRounds, endowment]);

  // Average giving per round
  const avgGivingData = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const giveAmounts: number[] = [];
      for (const r of results) {
        const rd = r.resultData || {};
        const give = rd.give ?? rd.offer ?? rd.giveAmount ?? rd.amount;
        if (give !== undefined && give !== null) {
          giveAmounts.push(Number(give));
        }
      }
      const avg = giveAmounts.length > 0 ? giveAmounts.reduce((s, g) => s + g, 0) / giveAmounts.length : 0;
      return {
        round: round.roundNumber,
        avgGive: parseFloat(avg.toFixed(2)),
      };
    });
  }, [completedRounds]);

  // Giving as percent of endowment per player per round (scatter)
  const givingPctScatter = useMemo(() => {
    const points: { round: number; givePct: number; player: string }[] = [];
    for (const round of completedRounds) {
      for (const r of round.results || []) {
        const rd = r.resultData || {};
        const give = rd.give ?? rd.offer ?? rd.giveAmount ?? rd.amount;
        if (give !== undefined && give !== null) {
          const pct = endowment > 0 ? (Number(give) / endowment) * 100 : 0;
          points.push({
            round: round.roundNumber,
            givePct: parseFloat(pct.toFixed(1)),
            player: data.players.find(p => p.id === r.playerId)?.name || 'Unknown',
          });
        }
      }
    }
    return points;
  }, [completedRounds, data.players, endowment]);

  const fairnessLine = endowment / 2;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Giving Distribution */}
      {givingDistribution.length > 0 && (
        <ChartCard title="Giving Distribution" description="Histogram of dictator give amounts across all rounds">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={givingDistribution} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="bin" label={{ value: 'Give Amount', position: 'insideBottom', offset: -2 }} />
              <YAxis label={{ value: 'Frequency', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" name="Frequency" fill={CHART_COLORS[0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Average Giving Over Rounds */}
      {avgGivingData.length > 0 && (
        <ChartCard title="Average Giving Over Rounds" description="Average dictator give amount per round with Nash (0) and fairness (50%) references">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={avgGivingData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Nash ($0)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={fairnessLine} stroke="#10b981" strokeDasharray="5 5" label={{ value: `Fairness: ${formatDollar(fairnessLine)}`, fill: '#10b981', fontSize: 10, position: 'right' }} />
              <Line type="monotone" dataKey="avgGive" name="Avg Give" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Giving as Percent of Endowment */}
      {givingPctScatter.length > 0 && (
        <ChartCard title="Giving as % of Endowment" description="Each dot is a dictator's give as a percentage of the endowment per round">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ScatterChart margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" type="number" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis dataKey="givePct" type="number" domain={[0, 100]} label={{ value: '% of Endowment', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Nash (0%)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={50} stroke="#10b981" strokeDasharray="5 5" label={{ value: 'Fairness (50%)', fill: '#10b981', fontSize: 10, position: 'right' }} />
              <Scatter data={givingPctScatter} fill={CHART_COLORS[0]} name="Give %" r={5} fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default DictatorAnalytics;
