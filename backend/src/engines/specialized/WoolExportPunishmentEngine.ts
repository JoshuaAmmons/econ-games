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
import { pool } from '../../config/database';

// ============================================================================
// Types
// ============================================================================

type PunishmentLevel = 'low' | 'high';
type SmugglerDecision = 'trade_locally' | 'smuggle';
type HarborWatchDecision = 'blind_eye' | 'report';
type GroupStage = 'smuggler_decision' | 'harbor_watch_decision' | 'complete';

interface GroupState {
  groupId: number;
  smugglerId: string;
  portMerchantId: string;
  foreignContactId: string;
  harborWatchId: string;
  stage: GroupStage;
  smugglerDecision: SmugglerDecision | null;
  harborWatchDecision: HarborWatchDecision | null;
}

interface RoundState {
  groups: Map<number, GroupState>;          // groupId -> GroupState
  playerToGroup: Map<string, number>;       // playerId -> groupId
  config: Record<string, any>;
  sessionId: string;
  resolved: boolean;                        // whether processRoundEnd already ran
}

// ============================================================================
// Constants
// ============================================================================

const ROLES = ['smuggler', 'port_merchant', 'foreign_contact', 'harbor_watch'] as const;
type Role = typeof ROLES[number];

const ROLE_LABELS: Record<Role, string> = {
  smuggler: 'Smuggler Captain',
  port_merchant: 'Port Merchant',
  foreign_contact: 'Foreign Contact',
  harbor_watch: 'Harbor Watch',
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  smuggler: 'You decide whether to trade locally or smuggle cargo overseas',
  port_merchant: 'You benefit from local trade but are harmed by smuggling',
  foreign_contact: 'You benefit when smuggling occurs',
  harbor_watch: 'You can report smuggling to authorities if it occurs',
};

// ============================================================================
// Engine
// ============================================================================

/**
 * Wool Export Punishment Engine (Specialized)
 *
 * Based on: Aimone, Rentschler, Smith & Wilson (2025) "Sympathy with Resentment"
 *
 * A one-shot, 4-player extensive-form game per group using a pirate/smuggler framing.
 *
 * Roles:
 * - Smuggler Captain (Wool Producer) decides to trade locally or smuggle overseas
 * - Port Merchant (Domestic Weaver) benefits from legal trade, harmed by smuggling
 * - Foreign Contact (Foreign Weaver) benefits from smuggling
 * - Harbor Watch (Domestic Observer) can report smuggling to authorities
 *
 * Game flow (within a single round):
 * Stage 1: Smuggler Captain decides "Trade Locally" or "Smuggle Overseas"
 *   - If "Trade Locally": game ends immediately with legal payoffs
 *   - If "Smuggle Overseas": advance to Stage 2
 * Stage 2: Harbor Watch decides "Turn a Blind Eye" or "Report to Authorities"
 *   - Fine imposed depends on config punishment_level (low or high)
 *
 * Players are grouped into sets of 4. Each group plays independently.
 * Port Merchant and Foreign Contact are passive observers (no decisions).
 */
export class WoolExportPunishmentEngine implements GameEngine {
  readonly gameType: GameType = 'wool_export_punishment' as GameType;

  // In-memory round states keyed by roundId
  private roundStates: Map<string, RoundState> = new Map();

  // ========================================================================
  // UI Config
  // ========================================================================

