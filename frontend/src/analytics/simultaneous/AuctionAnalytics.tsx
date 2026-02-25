import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  ScatterChart, Scatter, Cell,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar, PROFIT_COLORS } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const AuctionAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const numPlayers = data.players.length || 2;

  // Bids vs Values scatter (each point is a player-round)
  const bidsVsValues = useMemo(() => {
    const points: { valuation: number; bid: number; round: number; player: string }[] = [];
    for (const round of completedRounds) {
      for (const r of round.results || []) {
        const valuation = r.resultData?.valuation ?? 0;
        const bid = r.resultData?.bid ?? 0;
        const player = data.players.find(p => p.id === r.playerId)?.name || r.playerId.slice(0, 6);
        points.push({ valuation, bid, round: round.roundNumber, player });
      }
    }
    return points;
  }, [completedRounds, data.players]);

  // Max value for 45-degree reference line
  const maxVal = useMemo(() => {
    if (bidsVsValues.length === 0) return 100;
    return Math.max(...bidsVsValues.map(p => Math.max(p.valuation, p.bid))) * 1.1;
  }, [bidsVsValues]);

  // 45-degree line data (bid = value)
  const diagonalLine = useMemo(() => {
    return [
      { valuation: 0, bid: 0 },
      { valuation: maxVal, bid: maxVal },
    ];
  }, [maxVal]);

  // Bid Shading Over Rounds: average bid/value ratio per round
  const bidShadingData = useMemo(() => {
    // For first-price auctions, the optimal bid is (n-1)/n * value
    const optimalRatio = (numPlayers - 1) / numPlayers;
    return completedRounds.map(round => {
      const results = round.results || [];
      const ratios: number[] = [];
      for (const r of results) {
        const value = r.resultData?.valuation ?? 0;
        const bid = r.resultData?.bid ?? 0;
        if (value > 0) {
          ratios.push(bid / value);
        }
      }
      const avgRatio = ratios.length > 0
        ? ratios.reduce((s, v) => s + v, 0) / ratios.length
        : 0;
      return {
        round: round.roundNumber,
        avgBidValueRatio: parseFloat((avgRatio * 100).toFixed(1)),
        optimalRatio: parseFloat((optimalRatio * 100).toFixed(1)),
      };
    });
  }, [completedRounds, numPlayers]);

  // Winner's Profit per round
  const winnerProfitData = useMemo(() => {
    return completedRounds.map(round => {
      const results = round.results || [];
      const winners = results.filter(r => r.resultData?.isWinner);
      if (winners.length === 0) {
        return {
          round: `R${round.roundNumber}`,
          roundNum: round.roundNumber,
          winnerProfit: 0,
          winnerValue: 0,
          pricePaid: 0,
        };
      }
      // Usually one winner per round
      const winner = winners[0];
      const winnerValuation = winner.resultData?.valuation ?? 0;
      const pricePaid = winner.resultData?.pricePaid ?? winner.resultData?.bid ?? 0;
      const profit = winnerValuation - pricePaid;
      return {
        round: `R${round.roundNumber}`,
        roundNum: round.roundNumber,
        winnerProfit: parseFloat(profit.toFixed(2)),
        winnerValue: parseFloat(winnerValuation.toFixed(2)),
        pricePaid: parseFloat(pricePaid.toFixed(2)),
      };
    });
  }, [completedRounds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Bids vs Values Scatter */}
      {bidsVsValues.length > 0 && (
        <ChartCard title="Bids vs Values" description="Each point is a player-round. Points below the 45-degree line indicate bid shading.">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ScatterChart margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="valuation"
                type="number"
                name="Private Value"
                tickFormatter={formatDollar}
                domain={[0, 'auto']}
                label={{ value: 'Private Value', position: 'insideBottom', offset: -2 }}
              />
              <YAxis
                dataKey="bid"
                type="number"
                name="Bid"
                tickFormatter={formatDollar}
                domain={[0, 'auto']}
                label={{ value: 'Bid', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              {/* 45-degree reference line (bid = value) */}
              <Scatter
                data={diagonalLine}
                fill="none"
                line={{ stroke: '#94a3b8', strokeWidth: 2, strokeDasharray: '5 5' }}
                name="Bid = Value"
                r={0}
                legendType="line"
              />
              <Scatter
                data={bidsVsValues}
                fill={CHART_COLORS[0]}
                name="Player Bids"
                r={5}
                fillOpacity={0.7}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Bid Shading Over Rounds */}
      {bidShadingData.length > 0 && (
        <ChartCard title="Bid Shading Over Rounds" description={`Avg bid/value ratio. Optimal for first-price: ${((numPlayers - 1) / numPlayers * 100).toFixed(0)}% = (n-1)/n`}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={bidShadingData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis
                domain={[0, 110]}
                label={{ value: 'Bid/Value %', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Legend />
              <ReferenceLine
                y={((numPlayers - 1) / numPlayers) * 100}
                stroke="#10b981"
                strokeDasharray="5 5"
                label={{ value: `Optimal (${((numPlayers - 1) / numPlayers * 100).toFixed(0)}%)`, fill: '#10b981', fontSize: 10, position: 'right' }}
              />
              <ReferenceLine
                y={100}
                stroke="#ef4444"
                strokeDasharray="5 5"
                label={{ value: 'Bid = Value', fill: '#ef4444', fontSize: 10, position: 'right' }}
              />
              <Line
                type="monotone"
                dataKey="avgBidValueRatio"
                name="Avg Bid/Value %"
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Winner's Profit */}
      {winnerProfitData.length > 0 && (
        <ChartCard title="Winner's Profit by Round" description="Winning bidder's surplus (value - price paid). Negative = winner's curse.">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={winnerProfitData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip
                formatter={(value: any, name: any) => formatDollar(value)}
              />
              <Legend />
              <ReferenceLine y={0} stroke="#999" />
              <Bar dataKey="winnerProfit" name="Winner's Profit" radius={[4, 4, 0, 0]}>
                {winnerProfitData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.winnerProfit >= 0 ? PROFIT_COLORS.positive : PROFIT_COLORS.negative}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default AuctionAnalytics;
