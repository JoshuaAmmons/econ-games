import { useState, useEffect, useCallback } from 'react';
import { sessionsApi } from '../api/sessions';

/**
 * ResultsData mirrors the shape returned by GET /api/sessions/:id/results
 * (same as the ResultsData interface in Results.tsx)
 */
export interface AnalyticsData {
  session: {
    id: string;
    code: string;
    gameType: string;
    gameConfig: Record<string, any>;
    numRounds: number;
    status: string;
    marketSize: number;
  };
  players: Array<{
    id: string;
    name: string;
    role: string;
    valuation?: number;
    productionCost?: number;
    totalProfit: number;
    isBot: boolean;
  }>;
  rounds: Array<{
    roundNumber: number;
    roundId: string;
    status: string;
    startedAt: string;
    endedAt: string;
    trades?: Array<{
      price: number;
      buyerId: string;
      sellerId: string;
      buyerProfit: number;
      sellerProfit: number;
      time: string;
    }>;
    actions?: Array<{
      playerId: string;
      actionType: string;
      actionData: Record<string, any>;
      time: string;
    }>;
    results?: Array<{
      playerId: string;
      profit: number;
      resultData: Record<string, any>;
    }>;
  }>;
  stats: {
    totalPlayers: number;
    completedRounds: number;
    avgProfit: number;
    maxProfit: number;
    minProfit: number;
  };
}

const DA_GAME_TYPES = ['double_auction', 'double_auction_tax', 'double_auction_price_controls'];

/**
 * Hook that loads session results for analytics.
 * Returns the data, loading state, and helper properties.
 */
export function useAnalyticsData(sessionCode: string | undefined) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionCode) return;
    setLoading(true);
    setError(null);
    try {
      // Retrieve admin password from localStorage (saved by AdminPasswordGate)
      const storedAdminPassword = localStorage.getItem(`admin_pw_${sessionCode}`) || undefined;
      const session = await sessionsApi.getByCode(sessionCode);
      const results = await sessionsApi.getResults(session.id, storedAdminPassword);
      setData(results);
    } catch (err) {
      console.error('Failed to load analytics data:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [sessionCode]);

  useEffect(() => {
    load();
  }, [load]);

  const isDA = data ? DA_GAME_TYPES.includes(data.session.gameType) : false;
  const completedRounds = data?.rounds.filter(r => r.status === 'completed') || [];

  return { data, loading, error, refresh: load, isDA, completedRounds };
}
