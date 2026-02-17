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
 * Base engine for two-stage sequential games.
 *
 * Pattern:
 * 1. Players are paired (role1 + role2).
 * 2. Stage 1: First movers submit their actions.
 * 3. Stage 2: Second movers see the first mover's action and respond.
 * 4. After both stages complete, payoffs are calculated.
 *
 * Subclasses must implement:
 * - gameType, getUIConfig(), validateConfig()
 * - roles() — returns [firstMoverRole, secondMoverRole]
 * - validateFirstMove() / validateSecondMove()
 * - calculatePairResult() — compute payoffs for one pair
 */
export abstract class SequentialBaseEngine implements GameEngine {
  abstract readonly gameType: GameType;
  abstract getUIConfig(): UIConfig;
  abstract validateConfig(config: Record<string, any>): ValidationResult;

  /** Guard against concurrent resolveRound calls (double-profit bug) */
  private resolvingRounds = new Set<string>();

  /** Return [firstMoverRole, secondMoverRole] */
  protected abstract roles(): [string, string];

  /** Validate the first mover's action */
  protected abstract validateFirstMove(
    action: Record<string, any>,
    config: Record<string, any>
  ): string | null;

  /** Validate the second mover's response */
  protected abstract validateSecondMove(
    action: Record<string, any>,
    firstMoveAction: Record<string, any>,
    config: Record<string, any>
  ): string | null;

  /** Calculate payoffs for a single pair */
  protected abstract calculatePairResult(
    firstMoveAction: Record<string, any>,
    secondMoveAction: Record<string, any>,
    config: Record<string, any>
  ): {
    firstMoverProfit: number;
    secondMoverProfit: number;
    firstMoverResultData: Record<string, any>;
    secondMoverResultData: Record<string, any>;
  };

  async setupPlayers(
    _sessionId: string,
    _playerCount: number,
    _config: Record<string, any>
  ): Promise<void> {
    // Sequential games assign roles during the join flow (handled in playerController)
  }

