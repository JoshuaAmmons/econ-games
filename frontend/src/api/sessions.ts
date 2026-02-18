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

  // Start session (requires admin password if session has one)
  start: async (id: string, adminPassword?: string): Promise<void> => {
    const headers: Record<string, string> = {};
    if (adminPassword) headers['x-admin-password'] = adminPassword;
    await apiClient.post(`/sessions/${id}/start`, {}, { headers });
  },

  // End session (requires admin password if session has one)
  end: async (id: string, adminPassword?: string): Promise<void> => {
    const headers: Record<string, string> = {};
    if (adminPassword) headers['x-admin-password'] = adminPassword;
    await apiClient.post(`/sessions/${id}/end`, {}, { headers });
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

  // Get comprehensive results for a session (requires admin password)
  getResults: async (id: string, adminPassword?: string): Promise<any> => {
    const headers: Record<string, string> = {};
    if (adminPassword) headers['x-admin-password'] = adminPassword;
    const response = await apiClient.get<ApiResponse<any>>(`/sessions/${id}/results`, { headers });
    return response.data.data!;
  },

  // Delete session (requires admin password)
  delete: async (id: string, adminPassword?: string): Promise<void> => {
    const headers: Record<string, string> = {};
    if (adminPassword) headers['x-admin-password'] = adminPassword;
    await apiClient.delete(`/sessions/${id}`, { headers });
  },

  // Delete all sessions (requires confirmation header)
  deleteAll: async (): Promise<void> => {
    await apiClient.delete('/sessions', {
      headers: { 'x-confirm-delete-all': 'true' },
    });
  },

  // Get CSV export URL (with admin password as query param for download links)
  getExportUrl: (id: string, type: string, adminPassword?: string): string => {
    const baseUrl = apiClient.defaults.baseURL || '';
    const params = new URLSearchParams({ type });
    if (adminPassword) params.set('admin_password', adminPassword);
    return `${baseUrl}/sessions/${id}/export?${params.toString()}`;
  },
};
