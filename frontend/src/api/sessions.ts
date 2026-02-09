import apiClient from './client';
import { Session, CreateSessionData, ApiResponse } from '../types';

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
};
