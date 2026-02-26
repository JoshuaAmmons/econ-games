import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  ScatterChart, Scatter,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const CommonPoolResourceAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const poolSize = gameConfig.poolSize ?? gameConfig.resourcePool ?? 100;

  // Scatter: extraction amounts per player per round
  const extractionScatter = useMemo(() => {
    const points: { round: number; extraction: number; player: string }[] = [];
    for (const round of completedRounds) {
      if (!round.results) continue;
      for (const r of round.results) {
        const rd = r.resultData || {};
        points.push({
          round: round.roundNumber,
          extraction: Number(rd.extraction ?? rd.amount ?? 0),
          player: data.players.find(p => p.id === r.playerId)?.name || 'Unknown',
        });
      }
    }
    return points;
  }, [completedRounds, data.players]);

  // Total extraction vs pool size per round
  const totalExtractionData = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const extractions = results.map(r => Number(r.resultData?.extraction ?? r.resultData?.amount ?? 0));
      const total = extractions.reduce((s, e) => s + e, 0);
      return {
        round: round.roundNumber,
        totalExtraction: parseFloat(total.toFixed(2)),
      };
    });
  }, [completedRounds]);

  // Shared bonus per round
  const sharedBonusData = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      // Try to get shared bonus from the first result's resultData, as it is common to all players
      const sharedBonus = results.length > 0
        ? Number(results[0].resultData?.sharedBonus ?? results[0].resultData?.bonus ?? results[0].resultData?.groupBonus ?? 0)
        : 0;
      return {
        round: `R${round.roundNumber}`,
        sharedBonus: parseFloat(sharedBonus.toFixed(2)),
      };
    });
  }, [completedRounds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Extraction Per Player */}
      {extractionScatter.length > 0 && (
        <ChartCard title="Extraction Per Player" description="Each dot is one player's extraction amount per round">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ScatterChart margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" type="number" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis dataKey="extraction" type="number" label={{ value: 'Extraction', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Scatter data={extractionScatter} fill={CHART_COLORS[0]} name="Extraction" r={5} fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Total Extraction vs Pool Size */}
      {totalExtractionData.length > 0 && (
        <ChartCard title="Total Extraction vs Pool Size" description="Total group extraction per round. Exceeding pool size depletes the resource.">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={totalExtractionData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis label={{ value: 'Total Extraction', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={poolSize} stroke="#ef4444" strokeDasharray="5 5" label={{ value: `Pool Size: ${poolSize}`, fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <Line type="monotone" dataKey="totalExtraction" name="Total Extraction" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Shared Bonus Over Rounds */}
      {sharedBonusData.length > 0 && (
        <ChartCard title="Shared Bonus Over Rounds" description="Group bonus from remaining resources. Should increase if players learn to restrain extraction.">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={sharedBonusData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <Bar dataKey="sharedBonus" name="Shared Bonus" fill={CHART_COLORS[2]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default CommonPoolResourceAnalytics;
