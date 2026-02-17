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
 * Pairing stability:
 * Pairings are computed once per session from ALL players (including inactive)
 * sorted by player ID within each role group. This ensures pairings remain
 * stable even when players disconnect between rounds — indices never shift.
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

  /**
   * Stable pairing map: sessionId -> Map<playerId, partnerId>
   * Built once from ALL players (including inactive) sorted by ID.
   */
  private sessionPairings = new Map<string, Map<string, string>>();

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

  /**
   * Sanitize the first-move action before broadcasting to all players.
   * Subclasses can override to strip hidden information (e.g., quality in Market for Lemons).
   * By default, returns the full action.
   */
  protected sanitizeFirstMoveForBroadcast(action: Record<string, any>): Record<string, any> {
    return action;
  }

  /**
   * Build (or retrieve cached) stable pairings for a session.
   * Uses ALL players (including inactive) sorted by ID within each role group
   * so that pairings never shift when a player disconnects.
   */
  private async getOrBuildPairings(sessionId: string): Promise<Map<string, string>> {
    const existing = this.sessionPairings.get(sessionId);
    if (existing) return existing;

    const [firstMoverRole, secondMoverRole] = this.roles();

    // Use findBySession (ALL players, not just active) for stability
    const allPlayers = await PlayerModel.findBySession(sessionId);
    const firstMovers = allPlayers
      .filter(p => p.role === firstMoverRole)
      .sort((a, b) => a.id.localeCompare(b.id));
    const secondMovers = allPlayers
      .filter(p => p.role === secondMoverRole)
      .sort((a, b) => a.id.localeCompare(b.id));

    const pairMap = new Map<string, string>();
    const numPairs = Math.min(firstMovers.length, secondMovers.length);
    for (let i = 0; i < numPairs; i++) {
      pairMap.set(firstMovers[i].id, secondMovers[i].id);
      pairMap.set(secondMovers[i].id, firstMovers[i].id);
    }

    this.sessionPairings.set(sessionId, pairMap);
    return pairMap;
  }

  /**
   * Find the stable partner for a given player.
   * Returns the partner's ID or undefined if unpaired (odd player out).
   */
  private async findPartner(sessionId: string, playerId: string): Promise<string | undefined> {
    const pairMap = await this.getOrBuildPairings(sessionId);
    return pairMap.get(playerId);
  }

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

    // Check if already submitted (filter by the player's specific action type)
    const actionType = isFirstMover ? 'first_move' : 'second_move';
    const alreadyActed = await GameActionModel.hasPlayerActed(roundId, playerId, actionType);
    if (alreadyActed) {
      return { success: false, error: 'You have already submitted your decision this round' };
    }

    if (isFirstMover) {
      // First mover submits
      const error = this.validateFirstMove(action, config);
      if (error) return { success: false, error };

      await GameActionModel.create(roundId, playerId, 'first_move', action);

      // Find this player's stable partner
      const partnerId = await this.findPartner(session.id, playerId);

      // Get counts for broadcast
      const allPlayers = await PlayerModel.findActiveBySession(session.id);
      const firstMovers = allPlayers.filter(p => p.role === firstMoverRole);
      const firstMoveActions = await GameActionModel.findByRoundAndType(roundId, 'first_move');

      // Broadcast to room — partner can now see the first move
      // Use sanitized action to avoid leaking hidden info (e.g., quality in Market for Lemons)
      io.to(`market-${sessionCode}`).emit('first-move-submitted', {
        playerId,
        playerName: player.name,
        action: this.sanitizeFirstMoveForBroadcast(action),
        totalFirstMoves: firstMoveActions.length,
        totalFirstMovers: firstMovers.length,
        partnerId: partnerId,
      });

      // Check if all active pairs are complete
      await this.checkAllComplete(roundId, sessionCode, io, session);

      return { success: true };
    } else {
      // Second mover responds — they need to see their partner's first move
      const partnerId = await this.findPartner(session.id, playerId);

      if (!partnerId) {
        return { success: false, error: 'No partner assigned yet' };
      }

      // Get partner's first move
      const partnerActions = await GameActionModel.findByRoundAndPlayer(roundId, partnerId);
      const firstMoveAction = partnerActions.find(a => a.action_type === 'first_move');

      if (!firstMoveAction) {
        return { success: false, error: 'Your partner has not submitted yet. Please wait.' };
      }

      const error = this.validateSecondMove(action, firstMoveAction.action_data, config);
      if (error) return { success: false, error };

      await GameActionModel.create(roundId, playerId, 'second_move', action);

      // Get counts for broadcast
      const allPlayers = await PlayerModel.findActiveBySession(session.id);
      const secondMovers = allPlayers.filter(p => p.role === secondMoverRole);
      const secondMoveActions = await GameActionModel.findByRoundAndType(roundId, 'second_move');

      // Broadcast
      io.to(`market-${sessionCode}`).emit('second-move-submitted', {
        playerId,
        playerName: player.name,
        action,
        totalSecondMoves: secondMoveActions.length,
        totalSecondMovers: secondMovers.length,
        partnerId,
      });

      // Check if all active pairs are complete
      await this.checkAllComplete(roundId, sessionCode, io, session);

      return { success: true };
    }
  }

  private async checkAllComplete(
    roundId: string,
    sessionCode: string,
    io: Server,
    session: any
  ): Promise<void> {
    const [firstMoverRole] = this.roles();
    const activePlayers = await PlayerModel.findActiveBySession(session.id);
    const pairMap = await this.getOrBuildPairings(session.id);

    // Count active pairs: both partners must still be active
    const activeFirstMovers = activePlayers.filter(p => p.role === firstMoverRole);
    let activePairCount = 0;
    for (const fm of activeFirstMovers) {
      const partnerId = pairMap.get(fm.id);
      if (partnerId && activePlayers.some(p => p.id === partnerId)) {
        activePairCount++;
      }
    }

    const firstMoveActions = await GameActionModel.findByRoundAndType(roundId, 'first_move');
    const secondMoveActions = await GameActionModel.findByRoundAndType(roundId, 'second_move');

    if (activePairCount > 0 && firstMoveActions.length >= activePairCount && secondMoveActions.length >= activePairCount) {
      // All active pairs complete — calculate results
      await this.resolveRound(roundId, sessionCode, io, session);
    }
  }

  protected async resolveRound(
    roundId: string,
    sessionCode: string,
    io: Server,
    session: any
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
      const pairMap = await this.getOrBuildPairings(session.id);

      // Use ALL players (including inactive) so we can resolve for disconnected partners
      const allPlayersEver = await PlayerModel.findBySession(session.id);
      const activePlayers = await PlayerModel.findActiveBySession(session.id);
      const firstMovers = allPlayersEver
        .filter(p => p.role === firstMoverRole)
        .sort((a, b) => a.id.localeCompare(b.id));

      const firstMoveActions = await GameActionModel.findByRoundAndType(roundId, 'first_move');
      const secondMoveActions = await GameActionModel.findByRoundAndType(roundId, 'second_move');

      const pairResults: Array<{
        firstMover: any;
        secondMover: any;
        firstMoveAction: any;
        secondMoveAction: any;
        result: ReturnType<SequentialBaseEngine['calculatePairResult']>;
        partnerDisconnected?: boolean;
      }> = [];

      for (const fm of firstMovers) {
        const partnerId = pairMap.get(fm.id);
        if (!partnerId) continue; // Unpaired (odd player) — handled in processRoundEnd

        const sm = allPlayersEver.find(p => p.id === partnerId);
        if (!sm) continue;

        const fmAction = firstMoveActions.find(a => a.player_id === fm.id);
        const smAction = secondMoveActions.find(a => a.player_id === sm.id);

        const fmIsActive = activePlayers.some(p => p.id === fm.id);
        const smIsActive = activePlayers.some(p => p.id === sm.id);

        if (fmAction && smAction) {
          // Normal case: both submitted
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
        } else if (!fmIsActive || !smIsActive) {
          // One partner disconnected — give the remaining active player a default result
          const disconnectedRole = !fmIsActive ? firstMoverRole : secondMoverRole;
          const defaultResult = {
            firstMoverProfit: 0,
            secondMoverProfit: 0,
            firstMoverResultData: {
              role: firstMoverRole,
              partnerDisconnected: true,
              disconnectedRole,
            } as Record<string, any>,
            secondMoverResultData: {
              role: secondMoverRole,
              partnerDisconnected: true,
              disconnectedRole,
            } as Record<string, any>,
          };

          // Only create results for players who are still active
          if (fmIsActive) {
            await GameResultModel.create(roundId, fm.id, defaultResult.firstMoverResultData, 0);
          }
          if (smIsActive) {
            await GameResultModel.create(roundId, sm.id, defaultResult.secondMoverResultData, 0);
          }

          pairResults.push({
            firstMover: fm,
            secondMover: sm,
            firstMoveAction: fmAction?.action_data || null,
            secondMoveAction: smAction?.action_data || null,
            result: defaultResult,
            partnerDisconnected: true,
          });
        }
        // If both are active but one hasn't submitted yet, skip (timer will eventually resolve)
      }

      // Broadcast all results
      io.to(`market-${sessionCode}`).emit('round-results', {
        roundId,
        pairs: pairResults.map(pr => ({
          firstMoverId: pr.firstMover.id,
          firstMoverName: pr.firstMover.name,
          secondMoverId: pr.secondMover.id,
          secondMoverName: pr.secondMover.name,
          firstMoveAction: pr.firstMoveAction ? this.sanitizeFirstMoveForBroadcast(pr.firstMoveAction) : null,
          secondMoveAction: pr.secondMoveAction,
          firstMoverProfit: pr.result.firstMoverProfit,
          secondMoverProfit: pr.result.secondMoverProfit,
          firstMoverResultData: pr.result.firstMoverResultData,
          secondMoverResultData: pr.result.secondMoverResultData,
          partnerDisconnected: pr.partnerDisconnected || false,
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

    // Invalidate pairing cache so it gets rebuilt next round with any late joiners
    this.sessionPairings.delete(session.id);

    // Use ALL players (not just active) so resolveRound can handle disconnects
    const allPlayers = await PlayerModel.findBySession(session.id);
    const activePlayers = await PlayerModel.findActiveBySession(session.id);

    // Check if results already exist (from auto-resolve when all pairs completed)
    const existingResults = await GameResultModel.findByRound(roundId);
    if (existingResults.length === 0) {
      await this.resolveRound(roundId, sessionCode, io, session);
    }

    // --- Handle unpaired / incomplete players at round end ---
    // After resolveRound, some active players may still have no result:
    //   1. Unpaired first-movers (no matching second-mover exists)
    //   2. Paired players whose partner never submitted their action
    //   3. Unpaired second-movers (no matching first-mover exists)
    // Give each of them a GameResult with profit=0 so they receive feedback.
    const resultsAfterResolve = await GameResultModel.findByRound(roundId);
    const playerIdsWithResults = new Set(resultsAfterResolve.map(r => r.player_id));

    const [firstMoverRole, secondMoverRole] = this.roles();
    const pairMap = await this.getOrBuildPairings(session.id);

    const unpairedResults: Array<{
      playerId: string;
      playerName: string;
      role: string;
      profit: number;
      resultData: Record<string, any>;
    }> = [];

    for (const player of activePlayers) {
      if (playerIdsWithResults.has(player.id)) continue;

      const isFirstMover = player.role === firstMoverRole;
      const isSecondMover = player.role === secondMoverRole;
      if (!isFirstMover && !isSecondMover) continue;

      // Check whether this player submitted an action
      const playerActions = await GameActionModel.findByRoundAndPlayer(roundId, player.id);
      const submitted = playerActions.length > 0;

      // Use stable pairing to determine reason
      const partnerId = pairMap.get(player.id);
      let reason: string;

      if (!partnerId) {
        reason = 'unpaired';
      } else {
        const partnerIsActive = activePlayers.some(p => p.id === partnerId);
        if (!partnerIsActive) {
          reason = 'partner_disconnected';
        } else if (!submitted) {
          reason = 'did_not_submit';
        } else {
          reason = isFirstMover ? 'partner_did_not_respond' : 'partner_did_not_submit';
        }
      }

      const resultData: Record<string, any> = {
        unpaired: true,
        reason,
        role: player.role,
        submitted,
      };

      await GameResultModel.create(roundId, player.id, resultData, 0);
      await PlayerModel.updateProfit(player.id, 0);

      unpairedResults.push({
        playerId: player.id,
        playerName: player.name || 'Unknown',
        role: player.role || (isFirstMover ? firstMoverRole : secondMoverRole),
        profit: 0,
        resultData,
      });
    }

    // If we created unpaired results, broadcast them so clients get feedback
    if (unpairedResults.length > 0) {
      io.to(`market-${sessionCode}`).emit('unpaired-results', {
        roundId,
        unpairedPlayers: unpairedResults,
      });
    }

    const results = await GameResultModel.findByRound(roundId);

    return {
      playerResults: results.map(r => ({
        playerId: r.player_id,
        profit: Number(r.profit),
        resultData: r.result_data,
      })),
      summary: {
        totalPairs: Math.floor(
          results.filter(r => !r.result_data?.unpaired).length / 2
        ),
        unpairedPlayers: unpairedResults.length,
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
    let partnerDisconnected = false;

    if (playerId) {
      const player = allPlayers.find(p => p.id === playerId);
      myRole = player?.role;

      const myActions = await GameActionModel.findByRoundAndPlayer(roundId, playerId);
      myAction = myActions.length > 0 ? myActions[0].action_data : null;

      // Find partner via stable pairing map
      const partnerId = await this.findPartner(session.id, playerId);
      if (partnerId) {
        const partnerIsActive = allPlayers.some(p => p.id === partnerId);
        partnerDisconnected = !partnerIsActive;

        if (partnerIsActive) {
          const partnerActions = await GameActionModel.findByRoundAndPlayer(roundId, partnerId);
          // Second mover can see first mover's action (sanitized to strip hidden info)
          const isFirst = player?.role === firstMoverRole;
          if (!isFirst && partnerActions.length > 0) {
            partnerAction = this.sanitizeFirstMoveForBroadcast(partnerActions[0].action_data);
          }
        }
      }
    }

    // Build pairs structure matching round-results broadcast shape so UIs
    // display correctly on page reload / reconnect.
    let pairsData: any[] | null = null;
    if (results.length > 0) {
      const [fmRole] = this.roles();
      const pairMap = await this.getOrBuildPairings(session.id);
      const allPlayersEver = await PlayerModel.findBySession(session.id);
      const firstMoverResults = results.filter(r => {
        const p = allPlayersEver.find(pl => pl.id === r.player_id);
        return p?.role === fmRole;
      });

      pairsData = [];
      for (const fmResult of firstMoverResults) {
        const partnerId = pairMap.get(fmResult.player_id);
        if (!partnerId) continue;
        const smResult = results.find(r => r.player_id === partnerId);
        if (!smResult) continue;

        const fm = allPlayersEver.find(p => p.id === fmResult.player_id);
        const sm = allPlayersEver.find(p => p.id === partnerId);

        // Reconstruct the original actions for the pair
        const fmActions = await GameActionModel.findByRoundAndPlayer(roundId, fmResult.player_id);
        const smActions = await GameActionModel.findByRoundAndPlayer(roundId, partnerId);

        pairsData.push({
          firstMoverId: fmResult.player_id,
          firstMoverName: fm?.name || 'Unknown',
          secondMoverId: partnerId,
          secondMoverName: sm?.name || 'Unknown',
          firstMoveAction: this.sanitizeFirstMoveForBroadcast(fmActions.find(a => a.action_type === 'first_move')?.action_data || {}),
          secondMoveAction: smActions.find(a => a.action_type === 'second_move')?.action_data || null,
          firstMoverProfit: Number(fmResult.profit),
          secondMoverProfit: Number(smResult.profit),
          firstMoverResultData: fmResult.result_data,
          secondMoverResultData: smResult.result_data,
          partnerDisconnected: !!(fmResult.result_data?.partnerDisconnected || smResult.result_data?.partnerDisconnected),
        });
      }
    }

    return {
      myRole,
      myAction,
      partnerAction,
      partnerDisconnected,
      firstMovesSubmitted: firstMoveActions.length,
      totalFirstMovers: firstMovers.length,
      secondMovesSubmitted: secondMoveActions.length,
      totalSecondMovers: secondMovers.length,
      pairs: pairsData,
      config: session.game_config || {},
    };
  }
}
