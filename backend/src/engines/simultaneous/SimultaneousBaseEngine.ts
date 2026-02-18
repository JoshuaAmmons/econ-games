import type { Server } from 'socket.io';
import type {
  GameEngine,
  GameType,
  UIConfig,
  ValidationResult,
  ActionResult,
  RoundResult,
} from '../GameEngine';
import { GameActionModel } from '../../models/GameAction';
import { GameResultModel } from '../../models/GameResult';
import { PlayerModel } from '../../models/Player';
import { RoundModel } from '../../models/Round';
import { SessionModel } from '../../models/Session';

/**
 * Base engine for all simultaneous-move games.
 *
 * Pattern:
 * 1. All players submit a single decision per round (price, quantity, contribution, etc.)
 * 2. Once all active players have submitted (or the timer expires), results are calculated.
 * 3. Payoffs are computed based on all players' decisions together.
 *
 * Subclasses must implement:
 * - gameType, getUIConfig(), validateConfig()
 * - validateAction() — check if an individual action is valid
 * - calculateResults() — compute payoffs given all actions for the round
 */
export abstract class SimultaneousBaseEngine implements GameEngine {
  abstract readonly gameType: GameType;

  /** Guard against concurrent resolveRound calls (double-profit bug) */
  private resolvingRounds = new Set<string>();
  abstract getUIConfig(): UIConfig;
  abstract validateConfig(config: Record<string, any>): ValidationResult;

  /**
   * Validate a player's action before storing it.
   * Return an error string if invalid, null if OK.
   */
  protected abstract validateAction(
    action: Record<string, any>,
    player: any,
    config: Record<string, any>
  ): string | null;

