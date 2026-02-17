import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_COLORS, CHART_HEIGHT, CHART_MARGINS, formatDollar, getPlayerColor } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

const DiscoveryProcessAnalytics: React.FC<AnalyticsProps> = ({ data, completedRounds }) => {
  const gameConfig = data.session.gameConfig || {};
  const numGoods = gameConfig.numGoods ?? 2;
  const goodNames: string[] = [];
  const goodColors: string[] = [];
  for (let i = 1; i <= numGoods; i++) {
    goodNames.push(gameConfig[`good${i}Name`] || `Good ${i}`);
    goodColors.push(gameConfig[`good${i}Color`] || CHART_COLORS[i - 1]);
  }

  const playerNames = useMemo(
    () => data.players.map(p => p.name || p.id.slice(0, 6)),
    [data.players],
  );

  // ---- Earnings Over Rounds (per player) ----
  const earningsOverRounds = useMemo(() => {
    return completedRounds.map(round => {
      const row: Record<string, any> = { round: round.roundNumber };
      for (const r of round.results || []) {
        const name = data.players.find(p => p.id === r.playerId)?.name || r.playerId.slice(0, 6);
        row[name] = Number(r.profit || 0);
      }
      return row;
    });
  }, [completedRounds, data.players]);

  // ---- Cumulative Earnings ----
  const cumulativeEarnings = useMemo(() => {
    const cumul: Record<string, number> = {};
    return completedRounds.map(round => {
      const row: Record<string, any> = { round: round.roundNumber };
      for (const r of round.results || []) {
        const name = data.players.find(p => p.id === r.playerId)?.name || r.playerId.slice(0, 6);
        cumul[name] = (cumul[name] || 0) + Number(r.profit || 0);
        row[name] = cumul[name];
      }
      return row;
    });
  }, [completedRounds, data.players]);

  // ---- Specialization Pattern (% allocation to Good 1) ----
  const specializationData = useMemo(() => {
    return completedRounds.map(round => {
      const row: Record<string, any> = { round: round.roundNumber };
      for (const a of round.actions || []) {
        if (a.actionType !== 'production') continue;
        const name = data.players.find(p => p.id === a.playerId)?.name || a.playerId.slice(0, 6);
        const allocation = a.actionData?.allocation as number[] | undefined;
        if (allocation && allocation.length > 0) {
          row[name] = parseFloat(allocation[0].toFixed(1));
        }
      }
      return row;
    });
  }, [completedRounds, data.players]);

  // ---- Complete Sets per Round ----
  const completeSetsData = useMemo(() => {
    return completedRounds.map(round => {
      const row: Record<string, any> = { round: round.roundNumber };
      for (const r of round.results || []) {
        const name = data.players.find(p => p.id === r.playerId)?.name || r.playerId.slice(0, 6);
        row[name] = r.resultData?.completeSets ?? 0;
      }
      return row;
    });
  }, [completedRounds, data.players]);

  // ---- Total Wasted Goods (summed across all rounds per player) ----
  const wastedSummary = useMemo(() => {
    const totals: Record<string, Record<string, number>> = {};
    for (const round of completedRounds) {
      for (const r of round.results || []) {
        const name = data.players.find(p => p.id === r.playerId)?.name || r.playerId.slice(0, 6);
        if (!totals[name]) totals[name] = {};
        const wasted = r.resultData?.wasted as Record<string, number> | undefined;
        if (wasted) {
          for (const [good, qty] of Object.entries(wasted)) {
            totals[name][good] = (totals[name][good] || 0) + Number(qty);
          }
        }
      }
    }
    return Object.entries(totals).map(([name, goods]) => ({
      name,
      ...goods,
    }));
  }, [completedRounds, data.players]);

  // ---- Exchange Activity (goods moved to others' houses per round) ----
  const exchangeActivity = useMemo(() => {
    return completedRounds.map(round => {
      let totalMoves = 0;
      let goodsMoved = 0;
      for (const a of round.actions || []) {
        if (a.actionType !== 'move') continue;
        const { fromPlayerId, toPlayerId, amount } = a.actionData || {};
        // Only count moves TO other players (actual trades)
        if (fromPlayerId && toPlayerId && fromPlayerId !== toPlayerId) {
          totalMoves++;
          goodsMoved += Number(amount || 0);
        }
      }
      return {
        round: round.roundNumber,
        trades: totalMoves,
        goodsTraded: goodsMoved,
      };
    });
  }, [completedRounds]);

  // ---- Efficiency: % of produced goods that ended up in complete sets ----
  const efficiencyData = useMemo(() => {
    return completedRounds.map(round => {
      let totalProduced = 0;
      let totalUsed = 0;
      for (const r of round.results || []) {
        const inventory = r.resultData?.inventory as { field: Record<string, number>; house: Record<string, number> } | undefined;
        const wasted = r.resultData?.wasted as Record<string, number> | undefined;
        if (inventory) {
          // Total produced = sum of all goods in field + house
          for (const v of Object.values(inventory.field)) totalProduced += Number(v || 0);
          for (const v of Object.values(inventory.house)) totalProduced += Number(v || 0);
        }
        if (wasted && inventory) {
          // Used goods = goods in house - wasted
          for (const [good, houseQty] of Object.entries(inventory.house)) {
            totalUsed += Number(houseQty || 0) - Number(wasted[good] || 0);
          }
        }
      }
      return {
        round: round.roundNumber,
        efficiency: totalProduced > 0 ? parseFloat(((totalUsed / totalProduced) * 100).toFixed(1)) : 0,
      };
    });
  }, [completedRounds]);

  // ---- Average Earnings by Player Type ----
  const earningsByType = useMemo(() => {
    const typeMap: Record<number, { total: number; count: number }> = {};
    for (const round of completedRounds) {
      for (const r of round.results || []) {
        const typeIdx = r.resultData?.typeIndex ?? 0;
        if (!typeMap[typeIdx]) typeMap[typeIdx] = { total: 0, count: 0 };
        typeMap[typeIdx].total += Number(r.profit || 0);
        typeMap[typeIdx].count++;
      }
    }
    return Object.entries(typeMap).map(([idx, { total, count }]) => ({
      type: `Type ${Number(idx) + 1}`,
      avgEarnings: parseFloat((total / count).toFixed(2)),
    }));
  }, [completedRounds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Earnings per Round */}
      {earningsOverRounds.length > 0 && (
        <ChartCard title="Earnings per Round" description="Each player's earnings by period — do they increase with specialization?">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={earningsOverRounds} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(v: any) => formatDollar(v)} />
              <Legend />
              {playerNames.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={getPlayerColor(i)} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Cumulative Earnings */}
      {cumulativeEarnings.length > 0 && (
        <ChartCard title="Cumulative Earnings" description="Running total of earnings — shows long-run gains from trade">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={cumulativeEarnings} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(v: any) => formatDollar(v)} />
              <Legend />
              {playerNames.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={getPlayerColor(i)} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Specialization Pattern */}
      {specializationData.length > 0 && (
        <ChartCard
          title="Specialization Over Rounds"
          description={`% of production time allocated to ${goodNames[0]} — convergence toward 0% or 100% signals specialization`}
        >
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={specializationData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis domain={[0, 100]} label={{ value: `% to ${goodNames[0]}`, angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(v: any) => `${v}%`} />
              <Legend />
              {playerNames.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={getPlayerColor(i)} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Complete Sets per Round */}
      {completeSetsData.length > 0 && (
        <ChartCard title="Complete Sets per Round" description="Number of earning sets assembled — more sets = more earnings">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={completeSetsData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              {playerNames.map((name, i) => (
                <Bar key={name} dataKey={name} fill={getPlayerColor(i)} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Exchange Activity */}
      {exchangeActivity.length > 0 && (
        <ChartCard title="Exchange Activity" description="Number of goods traded between players — does exchange emerge?">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={exchangeActivity} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="trades" name="# Transfers" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="goodsTraded" name="Goods Moved" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Exchange Efficiency */}
      {efficiencyData.length > 0 && (
        <ChartCard title="Exchange Efficiency" description="% of all produced goods that ended up in complete earning sets">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={efficiencyData} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" label={{ value: 'Round', position: 'insideBottom', offset: -2 }} />
              <YAxis domain={[0, 100]} tickFormatter={(v: any) => `${v}%`} />
              <Tooltip formatter={(v: any) => `${v}%`} />
              <Line type="monotone" dataKey="efficiency" name="Efficiency" stroke={CHART_COLORS[4]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Wasted Goods Summary */}
      {wastedSummary.length > 0 && (
        <ChartCard title="Total Wasted Goods" description="Goods in house that didn't form complete earning sets (summed across all rounds)">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={wastedSummary} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              {goodNames.map((good, i) => (
                <Bar key={good} dataKey={good} name={good} fill={goodColors[i]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Average Earnings by Player Type */}
      {earningsByType.length > 1 && (
        <ChartCard title="Average Earnings by Player Type" description="Do both types earn similarly? Balanced gains signal efficient exchange.">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={earningsByType} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="type" />
              <YAxis tickFormatter={formatDollar} />
              <Tooltip formatter={(v: any) => formatDollar(v)} />
              <Bar dataKey="avgEarnings" name="Avg Earnings / Round" radius={[4, 4, 0, 0]}>
                {earningsByType.map((_, i) => (
                  <Cell key={i} fill={getPlayerColor(i)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
};

export default DiscoveryProcessAnalytics;