  getUIConfig(): UIConfig {
    return {
      name: 'Wool Export Punishment',
      description:
        'A 4-player extensive-form game. The Smuggler Captain decides whether to trade locally or smuggle overseas. If smuggling occurs, the Harbor Watch can report it to authorities.',
      category: 'specialized',
      weekNumber: 31,
      roles: ROLES.map(role => ({
        role,
        label: ROLE_LABELS[role],
        description: ROLE_DESCRIPTIONS[role],
      })),
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'punishment_level',
          label: 'Punishment Level',
          type: 'select',
          default: 'low',
          options: [
            { value: 'low', label: 'Low Fine ($4)' },
            { value: 'high', label: 'High Fine ($23)' },
          ],
          description: 'Severity of the fine when smuggling is reported',
        },
        {
          name: 'low_fine',
          label: 'Low Fine (cents)',
          type: 'number',
          default: 400,
          min: 0,
          max: 10000,
          description: 'Fine amount in cents when punishment_level is low',
        },
        {
          name: 'high_fine',
          label: 'High Fine (cents)',
          type: 'number',
          default: 2300,
          min: 0,
          max: 10000,
          description: 'Fine amount in cents when punishment_level is high',
        },
        {
          name: 'base_payoff_smuggler',
          label: 'Smuggler Base Payoff (cents)',
          type: 'number',
          default: 2000,
          min: 0,
          max: 10000,
          description: 'Smuggler payoff when trading locally',
        },
        {
          name: 'base_payoff_port_merchant',
          label: 'Port Merchant Base Payoff (cents)',
          type: 'number',
          default: 2000,
          min: 0,
          max: 10000,
          description: 'Port Merchant payoff when trade is local',
        },
        {
          name: 'base_payoff_foreign_contact',
          label: 'Foreign Contact Base Payoff (cents)',
          type: 'number',
          default: 1500,
          min: 0,
          max: 10000,
          description: 'Foreign Contact payoff (baseline)',
        },
        {
          name: 'base_payoff_harbor_watch',
          label: 'Harbor Watch Payoff (cents)',
          type: 'number',
          default: 2700,
          min: 0,
          max: 10000,
          description: 'Harbor Watch payoff (constant regardless of outcome)',
        },
        {
          name: 'smuggle_bonus',
          label: 'Smuggle Bonus (cents)',
          type: 'number',
          default: 300,
          min: 0,
          max: 5000,
          description: 'Extra payoff to smuggler for smuggling (before fine)',
        },
        {
          name: 'domestic_loss',
          label: 'Domestic Loss (cents)',
          type: 'number',
          default: 500,
          min: 0,
          max: 5000,
          description: 'Port Merchant loss when smuggling occurs',
        },
        {
          name: 'foreign_gain',
          label: 'Foreign Gain (cents)',
          type: 'number',
          default: 200,
          min: 0,
          max: 5000,
          description: 'Foreign Contact additional gain when smuggling occurs',
        },
        {
          name: 'num_rounds',
          label: 'Number of Rounds',
          type: 'number',
          default: 1,
          min: 1,
          max: 20,
          description: 'Number of rounds (typically 1 for one-shot design)',
        },
        {
          name: 'time_per_round',
          label: 'Time per Round (seconds)',
          type: 'number',
          default: 120,
          min: 30,
          max: 600,
        },
      ],
    };
  }

  // ========================================================================
  // Validation
  // ========================================================================

  validateConfig(config: Record<string, any>): ValidationResult {
    const punishmentLevel = config.punishment_level ?? 'low';
    if (punishmentLevel !== 'low' && punishmentLevel !== 'high') {
      return { valid: false, error: 'punishment_level must be "low" or "high"' };
    }

    const lowFine = config.low_fine ?? 400;
    const highFine = config.high_fine ?? 2300;
    if (lowFine < 0) return { valid: false, error: 'Low fine cannot be negative' };
    if (highFine < 0) return { valid: false, error: 'High fine cannot be negative' };
    if (highFine < lowFine) return { valid: false, error: 'High fine should be >= low fine' };

    const baseSmuggler = config.base_payoff_smuggler ?? 2000;
    const smuggleBonus = config.smuggle_bonus ?? 300;
    if (baseSmuggler < 0) return { valid: false, error: 'Smuggler base payoff cannot be negative' };
    if (smuggleBonus < 0) return { valid: false, error: 'Smuggle bonus cannot be negative' };

    // Ensure high fine doesn't make payoff negative beyond smuggler's means
    // (It's intentional that high fine can wipe out smuggler entirely)

    const domesticLoss = config.domestic_loss ?? 500;
    const foreignGain = config.foreign_gain ?? 200;
    if (domesticLoss < 0) return { valid: false, error: 'Domestic loss cannot be negative' };
    if (foreignGain < 0) return { valid: false, error: 'Foreign gain cannot be negative' };

    return { valid: true };
  }

  // ========================================================================
  // Setup Players
  // ========================================================================

  /**
   * Group players into sets of 4 and assign roles within each group.
   * Roles are assigned round-robin: smuggler, port_merchant, foreign_contact, harbor_watch.
   * Group assignment and role stored in player.game_data.
   */
  async setupPlayers(
    sessionId: string,
    _playerCount: number,
    _config: Record<string, any>
  ): Promise<void> {
    const players = await PlayerModel.findBySession(sessionId);
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    const groupSize = 4;
    const numGroups = Math.floor(shuffled.length / groupSize);

    if (numGroups === 0) {
      console.warn(`[WoolExportPunishment] Not enough players for a group of 4. Have ${shuffled.length} players.`);
    }

    for (let i = 0; i < shuffled.length; i++) {
      const groupIndex = Math.floor(i / groupSize);
      const roleIndex = i % groupSize;

      // Players beyond the last complete group go into the last group as observers
      // but ideally market_size should be a multiple of 4
      const assignedGroup = groupIndex < numGroups ? groupIndex : numGroups - 1;
      const role: Role = roleIndex < ROLES.length ? ROLES[roleIndex] : 'port_merchant';

      await pool.query(
        `UPDATE players SET role = $1, game_data = $2 WHERE id = $3`,
        [
          role,
          JSON.stringify({ groupId: assignedGroup, role }),
          shuffled[i].id,
        ]
      );
    }

    console.log(
      `[WoolExportPunishment] setupPlayers: ${shuffled.length} players -> ${numGroups} group(s) of 4`
    );
  }

  // ========================================================================
  // Round Start
  // ========================================================================

  async onRoundStart(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<void> {
    const round = await RoundModel.findById(roundId);
    if (!round) return;
    const session = await SessionModel.findById(round.session_id);
    if (!session) return;
    const config = session.game_config || {};

    const players = await PlayerModel.findActiveBySession(session.id);

    // Build groups from player game_data
    const groupsMap = new Map<number, Partial<GroupState>>();
    const playerToGroup = new Map<string, number>();

    for (const player of players) {
      const gd = player.game_data as { groupId: number; role: Role } | undefined;
      if (!gd || gd.groupId === undefined) {
        console.warn(`[WoolExportPunishment] Player ${player.id} has no group assignment`);
        continue;
      }

      const groupId = gd.groupId;
      playerToGroup.set(player.id, groupId);

      if (!groupsMap.has(groupId)) {
        groupsMap.set(groupId, {
          groupId,
          stage: 'smuggler_decision',
          smugglerDecision: null,
          harborWatchDecision: null,
        });
      }

      const group = groupsMap.get(groupId)!;
      const role = gd.role || player.role;

      switch (role) {
        case 'smuggler':
          group.smugglerId = player.id;
          break;
        case 'port_merchant':
          group.portMerchantId = player.id;
          break;
        case 'foreign_contact':
          group.foreignContactId = player.id;
          break;
        case 'harbor_watch':
          group.harborWatchId = player.id;
          break;
      }
    }

    // Validate all groups have the required smuggler and harbor_watch roles
    const groups = new Map<number, GroupState>();
    for (const [groupId, partial] of groupsMap) {
      if (!partial.smugglerId) {
        console.error(`[WoolExportPunishment] Group ${groupId} has no smuggler`);
        continue;
      }
      if (!partial.harborWatchId) {
        console.error(`[WoolExportPunishment] Group ${groupId} has no harbor watch`);
        continue;
      }

      groups.set(groupId, {
        groupId,
        smugglerId: partial.smugglerId!,
        portMerchantId: partial.portMerchantId || '',
        foreignContactId: partial.foreignContactId || '',
        harborWatchId: partial.harborWatchId!,
        stage: 'smuggler_decision',
        smugglerDecision: null,
        harborWatchDecision: null,
      });
    }

    const state: RoundState = {
      groups,
      playerToGroup,
      config,
      sessionId: session.id,
      resolved: false,
    };

    this.roundStates.set(roundId, state);

    // Broadcast initial state to all players
    io.to(`market-${sessionCode}`).emit('game-state', {
      stage: 'smuggler_decision',
      groupCount: groups.size,
      message: 'Smuggler Captains are making their decisions...',
    });

    console.log(
      `[WoolExportPunishment] Round ${roundId} started with ${groups.size} group(s), punishment_level=${config.punishment_level || 'low'}`
    );
  }

  // ========================================================================
  // Handle Action
  // ========================================================================

  async handleAction(
    roundId: string,
    playerId: string,
    action: Record<string, any>,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    const player = await PlayerModel.findById(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const state = this.roundStates.get(roundId);
    if (!state) return { success: false, error: 'Round not initialized' };

    const groupId = state.playerToGroup.get(playerId);
    if (groupId === undefined) return { success: false, error: 'Player has no group assignment' };

    const group = state.groups.get(groupId);
    if (!group) return { success: false, error: 'Group not found' };

    if (group.stage === 'complete') {
      return { success: false, error: 'Your group has already completed this round' };
    }

    const actionType = action.type;

    // Store action in DB
    await GameActionModel.create(roundId, playerId, actionType || 'unknown', action);

    // ---------- Stage 1: Smuggler decision ----------
    if (actionType === 'trade_locally' || actionType === 'smuggle') {
      return this.handleSmugglerDecision(
        state, group, playerId, actionType as SmugglerDecision, roundId, sessionCode, io
      );
    }

    // ---------- Stage 2: Harbor Watch decision ----------
    if (actionType === 'blind_eye' || actionType === 'report') {
      return this.handleHarborWatchDecision(
        state, group, playerId, actionType as HarborWatchDecision, roundId, sessionCode, io
      );
    }

    return { success: false, error: `Unknown action type: ${actionType}` };
  }

  // ========================================================================
  // Smuggler Decision (Stage 1)
  // ========================================================================

  private async handleSmugglerDecision(
    state: RoundState,
    group: GroupState,
    playerId: string,
    decision: SmugglerDecision,
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    if (group.stage !== 'smuggler_decision') {
      return { success: false, error: 'It is not the smuggler decision stage' };
    }

    if (playerId !== group.smugglerId) {
      return { success: false, error: 'Only the Smuggler Captain can make this decision' };
    }

    if (group.smugglerDecision !== null) {
      return { success: false, error: 'You have already made your decision' };
    }

    group.smugglerDecision = decision;

    // Notify all group members of the smuggler's decision
    const groupPlayerIds = this.getGroupPlayerIds(group);
    this.emitToGroupPlayers(io, sessionCode, groupPlayerIds, 'smuggler-decided', {
      groupId: group.groupId,
      decision,
    });

    if (decision === 'trade_locally') {
      // Game ends for this group immediately
      group.stage = 'complete';

      const payoffs = this.calculatePayoffs(state.config, group);

      // Save results and notify
      await this.saveGroupResults(roundId, group, payoffs, state);

      this.emitToGroupPlayers(io, sessionCode, groupPlayerIds, 'group-results', {
        groupId: group.groupId,
        decisions: {
          smuggler: 'trade_locally',
          harborWatch: null,
        },
        payoffs,
      });

      // Check if all groups are complete
      this.checkAllGroupsComplete(state, roundId, sessionCode, io);

      return {
        success: true,
        reply: {
          event: 'action-confirmed',
          data: { message: 'You chose to trade locally. The round is complete for your group.' },
        },
      };
    }

    // decision === 'smuggle': advance to harbor watch stage
    group.stage = 'harbor_watch_decision';

    console.log(
      `[WoolExportPunishment] Group ${group.groupId}: Smuggler chose to smuggle. Waiting for Harbor Watch.`
    );

    return {
      success: true,
      reply: {
        event: 'action-confirmed',
        data: { message: 'You chose to smuggle overseas. Waiting for the Harbor Watch to decide...' },
      },
    };
  }

  // ========================================================================
  // Harbor Watch Decision (Stage 2)
  // ========================================================================

  private async handleHarborWatchDecision(
    state: RoundState,
    group: GroupState,
    playerId: string,
    decision: HarborWatchDecision,
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<ActionResult> {
    if (group.stage !== 'harbor_watch_decision') {
      return { success: false, error: 'It is not the Harbor Watch decision stage' };
    }

    if (playerId !== group.harborWatchId) {
      return { success: false, error: 'Only the Harbor Watch can make this decision' };
    }

    if (group.harborWatchDecision !== null) {
      return { success: false, error: 'You have already made your decision' };
    }

    group.harborWatchDecision = decision;
    group.stage = 'complete';

    const groupPlayerIds = this.getGroupPlayerIds(group);

    // Notify all group members
    this.emitToGroupPlayers(io, sessionCode, groupPlayerIds, 'harbor-watch-decided', {
      groupId: group.groupId,
      decision,
    });

    const payoffs = this.calculatePayoffs(state.config, group);

    // Save results
    await this.saveGroupResults(roundId, group, payoffs, state);

    // Send final results to group
    this.emitToGroupPlayers(io, sessionCode, groupPlayerIds, 'group-results', {
      groupId: group.groupId,
      decisions: {
        smuggler: group.smugglerDecision,
        harborWatch: decision,
      },
      payoffs,
    });

    // Check if all groups are complete
    this.checkAllGroupsComplete(state, roundId, sessionCode, io);

    const actionLabel = decision === 'blind_eye'
      ? 'You turned a blind eye. The smuggler keeps their profit.'
      : 'You reported the smuggling. A fine has been imposed.';

    console.log(
      `[WoolExportPunishment] Group ${group.groupId}: Harbor Watch chose ${decision}. Group complete.`
    );

    return {
      success: true,
      reply: {
        event: 'action-confirmed',
        data: { message: actionLabel },
      },
    };
  }

  // ========================================================================
  // Process Round End
  // ========================================================================

  async processRoundEnd(
    roundId: string,
    sessionCode: string,
    io: Server
  ): Promise<RoundResult> {
    const state = this.roundStates.get(roundId);

    if (state && !state.resolved) {
      // Resolve any incomplete groups with default decisions
      for (const [, group] of state.groups) {
        if (group.stage === 'complete') continue;

        // Default: smuggler didn't decide -> trade_locally
        if (group.stage === 'smuggler_decision') {
          group.smugglerDecision = 'trade_locally';
          group.stage = 'complete';

          console.log(
            `[WoolExportPunishment] Group ${group.groupId}: Smuggler timed out, defaulting to trade_locally`
          );
        }
        // Default: harbor watch didn't decide -> blind_eye
        else if (group.stage === 'harbor_watch_decision') {
          group.harborWatchDecision = 'blind_eye';
          group.stage = 'complete';

          console.log(
            `[WoolExportPunishment] Group ${group.groupId}: Harbor Watch timed out, defaulting to blind_eye`
          );
        }

        const payoffs = this.calculatePayoffs(state.config, group);
        await this.saveGroupResults(roundId, group, payoffs, state);

        const groupPlayerIds = this.getGroupPlayerIds(group);
        this.emitToGroupPlayers(io, sessionCode, groupPlayerIds, 'group-results', {
          groupId: group.groupId,
          decisions: {
            smuggler: group.smugglerDecision,
            harborWatch: group.harborWatchDecision,
          },
          payoffs,
          timedOut: true,
        });
      }

      state.resolved = true;
    }

    // Read results from DB
    const results = await GameResultModel.findByRound(roundId);
    const playerResults = (results || []).map((r: any) => ({
      playerId: r.player_id,
      profit: r.profit ?? 0,
      resultData: r.result_data || {},
    }));

    // Build summary
    const groupSummaries: Array<{
      groupId: number;
      smugglerDecision: string | null;
      harborWatchDecision: string | null;
      outcome: string;
    }> = [];

    if (state) {
      for (const [, group] of state.groups) {
        const outcome = this.getOutcomeLabel(group);
        groupSummaries.push({
          groupId: group.groupId,
          smugglerDecision: group.smugglerDecision,
          harborWatchDecision: group.harborWatchDecision,
          outcome,
        });
      }
    }

    const summary = {
      groupCount: groupSummaries.length,
      groups: groupSummaries,
      punishmentLevel: state?.config?.punishment_level || 'low',
    };

    // Clean up round state
    this.roundStates.delete(roundId);

    return { playerResults, summary };
  }

  // ========================================================================
  // Get Game State (reconnection)
  // ========================================================================

  async getGameState(
    roundId: string,
    playerId?: string
  ): Promise<Record<string, any>> {
    const state = this.roundStates.get(roundId);

    if (!state) {
      // Check for existing results
      const results = await GameResultModel.findByRound(roundId);
      if (results && results.length > 0) {
        const playerResult = playerId
          ? results.find((r: any) => r.player_id === playerId)
          : null;
        return {
          stage: 'complete',
          results: playerResult ? playerResult.result_data : null,
          allResults: results.map((r: any) => ({
            playerId: r.player_id,
            profit: r.profit,
            resultData: r.result_data,
          })),
        };
      }
      return { stage: 'unknown' };
    }

    const gameState: Record<string, any> = {
      groupCount: state.groups.size,
      punishmentLevel: state.config.punishment_level || 'low',
    };

    if (playerId) {
      const groupId = state.playerToGroup.get(playerId);
      if (groupId !== undefined) {
        const group = state.groups.get(groupId);
        if (group) {
          const playerGameData = await this.getPlayerGameData(playerId);
          const role = playerGameData?.role || 'unknown';

          gameState.myRole = role;
          gameState.myRoleLabel = ROLE_LABELS[role as Role] || role;
          gameState.groupId = groupId;
          gameState.stage = group.stage;

          // What has happened so far (visible to all group members)
          if (group.smugglerDecision !== null) {
            gameState.smugglerDecision = group.smugglerDecision;
          }

          if (group.harborWatchDecision !== null) {
            gameState.harborWatchDecision = group.harborWatchDecision;
          }

          // If group is complete, include payoffs
          if (group.stage === 'complete') {
            const payoffs = this.calculatePayoffs(state.config, group);
            gameState.payoffs = payoffs;
          }

          // Is it this player's turn to act?
          gameState.isMyTurn = false;
          if (group.stage === 'smuggler_decision' && playerId === group.smugglerId) {
            gameState.isMyTurn = true;
          } else if (group.stage === 'harbor_watch_decision' && playerId === group.harborWatchId) {
            gameState.isMyTurn = true;
          }
        }
      }
    }

    // Summary of all groups' stages (for admin/instructor view)
    const groupStages: Array<{ groupId: number; stage: GroupStage }> = [];
    for (const [gId, group] of state.groups) {
      groupStages.push({ groupId: gId, stage: group.stage });
    }
    gameState.groupStages = groupStages;

    return gameState;
  }

  // ========================================================================
  // Payoff Calculation
  // ========================================================================

  /**
   * Calculate payoffs for all 4 players in a group based on decisions made.
   *
   * Payoff table (in cents):
   * | Outcome                    | Smuggler              | Port Merchant              | Foreign Contact              | Harbor Watch |
   * |----------------------------|-----------------------|----------------------------|------------------------------|--------------|
   * | Trade Locally              | base_smuggler         | base_port_merchant         | base_foreign_contact         | base_hw      |
   * | Smuggle, Not Reported      | base + bonus          | base_pm - domestic_loss    | base_fc + foreign_gain       | base_hw      |
   * | Smuggle, Reported (LOW)    | base + bonus - low_fine | base_pm - domestic_loss  | base_fc + foreign_gain       | base_hw      |
   * | Smuggle, Reported (HIGH)   | base + bonus - high_fine| base_pm - domestic_loss  | base_fc + foreign_gain       | base_hw      |
   */
  private calculatePayoffs(
    config: Record<string, any>,
    group: GroupState
  ): Record<string, { playerId: string; role: Role; payoff: number }> {
    const baseSmuggler = config.base_payoff_smuggler ?? 2000;
    const basePortMerchant = config.base_payoff_port_merchant ?? 2000;
    const baseForeignContact = config.base_payoff_foreign_contact ?? 1500;
    const baseHarborWatch = config.base_payoff_harbor_watch ?? 2700;
    const smuggleBonus = config.smuggle_bonus ?? 300;
    const domesticLoss = config.domestic_loss ?? 500;
    const foreignGain = config.foreign_gain ?? 200;
    const punishmentLevel: PunishmentLevel = config.punishment_level || 'low';
    const lowFine = config.low_fine ?? 400;
    const highFine = config.high_fine ?? 2300;

    let smugglerPayoff: number;
    let portMerchantPayoff: number;
    let foreignContactPayoff: number;
    const harborWatchPayoff = baseHarborWatch; // Always the same

    if (group.smugglerDecision === 'trade_locally' || group.smugglerDecision === null) {
      // Trade locally outcome
      smugglerPayoff = baseSmuggler;
      portMerchantPayoff = basePortMerchant;
      foreignContactPayoff = baseForeignContact;
    } else {
      // Smuggling occurred
      portMerchantPayoff = basePortMerchant - domesticLoss;
      foreignContactPayoff = baseForeignContact + foreignGain;

      if (group.harborWatchDecision === 'report') {
        // Smuggling reported - fine depends on punishment level
        const fine = punishmentLevel === 'high' ? highFine : lowFine;
        smugglerPayoff = baseSmuggler + smuggleBonus - fine;
      } else {
        // Smuggling not reported (blind_eye or null/default)
        smugglerPayoff = baseSmuggler + smuggleBonus;
      }
    }

    return {
      smuggler: { playerId: group.smugglerId, role: 'smuggler', payoff: smugglerPayoff },
      port_merchant: { playerId: group.portMerchantId, role: 'port_merchant', payoff: portMerchantPayoff },
      foreign_contact: { playerId: group.foreignContactId, role: 'foreign_contact', payoff: foreignContactPayoff },
      harbor_watch: { playerId: group.harborWatchId, role: 'harbor_watch', payoff: harborWatchPayoff },
    };
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  /**
   * Save group results to the database and update player profits.
   * Skips players who already have a result for this round (idempotent).
   */
  private async saveGroupResults(
    roundId: string,
    group: GroupState,
    payoffs: Record<string, { playerId: string; role: Role; payoff: number }>,
    state: RoundState
  ): Promise<void> {
    const outcome = this.getOutcomeLabel(group);
    const punishmentLevel = state.config.punishment_level || 'low';

    for (const [roleKey, info] of Object.entries(payoffs)) {
      if (!info.playerId) continue; // Skip if role was unfilled

      // Check if result already exists (idempotent)
      const existing = await GameResultModel.findByRoundAndPlayer(roundId, info.playerId);
      if (existing) continue;

      const resultData = {
        role: info.role,
        roleLabel: ROLE_LABELS[info.role],
        groupId: group.groupId,
        outcome,
        smugglerDecision: group.smugglerDecision,
        harborWatchDecision: group.harborWatchDecision,
        punishmentLevel,
        payoff: info.payoff,
      };

      await GameResultModel.create(roundId, info.playerId, resultData, info.payoff);

      await pool.query(
        'UPDATE players SET total_profit = COALESCE(total_profit, 0) + $1 WHERE id = $2',
        [info.payoff, info.playerId]
      );
    }
  }

  /**
   * Get all player IDs in a group.
   */
  private getGroupPlayerIds(group: GroupState): string[] {
    const ids: string[] = [];
    if (group.smugglerId) ids.push(group.smugglerId);
    if (group.portMerchantId) ids.push(group.portMerchantId);
    if (group.foreignContactId) ids.push(group.foreignContactId);
    if (group.harborWatchId) ids.push(group.harborWatchId);
    return ids;
  }

  /**
   * Emit an event to specific players in a session room.
   * Uses socket.io room membership to find the right sockets.
   */
  private emitToGroupPlayers(
    io: Server,
    sessionCode: string,
    playerIds: string[],
    event: string,
    data: any
  ): void {
    const room = `market-${sessionCode}`;
    const sockets = io.sockets.adapter.rooms.get(room);
    if (!sockets) return;

    const playerIdSet = new Set(playerIds);

    for (const socketId of sockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && playerIdSet.has((socket as any).playerId)) {
        socket.emit(event, data);
      }
    }
  }

  /**
   * Check if all groups have completed. If so, broadcast round-complete hint.
   */
  private checkAllGroupsComplete(
    state: RoundState,
    roundId: string,
    sessionCode: string,
    io: Server
  ): void {
    let allComplete = true;
    for (const [, group] of state.groups) {
      if (group.stage !== 'complete') {
        allComplete = false;
        break;
      }
    }

    if (allComplete) {
      io.to(`market-${sessionCode}`).emit('all-groups-complete', {
        roundId,
        groupCount: state.groups.size,
      });

      console.log(
        `[WoolExportPunishment] All ${state.groups.size} group(s) complete for round ${roundId}`
      );
    }
  }

  /**
   * Get a human-readable outcome label.
   */
  private getOutcomeLabel(group: GroupState): string {
    if (group.smugglerDecision === 'trade_locally' || group.smugglerDecision === null) {
      return 'Trade Locally';
    }
    if (group.harborWatchDecision === 'report') {
      return 'Smuggle - Reported';
    }
    return 'Smuggle - Not Reported';
  }

  /**
   * Read a player's game_data from the database.
   */
  private async getPlayerGameData(
    playerId: string
  ): Promise<{ groupId: number; role: string } | null> {
    const player = await PlayerModel.findById(playerId);
    if (!player || !player.game_data) return null;
    return player.game_data as { groupId: number; role: string };
  }
}
