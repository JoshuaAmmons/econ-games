import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { ChartCard } from '../components/charts/ChartCard';
import {
  CHART_COLORS, PROFIT_COLORS, CHART_HEIGHT, CHART_MARGINS,
  formatDollar, getPlayerColor, computePerRoundProfits,
} from '../components/charts/chartUtils';
import type { AnalyticsData } from '../hooks/useAnalyticsData';

const DA_GAME_TYPES = ['double_auction', 'double_auction_tax', 'double_auction_price_controls'];

interface Props {
  data: AnalyticsData;
  completedRounds: AnalyticsData['rounds'];
}

/**
 * Cumulative Profit Over Rounds — line chart with one line per player
 */
export const CumulativeProfitChart: React.FC<Props> = ({ data, completedRounds }) => {
  const isDA = DA_GAME_TYPES.includes(data.session.gameType);

  const chartData = useMemo(() => {
    const profitMap = computePerRoundProfits(data.players, completedRounds, isDA);
    const roundNumbers = completedRounds.map(r => r.roundNumber).sort((a, b) => a - b);

    return roundNumbers.map((rn, idx) => {
      const point: Record<string, any> = { round: rn };
      for (const player of data.players) {
        const perRound = profitMap.get(player.id) || [];
        let cumulative = 0;
        for (let i = 0; i <= idx && i < perRound.length; i++) {
          cumulative += perRound[i];
        }
        point[player.id] = parseFloat(cumulative.toFixed(2));
      }
      return point;
    });
  }, [data.players, completedRounds, isDA]);

  if (completedRounds.length === 0) return null;

  return (
    <ChartCard title="Cumulative Profit Over Rounds" description="Each line represents one player's running total profit">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={chartData} margin={CHART_MARGINS}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
          <YAxis tickFormatter={formatDollar} />
          <Tooltip formatter={(value: any) => formatDollar(value)} />
          <Legend />
          <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
          {data.players.map((player, i) => (
            <Line
              key={player.id}
              type="monotone"
              dataKey={player.id}
              name={player.name || `Player ${i + 1}`}
              stroke={getPlayerColor(i)}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

/**
 * Profit Distribution — histogram of final profits
 */
export const ProfitDistributionChart: React.FC<Props> = ({ data }) => {
  const chartData = useMemo(() => {
    const profits = data.players.map(p => p.totalProfit);
    if (profits.length === 0) return [];

    const min = Math.floor(Math.min(...profits));
    const max = Math.ceil(Math.max(...profits));
    const range = max - min || 1;
    const binCount = Math.min(10, Math.max(3, Math.ceil(Math.sqrt(profits.length))));
    const binSize = range / binCount;

    const bins: { label: string; count: number; midpoint: number }[] = [];
    for (let i = 0; i < binCount; i++) {
      const lo = min + i * binSize;
      const hi = lo + binSize;
      bins.push({
        label: `$${lo.toFixed(0)}-${hi.toFixed(0)}`,
        midpoint: (lo + hi) / 2,
        count: profits.filter(p => p >= lo && (i === binCount - 1 ? p <= hi : p < hi)).length,
      });
    }
    return bins;
  }, [data.players]);

  if (data.players.length === 0) return null;

  return (
    <ChartCard title="Profit Distribution" description="How total profits are distributed across players">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={chartData} margin={CHART_MARGINS}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} label={{ value: 'Players', angle: -90, position: 'insideLeft' }} />
          <Tooltip />
          <Bar dataKey="count" name="Number of Players" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.midpoint >= 0 ? PROFIT_COLORS.positive : PROFIT_COLORS.negative} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

/**
 * Player Ranking — horizontal bar chart sorted by profit
 */
export const PlayerRankingChart: React.FC<Props> = ({ data }) => {
  const chartData = useMemo(() => {
    return [...data.players]
      .sort((a, b) => a.totalProfit - b.totalProfit) // ascending for horizontal layout
      .map((p, i, arr) => ({
        name: p.name || `Player ${arr.length - i}`,
        profit: parseFloat(p.totalProfit.toFixed(2)),
        role: p.role,
        rank: arr.length - i,
      }));
  }, [data.players]);

  if (data.players.length === 0) return null;

  const height = Math.max(CHART_HEIGHT, data.players.length * 35 + 60);

  return (
    <ChartCard title="Player Ranking" description="Total profit by player, sorted highest to lowest">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} layout="vertical" margin={{ ...CHART_MARGINS, left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis type="number" tickFormatter={formatDollar} />
          <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value: any) => formatDollar(value)} />
          <ReferenceLine x={0} stroke="#999" />
          <Bar dataKey="profit" name="Total Profit" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, i) => {
              const rank = chartData.length - i;
              let fill = entry.profit >= 0 ? PROFIT_COLORS.positive : PROFIT_COLORS.negative;
              if (rank === 1) fill = '#eab308'; // gold
              else if (rank === 2) fill = '#9ca3af'; // silver
              else if (rank === 3) fill = '#f97316'; // bronze
              return <Cell key={i} fill={fill} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

/**
 * Round Summary Table — key metrics per round
 */
export const RoundSummaryChart: React.FC<Props> = ({ data, completedRounds }) => {
  const isDA = DA_GAME_TYPES.includes(data.session.gameType);

  const chartData = useMemo(() => {
    return completedRounds.map(round => {
      const row: Record<string, any> = { round: `R${round.roundNumber}` };

      if (isDA && round.trades) {
        row.trades = round.trades.length;
        row.avgPrice = round.trades.length > 0
          ? parseFloat((round.trades.reduce((s, t) => s + Number(t.price), 0) / round.trades.length).toFixed(2))
          : 0;
        row.totalSurplus = parseFloat(
          round.trades.reduce((s, t) => s + Number(t.buyerProfit) + Number(t.sellerProfit), 0).toFixed(2)
        );
      } else if (round.results) {
        row.players = round.results.length;
        row.avgProfit = round.results.length > 0
          ? parseFloat((round.results.reduce((s, r) => s + r.profit, 0) / round.results.length).toFixed(2))
          : 0;
        row.totalProfit = parseFloat(round.results.reduce((s, r) => s + r.profit, 0).toFixed(2));
      }
      return row;
    });
  }, [completedRounds, isDA]);

  if (completedRounds.length === 0) return null;

  return (
    <ChartCard title="Round Summary" description={isDA ? 'Trade volume, average price, and surplus per round' : 'Average and total profit per round'}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={chartData} margin={CHART_MARGINS}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="round" />
          <Tooltip formatter={(value: any) => formatDollar(value)} />
          <Legend />
          {isDA ? (
            <>
              <YAxis yAxisId="left" tickFormatter={formatDollar} />
              <YAxis yAxisId="right" orientation="right" />
              <Bar yAxisId="left" dataKey="avgPrice" name="Avg Price" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              <Bar yAxisId="left" dataKey="totalSurplus" name="Total Surplus" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="trades" name="# Trades" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
            </>
          ) : (
            <>
              <YAxis tickFormatter={formatDollar} />
              <Bar dataKey="avgProfit" name="Avg Profit" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="totalProfit" name="Total Profit" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
            </>
          )}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};
