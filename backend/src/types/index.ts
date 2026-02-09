// ============================================================================
// DATABASE TYPES
// ============================================================================

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
  created_at: Date;
  started_at?: Date;
  ended_at?: Date;
}

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
  created_at: Date;
  last_active_at: Date;
}

export interface Round {
  id: string;
  session_id: string;
  round_number: number;
  status: 'waiting' | 'active' | 'completed';
  started_at?: Date;
  ended_at?: Date;
}

export interface Bid {
  id: string;
  round_id: string;
  player_id: string;
  price: number;
  is_active: boolean;
  created_at: Date;
}

export interface Ask {
  id: string;
  round_id: string;
  player_id: string;
  price: number;
  is_active: boolean;
  created_at: Date;
}

export interface Trade {
  id: string;
  round_id: string;
  buyer_id: string;
  seller_id: string;
  bid_id?: string;
  ask_id?: string;
  price: number;
  buyer_profit: number;
  seller_profit: number;
  created_at: Date;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateSessionRequest {
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

export interface JoinSessionRequest {
  code: string;
  name?: string;
}

export interface SubmitBidRequest {
  round_id: string;
  player_id: string;
  price: number;
}

export interface SubmitAskRequest {
  round_id: string;
  player_id: string;
  price: number;
}

// ============================================================================
// WEBSOCKET EVENT TYPES
// ============================================================================

export interface BidSubmittedEvent {
  bid: Bid;
  player: Player;
}

export interface AskSubmittedEvent {
  ask: Ask;
  player: Player;
}

export interface TradeExecutedEvent {
  trade: Trade;
  buyer: Player;
  seller: Player;
}

export interface RoundStartedEvent {
  round: Round;
  session: Session;
}

export interface RoundEndedEvent {
  round: Round;
  trades: Trade[];
}

export interface TimerUpdateEvent {
  round_id: string;
  seconds_remaining: number;
}

export interface PlayerJoinedEvent {
  player: Player;
  session_id: string;
}

export interface PlayerLeftEvent {
  player_id: string;
  session_id: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
