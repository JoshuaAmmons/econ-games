import React, { useMemo } from 'react';
import {
  ComposedChart, BarChart, Bar, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_MARGINS, formatCents } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

// Sized to be read on a projector
const TICK = { fontSize: 14 };
const HEIGHT = 380;
const TRADE = '#0ea5e9';
const MEAN = '#e5e7eb'; // light: the site is dark-themed
const FV = '#dc2626';

// The engine's defaults (AssetBubbleEngine.ts), used only when the session's settings leave them out
const DEFAULT_DIVIDENDS = [0, 8, 28, 60];
const DEFAULT_SHARES = 3;

const Stat: React.FC<{ value: string; label: string; sub?: string }> = ({ value, label, sub }) => (
  <div className="bg-white rounded-lg shadow p-4 text-center">
    <div className="text-3xl font-bold text-sky-700">{value}</div>
    <div className="text-sm font-medium text-gray-700 mt-1">{label}</div>
    {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
  </div>
);

/**
 * Asset Bubble (Smith, Suchanek and Williams 1988): trade prices against the fundamental value, which is the
 * expected dividend times the periods left and so falls by one expected dividend each period. All values in cents.
 */
const AssetBubbleAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const cfg = data.session.gameConfig || {};
  const numRounds = Number(data.session.numRounds || cfg.num_rounds || 15);
  const dividends: number[] = Array.isArray(cfg.dividend_values) && cfg.dividend_values.length ? cfg.dividend_values : DEFAULT_DIVIDENDS;
  const expectedDividend = dividends.reduce((s, v) => s + Number(v), 0) / dividends.length;

  const periods = useMemo(() => {
    return [...completedRounds]
      .sort((a, b) => a.roundNumber - b.roundNumber)
      .map(round => {
        // one 'trade' action per side; the buyer's record stands for the trade
        const trades = (round.actions || [])
          .filter(a => a.actionType === 'trade' && a.actionData?.role === 'buyer')
          .map(a => ({ price: Number(a.actionData.price), time: new Date(a.time).getTime() }))
          .sort((a, b) => a.time - b.time);
        const first = (round.results || [])[0]?.resultData || {};
        // the fundamental value going into the period, as the engine computed it; the settings are the fallback
        const fv = first.fundamental_value_before != null
          ? Number(first.fundamental_value_before)
          : expectedDividend * (numRounds - round.roundNumber + 1);
        const prices = trades.map(t => t.price).sort((a, b) => a - b);
        const mean = prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : null;
        const median = prices.length ? (prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2) : null;
        return {
          period: round.roundNumber,
          label: `P${round.roundNumber}`,
          trades,
          volume: trades.length,
          mean: mean != null ? parseFloat(mean.toFixed(1)) : null,
          median,
          fv: parseFloat(fv.toFixed(2)),
          dividend: first.dividend != null ? Number(first.dividend) : null,
        };
      });
  }, [completedRounds, expectedDividend, numRounds]);

  // shares outstanding: the sum of holdings after any period (trades move shares, never create them)
  const sharesOutstanding = useMemo(() => {
    const firstRound = [...completedRounds].sort((a, b) => a.roundNumber - b.roundNumber).find(r => (r.results || []).length);
    if (firstRound) {
      const total = (firstRound.results || []).reduce((s, r) => s + Number(r.resultData?.shares ?? 0), 0);
      if (total > 0) return total;
    }
    return Number(cfg.shares_per_player ?? DEFAULT_SHARES) * data.players.length;
  }, [completedRounds, cfg, data.players.length]);

  const dots = useMemo(() => periods.flatMap(p =>
    p.trades.map((t, i) => ({ x: p.period - 0.38 + (0.76 * (i + 0.5)) / p.trades.length, y: t.price }))
  ), [periods]);

  const meanLine = useMemo(() => periods.filter(p => p.mean != null).map(p => ({ x: p.period, y: p.mean })), [periods]);

  // the fundamental value as a step: flat across each period, dropping at the boundary
  const fvStep = useMemo(() => periods.flatMap(p => [{ x: p.period - 0.5, y: p.fv }, { x: p.period + 0.5, y: p.fv }]), [periods]);

  if (periods.length === 0) return null;

  const totalTrades = periods.reduce((s, p) => s + p.volume, 0);
  const above = periods.filter(p => p.mean != null && p.mean > p.fv);
  const traded = periods.filter(p => p.mean != null);
  const peak = traded.reduce<typeof periods[number] | null>((m, p) => (!m || (p.mean! - p.fv) > (m.mean! - m.fv) ? p : m), null);
  const lastPeriod = periods[periods.length - 1].period;
  const ticks = periods.map(p => p.period);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat value={`${totalTrades}`} label="Trades" sub={`turnover ${(totalTrades / Math.max(1, sharesOutstanding)).toFixed(1)}x the ${sharesOutstanding} shares`} />
        <Stat value={`${above.length} of ${traded.length}`} label="Periods priced above fundamental value" sub="average trade price above the value" />
        <Stat value={peak ? formatCents(peak.mean) : '-'} label={peak ? `Average price in period ${peak.period}` : 'No trades'}
              sub={peak ? `fundamental value ${formatCents(peak.fv)}; the period priced highest against its value` : undefined} />
        <Stat value={formatCents(expectedDividend)} label="Expected dividend a period"
              sub={`the value falls by this much each period, to 0 after period ${numRounds}`} />
      </div>

      <ChartCard title="Prices Against Fundamental Value"
                 description={`Each dot is a trade, in time order within its period; the white line is the period's average price. The red step is the fundamental value: the expected dividend (${formatCents(expectedDividend)}) times the periods left.`}>
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <ComposedChart margin={CHART_MARGINS}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="x" type="number" domain={[0.5, lastPeriod + 0.5]} ticks={ticks} tick={TICK}
                   tickFormatter={(v: any) => `P${v}`} />
            <YAxis dataKey="y" type="number" tick={TICK} tickFormatter={formatCents}
                   label={{ value: 'Cents per share', angle: -90, position: 'insideLeft', fontSize: 14 }} />
            <Tooltip formatter={(v: any, name: any) => [formatCents(v), name]} labelFormatter={() => ''} />
            <Legend wrapperStyle={{ fontSize: 14 }} />
            <Line data={fvStep} dataKey="y" name="Fundamental value" stroke={FV} strokeWidth={3} dot={false} isAnimationActive={false} />
            <Scatter data={dots} dataKey="y" name="Trade price" fill={TRADE} fillOpacity={0.6} />
            <Line data={meanLine} dataKey="y" name="Average price" stroke={MEAN} strokeWidth={3} dot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Trading Volume"
                 description={`Trades each period. ${sharesOutstanding} shares are outstanding, so the session's ${totalTrades} trades turned the stock over ${(totalTrades / Math.max(1, sharesOutstanding)).toFixed(1)} times.`}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={periods} margin={{ ...CHART_MARGINS, top: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={TICK} />
            <YAxis allowDecimals={false} tick={TICK} label={{ value: 'Trades', angle: -90, position: 'insideLeft', fontSize: 14 }} />
            <Tooltip formatter={(v: any) => [v, 'Trades']} />
            <Bar dataKey="volume" name="Trades" fill={TRADE} radius={[4, 4, 0, 0]}>
              <LabelList dataKey="volume" position="top" style={{ fontSize: 15, fill: '#e5e7eb', fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

export default AssetBubbleAnalytics;
