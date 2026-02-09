import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const PrincipalAgentAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};

  // Contract design over rounds
  const contractData = useMemo(() => {
    return completedRounds.map(round => {
      const principals = (round.results || []).filter(r => r.resultData?.role === 'principal');
      const wages = principals.map(r => r.resultData?.fixedWage ?? 0);
      const bonuses = principals.map(r => r.resultData?.bonus ?? 0);
      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
      return {
        round: round.roundNumber,
        avgWage: parseFloat(avg(wages).toFixed(2)),
        avgBonus: parseFloat(avg(bonuses).toFixed(2)),
      };
    });
  }, [completedRounds]);

  // Effort choice rate per round
  const effortData = useMemo(() => {
    return completedRounds.map(round => {
      const agents = (round.results || []).filter(r => r.resultData?.role === 'agent');
      const highEffort = agents.filter(r => r.resultData?.highEffort).length;
      return {
        round: round.roundNumber,
        highEffortPct: agents.length > 0 ? parseFloat(((highEffort / agents.length) * 100).toFixed(1)) : 0,
        highEffort,
        total: agents.length,
      };
    });
  }, [completedRounds]);

  // Bonus vs effort scatter
  const bonusEffortScatter = useMemo(() => {
    const points: { bonus: number; highEffort: number; round: number }[] = [];
    for (const round of completedRounds) {
      for (const r of round.results || []) {
        if (r.resultData?.role === 'agent') {
          points.push({
            bonus: r.resultData.bonus ?? 0,
            highEffort: r.resultData.highEffort ? 1 : 0,
            round: round.roundNumber,
          });
        }
      }
    }
    return points;
  }, [completedRounds]);

  // Output distribution pie
  const outputDist = useMemo(() => {
    let high = 0;
    let low = 0;
    for (const round of completedRounds) {
      for (const r of round.results || []) {
        if (r.resultData?.role === 'principal') {
          if (r.resultData.isHighOutput) high++;
          else low++;
        }
      }
    }
    return [
      { name: 'High Output', value: high, fill: CHART_COLORS[2] },
      { name: 'Low Output', value: low, fill: CHART_COLORS[3] },
    ];
  }, [completedRounds]);

  const theoreticalHighPct = useMemo(() => {
    // Expected: weighted average of highEffortProb and lowEffortProb based on actual effort choices
    const highProb = gameConfig.highEffortProb ?? 0.8;
    const lowProb = gameConfig.lowEffortProb ?? 0.2;
    const totalAgents = bonusEffortScatter.length;
    const highEffortCount = bonusEffortScatter.filter(p => p.highEffort === 1).length;
    if (totalAgents === 0) return 0;
    const pHigh = highEffortCount / totalAgents;
    return pHigh * highProb + (1 - pHigh) * lowProb;
  }, [bonusEffortScatter, gameConfig]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Contract design over rounds */}
      {contractData.length > 0 && (
        <ChartCard title="Contract Design Over Rounds" description="How principals adjust fixed wage and bonus offers">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={contractData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <Line type="monotone" dataKey="avgWage" name="Avg Fixed Wage" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="avgBonus" name="Avg Bonus" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Effort choice rate */}
      {effortData.length > 0 && (
        <ChartCard title="High Effort Choice Rate" description="Percentage of agents choosing high effort each round">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={effortData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis domain={[0, 100]} label={{ value: '% High Effort', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Bar dataKey="highEffortPct" name="High Effort %" radius={[4, 4, 0, 0]}>
                {effortData.map((entry, i) => (
                  <Cell key={i} fill={entry.highEffortPct >= 50 ? CHART_COLORS[2] : CHART_COLORS[3]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Bonus vs effort scatter */}
      {bonusEffortScatter.length > 0 && (
        <ChartCard title="Bonus vs Effort Response" description="Higher bonuses should incentivize more high effort (dots at 0 or 1)">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ScatterChart margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="bonus" type="number" name="Bonus" tickFormatter={formatDollar} label={{ value: 'Bonus ($)', position: 'insideBottom', offset: -2 }} />
              <YAxis dataKey="highEffort" type="number" name="High Effort" domain={[-0.1, 1.1]} ticks={[0, 1]} tickFormatter={(v: any) => v === 1 ? 'High' : 'Low'} />
              <Tooltip formatter={(value: any, name: any) => name === 'Bonus' ? formatDollar(value) : value === 1 ? 'High' : 'Low'} />
              <Scatter data={bonusEffortScatter} fill={CHART_COLORS[0]} name="Agent Response" r={6} fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Output distribution pie */}
      {(outputDist[0].value + outputDist[1].value) > 0 && (
        <ChartCard title="Output Distribution" description={`Actual vs expected: ${(theoreticalHighPct * 100).toFixed(0)}% high output predicted`}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <PieChart>
              <Pie
                data={outputDist}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                dataKey="value"
                label={({ name, value, percent }) => `${name}: ${value} (${(percent! * 100).toFixed(0)}%)`}
              >
                {outputDist.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default PrincipalAgentAnalytics;
