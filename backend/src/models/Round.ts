import { pool } from '../config/database';
import { Round } from '../types';

export class RoundModel {
  // Create new round
  static async create(sessionId: string, roundNumber: number): Promise<Round> {
    const result = await pool.query<Round>(
      'INSERT INTO rounds (session_id, round_number) VALUES ($1, $2) RETURNING *',
      [sessionId, roundNumber]
    );
    return result.rows[0];
  }

  // Get round by ID
  static async findById(id: string): Promise<Round | null> {
    const result = await pool.query<Round>(
      'SELECT * FROM rounds WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  // Get round by session and round number
  static async findBySessionAndNumber(sessionId: string, roundNumber: number): Promise<Round | null> {
    const result = await pool.query<Round>(
      'SELECT * FROM rounds WHERE session_id = $1 AND round_number = $2',
      [sessionId, roundNumber]
    );
    return result.rows[0] || null;
  }

  // Get all rounds for session
  static async findBySession(sessionId: string): Promise<Round[]> {
    const result = await pool.query<Round>(
      'SELECT * FROM rounds WHERE session_id = $1 ORDER BY round_number',
      [sessionId]
    );
    return result.rows;
  }

  // Get current round for session
  static async getCurrentRound(sessionId: string): Promise<Round | null> {
    const result = await pool.query<Round>(
      "SELECT * FROM rounds WHERE session_id = $1 AND status = 'active'",
      [sessionId]
    );
    return result.rows[0] || null;
  }

  // Start round
  static async start(id: string): Promise<Round> {
    const result = await pool.query<Round>(
      "UPDATE rounds SET status = 'active', started_at = NOW() WHERE id = $1 RETURNING *",
      [id]
    );
    return result.rows[0];
  }

  // End round
  static async end(id: string): Promise<Round> {
    const result = await pool.query<Round>(
      "UPDATE rounds SET status = 'completed', ended_at = NOW() WHERE id = $1 RETURNING *",
      [id]
    );
    return result.rows[0];
  }

  // Update status
  static async updateStatus(id: string, status: Round['status']): Promise<Round> {
    const result = await pool.query<Round>(
      'UPDATE rounds SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows[0];
  }
}
