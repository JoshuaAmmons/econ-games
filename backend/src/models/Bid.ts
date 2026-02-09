import { pool } from '../config/database';
import { Bid } from '../types';

export class BidModel {
  // Submit bid
  static async create(roundId: string, playerId: string, price: number): Promise<Bid> {
    const result = await pool.query<Bid>(
      'INSERT INTO bids (round_id, player_id, price) VALUES ($1, $2, $3) RETURNING *',
      [roundId, playerId, price]
    );
    return result.rows[0];
  }

  // Get bid by ID
  static async findById(id: string): Promise<Bid | null> {
    const result = await pool.query<Bid>(
      'SELECT * FROM bids WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  // Get all bids for round
  static async findByRound(roundId: string): Promise<Bid[]> {
    const result = await pool.query<Bid>(
      'SELECT * FROM bids WHERE round_id = $1 ORDER BY created_at DESC',
      [roundId]
    );
    return result.rows;
  }

  // Get active bids for round
  static async findActiveByRound(roundId: string): Promise<Bid[]> {
    const result = await pool.query<Bid>(
      'SELECT * FROM bids WHERE round_id = $1 AND is_active = true ORDER BY price DESC, created_at',
      [roundId]
    );
    return result.rows;
  }

  // Mark bid as inactive (traded)
  static async markInactive(id: string): Promise<Bid> {
    const result = await pool.query<Bid>(
      'UPDATE bids SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  // Deactivate all bids for round (when round ends)
  static async deactivateAllForRound(roundId: string): Promise<void> {
    await pool.query(
      'UPDATE bids SET is_active = false WHERE round_id = $1',
      [roundId]
    );
  }
}
