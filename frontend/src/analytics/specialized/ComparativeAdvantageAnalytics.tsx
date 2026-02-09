import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, getPlayerColor } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const ComparativeAdvantageAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const laborUnits = gameConfig.laborUnits ?? 100;

  // PPF data per player
  const ppfData = useMemo(() => {
    const players: { name: string; prod1: number; prod2: number; points: { good1: number; good2: number }[] }[] = [];
    for (const player of data.players) {
      // Get productivity from first round result
      const firstResult = completedRounds[0]?.results?.find(r => r.playerId === player.id);
      if (!firstResult) continue;
      const p1 = firstResult.resultData?.productivity1 ?? 1;
      const p2 = firstResult.resultData?.productivity2 ?? 1;
      const ppf: { good1: number; good2: number }[] = [];
      for (let l1 = 0; l1 <= laborUnits; l1 += laborUnits / 20) {
        ppf.push({
          good1: l1 * p1,
          good2: (laborUnits - l1) * p2,
        });
      }

      // Actual production choices across rounds
      const actuals = completedRounds.map(round => {
        const r = round.results?.find(res => res.playerId === player.id);
        return r ? {
          good1: r.resultData?.good1Produced ?? 0,
          good2: r.resultData?.good2Produced ?? 0,
        } : null;
      }).filter(Boolean) as { good1: number; good2: number }[];

      players.push({
        name: player.name || 'Unknown',
        prod1: p1,
        prod2: p2,
        points: actuals,
      });
    }
    return players;
  }, [data.players, completedRounds, laborUnits]);

  // Specialization over rounds
  const specializationData = useMemo(() => {
    return completedRounds.map(round => {
      const row: Record<string, any> = { round: round.roundNumber };
      for (const r of round.results || []) {
        const name = data.players.find(p => p.id === r.playerId)?.name || r.playerId.slice(0, 6);
        const labor1 = r.resultData?.laborGood1 ?? 0;
        row[name] = parseFloat(((labor1 / laborUnits) * 100).toFixed(1));
      }
      return row;
    });
  }, [completedRounds, data.players, laborUnits]);

  // Utility comparison: autarky vs actual
  const utilityComparison = useMemo(() => {
    const playerData: { name: string; autarky: number; actual: number }[] = [];
    for (const player of data.players) {
      const autarkies: number[] = [];
      const actuals: number[] = [];
      for (const round of completedRounds) {
        const r = round.results?.find(res => res.playerId === player.id);
        if (r) {
          autarkies.push(r.resultData?.autarkyUtility ?? 0);
          actuals.push(r.resultData?.utility ?? 0);
        }
      }
      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
      playerData.push({
        name: player.name || 'Unknown',
        autarky: parseFloat(avg(autarkies).toFixed(2)),
        actual: parseFloat(avg(actuals).toFixed(2)),
      });
    }
    return playerData;
  }, [data.players, completedRounds]);

  const playerNames = useMemo(() => data.players.map(p => p.name || p.id.slice(0, 6)), [data.players]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* PPF with actual choices */}
      {ppfData.length > 0 && (
        <ChartCard title="Production Possibilities Frontier" description="PPF curves with actual production choices (dots)">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT + 50}>
            <ScatterChart margin={{ ...CHART_MARGINS, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="good1" type="number" name={gameConfig.good1Name || 'Good 1'} label={{ value: gameConfig.good1Name || 'Good 1', position: 'insideBottom', offset: -5 }} />
              <YAxis dataKey="good2" type="number" name={gameConfig.good2Name || 'Good 2'} label={{ value: gameConfig.good2Name || 'Good 2', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              {ppfData.map((player, i) => (
                <React.Fragment key={player.name}>
                  <Scatter data={player.points} fill={getPlayerColor(i)} name={`${player.name} (actual)`} r={6} />
                </React.Fragment>
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Specialization pattern */}
      {specializationData.length > 0 && (
        <ChartCard title="Specialization Over Rounds" description="% of labor allocated to Good 1 — shows learning to specialize">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={specializationData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis domain={[0, 100]} label={{ value: '% Labor to Good 1', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Legend />
              {playerNames.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={getPlayerColor(i)} strokeWidth={2} dot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Utility comparison */}
      {utilityComparison.length > 0 && (
        <ChartCard title="Utility: Autarky vs Actual" description="Gains from specialization compared to equal-split autarky">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={utilityComparison} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" />
              <YAxis label={{ value: 'Utility', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="autarky" name="Autarky (50/50)" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default ComparativeAdvantageAnalytics;
