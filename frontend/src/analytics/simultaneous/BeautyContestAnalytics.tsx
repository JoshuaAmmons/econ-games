import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  ScatterChart, Scatter,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, getPlayerColor } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const BeautyContestAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const fraction = gameConfig.fraction ?? gameConfig.multiplier ?? 2 / 3;

  // Scatter: each player's chosen number per round, with target line
  const numberScatter = useMemo(() => {
    const points: { round: number; number: number; player: string }[] = [];
    for (const round of completedRounds) {
      if (!round.results) continue;
      for (const r of round.results) {
        const rd = r.resultData || {};
        points.push({
          round: round.roundNumber,
          number: Number(rd.chosenNumber ?? rd.number ?? rd.guess ?? 0),
          player: data.players.find(p => p.id === r.playerId)?.name || 'Unknown',
        });
      }
    }
    return points;
  }, [completedRounds, data.players]);

  // Group average and target per round
  const avgTargetData = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const numbers = results.map(r => Number(r.resultData?.chosenNumber ?? r.resultData?.number ?? r.resultData?.guess ?? 0));
      const avg = numbers.length > 0 ? numbers.reduce((s, n) => s + n, 0) / numbers.length : 0;
      const target = avg * fraction;
      return {
        round: round.roundNumber,
        average: parseFloat(avg.toFixed(2)),
        target: parseFloat(target.toFixed(2)),
      };
    });
  }, [completedRounds, fraction]);

  // Convergence to Nash: group average declining toward 0
  const convergenceData = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const numbers = results.map(r => Number(r.resultData?.chosenNumber ?? r.resultData?.number ?? r.resultData?.guess ?? 0));
      const avg = numbers.length > 0 ? numbers.reduce((s, n) => s + n, 0) / numbers.length : 0;
      return {
        round: round.roundNumber,
        groupAverage: parseFloat(avg.toFixed(2)),
      };
    });
  }, [completedRounds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Chosen Numbers Over Rounds */}
      {numberScatter.length > 0 && (
        <ChartCard title="Chosen Numbers Over Rounds" description="Each dot is a player's chosen number. Shows dispersion of guesses per round.">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ScatterChart margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" type="number" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis dataKey="number" type="number" label={{ value: 'Chosen Number', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Nash (0)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <Scatter data={numberScatter} fill={CHART_COLORS[0]} name="Player Choices" r={5} fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Group Average & Target */}
      {avgTargetData.length > 0 && (
        <ChartCard title="Group Average & Target" description={`Average guess and target (${(fraction * 100).toFixed(0)}% of average). Nash equilibrium is 0.`}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={avgTargetData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis label={{ value: 'Value', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Nash (0)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <Line type="monotone" dataKey="average" name="Group Average" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="target" name="Target" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Convergence to Nash Equilibrium */}
      {convergenceData.length > 0 && (
        <ChartCard title="Convergence to Nash Equilibrium" description="Group average should decline toward 0 over rounds as players iterate best responses">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={convergenceData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis label={{ value: 'Group Average', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Nash (0)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <Line type="monotone" dataKey="groupAverage" name="Group Average" stroke={CHART_COLORS[2]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default BeautyContestAnalytics;
