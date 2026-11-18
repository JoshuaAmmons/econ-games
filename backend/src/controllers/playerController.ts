import { Request, Response } from 'express';
import { SessionModel } from '../models/Session';
import { PlayerModel } from '../models/Player';
import { JoinSessionRequest, ApiResponse } from '../types';
import { generateValuations, generateProductionCosts } from '../services/gameLogic';
import { GameRegistry } from '../engines/GameRegistry';
import { BotService } from '../services/BotService';
import { lateJoinerEndowment } from '../engines/specialized/AssetBubbleEngine';
import { RoundModel } from '../models/Round';

// Games a student may join after the instructor presses Start (a late joiner plays from the
// current round if it is still open, otherwise from the next). Pairs already formed never change;
// late joiners in paired games are matched in arrival order. Discovery Process is not here: its
// round loop keeps every player's position and health, so a mid-game join is not safe.
const LATE_JOIN_GAMES = new Set([
  'ellsberg', 'newsvendor', 'beauty_contest', 'prisoner_dilemma', 'stag_hunt', 'public_goods', 'bertrand',
  'double_auction', 'double_auction_tax', 'double_auction_price_controls',
  'ultimatum', 'market_for_lemons', 'principal_agent', 'gift_exchange', 'trust_game',
  'asset_bubble',
]);

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
  ellsberg: 'chooser',
  newsvendor: 'manager',
  dutch_auction: 'bidder',
  english_auction: 'bidder',
  discriminative_auction: 'bidder',
  posted_offer: 'seller',
  lindahl: 'voter',
  pg_auction: 'voter',
  sealed_bid_offer: 'buyer',
  sponsored_search: 'advertiser',
};

// Games where players alternate between two roles
const PAIRED_ROLES: Record<string, [string, string]> = {
  ultimatum: ['proposer', 'responder'],
  bargaining: ['proposer', 'responder'],
  gift_exchange: ['employer', 'worker'],
  principal_agent: ['principal', 'agent'],
  trust_game: ['sender', 'receiver'],
  market_for_lemons: ['seller', 'buyer'],
  posted_offer: ['seller', 'buyer'],
  sealed_bid_offer: ['buyer', 'seller'],
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
      if (!code) {
        res.status(400).json({
          success: false,
          error: 'Session code is required'
        } as ApiResponse);
        return;
      }
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

      const gameType = session.game_type || 'double_auction';
      let late = false;
      if (session.status === 'completed' || session.status === 'cancelled') {
        res.status(409).json({
          success: false,
          error: 'This game has already ended.'
        } as ApiResponse);
        return;
      }
      if (session.status !== 'waiting') {
        // Practice sessions are one student's; other games keep the old rule
        if ((session.game_config as any)?.practice || !LATE_JOIN_GAMES.has(gameType)) {
          res.status(409).json({
            success: false,
            error: 'This game has already started and cannot take new players. Please wait for the next game.'
          } as ApiResponse);
          return;
        }
        // A session stays active after its last round until the instructor ends it
        const rounds = await RoundModel.findBySession(session.id);
        if (rounds.length > 0 && rounds.every((r) => r.status === 'completed')) {
          res.status(409).json({
            success: false,
            error: 'This game has already ended.'
          } as ApiResponse);
          return;
        }
        late = true;
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

      // A late joiner in a session with bots counts against the seats only as a student
      // (bots fill every seat at Start)
      const joinOpts = late
        ? { late: true, capacity: (session.bot_enabled ? 'humans' : 'all') as 'humans' | 'all' }
        : {};
      let player: import('../types').Player | null = null;

      if (DA_GAME_TYPES.includes(gameType)) {
        // DA games: assign buyer/seller roles with valuations/costs
        // Role assignment + capacity check happen atomically inside the transaction
        player = await PlayerModel.createWithRoleAssignment(
          session.id,
          session.market_size,
          name,
          false,
          (existingPlayers) => {
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
            return { role, valueColumn, value };
          },
          joinOpts
        );
      } else if (PAIRED_ROLES[gameType]) {
        // Paired games: alternate between two roles (atomic role assignment)
        const [role1, role2] = PAIRED_ROLES[gameType];
        player = await PlayerModel.createWithRoleAssignment(
          session.id,
          session.market_size,
          name,
          false,
          (existingPlayers) => {
            const role1Count = existingPlayers.filter(p => p.role === role1).length;
            const role2Count = existingPlayers.filter(p => p.role === role2).length;
            const role = role1Count <= role2Count ? role1 : role2;
            return { role };
          },
          joinOpts
        );
      } else if (late) {
        // Uniform-role games, after Start. Asset Bubble traders get the starting cash and shares.
        const role = GAME_ROLES[gameType] || 'player';
        player = await PlayerModel.createWithRoleAssignment(
          session.id,
          session.market_size,
          name,
          false,
          () => gameType === 'asset_bubble'
            ? { role: 'trader', gameData: lateJoinerEndowment(session.game_config || {}) }
            : { role },
          joinOpts
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

      // A late joiner: let the engine add them to the running round (pairing, portfolios)
      if (late) {
        try {
          const io = BotService.getInstance().getIO();
          const engine = GameRegistry.get(gameType);
          if (io && engine.onLateJoin) {
            await engine.onLateJoin(session, player, io);
          }
        } catch (err) {
          console.error('Error setting up a late joiner:', err);
        }
      }

      // Convert DECIMAL columns from strings to numbers (pg driver returns DECIMAL as string)
      const sanitizedPlayer = {
        ...player,
        total_profit: Number(player.total_profit ?? 0),
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
        total_profit: Number(player.total_profit ?? 0),
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
      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found'
        } as ApiResponse);
        return;
      }

      // Convert DECIMAL columns from strings to numbers (pg driver returns DECIMAL as string)
      const sanitizedPlayer = {
        ...player,
        total_profit: Number(player.total_profit ?? 0),
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
