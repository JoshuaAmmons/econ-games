import { pool } from '../config/database';
import { Trade } from '../types';

export class TradeModel {
  // Record trade
  static async create(
    roundId: string,
    buyerId: string,
    sellerId: string,
    price: number,
    buyerProfit: number,
    sellerProfit: number,
    bidId?: string,
    askId?: string
  ): Promise<Trade> {
    const result = await pool.query<Trade>(
      `INSERT INTO trades
       (round_id, buyer_id, seller_id, price, buyer_profit, seller_profit, bid_id, ask_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [roundId, buyerId, sellerId, price, buyerProfit, sellerProfit, bidId, askId]
    );
    return result.rows[0];
  }

  // Get trade by ID
  static async findById(id: string): Promise<Trade | null> {
    const result = await pool.query<Trade>(
      'SELECT * FROM trades WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  // Get all trades for round
  static async findByRound(roundId: string): Promise<Trade[]> {
    const result = await pool.query<Trade>(
      'SELECT * FROM trades WHERE round_id = $1 ORDER BY created_at',
      [roundId]
    );
    return result.rows;
  }

  // Get trades for session
  static async findBySession(sessionId: string): Promise<Trade[]> {
    const result = await pool.query<Trade>(
      `SELECT t.* FROM trades t
       JOIN rounds r ON t.round_id = r.id
       WHERE r.session_id = $1
       ORDER BY t.created_at`,
      [sessionId]
    );
    return result.rows;
  }

  // Get trades for player
  static async findByPlayer(playerId: string): Promise<Trade[]> {
    const result = await pool.query<Trade>(
      'SELECT * FROM trades WHERE buyer_id = $1 OR seller_id = $1 ORDER BY created_at',
      [playerId]
    );
    return result.rows;
  }
}
