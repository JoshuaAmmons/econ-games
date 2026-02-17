import { pool } from '../config/database';
import { Session, CreateSessionRequest } from '../types';

export class SessionModel {
  // Create new session
  static async create(data: CreateSessionRequest): Promise<Session> {
    const code = await this.generateUniqueCode();

    const result = await pool.query<Session>(
      `INSERT INTO sessions (
        code, game_type, game_config, market_size, num_rounds, time_per_round,
        valuation_min, valuation_max, valuation_increments,
        cost_min, cost_max, cost_increments, bot_enabled, passcode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        code,
        data.game_type || 'double_auction',
        JSON.stringify(data.game_config || {}),
        data.market_size,
        data.num_rounds,
        data.time_per_round,
        data.valuation_min,
        data.valuation_max,
        data.valuation_increments,
        data.cost_min,
        data.cost_max,
        data.cost_increments,
        data.bot_enabled || false,
        data.passcode || null
      ]
    );

    return result.rows[0];
  }

  // Get session by ID
  static async findById(id: string): Promise<Session | null> {
    const result = await pool.query<Session>(
      'SELECT * FROM sessions WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  // Get session by code
  static async findByCode(code: string): Promise<Session | null> {
    const result = await pool.query<Session>(
      'SELECT * FROM sessions WHERE code = $1',
      [code]
    );
    return result.rows[0] || null;
  }

  // Get all sessions
  static async findAll(limit = 50, offset = 0): Promise<Session[]> {
    const result = await pool.query<Session>(
      'SELECT * FROM sessions ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  }

  // Get active sessions
  static async findActive(): Promise<Session[]> {
    const result = await pool.query<Session>(
      "SELECT * FROM sessions WHERE status IN ('waiting', 'active') ORDER BY created_at DESC"
    );
    return result.rows;
  }

  // Update session status
  static async updateStatus(id: string, status: Session['status']): Promise<Session> {
    const result = await pool.query<Session>(
      'UPDATE sessions SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows[0];
  }

  // Start session
  static async start(id: string): Promise<Session> {
    const result = await pool.query<Session>(
      'UPDATE sessions SET status = $1, started_at = NOW() WHERE id = $2 RETURNING *',
      ['active', id]
    );
    return result.rows[0];
  }

  // Update current round
  static async updateCurrentRound(id: string, roundNumber: number): Promise<Session> {
    const result = await pool.query<Session>(
      'UPDATE sessions SET current_round = $1 WHERE id = $2 RETURNING *',
      [roundNumber, id]
    );
    return result.rows[0];
  }

  // End session
  static async end(id: string): Promise<Session> {
    const result = await pool.query<Session>(
      'UPDATE sessions SET status = $1, ended_at = NOW() WHERE id = $2 RETURNING *',
      ['completed', id]
    );
    return result.rows[0];
  }

  // Delete session
  static async delete(id: string): Promise<void> {
    await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
  }

  // Generate unique 6-character code
  private static async generateUniqueCode(): Promise<string> {
    // Use application-level code generation (works without the DB function)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code: string;
    let exists = true;

    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const result = await pool.query(
        'SELECT EXISTS(SELECT 1 FROM sessions WHERE code = $1) as exists',
        [code]
      );
      exists = result.rows[0].exists;
    } while (exists);

    return code;
  }
}
