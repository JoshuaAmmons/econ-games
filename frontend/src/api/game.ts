import apiClient from './client';
import { Bid, Ask, Trade, ApiResponse } from '../types';

export const gameApi = {
  // Submit bid
  submitBid: async (roundId: string, playerId: string, price: number): Promise<Bid> => {
    const response = await apiClient.post<ApiResponse<Bid>>('/game/bids', {
      round_id: roundId,
      player_id: playerId,
      price,
    });
    return response.data.data!;
  },

  // Submit ask
  submitAsk: async (roundId: string, playerId: string, price: number): Promise<Ask> => {
    const response = await apiClient.post<ApiResponse<Ask>>('/game/asks', {
      round_id: roundId,
      player_id: playerId,
      price,
    });
    return response.data.data!;
  },

  // Get order book
  getOrderBook: async (roundId: string): Promise<{ bids: Bid[]; asks: Ask[] }> => {
    const response = await apiClient.get<ApiResponse<{ bids: Bid[]; asks: Ask[] }>>(
      `/game/rounds/${roundId}/orderbook`
    );
    return response.data.data!;
  },

  // Get trades
  getTrades: async (roundId: string): Promise<Trade[]> => {
    const response = await apiClient.get<ApiResponse<Trade[]>>(
      `/game/rounds/${roundId}/trades`
    );
    return response.data.data!;
  },
};
