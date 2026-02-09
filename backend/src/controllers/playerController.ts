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
};

// Games where players alternate between two roles
const PAIRED_ROLES: Record<string, [string, string]> = {
  ultimatum: ['proposer', 'responder'],
  gift_exchange: ['employer', 'worker'],
  principal_agent: ['principal', 'agent'],
  market_for_lemons: ['seller', 'buyer'],
};

export class PlayerController {
  // Join session
  static async joinSession(req: Request, res: Response) {
    try {
      const { code, name }: JoinSessionRequest = req.body;

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
        res.status(400).json({
          success: false,
          error: 'Session already started'
        } as ApiResponse);
        return;
      }

      // Check if session is full
      const existingPlayers = await PlayerModel.findBySession(session.id);
      if (existingPlayers.length >= session.market_size) {
        res.status(400).json({
          success: false,
          error: 'Session is full'
        } as ApiResponse);
        return;
      }

      const gameType = session.game_type || 'double_auction';
      let player;

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

        player = await PlayerModel.create(session.id, role, value, name);
      } else if (PAIRED_ROLES[gameType]) {
        // Paired games: alternate between two roles
        const [role1, role2] = PAIRED_ROLES[gameType];
        const role1Count = existingPlayers.filter(p => p.role === role1).length;
        const role2Count = existingPlayers.filter(p => p.role === role2).length;
        const role = role1Count <= role2Count ? role1 : role2;

        player = await PlayerModel.createGeneric(session.id, role, name);
      } else {
        // Uniform-role games (Bertrand, Cournot, Public Goods, etc.)
        const role = GAME_ROLES[gameType] || 'player';
        player = await PlayerModel.createGeneric(session.id, role, name);
      }

      res.status(201).json({
        success: true,
        data: {
          player,
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

      res.json({
        success: true,
        data: player
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

      res.json({
        success: true,
        data: {
          player,
          session
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
