// Session types
export interface Session {
  id: string;
  code: string;
  status: 'waiting' | 'active' | 'completed' | 'cancelled';
  market_size: number;
  num_rounds: number;
  time_per_round: number;
  valuation_min: number;
  valuation_max: number;
  valuation_increments: number;
  cost_min: number;
  cost_max: number;
  cost_increments: number;
  bot_enabled: boolean;
  current_round: number;
  created_at: string;
  started_at?: string;
  ended_at?: string;
}

export interface CreateSessionData {
  market_size: number;
  num_rounds: number;
  time_per_round: number;
  valuation_min: number;
  valuation_max: number;
  valuation_increments: number;
  cost_min: number;
  cost_max: number;
  cost_increments: number;
  bot_enabled?: boolean;
}

// Player types
export interface Player {
  id: string;
  session_id: string;
  name?: string;
  role: 'buyer' | 'seller';
  valuation?: number;
  production_cost?: number;
  total_profit: number;
  is_bot: boolean;
  is_active: boolean;
  created_at: string;
}

// Round types
export interface Round {
  id: string;
  session_id: string;
  round_number: number;
  status: 'waiting' | 'active' | 'completed';
  started_at?: string;
  ended_at?: string;
}

// Bid/Ask types
export interface Bid {
  id: string;
  round_id: string;
  player_id: string;
  price: number;
  is_active: boolean;
  created_at: string;
}

export interface Ask {
  id: string;
  round_id: string;
  player_id: string;
  price: number;
  is_active: boolean;
  created_at: string;
}

// Trade types
export interface Trade {
  id: string;
  round_id: string;
  buyer_id: string;
  seller_id: string;
  price: number;
  buyer_profit: number;
  seller_profit: number;
  created_at: string;
}

// API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
