import { Request, Response } from 'express';
import { SessionModel } from '../models/Session';
import { PlayerModel } from '../models/Player';
import { RoundModel } from '../models/Round';
import { GameRegistry } from '../engines';
import { BotService } from '../services/BotService';
import { generateValuations, generateProductionCosts } from '../services/gameLogic';
import {
  getPracticeConfig,
  getPracticeHumanRole,
  listPracticeGameTypes,
} from '../services/practiceConfigs';
import { ApiResponse } from '../types';

// DA games — these require role + valuation/cost atomically (mirror playerController)
const DA_GAME_TYPES = new Set([
  'double_auction',
  'double_auction_tax',
  'double_auction_price_controls',
]);

// Sanitize player name (mirrors playerController logic)
function sanitizeName(raw: string | undefined): string {
  if (!raw) return 'You';
  const cleaned = raw.replace(/<[^>]*>/g, '').trim();
  return cleaned.slice(0, 50) || 'You';
}

export class PracticeController {
  /**
   * GET /api/practice/games
   * List the game types available in practice mode (for the landing page).
   */
  static async listGames(_req: Request, res: Response) {
    try {
      const types = listPracticeGameTypes();
      const games = types.map((gameType) => {
        const config = getPracticeConfig(gameType)!;
        let uiInfo: { name: string; description: string; category: string; weekNumber: number } | null = null;
        try {
          const engine = GameRegistry.get(gameType);
          const ui = engine.getUIConfig();
          uiInfo = {
            name: ui.name,
            description: ui.description,
            category: ui.category,
            weekNumber: ui.weekNumber,
          };
        } catch (_) {
          uiInfo = null;
        }
        return {
          gameType,
          marketSize: config.market_size,
          numRounds: config.num_rounds,
          timePerRound: config.time_per_round,
          ...(uiInfo || {}),
        };
      });
      res.json({ success: true, data: games } as ApiResponse);
    } catch (error) {
      console.error('Error listing practice games:', error);
      res.status(500).json({ success: false, error: 'Failed to list practice games' } as ApiResponse);
    }
  }

