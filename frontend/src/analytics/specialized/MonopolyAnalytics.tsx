import React, { useMemo } from 'react';
import {
  Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, Scatter, ComposedChart,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const MonopolyAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const a = gameConfig.demandIntercept ?? 100;
  const b = gameConfig.demandSlope ?? 1;
  const mc = gameConfig.marginalCost ?? 10;
  const fc = gameConfig.fixedCost ?? 0;

  // Theoretical benchmarks
  const optQty = (a - mc) / (2 * b);
  const optPrice = a - b * optQty;
  const optProfit = (optPrice - mc) * optQty - fc;
  const compQty = (a - mc) / b;

  // Demand, MR, MC curves
  const curveData = useMemo(() => {
    const maxQ = compQty * 1.2;
    const points = [];
    for (let q = 0; q <= maxQ; q += maxQ / 50) {
      points.push({
        qty: parseFloat(q.toFixed(1)),
        demand: parseFloat(Math.max(0, a - b * q).toFixed(2)),
        mr: parseFloat(Math.max(0, a - 2 * b * q).toFixed(2)),
        mc: mc,
      });
    }
    return points;
  }, [a, b, mc, compQty]);

  // Actual outcomes per round
  const actualOutcomes = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      if (results.length === 0) return null;
      const r = results[0];
      return {
        qty: parseFloat((r.resultData?.quantity ?? 0).toFixed(1)),
        price: parseFloat((r.resultData?.price ?? 0).toFixed(2)),
        round: round.roundNumber,
      };
    }).filter(Boolean);
  }, [completedRounds]);

  // Profit vs optimal per round
  const profitComparison = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const profit = results.length > 0 ? results[0].profit : 0;
      return {
        round: `R${round.roundNumber}`,
        actual: parseFloat(profit.toFixed(2)),
        optimal: parseFloat(optProfit.toFixed(2)),
      };
    });
  }, [completedRounds, optProfit]);

  // DWL over rounds
  const dwlData = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const dwl = results.length > 0 ? (results[0].resultData?.deadweightLoss ?? 0) : 0;
      return {
        round: round.roundNumber,
        dwl: parseFloat(dwl.toFixed(2)),
      };
    });
  }, [completedRounds]);

  // Surplus decomposition
  const surplusData = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      if (results.length === 0) return null;
      const r = results[0];
      return {
        round: `R${round.roundNumber}`,
        cs: parseFloat((r.resultData?.consumerSurplus ?? 0).toFixed(2)),
        profit: parseFloat(r.profit.toFixed(2)),
        dwl: parseFloat((r.resultData?.deadweightLoss ?? 0).toFixed(2)),
      };
    }).filter(Boolean);
  }, [completedRounds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Demand, MR, MC with actual outcomes */}
      {curveData.length > 0 && (
        <ChartCard title="Demand, MR, MC & Actual Outcomes" description="Actual (Q, P) choices plotted on the theoretical curves">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ComposedChart margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="qty" type="number" label={{ value: 'Quantity', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <Line data={curveData} type="monotone" dataKey="demand" name="Demand" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
              <Line data={curveData} type="monotone" dataKey="mr" name="MR" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} strokeDasharray="5 5" />
              <Line data={curveData} type="monotone" dataKey="mc" name="MC" stroke={CHART_COLORS[3]} strokeWidth={2} dot={false} strokeDasharray="3 3" />
              {actualOutcomes.length > 0 && (
                <Scatter data={actualOutcomes} dataKey="price" name="Actual Choices" fill={CHART_COLORS[4]} r={7} />
              )}
              <ReferenceLine x={optQty} stroke="#8b5cf6" strokeDasharray="5 5" label={{ value: 'Q*', fill: '#8b5cf6', fontSize: 10 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Profit vs Optimal */}
      {profitComparison.length > 0 && (
        <ChartCard title="Actual vs Optimal Profit" description="How close are students to maximizing monopoly profit?">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={profitComparison} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <Bar dataKey="optimal" name="Optimal Profit" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actual Profit" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* DWL over rounds */}
      {dwlData.length > 0 && (
        <ChartCard title="Deadweight Loss Over Rounds" description="Social cost of monopoly pricing">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <AreaChart data={dwlData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Area type="monotone" dataKey="dwl" name="Deadweight Loss" fill={CHART_COLORS[3]} fillOpacity={0.3} stroke={CHART_COLORS[3]} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Surplus decomposition */}
      {surplusData && surplusData.length > 0 && (
        <ChartCard title="Surplus Decomposition" description="Consumer surplus + producer surplus + deadweight loss = total potential">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={surplusData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <Bar dataKey="cs" name="Consumer Surplus" stackId="a" fill={CHART_COLORS[0]} />
              <Bar dataKey="profit" name="Producer Surplus" stackId="a" fill={CHART_COLORS[2]} />
              <Bar dataKey="dwl" name="Deadweight Loss" stackId="a" fill={CHART_COLORS[3]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default MonopolyAnalytics;
