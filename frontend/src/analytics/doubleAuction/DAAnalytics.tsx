import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, Area, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, ComposedChart,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const DAAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const gameType = data.session.gameType;

  // Compute equilibrium from player valuations/costs
  const equilibrium = useMemo(() => {
    const buyers = data.players.filter(p => p.role === 'buyer' && p.valuation != null).map(p => p.valuation!);
    const sellers = data.players.filter(p => p.role === 'seller' && p.productionCost != null).map(p => p.productionCost!);
    if (buyers.length === 0 || sellers.length === 0) return null;

    const demand = [...buyers].sort((a, b) => b - a);
    const supply = [...sellers].sort((a, b) => a - b);

    let eqPrice = 0;
    let eqQty = 0;
    for (let i = 0; i < Math.min(demand.length, supply.length); i++) {
      if (demand[i] >= supply[i]) {
        eqQty = i + 1;
        eqPrice = (demand[i] + supply[i]) / 2;
      } else break;
    }

    const maxSurplus = demand.slice(0, eqQty).reduce((s, v, i) => s + (v - supply[i]), 0);
    return { price: eqPrice, quantity: eqQty, maxSurplus, demand, supply };
  }, [data.players]);

  // Trade price time series data
  const tradeTimeSeries = useMemo(() => {
    const points: { seq: number; price: number; round: number }[] = [];
    let seq = 0;
    for (const round of completedRounds) {
      if (round.trades) {
        for (const trade of round.trades) {
          seq++;
          points.push({ seq, price: trade.price, round: round.roundNumber });
        }
      }
    }
    return points;
  }, [completedRounds]);

  // Supply and Demand curves
  const sdCurves = useMemo(() => {
    if (!equilibrium) return [];
    const { demand, supply } = equilibrium;
    const maxLen = Math.max(demand.length, supply.length);
    const points = [];
    for (let i = 0; i <= maxLen; i++) {
      points.push({
        qty: i,
        demand: i < demand.length ? demand[i] : undefined,
        supply: i < supply.length ? supply[i] : undefined,
      });
    }
    return points;
  }, [equilibrium]);

  // Per-round efficiency
  const efficiencyData = useMemo(() => {
    if (!equilibrium) return [];
    return completedRounds.map(round => {
      const realized = round.trades
        ? round.trades.reduce((s, t) => s + t.buyerProfit + t.sellerProfit, 0)
        : 0;
      const efficiency = equilibrium.maxSurplus > 0 ? (realized / equilibrium.maxSurplus) * 100 : 0;
      return {
        round: `R${round.roundNumber}`,
        realized: parseFloat(realized.toFixed(2)),
        maximum: parseFloat(equilibrium.maxSurplus.toFixed(2)),
        efficiency: parseFloat(efficiency.toFixed(1)),
      };
    });
  }, [completedRounds, equilibrium]);

  // Price convergence
  const convergenceData = useMemo(() => {
    return completedRounds.map(round => {
      const prices = round.trades?.map(t => t.price) || [];
      const avg = prices.length > 0 ? prices.reduce((s, p) => s + p, 0) / prices.length : null;
      return {
        round: round.roundNumber,
        avgPrice: avg !== null ? parseFloat(avg.toFixed(2)) : null,
        volume: prices.length,
      };
    });
  }, [completedRounds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Trade Price Time Series */}
      {tradeTimeSeries.length > 0 && (
        <ChartCard title="Trade Prices Over Time" description="Each dot is a trade, with sequence across all rounds">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ComposedChart data={tradeTimeSeries} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="seq" label={{ value: 'Trade #', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              {equilibrium && (
                <ReferenceLine y={equilibrium.price} stroke="#ef4444" strokeDasharray="5 5" label={{ value: `Eq: ${formatDollar(equilibrium.price)}`, position: 'right', fill: '#ef4444', fontSize: 11 }} />
              )}
              <Scatter dataKey="price" fill={CHART_COLORS[0]} name="Trade Price" r={4} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Supply & Demand Curves */}
      {sdCurves.length > 0 && equilibrium && (
        <ChartCard title="Supply & Demand" description="Step functions from buyer valuations and seller costs">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={sdCurves} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="qty" label={{ value: 'Quantity', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <Line type="stepAfter" dataKey="demand" name="Demand (Valuations)" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} connectNulls />
              <Line type="stepAfter" dataKey="supply" name="Supply (Costs)" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} connectNulls />
              <ReferenceLine y={equilibrium.price} stroke="#ef4444" strokeDasharray="5 5" />
              <ReferenceLine x={equilibrium.quantity} stroke="#ef4444" strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Market Efficiency */}
      {efficiencyData.length > 0 && (
        <ChartCard title="Market Efficiency" description="Realized surplus vs. maximum possible surplus per round">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={efficiencyData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any, name: any) => name === 'efficiency' ? `${value}%` : formatDollar(value)} />
              <Legend />
              <Bar dataKey="maximum" name="Max Surplus" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="realized" name="Realized Surplus" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-2 mt-2 flex-wrap">
            {efficiencyData.map(d => (
              <span key={d.round} className="text-xs bg-gray-100 px-2 py-1 rounded">
                {d.round}: {d.efficiency}%
              </span>
            ))}
          </div>
        </ChartCard>
      )}

      {/* Price Convergence */}
      {convergenceData.length > 0 && (
        <ChartCard title="Price Convergence" description="Average trade price per round approaching equilibrium">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={convergenceData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              {equilibrium && (
                <ReferenceLine y={equilibrium.price} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Equilibrium', position: 'right', fill: '#ef4444', fontSize: 11 }} />
              )}
              <Line type="monotone" dataKey="avgPrice" name="Avg Trade Price" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Bid-Ask Spread — inferred from trade prices */}
      {tradeTimeSeries.length > 1 && (
        <ChartCard title="Trade Price Range by Round" description="Min, max, and average trade prices per round">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ComposedChart data={completedRounds.map(round => {
              const prices = round.trades?.map(t => t.price) || [];
              if (prices.length === 0) return null;
              return {
                round: round.roundNumber,
                min: Math.min(...prices),
                max: Math.max(...prices),
                avg: parseFloat((prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2)),
                spread: parseFloat((Math.max(...prices) - Math.min(...prices)).toFixed(2)),
              };
            }).filter(Boolean)} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <Area type="monotone" dataKey="max" stackId="range" fill={CHART_COLORS[0]} fillOpacity={0.15} stroke={CHART_COLORS[0]} name="Max Price" />
              <Area type="monotone" dataKey="min" stackId="range2" fill="#fff" fillOpacity={0} stroke={CHART_COLORS[1]} name="Min Price" />
              <Line type="monotone" dataKey="avg" stroke={CHART_COLORS[2]} strokeWidth={2} dot={{ r: 3 }} name="Avg Price" />
              {equilibrium && (
                <ReferenceLine y={equilibrium.price} stroke="#ef4444" strokeDasharray="5 5" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Tax Incidence (Tax/Subsidy only) */}
      {gameType === 'double_auction_tax' && (
        <ChartCard title="Tax Incidence" description="How the tax burden is shared between buyers and sellers">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={completedRounds.map(round => {
              const trades = round.trades || [];
              if (trades.length === 0) return null;
              const avgPrice = trades.reduce((s, t) => s + t.price, 0) / trades.length;
              const taxAmount = gameConfig.taxAmount || 0;
              const taxType = gameConfig.taxType || 'buyer';
              return {
                round: `R${round.roundNumber}`,
                tradePrice: parseFloat(avgPrice.toFixed(2)),
                buyerPays: parseFloat((taxType === 'buyer' ? avgPrice + taxAmount : avgPrice).toFixed(2)),
                sellerReceives: parseFloat((taxType === 'seller' ? avgPrice - taxAmount : avgPrice).toFixed(2)),
                taxWedge: Math.abs(taxAmount),
              };
            }).filter(Boolean)} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <Bar dataKey="buyerPays" name="Buyer Pays" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="sellerReceives" name="Seller Receives" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Price Controls Impact */}
      {gameType === 'double_auction_price_controls' && equilibrium && (
        <ChartCard title="Price Control Impact" description="Effect of price floor/ceiling on market outcomes">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={sdCurves} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="qty" label={{ value: 'Quantity', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(value: any) => formatDollar(value)} />
              <Legend />
              <Line type="stepAfter" dataKey="demand" name="Demand" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} connectNulls />
              <Line type="stepAfter" dataKey="supply" name="Supply" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} connectNulls />
              <ReferenceLine y={equilibrium.price} stroke="#6b7280" strokeDasharray="3 3" label={{ value: 'Equilibrium', fill: '#6b7280', fontSize: 10 }} />
              {gameConfig.controlPrice && (
                <ReferenceLine y={gameConfig.controlPrice} stroke="#ef4444" strokeWidth={2} label={{ value: `${gameConfig.controlType === 'floor' ? 'Floor' : 'Ceiling'}: ${formatDollar(gameConfig.controlPrice)}`, fill: '#ef4444', fontSize: 11, position: 'right' }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default DAAnalytics;