  /**
   * POST /api/practice/:gameType/start
   *
   * Creates a practice session with bots filling all seats but one,
   * adds the requester as the only human player, and starts the session
   * immediately (no admin / no lobby). Returns { sessionCode, playerId }
   * which the frontend uses to connect directly to the Market page.
   */
  static async start(req: Request, res: Response) {
    const gameType = req.params.gameType as string;
    const { name } = req.body || {};
    const playerName = sanitizeName(name);

    // 1. Look up the practice config for this game type
    const cfg = getPracticeConfig(gameType);
    if (!cfg) {
      const available = listPracticeGameTypes().join(', ');
      res.status(404).json({
        success: false,
        error: `Game type "${gameType}" is not enabled for practice mode. Available: ${available}`,
      } as ApiResponse);
      return;
    }

    // 2. Verify the engine exists
    if (!GameRegistry.has(gameType as any)) {
      res.status(404).json({
        success: false,
        error: `Game engine "${gameType}" is not registered`,
      } as ApiResponse);
      return;
    }
    const engine = GameRegistry.get(gameType as any);

    // 3. Validate the practice config against the engine's own validator
    const validation = engine.validateConfig(cfg.game_config || {});
    if (!validation.valid) {
      res.status(500).json({
        success: false,
        error: `Practice config invalid: ${validation.error}`,
      } as ApiResponse);
      return;
    }

    let session;
    try {
      // 4. Create the session (no admin_password, bot_enabled=true)
      session = await SessionModel.create({
        game_type: gameType as any,
        game_config: {
          ...cfg.game_config,
          market_size: cfg.market_size,
          num_rounds: cfg.num_rounds,
          time_per_round: cfg.time_per_round,
        },
        market_size: cfg.market_size,
        num_rounds: cfg.num_rounds,
        time_per_round: cfg.time_per_round,
        valuation_min: cfg.valuation_min ?? 0,
        valuation_max: cfg.valuation_max ?? 100,
        valuation_increments: cfg.valuation_increments ?? 5,
        cost_min: cfg.cost_min ?? 0,
        cost_max: cfg.cost_max ?? 100,
        cost_increments: cfg.cost_increments ?? 5,
        bot_enabled: true,
      } as any);

      // 5. Create the rounds
      for (let i = 1; i <= session.num_rounds; i++) {
        await RoundModel.create(session.id, i);
      }
    } catch (err: any) {
      console.error('Practice: failed to create session:', err);
      res.status(500).json({
        success: false,
        error: `Failed to create practice session: ${err?.message || 'unknown error'}`,
      } as ApiResponse);
      return;
    }

    // 6. Create the human player. Different game families need different setup:
    //    - DA games:    role 'buyer' + a private valuation drawn from session range
    //                   (sellers come from bot creation; this mirrors PlayerController.joinSession)
    //    - Other games: role from PRACTICE_HUMAN_ROLES; engine.setupPlayers handles any
    //                   game-specific initialization (e.g. AssetBubble assigns endowments)
    let humanPlayer;
    try {
      const humanRole = getPracticeHumanRole(gameType);

      if (DA_GAME_TYPES.has(gameType)) {
        // DA: atomic role + valuation. Always seat the human as a buyer in practice.
        const vals = generateValuations(
          session.valuation_min,
          session.valuation_max,
          session.valuation_increments,
          1,
        );
        humanPlayer = await PlayerModel.createWithRoleAssignment(
          session.id,
          session.market_size,
          playerName,
          false /* isBot */,
          () => ({ role: 'buyer', valueColumn: 'valuation' as const, value: vals[0] }),
        );
      } else {
        // Non-DA: simple role assignment. engine.setupPlayers fills the rest.
        humanPlayer = await PlayerModel.createWithCapacityCheck(
          session.id,
          session.market_size,
          humanRole,
          playerName,
          false /* isBot */,
        );
      }

      if (!humanPlayer) {
        throw new Error('Could not create human player (capacity check failed)');
      }
    } catch (err: any) {
      console.error('Practice: failed to create human player:', err);
      // Roll back the session so we don't leak orphans
      try { await SessionModel.delete(session.id); } catch (_) { /* best-effort */ }
      res.status(500).json({
        success: false,
        error: `Failed to add player: ${err?.message || 'unknown error'}`,
      } as ApiResponse);
      return;
    }

    // 7. Start the session (mimics SessionController.start, minus the admin check)
    try {
      await SessionModel.start(session.id);

      const firstRound = await RoundModel.findBySessionAndNumber(session.id, 1);
      if (!firstRound) {
        throw new Error('Round 1 missing after session creation');
      }
      await RoundModel.start(firstRound.id);
      await SessionModel.updateCurrentRound(session.id, 1);

      // Refresh the session record so it reflects status='active' for downstream code
      const startedSession = await SessionModel.findById(session.id);
      if (!startedSession) throw new Error('Session vanished after start');

      // Create bots to fill remaining seats
      const botService = BotService.getInstance();
      await botService.createBotsForSession(startedSession);

      // Engine-specific player setup (auction valuations, asset endowments, etc.)
      const activePlayers = await PlayerModel.findActiveBySession(session.id);
      await engine.setupPlayers(session.id, activePlayers.length, startedSession.game_config || {});

      // Schedule round-1 timers + bot actions (the socket start-round handler
      // never runs for round 1, so we set this up here directly — same pattern
      // as SessionController.start does)
      const io = botService.getIO();
      if (io) {
        const scheduleTimer = (io as any).__scheduleRoundEndTimer;
        if (scheduleTimer) {
          scheduleTimer(firstRound.id, startedSession.code, startedSession, gameType);
        }
        if (engine.onRoundStart) {
          await engine.onRoundStart(firstRound.id, startedSession.code, io);
        }
        botService
          .onRoundStart(firstRound.id, startedSession.code, startedSession, io)
          .catch((err) => console.error('Practice: bot round 1 error:', err));
      }
    } catch (err: any) {
      console.error('Practice: failed to start session:', err);
      try { await SessionModel.delete(session.id); } catch (_) { /* best-effort */ }
      res.status(500).json({
        success: false,
        error: `Failed to start practice session: ${err?.message || 'unknown error'}`,
      } as ApiResponse);
      return;
    }

    // 8. Return code + player ID; the frontend stores playerId in localStorage
    //    and navigates straight to /session/<code>/market
    res.status(201).json({
      success: true,
      data: {
        sessionCode: session.code,
        sessionId: session.id,
        playerId: humanPlayer.id,
        gameType,
        marketSize: cfg.market_size,
        numRounds: cfg.num_rounds,
        timePerRound: cfg.time_per_round,
      },
      message: 'Practice session ready',
    } as ApiResponse);
  }
}
