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

  /**
   * Atomically check capacity and create a player inside a transaction.
   * Locks the session row to serialize concurrent joins and prevent exceeding market_size.
   * Returns null if the session is full.
   */
  static async createWithCapacityCheck(
    sessionId: string,
    marketSize: number,
    role: string,
    name?: string,
    isBot = false,
    valueColumn?: 'valuation' | 'production_cost',
    value?: number
  ): Promise<Player | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock the session row to serialize concurrent join attempts
      await client.query('SELECT id FROM sessions WHERE id = $1 FOR UPDATE', [sessionId]);

      // Recheck capacity inside the transaction
      const countResult = await client.query(
        'SELECT COUNT(*) as count FROM players WHERE session_id = $1',
        [sessionId]
      );
      const currentCount = parseInt(countResult.rows[0].count, 10);
      if (currentCount >= marketSize) {
        await client.query('ROLLBACK');
        return null; // Session is full
      }

      // Create the player
      let result;
      if (valueColumn && value !== undefined) {
        result = await client.query<Player>(
          `INSERT INTO players (session_id, name, role, ${valueColumn}, is_bot)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [sessionId, name, role, value, isBot]
        );
      } else {
        result = await client.query<Player>(
          `INSERT INTO players (session_id, name, role, is_bot)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [sessionId, name, role, isBot]
        );
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Atomically assign a role (based on existing players) and create a player
   * inside a single transaction. The roleAssigner callback receives the list
   * of existing players (fetched under a row lock) and returns the role and
   * optional valuation/cost.  This prevents the race condition where two
   * concurrent joins both read the same player list and pick the same role.
   */
  static async createWithRoleAssignment(
    sessionId: string,
    marketSize: number,
    name: string | undefined,
    isBot: boolean,
    roleAssigner: (existingPlayers: Player[]) => {
      role: string;
      valueColumn?: 'valuation' | 'production_cost';
      value?: number;
    }
  ): Promise<Player | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock the session row to serialize concurrent join attempts
      await client.query('SELECT id FROM sessions WHERE id = $1 FOR UPDATE', [sessionId]);

      // Fetch existing players INSIDE the transaction
      const existingResult = await client.query<Player>(
        'SELECT * FROM players WHERE session_id = $1 ORDER BY created_at',
        [sessionId]
      );
      const existingPlayers = existingResult.rows;

      if (existingPlayers.length >= marketSize) {
        await client.query('ROLLBACK');
        return null; // Session is full
      }

      // Let the caller decide the role based on the locked player list
      const { role, valueColumn, value } = roleAssigner(existingPlayers);

      let result;
      if (valueColumn && value !== undefined) {
        result = await client.query<Player>(
          `INSERT INTO players (session_id, name, role, ${valueColumn}, is_bot)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [sessionId, name, role, value, isBot]
        );
      } else {
        result = await client.query<Player>(
          `INSERT INTO players (session_id, name, role, is_bot)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [sessionId, name, role, isBot]
        );
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