  /**
   * Given all submitted actions for a round, compute results.
   * Must return an array of { playerId, profit, resultData } objects.
   */
  protected abstract calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }>;

  async setupPlayers(
    _sessionId: string,
    _playerCount: number,
    _config: Record<string, any>
  ): Promise<void> {
    // Simultaneous games assign roles during the join flow
    // Most use a uniform role (e.g. 'firm' or 'player')
  }

  async handleAction(
    roundId: string,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    // Check if player already submitted a decision this round
    const alreadyActed = await GameActionModel.hasPlayerActed(roundId, playerId, 'decision');
    if (alreadyActed) {
      return { success: false, error: 'You have already submitted your decision this round' };
    }

    // Get player
    const player = await PlayerModel.findById(playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    // Get session config
    const round = await RoundModel.findById(roundId);
    if (!round) return { success: false, error: 'Round not found' };
    const session = await SessionModel.findById(round.session_id);
    if (!session) return { success: false, error: 'Session not found' };
    const config = session.game_config || {};

    // Validate the action
    const error = this.validateAction(action, player, config);
    if (error) {
      return { success: false, error };
    }

    // Store the action
    await GameActionModel.create(roundId, playerId, 'decision', action);

    // Broadcast submission count
    const totalSubmitted = await GameActionModel.countByRound(roundId, 'decision');
    const activePlayers = await PlayerModel.findActiveBySession(session.id);
    const totalPlayers = activePlayers.length;

    io.to(`market-${sessionCode}`).emit('action-submitted', {
      playerId,
      playerName: player.name,
      submitted: totalSubmitted,
      total: totalPlayers,
    });

    // Check if all players have submitted
    if (totalSubmitted >= totalPlayers) {
      await this.resolveRound(roundId, sessionCode, io, session, activePlayers);
    }

    return { success: true };
  }

  /**
   * Resolve the round — calculate results and broadcast them.
   * Called when all players have submitted or when the round timer expires.
   */
  protected async resolveRound(
    roundId: string,
    sessionCode: string,
    io: Server,
    session: any,
    activePlayers: any[]
  ): Promise<void> {
    // Prevent concurrent resolution (race between last-submit and timer-end)
    if (this.resolvingRounds.has(roundId)) return;
    this.resolvingRounds.add(roundId);

    try {
      // Double-check: if results already exist, skip
      const existingResults = await GameResultModel.findByRound(roundId);
      if (existingResults.length > 0) return;

    const config = session.game_config || {};

    // Get only 'decision' actions for this round (ignore any other action types)
    const actions = await GameActionModel.findByRoundAndType(roundId, 'decision');
    const actionData = actions.map((a) => ({
      playerId: a.player_id,
      playerName: activePlayers.find((p) => p.id === a.player_id)?.name || 'Unknown',
      action: a.action_data,
    }));

    // Calculate results
    const results = this.calculateResults(actionData, config, activePlayers);

    // Create result rows for non-submitting players (0 profit, no submission)
    const submittedPlayerIds = new Set(results.map(r => r.playerId));
    for (const player of activePlayers) {
      if (!submittedPlayerIds.has(player.id)) {
        results.push({
          playerId: player.id,
          profit: 0,
          resultData: { submitted: false, reason: 'No submission received' },
        });
      }
    }

    // Store results and update profits
    for (const result of results) {
      await GameResultModel.create(roundId, result.playerId, result.resultData, result.profit);
      if (result.profit !== 0) {
        await PlayerModel.updateProfit(result.playerId, result.profit);
      }
    }

    // Broadcast results to all players
    // Flatten resultData so UIs can read fields directly (e.g. result.price, result.isWinner)
    io.to(`market-${sessionCode}`).emit('round-results', {
      roundId,
      results: results.map((r) => ({
        playerId: r.playerId,
        profit: r.profit,
        ...r.resultData,
        playerName: activePlayers.find((p) => p.id === r.playerId)?.name || 'Unknown',
      })),
      actions: actionData,
    });
    } finally {
      this.resolvingRounds.delete(roundId);
    }
  }

  async processRoundEnd(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<RoundResult> {
    // Get session info
    const round = await RoundModel.findById(roundId);
    if (!round) return { playerResults: [], summary: {} };

    const session = await SessionModel.findById(round.session_id);
    if (!session) return { playerResults: [], summary: {} };

    const activePlayers = await PlayerModel.findActiveBySession(session.id);

    // Check if results already exist (resolved when all submitted)
    const existingResults = await GameResultModel.findByRound(roundId);
    if (existingResults.length === 0) {
      // Timer expired before all submitted — resolve now with whoever submitted
      await this.resolveRound(roundId, sessionCode, io, session, activePlayers);
    }

    // Get final results
    const results = await GameResultModel.findByRound(roundId);
    const actions = await GameActionModel.findByRound(roundId);

    return {
      playerResults: results.map((r) => ({
        playerId: r.player_id,
        profit: Number(r.profit),
        resultData: r.result_data,
      })),
      summary: {
        totalSubmissions: actions.length,
        totalPlayers: activePlayers.length,
        results: results.map((r) => ({
          playerId: r.player_id,
          playerName: activePlayers.find((p) => p.id === r.player_id)?.name || 'Unknown',
          profit: Number(r.profit),
          ...r.result_data,
        })),
      },
    };
  }

  async getGameState(
    roundId: string,
    playerId?: string
  ): Promise<Record<string, any>> {
    const round = await RoundModel.findById(roundId);
    if (!round) return { submitted: false, totalSubmitted: 0, totalPlayers: 0 };

    const session = await SessionModel.findById(round.session_id);
    if (!session) return { submitted: false, totalSubmitted: 0, totalPlayers: 0 };

    const activePlayers = await PlayerModel.findActiveBySession(session.id);
    const totalSubmitted = await GameActionModel.countByRound(roundId, 'decision');

    const hasSubmitted = playerId
      ? await GameActionModel.hasPlayerActed(roundId, playerId, 'decision')
      : false;

    // Get results if available
    const results = await GameResultModel.findByRound(roundId);

    // Get this player's action if they submitted
    let myAction = null;
    if (playerId) {
      const playerActions = await GameActionModel.findByRoundAndPlayer(roundId, playerId);
      if (playerActions.length > 0) {
        myAction = playerActions[0].action_data;
      }
    }

    return {
      submitted: hasSubmitted,
      myAction,
      totalSubmitted,
      totalPlayers: activePlayers.length,
      results: results.length > 0
        ? results.map((r) => ({
            playerId: r.player_id,
            playerName: activePlayers.find((p) => p.id === r.player_id)?.name || 'Unknown',
            profit: Number(r.profit),
            ...r.result_data,
          }))
        : null,
      config: session.game_config || {},
    };
  }
}
