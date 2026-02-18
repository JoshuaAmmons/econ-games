/**
 * Shared chart utilities, color palettes, and formatters
 */

export const CHART_COLORS = [
  '#0ea5e9', // sky-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
  '#84cc16', // lime-500
  '#06b6d4', // cyan-500
  '#a855f7', // purple-500
];

export const PROFIT_COLORS = {
  positive: '#059669', // emerald-600
  negative: '#dc2626', // red-600
};

export const ROLE_COLORS: Record<string, string> = {
  buyer: '#0ea5e9',
  seller: '#f59e0b',
  proposer: '#0ea5e9',
  responder: '#f59e0b',
  employer: '#0ea5e9',
  worker: '#f59e0b',
  principal: '#0ea5e9',
  agent: '#f59e0b',
  firm: '#0ea5e9',
  contributor: '#10b981',
  country: '#8b5cf6',
  monopolist: '#ef4444',
};

export const formatDollar = (v: any) => `$${Number(v || 0).toFixed(2)}`;
export const formatDollarShort = (v: any) => `$${Math.round(Number(v || 0))}`;
export const formatPercent = (v: any) => `${(Number(v || 0) * 100).toFixed(0)}%`;
export const formatNumber = (v: any) => Number(v || 0).toFixed(1);

export const CHART_MARGINS = { top: 20, right: 30, left: 20, bottom: 5 };
export const CHART_HEIGHT = 300;

/**
 * Simple linear regression: returns { slope, intercept, r2 }
 */
export function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  const ssTotal = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2 = ssTotal === 0 ? 0 : 1 - ssRes / ssTotal;

  return { slope, intercept, r2 };
}

/**
 * Get player color by index
 */
export function getPlayerColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/**
 * Compute per-round profits for each player from results data
 */
export function computePerRoundProfits(
  players: Array<{ id: string; name: string; role: string }>,
  rounds: Array<{
    roundNumber: number;
    trades?: Array<{ buyerId: string; sellerId: string; buyerProfit: number; sellerProfit: number }>;
    results?: Array<{ playerId: string; profit: number }>;
  }>,
  isDA: boolean
): Map<string, number[]> {
  const profitMap = new Map<string, number[]>();
  for (const player of players) {
    profitMap.set(player.id, []);
  }

  const completedRounds = rounds.filter(r => r.roundNumber != null).sort((a, b) => a.roundNumber - b.roundNumber);

  for (const round of completedRounds) {
    if (isDA && round.trades) {
      // Sum trade profits per player
      const roundProfits = new Map<string, number>();
      for (const player of players) roundProfits.set(player.id, 0);
      for (const trade of round.trades) {
        roundProfits.set(trade.buyerId, (roundProfits.get(trade.buyerId) || 0) + Number(trade.buyerProfit));
        roundProfits.set(trade.sellerId, (roundProfits.get(trade.sellerId) || 0) + Number(trade.sellerProfit));
      }
      for (const player of players) {
        profitMap.get(player.id)!.push(roundProfits.get(player.id) || 0);
      }
    } else if (round.results) {
      const resultMap = new Map(round.results.map(r => [r.playerId, r.profit]));
      for (const player of players) {
        profitMap.get(player.id)!.push(resultMap.get(player.id) || 0);
      }
    }
  }

  return profitMap;
}
