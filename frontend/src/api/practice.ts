import apiClient from './client';
import type { ApiResponse } from '../types';

export interface PracticeGame {
  gameType: string;
  marketSize: number;
  numRounds: number;
  timePerRound: number;
  name?: string;
  description?: string;
  category?: string;
  weekNumber?: number;
}

export interface PracticeStartResult {
  sessionCode: string;
  sessionId: string;
  playerId: string;
  gameType: string;
  marketSize: number;
  numRounds: number;
  timePerRound: number;
}

export const practiceApi = {
  /** List the games currently enabled for solo + bots practice mode. */
  listGames: async (): Promise<PracticeGame[]> => {
    const response = await apiClient.get<ApiResponse<PracticeGame[]>>('/practice/games');
    return response.data.data ?? [];
  },

  /**
   * Start a new practice session. Backend creates session+human+bots and
   * starts round 1 immediately. Returns code + playerId for the Market page.
   */
  start: async (gameType: string, name?: string): Promise<PracticeStartResult> => {
    const response = await apiClient.post<ApiResponse<PracticeStartResult>>(
      `/practice/${gameType}/start`,
      { name },
    );
    return response.data.data!;
  },
};
