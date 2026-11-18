import React, { useMemo } from 'react';
import {
  ComposedChart, BarChart, Bar, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_MARGINS, formatDollar } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

// Sized to be read on a projector
const TICK = { fontSize: 14 };
const HEIGHT = 340;
const ORDER = '#0ea5e9';
const BEST = '#059669';
const MEAN = '#d1d5db';
const DEMAND = '#f59e0b';
// the site is dark-themed: the average-order line must be light
const AVG = '#e5e7eb';

const Stat: React.FC<{ value: string; label: string; sub?: string }> = ({ value, label, sub }) => (
  <div className="bg-white rounded-lg shadow p-4 text-center">
    <div className="text-3xl font-bold text-sky-700">{value}</div>
    <div className="text-sm font-medium text-gray-700 mt-1">{label}</div>
    {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
  </div>
);

/**
 * Newsvendor: the debrief is the pull to centre. Orders sit between mean demand and the profit-maximising order
 * (Schweitzer and Cachon 2000). The best order and mean demand are taken from the round results, which the engine
 * computes from the session's prices; the session settings are the fallback.
 */
const NewsvendorAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const cfg = data.session.gameConfig || {};

  const params = useMemo(() => {
    const first = completedRounds.flatMap(r => r.results || []).find(r => r.resultData?.orderQuantity != null)?.resultData || {};
    const price = Number(first.sellingPrice ?? cfg.sellingPrice ?? 10);
    const cost = Number(first.unitCost ?? cfg.unitCost ?? 5);
    const salvage = Number(first.salvageValue ?? cfg.salvageValue ?? 1);
    const dMin = Number(cfg.demandMin ?? 0);
    const dMax = Number(cfg.demandMax ?? 100);
    // the engine's own rule: Q* = demandMin + (demandMax - demandMin) x critical ratio, rounded
    const best = Number(first.optimalQuantity ?? Math.round(dMin + (dMax - dMin) * ((price - cost) / (price - salvage))));
    const mean = Number(first.demandMean ?? Math.round((dMin + dMax) / 2));
    return { price, cost, salvage, best, mean };
  }, [completedRounds, cfg]);

  const profitFor = (q: number, d: number) =>
    Math.min(q, d) * params.price + Math.max(0, q - d) * params.salvage - q * params.cost;

  const rounds = useMemo(() => {
    return [...completedRounds]
      .sort((a, b) => a.roundNumber - b.roundNumber)
      .map(round => {
        const rs = (round.results || []).filter(r => r.resultData?.orderQuantity != null);
        const orders = rs.map(r => Number(r.resultData.orderQuantity));
        const demand = rs.length ? Number(rs[0].resultData.demand) : null;
        const avgOrder = orders.length ? orders.reduce((s, o) => s + o, 0) / orders.length : null;
        const avgProfit = rs.length ? rs.reduce((s, r) => s + Number(r.profit), 0) / rs.length : null;
        return {
          round: round.roundNumber,
          label: `R${round.roundNumber}`,
          orders,
          demand,
          avgOrder: avgOrder != null ? parseFloat(avgOrder.toFixed(1)) : null,
          avgProfit: avgProfit != null ? parseFloat(avgProfit.toFixed(2)) : null,
          bestProfit: demand != null ? parseFloat(profitFor(params.best, demand).toFixed(2)) : null,
        };
      })
      .filter(r => r.orders.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedRounds, params]);

  // every order as a dot, spread a little within its round so equal orders stay visible (golden-ratio steps
  // scatter them evenly; spreading them in sorted order would draw slanted streaks that look like data)
  const dots = useMemo(() => rounds.flatMap(r =>
    r.orders.map((o, i) => ({ x: r.round - 0.3 + 0.6 * ((i * 0.618034) % 1), y: o }))
  ), [rounds]);

  const avgLine = useMemo(() => rounds.map(r => ({ x: r.round, y: r.avgOrder })), [rounds]);

  const histogram = useMemo(() => {
    const all = rounds.flatMap(r => r.orders);
    if (all.length === 0) return { bins: [] as { bin: string; count: number }[], meanBin: '', bestBin: '' };
    const w = 5;
    const lo = Math.floor(Math.min(...all, params.mean, params.best) / w) * w;
    const hi = Math.floor(Math.max(...all, params.mean, params.best) / w) * w;
    const name = (a: number) => `${a}-${a + w - 1}`;
    const bins = [];
    for (let a = lo; a <= hi; a += w) bins.push({ bin: name(a), count: all.filter(o => o >= a && o < a + w).length });
    return { bins, meanBin: name(Math.floor(params.mean / w) * w), bestBin: name(Math.floor(params.best / w) * w) };
  }, [rounds, params]);

  if (rounds.length === 0) return null;

  const allOrders = rounds.flatMap(r => r.orders);
  const avgOrder = allOrders.reduce((s, o) => s + o, 0) / allOrders.length;
  const below = allOrders.filter(o => o < params.best).length;
  const classProfit = rounds.reduce((s, r) => s + (r.avgProfit ?? 0), 0) / rounds.length;
  const bestProfit = rounds.reduce((s, r) => s + (r.bestProfit ?? 0), 0) / rounds.length;
  const maxRound = rounds[rounds.length - 1].round;
  const roundTicks = rounds.map(r => r.round);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat value={`${params.best}`} label="Best order" sub={`maximises expected profit at $${params.price} price, $${params.cost} cost, $${params.salvage} salvage`} />
        <Stat value={`${params.mean}`} label="Mean demand" />
        <Stat value={avgOrder.toFixed(1)} label="Average order" sub={`${allOrders.length} orders, all rounds`} />
        <Stat value={`${below} of ${allOrders.length}`} label="Orders below the best order" sub={`${Math.round((100 * below) / allOrders.length)}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Orders Against the Best Order"
                   description={`Each dot is one order; the line is the average order each round. The best order is ${params.best}; mean demand is ${params.mean}.`}>
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <ComposedChart margin={{ ...CHART_MARGINS, right: 120 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="x" type="number" domain={[0.5, maxRound + 0.5]} ticks={roundTicks} tick={TICK}
                     tickFormatter={(v: any) => `R${v}`} />
              <YAxis dataKey="y" type="number" tick={TICK} label={{ value: 'Order', angle: -90, position: 'insideLeft', fontSize: 14 }} />
              <Tooltip formatter={(v: any) => [Number(v).toFixed(1), 'Order']} labelFormatter={() => ''} />
              <Legend wrapperStyle={{ fontSize: 14 }} />
              <ReferenceLine y={params.best} stroke={BEST} strokeWidth={2} strokeDasharray="6 4"
                             label={{ value: `Best order ${params.best}`, position: 'right', fontSize: 14, fill: BEST }} />
              <ReferenceLine y={params.mean} stroke={MEAN} strokeWidth={2} strokeDasharray="4 4"
                             label={{ value: `Mean demand ${params.mean}`, position: 'right', fontSize: 14, fill: MEAN }} />
              <Scatter data={dots} dataKey="y" name="Order" fill={ORDER} fillOpacity={0.55} />
              <Line data={avgLine} dataKey="y" name="Average order" stroke={AVG} strokeWidth={3} dot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="All Orders"
                   description={`How many orders fell in each range of five, all rounds, with mean demand (${params.mean}) and the best order (${params.best}) marked`}>
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <BarChart data={histogram.bins} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="bin" tick={{ fontSize: 12 }} interval={0} angle={-30} textAnchor="end" height={50} />
              <YAxis allowDecimals={false} tick={TICK} label={{ value: 'Orders', angle: -90, position: 'insideLeft', fontSize: 14 }} />
              <Tooltip formatter={(v: any) => [v, 'Orders']} />
              <ReferenceLine x={histogram.meanBin} stroke={MEAN} strokeWidth={2} strokeDasharray="4 4"
                             label={{ value: 'Mean demand', position: 'insideTopRight', fontSize: 14, fill: MEAN }} />
              <ReferenceLine x={histogram.bestBin} stroke={BEST} strokeWidth={2} strokeDasharray="6 4"
                             label={{ value: 'Best order', position: 'insideTopLeft', fontSize: 14, fill: BEST }} />
              <Bar dataKey="count" name="Orders" fill={ORDER} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Demand Each Round"
                   description="The demand drawn each round, the same for every student; the line is the average order">
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <ComposedChart data={rounds} margin={{ ...CHART_MARGINS, right: 90 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={TICK} />
              <YAxis tick={TICK} label={{ value: 'Units', angle: -90, position: 'insideLeft', fontSize: 14 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 14 }} />
              <ReferenceLine y={params.mean} stroke={MEAN} strokeWidth={2} strokeDasharray="4 4"
                             label={{ value: `Mean ${params.mean}`, position: 'right', fontSize: 14, fill: MEAN }} />
              <Bar dataKey="demand" name="Demand" fill={DEMAND} radius={[4, 4, 0, 0]} />
              <Line dataKey="avgOrder" name="Average order" stroke={AVG} strokeWidth={3} dot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Profit: the Class Against the Best Order"
                   description={`Average profit per student each round, and the profit the best order (${params.best}) would have made on the same demand. Over the session: ${formatDollar(classProfit)} against ${formatDollar(bestProfit)} a round. The best order is best on average over all the demands that can come up, not in every round.`}>
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <BarChart data={rounds} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={TICK} />
              <YAxis tickFormatter={formatDollar} tick={TICK} />
              <Tooltip formatter={(v: any, name: any) => [formatDollar(v), name]} />
              <Legend wrapperStyle={{ fontSize: 14 }} />
              <ReferenceLine y={0} stroke="#999" />
              <Bar dataKey="avgProfit" name="Class average" fill={ORDER} radius={[4, 4, 0, 0]} />
              <Bar dataKey="bestProfit" name={`Best order (${params.best})`} fill={BEST} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
};

export default NewsvendorAnalytics;
