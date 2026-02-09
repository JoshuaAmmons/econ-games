import { Request, Response } from 'express';
import { SessionModel } from '../models/Session';
import { PlayerModel } from '../models/Player';
import { JoinSessionRequest, ApiResponse } from '../types';
import { generateValuations, generateProductionCosts } from '../services/gameLogic';

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

      // Assign role
      const currentBuyers = existingPlayers.filter(p => p.role === 'buyer').length;
      const currentSellers = existingPlayers.filter(p => p.role === 'seller').length;
      const role = currentBuyers <= currentSellers ? 'buyer' : 'seller';

      // Generate value
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

      // Create player
      const player = await PlayerModel.create(session.id, role, value, name);

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
