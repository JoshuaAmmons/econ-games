import type { GameType, UIConfig, ValidationResult } from '../GameEngine';
import { SimultaneousBaseEngine } from './SimultaneousBaseEngine';

/**
 * Prisoner's Dilemma Engine (Week 1)
 *
 * N players simultaneously choose to 'cooperate' or 'defect'.
 * Each player is paired against every other player, and payoffs
 * are computed from the classic PD payoff matrix for each pair.
 * A player's profit is the average of their payoffs across all pairs.
 *
 * Payoff matrix (per pair):
 *   Both cooperate:    both get reward      (default 3)
 *   Both defect:       both get punishment   (default 1)
 *   Cooperate/Defect:  defector gets temptation (default 5),
 *                      cooperator gets sucker    (default 0)
 *
 * game_config: {
 *   reward: number,      // both cooperate payoff (default 3)
 *   temptation: number,  // defect vs cooperate payoff (default 5)
 *   sucker: number,      // cooperate vs defect payoff (default 0)
 *   punishment: number,  // both defect payoff (default 1)
 * }
 */
export class PrisonerDilemmaEngine extends SimultaneousBaseEngine {
  readonly gameType: GameType = 'prisoner_dilemma';

  getUIConfig(): UIConfig {
    return {
      name: "Prisoner's Dilemma",
      description: 'Players simultaneously choose to cooperate or defect. Payoffs depend on the choices of all players.',
      category: 'simultaneous',
      weekNumber: 1,
      roles: [
        { role: 'player', label: 'Player', description: 'Choose to cooperate or defect' },
      ],
      usesOrderBook: false,
      usesValuationCost: false,
      configFields: [
        {
          name: 'market_size',
          label: 'Number of Players',
          type: 'number',
          default: 8,
          min: 2,
          max: 40,
          description: 'Total number of players in the group',
        },
        {
          name: 'num_rounds',
          label: 'Number of Rounds',
          type: 'number',
          default: 10,
          min: 1,
          max: 50,
        },
        {
          name: 'time_per_round',
          label: 'Time per Round (seconds)',
          type: 'number',
          default: 60,
          min: 15,
          max: 300,
        },
        {
          name: 'reward',
          label: 'Reward (both cooperate)',
          type: 'number',
          default: 3,
          min: 0,
          max: 100,
          step: 0.5,
          description: 'Payoff when both players cooperate',
        },
        {
          name: 'temptation',
          label: 'Temptation (defect vs cooperate)',
          type: 'number',
          default: 5,
          min: 0,
          max: 100,
          step: 0.5,
          description: 'Payoff for defecting when the other cooperates',
        },
        {
          name: 'sucker',
          label: 'Sucker (cooperate vs defect)',
          type: 'number',
          default: 0,
          min: 0,
          max: 100,
          step: 0.5,
          description: 'Payoff for cooperating when the other defects',
        },
        {
          name: 'punishment',
          label: 'Punishment (both defect)',
          type: 'number',
          default: 1,
          min: 0,
          max: 100,
          step: 0.5,
          description: 'Payoff when both players defect',
        },
      ],
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const reward = config.reward ?? 3;
    const temptation = config.temptation ?? 5;
    const sucker = config.sucker ?? 0;
    const punishment = config.punishment ?? 1;

    // Classic PD requires: temptation > reward > punishment > sucker
    if (temptation <= reward) {
      return { valid: false, error: 'Temptation must be greater than reward for a valid PD' };
    }
    if (reward <= punishment) {
      return { valid: false, error: 'Reward must be greater than punishment for a valid PD' };
    }
    if (punishment < sucker) {
      return { valid: false, error: 'Punishment must be at least as large as sucker for a valid PD' };
    }
    return { valid: true };
  }

  protected validateAction(
    action: Record<string, any>,
    _player: any,
    _config: Record<string, any>
  ): string | null {
    const { choice } = action;
    if (choice === undefined || choice === null) {
      return 'A choice is required';
    }
    if (choice !== 'cooperate' && choice !== 'defect') {
      return 'Choice must be either "cooperate" or "defect"';
    }
    return null;
  }

  protected calculateResults(
    actions: Array<{ playerId: string; playerName: string; action: Record<string, any> }>,
    config: Record<string, any>,
    _allPlayers: any[]
  ): Array<{ playerId: string; profit: number; resultData: Record<string, any> }> {
    if (actions.length === 0) return [];

    const reward = config.reward ?? 3;
    const temptation = config.temptation ?? 5;
    const sucker = config.sucker ?? 0;
    const punishment = config.punishment ?? 1;

    const choices = actions.map((a) => ({
      playerId: a.playerId,
      choice: a.action.choice as 'cooperate' | 'defect',
    }));

    const numPlayers = choices.length;
    const numCooperators = choices.filter((c) => c.choice === 'cooperate').length;
    const numDefectors = numPlayers - numCooperators;

    return choices.map((player) => {
      // Calculate this player's average payoff against all other players
      let totalPayoff = 0;
      const opponents = numPlayers - 1;

      if (opponents === 0) {
        // Single player edge case — no opponents to pair with
        return {
          playerId: player.playerId,
          profit: 0,
          resultData: {
            choice: player.choice,
            averagePayoff: 0,
            numOpponents: 0,
            numCooperators,
            numDefectors,
          },
        };
      }

      for (const other of choices) {
        if (other.playerId === player.playerId) continue;

        if (player.choice === 'cooperate' && other.choice === 'cooperate') {
          totalPayoff += reward;
        } else if (player.choice === 'cooperate' && other.choice === 'defect') {
          totalPayoff += sucker;
        } else if (player.choice === 'defect' && other.choice === 'cooperate') {
          totalPayoff += temptation;
        } else {
          // both defect
          totalPayoff += punishment;
        }
      }

      const averagePayoff = totalPayoff / opponents;

      return {
        playerId: player.playerId,
        profit: Math.round(averagePayoff * 100) / 100,
        resultData: {
          choice: player.choice,
          averagePayoff: Math.round(averagePayoff * 100) / 100,
          totalPayoff: Math.round(totalPayoff * 100) / 100,
          numOpponents: opponents,
          numCooperators,
          numDefectors,
          reward,
          temptation,
          sucker,
          punishment,
        },
      };
    });
  }
}
