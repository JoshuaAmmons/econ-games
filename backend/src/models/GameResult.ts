import { pool } from '../config/database';

export interface GameResult {
  id: string;
  round_id: string;
  player_id: string;
  result_data: Record<string, any>;
  profit: number;
  created_at: Date;
}

export class GameResultModel {
  // Create a game result
  static async create(
    roundId: string,
    playerId: string,
    resultData: Record<string, any>,
    profit: number
  ): Promise<GameResult> {
    const result = await pool.query<GameResult>(
      `INSERT INTO game_results (round_id, player_id, result_data, profit)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [roundId, playerId, JSON.stringify(resultData), profit]
    );
    return result.rows[0];
  }

  // Get results for a round
  static async findByRound(roundId: string): Promise<GameResult[]> {
    const result = await pool.query<GameResult>(
      'SELECT * FROM game_results WHERE round_id = $1 ORDER BY created_at',
      [roundId]
    );
    return result.rows;
  }

  // Get results for a player across all rounds
  static async findByPlayer(playerId: string): Promise<GameResult[]> {
    const result = await pool.query<GameResult>(
      'SELECT * FROM game_results WHERE player_id = $1 ORDER BY created_at',
      [playerId]
    );
    return result.rows;
  }

  // Get result for a specific player in a specific round
  static async findByRoundAndPlayer(
    roundId: string,
    playerId: string
  ): Promise<GameResult | null> {
    const result = await pool.query<GameResult>(
      'SELECT * FROM game_results WHERE round_id = $1 AND player_id = $2',
      [roundId, playerId]
    );
    return result.rows[0] || null;
  }

  // Get results for a session (via rounds)
  static async findBySession(sessionId: string): Promise<GameResult[]> {
    const result = await pool.query<GameResult>(
      `SELECT gr.* FROM game_results gr
       JOIN rounds r ON gr.round_id = r.id
       WHERE r.session_id = $1
       ORDER BY r.round_number, gr.created_at`,
      [sessionId]
    );
    return result.rows;
  }
}
