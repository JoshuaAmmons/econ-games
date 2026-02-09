import { pool } from '../config/database';

export interface GameAction {
  id: string;
  round_id: string;
  player_id: string;
  action_type: string;
  action_data: Record<string, any>;
  created_at: Date;
}

export class GameActionModel {
  // Create a game action
  static async create(
    roundId: string,
    playerId: string,
    actionType: string,
    actionData: Record<string, any>
  ): Promise<GameAction> {
    const result = await pool.query<GameAction>(
      `INSERT INTO game_actions (round_id, player_id, action_type, action_data)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [roundId, playerId, actionType, JSON.stringify(actionData)]
    );
    return result.rows[0];
  }

  // Get actions for a round
  static async findByRound(roundId: string): Promise<GameAction[]> {
    const result = await pool.query<GameAction>(
      'SELECT * FROM game_actions WHERE round_id = $1 ORDER BY created_at',
      [roundId]
    );
    return result.rows;
  }

  // Get actions for a player in a round
  static async findByRoundAndPlayer(
    roundId: string,
    playerId: string
  ): Promise<GameAction[]> {
    const result = await pool.query<GameAction>(
      'SELECT * FROM game_actions WHERE round_id = $1 AND player_id = $2 ORDER BY created_at',
      [roundId, playerId]
    );
    return result.rows;
  }

  // Get actions by type for a round
  static async findByRoundAndType(
    roundId: string,
    actionType: string
  ): Promise<GameAction[]> {
    const result = await pool.query<GameAction>(
      'SELECT * FROM game_actions WHERE round_id = $1 AND action_type = $2 ORDER BY created_at',
      [roundId, actionType]
    );
    return result.rows;
  }

  // Check if player has submitted an action for this round
  static async hasPlayerActed(
    roundId: string,
    playerId: string,
    actionType?: string
  ): Promise<boolean> {
    let query = 'SELECT EXISTS(SELECT 1 FROM game_actions WHERE round_id = $1 AND player_id = $2';
    const params: any[] = [roundId, playerId];

    if (actionType) {
      query += ' AND action_type = $3';
      params.push(actionType);
    }
    query += ') as exists';

    const result = await pool.query(query, params);
    return result.rows[0].exists;
  }

  // Count actions for a round (useful for checking if all players submitted)
  static async countByRound(roundId: string, actionType?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM game_actions WHERE round_id = $1';
    const params: any[] = [roundId];

    if (actionType) {
      query += ' AND action_type = $2';
      params.push(actionType);
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count, 10);
  }

  // Delete all actions for a round
  static async deleteByRound(roundId: string): Promise<void> {
    await pool.query('DELETE FROM game_actions WHERE round_id = $1', [roundId]);
  }
}
