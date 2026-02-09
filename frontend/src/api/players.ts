import apiClient from './client';
import { Player, Session, ApiResponse } from '../types';

export const playersApi = {
  // Join session
  join: async (code: string, name?: string): Promise<{ player: Player; session: Pick<Session, 'id' | 'code' | 'status'> }> => {
    const response = await apiClient.post<ApiResponse<{ player: Player; session: Pick<Session, 'id' | 'code' | 'status'> }>>(
      '/players/join',
      { code, name }
    );
    return response.data.data!;
  },

  // Get player info
  getById: async (id: string): Promise<Player> => {
    const response = await apiClient.get<ApiResponse<Player>>(`/players/${id}`);
    return response.data.data!;
  },

  // Get player status
  getStatus: async (id: string): Promise<{ player: Player; session: Session }> => {
    const response = await apiClient.get<ApiResponse<{ player: Player; session: Session }>>(
      `/players/${id}/status`
    );
    return response.data.data!;
  },
};
