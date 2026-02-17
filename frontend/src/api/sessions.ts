import apiClient from './client';
import type { Session, CreateSessionData, Player, Round, GameTypeConfig, ApiResponse } from '../types';

export const sessionsApi = {
  // Create new session
  create: async (data: CreateSessionData): Promise<Session> => {
    const response = await apiClient.post<ApiResponse<Session>>('/sessions', data);
    return response.data.data!;
  },

  // Get session by ID
  getById: async (id: string): Promise<Session> => {
    const response = await apiClient.get<ApiResponse<Session>>(`/sessions/${id}`);
    return response.data.data!;
  },

  // Get session by code
  getByCode: async (code: string): Promise<Session> => {
    const response = await apiClient.get<ApiResponse<Session>>(`/sessions/code/${code}`);
    return response.data.data!;
  },

  // Verify admin password for a session
  verifyAdminPassword: async (code: string, admin_password: string): Promise<boolean> => {
    try {
      const response = await apiClient.post<ApiResponse<{ verified: boolean }>>(
        `/sessions/code/${code}/verify-admin`,
        { admin_password }
      );
      return response.data.data?.verified ?? false;
    } catch {
      return false;
    }
  },

  // Get all sessions
  getAll: async (): Promise<Session[]> => {
    const response = await apiClient.get<ApiResponse<Session[]>>('/sessions');
    return response.data.data!;
  },

  // Start session
  start: async (id: string): Promise<void> => {
    await apiClient.post(`/sessions/${id}/start`);
  },

  // End session
  end: async (id: string): Promise<void> => {
    await apiClient.post(`/sessions/${id}/end`);
  },

  // Get players for session
  getPlayers: async (id: string): Promise<Player[]> => {
    const response = await apiClient.get<ApiResponse<Player[]>>(`/sessions/${id}/players`);
    return response.data.data!;
  },

  // Get rounds for session
  getRounds: async (id: string): Promise<Round[]> => {
    const response = await apiClient.get<ApiResponse<Round[]>>(`/sessions/${id}/rounds`);
    return response.data.data!;
  },

  // Get available game types
  getGameTypes: async (): Promise<GameTypeConfig[]> => {
    const response = await apiClient.get<ApiResponse<GameTypeConfig[]>>('/game-types');
    return response.data.data!;
  },

  // Get comprehensive results for a session
  getResults: async (id: string): Promise<any> => {
    const response = await apiClient.get<ApiResponse<any>>(`/sessions/${id}/results`);
    return response.data.data!;
  },

  // Delete session
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/sessions/${id}`);
  },

  // Delete all sessions
  deleteAll: async (): Promise<void> => {
    await apiClient.delete('/sessions');
  },

  // Get CSV export URL
  getExportUrl: (id: string, type: string): string => {
    const baseUrl = apiClient.defaults.baseURL || '';
    return `${baseUrl}/sessions/${id}/export?type=${type}`;
  },
};
