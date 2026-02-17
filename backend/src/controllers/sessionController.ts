import { Request, Response } from 'express';
import { SessionModel } from '../models/Session';
import { PlayerModel } from '../models/Player';
import { RoundModel } from '../models/Round';
import { CreateSessionRequest, ApiResponse } from '../types';

export class SessionController {
  // Create new session
  static async create(req: Request, res: Response) {
    try {
      const sessionData: CreateSessionRequest = req.body;

      // Sync top-level fields from game_config if the engine defines them there
      const gc = sessionData.game_config || {};
      if (gc.market_size) sessionData.market_size = Number(gc.market_size);
      if (gc.num_rounds) sessionData.num_rounds = Number(gc.num_rounds);
      if (gc.time_per_round) sessionData.time_per_round = Number(gc.time_per_round);

      // Validate input
      if (!sessionData.market_size || sessionData.market_size < 2) {
        res.status(400).json({
          success: false,
          error: 'Market size must be at least 2'
        } as ApiResponse);
        return;
      }

      // Create session
      const session = await SessionModel.create(sessionData);

      // Create initial rounds
      for (let i = 1; i <= session.num_rounds; i++) {
        await RoundModel.create(session.id, i);
      }

      res.status(201).json({
        success: true,
        data: session,
        message: 'Session created successfully'
      } as ApiResponse);

    } catch (error) {
      console.error('Error creating session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create session'
      } as ApiResponse);
    }
  }

  // Get session by ID
  static async getById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const session = await SessionModel.findById(id);

      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found'
        } as ApiResponse);
        return;
      }

      // Get players
      const players = await PlayerModel.findBySession(session.id);

      res.json({
        success: true,
        data: {
          ...session,
          players
        }
      } as ApiResponse);

    } catch (error) {
      console.error('Error getting session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get session'
      } as ApiResponse);
    }
  }

  // Get session by code
  static async getByCode(req: Request, res: Response) {
    try {
      const code = req.params.code as string;
      const session = await SessionModel.findByCode(code.toUpperCase());

      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found'
        } as ApiResponse);
        return;
      }

      // Strip secrets from public response, expose only boolean flags
      const { passcode, admin_password, ...sessionData } = session;
      res.json({
        success: true,
        data: {
          ...sessionData,
          has_passcode: !!passcode,
          has_admin_password: !!admin_password,
        }
      } as ApiResponse);

    } catch (error) {
      console.error('Error getting session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get session'
      } as ApiResponse);
    }
  }

  // List all sessions
  static async list(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const sessions = await SessionModel.findAll(limit, offset);

      res.json({
        success: true,
        data: sessions
      } as ApiResponse);

    } catch (error) {
      console.error('Error listing sessions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list sessions'
      } as ApiResponse);
    }
  }

  // Start session
  static async start(req: Request, res: Response) {
    try {
      const id = req.params.id as string;

      const session = await SessionModel.findById(id);
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

      // Start session
      await SessionModel.start(id);

      // Start first round
      const firstRound = await RoundModel.findBySessionAndNumber(id, 1);
      if (firstRound) {
        await RoundModel.start(firstRound.id);
        await SessionModel.updateCurrentRound(id, 1);
      }

      res.json({
        success: true,
        message: 'Session started'
      } as ApiResponse);

    } catch (error) {
      console.error('Error starting session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start session'
      } as ApiResponse);
    }
  }

  // Get players for session
  static async getPlayers(req: Request, res: Response) {
    try {
      const id = req.params.id as string;

      const session = await SessionModel.findById(id);
      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found'
        } as ApiResponse);
        return;
      }

      const players = await PlayerModel.findBySession(session.id);

      res.json({
        success: true,
        data: players
      } as ApiResponse);

    } catch (error) {
      console.error('Error getting players:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get players'
      } as ApiResponse);
    }
  }

  // Get rounds for session
  static async getRounds(req: Request, res: Response) {
    try {
      const id = req.params.id as string;

      const session = await SessionModel.findById(id);
      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found'
        } as ApiResponse);
        return;
      }

      const rounds = await RoundModel.findBySession(session.id);

      res.json({
        success: true,
        data: rounds
      } as ApiResponse);

    } catch (error) {
      console.error('Error getting rounds:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get rounds'
      } as ApiResponse);
    }
  }

  // End session
  static async end(req: Request, res: Response) {
    try {
      const id = req.params.id as string;

      await SessionModel.end(id);

      res.json({
        success: true,
        message: 'Session ended'
      } as ApiResponse);

    } catch (error) {
      console.error('Error ending session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to end session'
      } as ApiResponse);
    }
  }

  // Verify admin password for a session
  static async verifyAdminPassword(req: Request, res: Response) {
    try {
      const code = req.params.code as string;
      const { admin_password } = req.body;

      const session = await SessionModel.findByCode(code.toUpperCase());
      if (!session) {
        res.status(404).json({ success: false, error: 'Session not found' } as ApiResponse);
        return;
      }

      // If no admin password is set, access is open
      if (!session.admin_password) {
        res.json({ success: true, data: { verified: true } } as ApiResponse);
        return;
      }

      // Check the provided password
      if (!admin_password || admin_password !== session.admin_password) {
        res.status(401).json({ success: false, error: 'Incorrect admin password' } as ApiResponse);
        return;
      }

      res.json({ success: true, data: { verified: true } } as ApiResponse);
    } catch (error) {
      console.error('Error verifying admin password:', error);
      res.status(500).json({ success: false, error: 'Failed to verify admin password' } as ApiResponse);
    }
  }

  // Delete session
  static async delete(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      await SessionModel.delete(id);

      res.json({
        success: true,
        message: 'Session deleted'
      } as ApiResponse);

    } catch (error) {
      console.error('Error deleting session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete session'
      } as ApiResponse);
    }
  }

  // Delete all sessions
  static async deleteAll(req: Request, res: Response) {
    try {
      const sessions = await SessionModel.findAll(1000, 0);
      for (const session of sessions) {
        await SessionModel.delete(session.id);
      }

      res.json({
        success: true,
        message: `Deleted ${sessions.length} sessions`
      } as ApiResponse);

    } catch (error) {
      console.error('Error deleting all sessions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete all sessions'
      } as ApiResponse);
    }
  }
}
