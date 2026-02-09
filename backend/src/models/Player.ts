import { pool } from '../config/database';
import { Player } from '../types';

export class PlayerModel {
  // Create new player
  static async create(
    sessionId: string,
    role: 'buyer' | 'seller',
    value: number,
    name?: string,
    isBot = false
  ): Promise<Player> {
    const valueColumn = role === 'buyer' ? 'valuation' : 'production_cost';

    const result = await pool.query<Player>(
      `INSERT INTO players (session_id, name, role, ${valueColumn}, is_bot)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [sessionId, name, role, value, isBot]
    );

    return result.rows[0];
  }

  // Create a generic player (no valuation/cost — for non-DA games)
  static async createGeneric(
    sessionId: string,
    role: string,
    name?: string,
    isBot = false
  ): Promise<Player> {
    const result = await pool.query<Player>(
      `INSERT INTO players (session_id, name, role, is_bot)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [sessionId, name, role, isBot]
    );

    return result.rows[0];
  }

  // Get player by ID
  static async findById(id: string): Promise<Player | null> {
    const result = await pool.query<Player>(
      'SELECT * FROM players WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  // Get all players in session
  static async findBySession(sessionId: string): Promise<Player[]> {
    const result = await pool.query<Player>(
      'SELECT * FROM players WHERE session_id = $1 ORDER BY created_at',
      [sessionId]
    );
    return result.rows;
  }

  // Get active players in session
  static async findActiveBySession(sessionId: string): Promise<Player[]> {
    const result = await pool.query<Player>(
      'SELECT * FROM players WHERE session_id = $1 AND is_active = true ORDER BY created_at',
      [sessionId]
    );
    return result.rows;
  }

  // Get players by role
  static async findBySessionAndRole(sessionId: string, role: 'buyer' | 'seller'): Promise<Player[]> {
    const result = await pool.query<Player>(
      'SELECT * FROM players WHERE session_id = $1 AND role = $2 AND is_active = true',
      [sessionId, role]
    );
    return result.rows;
  }

  // Update player profit
  static async updateProfit(id: string, additionalProfit: number): Promise<Player> {
    const result = await pool.query<Player>(
      'UPDATE players SET total_profit = total_profit + $1 WHERE id = $2 RETURNING *',
      [additionalProfit, id]
    );
    return result.rows[0];
  }

  // Mark player as inactive
  static async markInactive(id: string): Promise<Player> {
    const result = await pool.query<Player>(
      'UPDATE players SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  // Mark player as active
  static async markActive(id: string): Promise<Player> {
    const result = await pool.query<Player>(
      'UPDATE players SET is_active = true WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  // Convert to bot
  static async convertToBot(id: string): Promise<Player> {
    const result = await pool.query<Player>(
      'UPDATE players SET is_bot = true WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  // Delete player
  static async delete(id: string): Promise<void> {
    await pool.query('DELETE FROM players WHERE id = $1', [id]);
  }
}
