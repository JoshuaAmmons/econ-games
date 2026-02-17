import { Request, Response } from 'express';
import { SessionModel } from '../models/Session';
import { PlayerModel } from '../models/Player';
import { JoinSessionRequest, ApiResponse } from '../types';
import { generateValuations, generateProductionCosts } from '../services/gameLogic';

// Game types that use the DA buyer/seller role system
const DA_GAME_TYPES = ['double_auction', 'double_auction_tax', 'double_auction_price_controls'];

// Default role for non-DA game types
const GAME_ROLES: Record<string, string> = {
  bertrand: 'firm',
  cournot: 'firm',
  public_goods: 'player',
  negative_externality: 'firm',
  ultimatum: 'proposer',
  gift_exchange: 'employer',
  principal_agent: 'principal',
  comparative_advantage: 'country',
  monopoly: 'monopolist',
  market_for_lemons: 'seller',
  discovery_process: 'producer',
};

// Games where players alternate between two roles
const PAIRED_ROLES: Record<string, [string, string]> = {
  ultimatum: ['proposer', 'responder'],
  gift_exchange: ['employer', 'worker'],
  principal_agent: ['principal', 'agent'],
  market_for_lemons: ['seller', 'buyer'],
};

// Sanitize player name: strip HTML tags, limit length
function sanitizeName(raw: string | undefined): string {
  if (!raw) return 'Anonymous';
  const cleaned = raw.replace(/<[^>]*>/g, '').trim();
  return cleaned.slice(0, 50) || 'Anonymous';
}

export class PlayerController {
  // Join session
  static async joinSession(req: Request, res: Response) {
    try {
      const { code, name: rawName, passcode }: JoinSessionRequest = req.body;
      const name = sanitizeName(rawName);

      // Find session
      const session = await SessionModel.findByCode(code.toUpperCase());
      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found'
        } as ApiResponse);
        return;
      }

      if (session.status !== 'waiting') {
        res.status(409).json({
          success: false,
          error: 'Session already started'
        } as ApiResponse);
        return;
      }

      // Check passcode if session is protected
      if (session.passcode) {
        if (!passcode || passcode !== session.passcode) {
          res.status(401).json({
            success: false,
            error: 'Incorrect passcode'
          } as ApiResponse);
          return;
        }
      }

      // Get existing players for role assignment (capacity is enforced atomically below)
      const existingPlayers = await PlayerModel.findBySession(session.id);

      const gameType = session.game_type || 'double_auction';
      let player: import('../types').Player | null = null;

      if (DA_GAME_TYPES.includes(gameType)) {
        // DA games: assign buyer/seller roles with valuations/costs
        const currentBuyers = existingPlayers.filter(p => p.role === 'buyer').length;
        const currentSellers = existingPlayers.filter(p => p.role === 'seller').length;
        const role: 'buyer' | 'seller' = currentBuyers <= currentSellers ? 'buyer' : 'seller';

        let value: number;
        if (role === 'buyer') {
          const valuations = generateValuations(
            session.valuation_min,
            session.valuation_max,
            session.valuation_increments,
            1
          );
          value = valuations[0];
        } else {
          const costs = generateProductionCosts(
            session.cost_min,
            session.cost_max,
            session.cost_increments,
            1
          );
          value = costs[0];
        }

        const valueColumn = role === 'buyer' ? 'valuation' as const : 'production_cost' as const;
        player = await PlayerModel.createWithCapacityCheck(
          session.id, session.market_size, role, name, false, valueColumn, value
        );
      } else if (PAIRED_ROLES[gameType]) {
        // Paired games: alternate between two roles
        const [role1, role2] = PAIRED_ROLES[gameType];
        const role1Count = existingPlayers.filter(p => p.role === role1).length;
        const role2Count = existingPlayers.filter(p => p.role === role2).length;
        const role = role1Count <= role2Count ? role1 : role2;

        player = await PlayerModel.createWithCapacityCheck(
          session.id, session.market_size, role, name
        );
      } else {
        // Uniform-role games (Bertrand, Cournot, Public Goods, etc.)
        const role = GAME_ROLES[gameType] || 'player';
        player = await PlayerModel.createWithCapacityCheck(
          session.id, session.market_size, role, name
        );
      }

      // Atomic capacity check returned null — session is full
      if (!player) {
        res.status(409).json({
          success: false,
          error: 'Session is full'
        } as ApiResponse);
        return;
      }

      // Convert DECIMAL columns from strings to numbers (pg driver returns DECIMAL as string)
      const sanitizedPlayer = {
        ...player,
        total_profit: Number(player.total_profit || 0),
        valuation: player.valuation != null ? Number(player.valuation) : null,
        production_cost: player.production_cost != null ? Number(player.production_cost) : null,
      };

      res.status(201).json({
        success: true,
        data: {
          player: sanitizedPlayer,
          session: {
            id: session.id,
            code: session.code,
            status: session.status
          }
        },
        message: 'Joined session successfully'
      } as ApiResponse);

    } catch (error) {
      console.error('Error joining session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to join session'
      } as ApiResponse);
    }
  }

  // Get player info
  static async getPlayer(req: Request, res: Response) {
    try {
      const id = req.params.id as string;

      const player = await PlayerModel.findById(id);
      if (!player) {
        res.status(404).json({
          success: false,
          error: 'Player not found'
        } as ApiResponse);
        return;
      }

      // Convert DECIMAL columns from strings to numbers (pg driver returns DECIMAL as string)
      const sanitizedPlayer = {
        ...player,
        total_profit: Number(player.total_profit || 0),
        valuation: player.valuation != null ? Number(player.valuation) : null,
        production_cost: player.production_cost != null ? Number(player.production_cost) : null,
      };

      res.json({
        success: true,
        data: sanitizedPlayer
      } as ApiResponse);

    } catch (error) {
      console.error('Error getting player:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get player'
      } as ApiResponse);
    }
  }

  // Get player status
  static async getStatus(req: Request, res: Response) {
    try {
      const id = req.params.id as string;

      const player = await PlayerModel.findById(id);
      if (!player) {
        res.status(404).json({
          success: false,
          error: 'Player not found'
        } as ApiResponse);
        return;
      }

      const session = await SessionModel.findById(player.session_id);

      // Convert DECIMAL columns from strings to numbers (pg driver returns DECIMAL as string)
      const sanitizedPlayer = {
        ...player,
        total_profit: Number(player.total_profit || 0),
        valuation: player.valuation != null ? Number(player.valuation) : null,
        production_cost: player.production_cost != null ? Number(player.production_cost) : null,
      };

      // Strip secrets from session before sending to player
      const { passcode, admin_password, ...safeSession } = session as any;
      res.json({
        success: true,
        data: {
          player: sanitizedPlayer,
          session: {
            ...safeSession,
            has_passcode: !!passcode,
            has_admin_password: !!admin_password,
          }
        }
      } as ApiResponse);

    } catch (error) {
      console.error('Error getting player status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get player status'
      } as ApiResponse);
    }
  }
}
