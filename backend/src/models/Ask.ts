import { pool } from '../config/database';
import { Ask } from '../types';

export class AskModel {
  // Submit ask
  static async create(roundId: string, playerId: string, price: number): Promise<Ask> {
    const result = await pool.query<Ask>(
      'INSERT INTO asks (round_id, player_id, price) VALUES ($1, $2, $3) RETURNING *',
      [roundId, playerId, price]
    );
    return result.rows[0];
  }

  // Get ask by ID
  static async findById(id: string): Promise<Ask | null> {
    const result = await pool.query<Ask>(
      'SELECT * FROM asks WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  // Get all asks for round
  static async findByRound(roundId: string): Promise<Ask[]> {
    const result = await pool.query<Ask>(
      'SELECT * FROM asks WHERE round_id = $1 ORDER BY created_at DESC',
      [roundId]
    );
    return result.rows;
  }

  // Get active asks for round
  static async findActiveByRound(roundId: string): Promise<Ask[]> {
    const result = await pool.query<Ask>(
      'SELECT * FROM asks WHERE round_id = $1 AND is_active = true ORDER BY price ASC, created_at',
      [roundId]
    );
    return result.rows;
  }

  // Mark ask as inactive (traded)
  static async markInactive(id: string): Promise<Ask> {
    const result = await pool.query<Ask>(
      'UPDATE asks SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  // Deactivate all asks for round (when round ends)
  static async deactivateAllForRound(roundId: string): Promise<void> {
    await pool.query(
      'UPDATE asks SET is_active = false WHERE round_id = $1',
      [roundId]
    );
  }
}