  async handleAction(
    roundId: string,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    const player = await PlayerModel.findById(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const round = await RoundModel.findById(roundId);
    if (!round) return { success: false, error: 'Round not found' };
    const session = await SessionModel.findById(round.session_id);
    if (!session) return { success: false, error: 'Session not found' };
    const config = session.game_config || {};

    const [firstMoverRole, secondMoverRole] = this.roles();
    const isFirstMover = player.role === firstMoverRole;

    // Check if already submitted
    const alreadyActed = await GameActionModel.hasPlayerActed(roundId, playerId);
    if (alreadyActed) {
      return { success: false, error: 'You have already submitted your decision this round' };
    }

    if (isFirstMover) {
      // First mover submits
      const error = this.validateFirstMove(action, config);
      if (error) return { success: false, error };

      await GameActionModel.create(roundId, playerId, 'first_move', action);

      // Find this player's partner
      const allPlayers = await PlayerModel.findActiveBySession(session.id);
      const firstMovers = allPlayers.filter(p => p.role === firstMoverRole);
      const secondMovers = allPlayers.filter(p => p.role === secondMoverRole);

      // Find partner index (paired by join order)
      const myIndex = firstMovers.findIndex(p => p.id === playerId);
      const partner = secondMovers[myIndex];

      // Broadcast to room — partner can now see the first move
      const firstMoveActions = await GameActionModel.findByRoundAndType(roundId, 'first_move');

      io.to(`market-${sessionCode}`).emit('first-move-submitted', {
        playerId,
        playerName: player.name,
        action,
        totalFirstMoves: firstMoveActions.length,
        totalFirstMovers: firstMovers.length,
        partnerId: partner?.id,
      });

      // Check if all pairs are complete
      await this.checkAllComplete(roundId, sessionCode, io, session, allPlayers);

      return { success: true };
    } else {
      // Second mover responds — they need to see their partner's first move
      const allPlayers = await PlayerModel.findActiveBySession(session.id);
      const firstMovers = allPlayers.filter(p => p.role === firstMoverRole);
      const secondMovers = allPlayers.filter(p => p.role === secondMoverRole);

      const myIndex = secondMovers.findIndex(p => p.id === playerId);
      const partner = firstMovers[myIndex];

      if (!partner) {
        return { success: false, error: 'No partner assigned yet' };
      }

      // Get partner's first move
      const partnerActions = await GameActionModel.findByRoundAndPlayer(roundId, partner.id);
      const firstMoveAction = partnerActions.find(a => a.action_type === 'first_move');

      if (!firstMoveAction) {
        return { success: false, error: 'Your partner has not submitted yet. Please wait.' };
      }

      const error = this.validateSecondMove(action, firstMoveAction.action_data, config);
      if (error) return { success: false, error };

      await GameActionModel.create(roundId, playerId, 'second_move', action);

      // Broadcast
      const secondMoveActions = await GameActionModel.findByRoundAndType(roundId, 'second_move');

      io.to(`market-${sessionCode}`).emit('second-move-submitted', {
        playerId,
        playerName: player.name,
        action,
        totalSecondMoves: secondMoveActions.length,
        totalSecondMovers: secondMovers.length,
        partnerId: partner.id,
      });

      // Check if all pairs are complete
      await this.checkAllComplete(roundId, sessionCode, io, session, allPlayers);

      return { success: true };
    }
  }

  private async checkAllComplete(
    roundId: string,
    sessionCode: string,
    io: Server,
    session: any,
    allPlayers: any[]
  ): Promise<void> {
    const [firstMoverRole, secondMoverRole] = this.roles();
    const firstMovers = allPlayers.filter(p => p.role === firstMoverRole);
    const secondMovers = allPlayers.filter(p => p.role === secondMoverRole);

    const firstMoveActions = await GameActionModel.findByRoundAndType(roundId, 'first_move');
    const secondMoveActions = await GameActionModel.findByRoundAndType(roundId, 'second_move');

    const numPairs = Math.min(firstMovers.length, secondMovers.length);

    if (firstMoveActions.length >= numPairs && secondMoveActions.length >= numPairs) {
      // All pairs complete — calculate results
      await this.resolveRound(roundId, sessionCode, io, session, allPlayers);
    }
  }

  protected async resolveRound(
    roundId: string,
    sessionCode: string,
    io: Server,
    session: any,
    allPlayers: any[]
  ): Promise<void> {
    // Prevent concurrent resolution (race between last-submit and timer-end)
    if (this.resolvingRounds.has(roundId)) return;
    this.resolvingRounds.add(roundId);

    try {
      // Double-check: if results already exist, skip
      const existingResults = await GameResultModel.findByRound(roundId);
      if (existingResults.length > 0) return;

    const config = session.game_config || {};
    const [firstMoverRole, secondMoverRole] = this.roles();

    const firstMovers = allPlayers.filter(p => p.role === firstMoverRole);
    const secondMovers = allPlayers.filter(p => p.role === secondMoverRole);

    const firstMoveActions = await GameActionModel.findByRoundAndType(roundId, 'first_move');
    const secondMoveActions = await GameActionModel.findByRoundAndType(roundId, 'second_move');

    const pairResults: Array<{
      firstMover: any;
      secondMover: any;
      firstMoveAction: any;
      secondMoveAction: any;
      result: ReturnType<SequentialBaseEngine['calculatePairResult']>;
    }> = [];

    const numPairs = Math.min(firstMovers.length, secondMovers.length);
    for (let i = 0; i < numPairs; i++) {
      const fm = firstMovers[i];
      const sm = secondMovers[i];

      const fmAction = firstMoveActions.find(a => a.player_id === fm.id);
      const smAction = secondMoveActions.find(a => a.player_id === sm.id);

      if (fmAction && smAction) {
        const result = this.calculatePairResult(
          fmAction.action_data,
          smAction.action_data,
          config
        );

        await GameResultModel.create(roundId, fm.id, result.firstMoverResultData, result.firstMoverProfit);
        await GameResultModel.create(roundId, sm.id, result.secondMoverResultData, result.secondMoverProfit);
        await PlayerModel.updateProfit(fm.id, result.firstMoverProfit);
        await PlayerModel.updateProfit(sm.id, result.secondMoverProfit);

        pairResults.push({
          firstMover: fm,
          secondMover: sm,
          firstMoveAction: fmAction.action_data,
          secondMoveAction: smAction.action_data,
          result,
        });
      }
    }

    // Broadcast all results
    io.to(`market-${sessionCode}`).emit('round-results', {
      roundId,
      pairs: pairResults.map(pr => ({
        firstMoverId: pr.firstMover.id,
        firstMoverName: pr.firstMover.name,
        secondMoverId: pr.secondMover.id,
        secondMoverName: pr.secondMover.name,
        firstMoveAction: pr.firstMoveAction,
        secondMoveAction: pr.secondMoveAction,
        firstMoverProfit: pr.result.firstMoverProfit,
        secondMoverProfit: pr.result.secondMoverProfit,
        firstMoverResultData: pr.result.firstMoverResultData,
        secondMoverResultData: pr.result.secondMoverResultData,
      })),
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
    const round = await RoundModel.findById(roundId);
    if (!round) return { playerResults: [], summary: {} };

    const session = await SessionModel.findById(round.session_id);
    if (!session) return { playerResults: [], summary: {} };

    const allPlayers = await PlayerModel.findActiveBySession(session.id);

    // Check if results already exist
    const existingResults = await GameResultModel.findByRound(roundId);
    if (existingResults.length === 0) {
      await this.resolveRound(roundId, sessionCode, io, session, allPlayers);
    }

    const results = await GameResultModel.findByRound(roundId);

    return {
      playerResults: results.map(r => ({
        playerId: r.player_id,
        profit: Number(r.profit),
        resultData: r.result_data,
      })),
      summary: {
        totalPairs: Math.floor(results.length / 2),
        results: results.map(r => ({
          playerId: r.player_id,
          playerName: allPlayers.find(p => p.id === r.player_id)?.name || 'Unknown',
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
    if (!round) return { stage: 'waiting' };

    const session = await SessionModel.findById(round.session_id);
    if (!session) return { stage: 'waiting' };

    const allPlayers = await PlayerModel.findActiveBySession(session.id);
    const [firstMoverRole, secondMoverRole] = this.roles();
    const firstMovers = allPlayers.filter(p => p.role === firstMoverRole);
    const secondMovers = allPlayers.filter(p => p.role === secondMoverRole);

    const firstMoveActions = await GameActionModel.findByRoundAndType(roundId, 'first_move');
    const secondMoveActions = await GameActionModel.findByRoundAndType(roundId, 'second_move');
    const results = await GameResultModel.findByRound(roundId);

    let myAction = null;
    let partnerAction = null;
    let myRole = null;

    if (playerId) {
      const player = allPlayers.find(p => p.id === playerId);
      myRole = player?.role;

      const myActions = await GameActionModel.findByRoundAndPlayer(roundId, playerId);
      myAction = myActions.length > 0 ? myActions[0].action_data : null;

      // Find partner
      const isFirst = player?.role === firstMoverRole;
      const myGroup = isFirst ? firstMovers : secondMovers;
      const partnerGroup = isFirst ? secondMovers : firstMovers;
      const myIndex = myGroup.findIndex(p => p.id === playerId);
      const partner = partnerGroup[myIndex];

      if (partner) {
        const partnerActions = await GameActionModel.findByRoundAndPlayer(roundId, partner.id);
        // Second mover can see first mover's action
        if (!isFirst && partnerActions.length > 0) {
          partnerAction = partnerActions[0].action_data;
        }
      }
    }

    return {
      myRole,
      myAction,
      partnerAction,
      firstMovesSubmitted: firstMoveActions.length,
      totalFirstMovers: firstMovers.length,
      secondMovesSubmitted: secondMoveActions.length,
      totalSecondMovers: secondMovers.length,
      results: results.length > 0
        ? results.map(r => ({
            playerId: r.player_id,
            playerName: allPlayers.find(p => p.id === r.player_id)?.name || 'Unknown',
            profit: Number(r.profit),
            ...r.result_data,
          }))
        : null,
      config: session.game_config || {},
    };
  }
}
