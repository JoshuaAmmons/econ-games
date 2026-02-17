import type { Request, Response } from 'express';
import { SessionModel } from '../models/Session';
import { PlayerModel } from '../models/Player';
import { RoundModel } from '../models/Round';
import { TradeModel } from '../models/Trade';
import { GameResultModel } from '../models/GameResult';
import { GameActionModel } from '../models/GameAction';

const DA_GAME_TYPES = ['double_auction', 'double_auction_tax', 'double_auction_price_controls'];

/**
 * Get comprehensive results for a session (JSON)
 */
async function getResults(req: Request, res: Response) {
  try {
    const session = await SessionModel.findById(req.params.id as string);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const [players, rounds] = await Promise.all([
      PlayerModel.findBySession(session.id),
      RoundModel.findBySession(session.id),
    ]);

    const isDA = DA_GAME_TYPES.includes(session.game_type);

    // Build per-round data
    const roundResults = await Promise.all(
      rounds.map(async (round) => {
        if (isDA) {
          const trades = await TradeModel.findByRound(round.id);
          return {
            roundNumber: round.round_number,
            roundId: round.id,
            status: round.status,
            startedAt: round.started_at,
            endedAt: round.ended_at,
            trades: trades.map((t) => ({
              price: Number(t.price),
              buyerId: t.buyer_id,
              sellerId: t.seller_id,
              buyerProfit: Number(t.buyer_profit),
              sellerProfit: Number(t.seller_profit),
              time: t.created_at,
            })),
          };
        } else {
          const [results, actions] = await Promise.all([
            GameResultModel.findByRound(round.id),
            GameActionModel.findByRound(round.id),
          ]);
          return {
            roundNumber: round.round_number,
            roundId: round.id,
            status: round.status,
            startedAt: round.started_at,
            endedAt: round.ended_at,
            actions: actions.map((a) => ({
              playerId: a.player_id,
              actionType: a.action_type,
              actionData: a.action_data,
              time: a.created_at,
            })),
            results: results.map((r) => ({
              playerId: r.player_id,
              profit: Number(r.profit),
              resultData: r.result_data,
            })),
          };
        }
      })
    );

    // Player summary
    const playerSummary = players.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      valuation: p.valuation != null ? Number(p.valuation) : null,
      productionCost: p.production_cost != null ? Number(p.production_cost) : null,
      totalProfit: Number(p.total_profit),
      isBot: p.is_bot,
    }));

    // Calculate aggregate stats (Number() wrap needed — pg returns DECIMAL as string)
    const profits = players.map((p) => Number(p.total_profit));
    const avgProfit = profits.length > 0 ? profits.reduce((a, b) => a + b, 0) / profits.length : 0;
    const maxProfit = profits.length > 0 ? Math.max(...profits) : 0;
    const minProfit = profits.length > 0 ? Math.min(...profits) : 0;

    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          code: session.code,
          gameType: session.game_type,
          gameConfig: session.game_config,
          numRounds: session.num_rounds,
          status: session.status,
          marketSize: session.market_size,
        },
        players: playerSummary,
        rounds: roundResults,
        stats: {
          totalPlayers: players.length,
          completedRounds: rounds.filter((r) => r.status === 'completed').length,
          avgProfit: parseFloat(avgProfit.toFixed(2)),
          maxProfit: parseFloat(maxProfit.toFixed(2)),
          minProfit: parseFloat(minProfit.toFixed(2)),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch results' });
  }
}

/**
 * Export session data as CSV
 */
async function exportCSV(req: Request, res: Response) {
  try {
    const session = await SessionModel.findById(req.params.id as string);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const [players, rounds] = await Promise.all([
      PlayerModel.findBySession(session.id),
      RoundModel.findBySession(session.id),
    ]);

    const isDA = DA_GAME_TYPES.includes(session.game_type);
    const type = (req.query.type as string) || 'players';

    let csv = '';

    if (type === 'players') {
      // Player summary CSV
      csv = 'PlayerName,Role,Valuation,ProductionCost,TotalProfit,IsBot\n';
      for (const p of players) {
        csv += `"${p.name || 'Anonymous'}","${p.role}",${p.valuation ?? ''},${p.production_cost ?? ''},${p.total_profit},${p.is_bot}\n`;
      }
    } else if (type === 'rounds') {
      // Round-by-round profit CSV
      // Build header: PlayerName, Role, Round1, Round2, ..., Total
      const completedRounds = rounds.filter((r) => r.status === 'completed');
      const header = ['PlayerName', 'Role'];
      for (const r of completedRounds) {
        header.push(`Round${r.round_number}`);
      }
      header.push('TotalProfit');
      csv = header.join(',') + '\n';

      // For each player, get per-round profits
      for (const player of players) {
        const row: string[] = [`"${player.name || 'Anonymous'}"`, `"${player.role}"`];

        for (const round of completedRounds) {
          if (isDA) {
            const trades = await TradeModel.findByRound(round.id);
            let roundProfit = 0;
            for (const t of trades) {
              if (t.buyer_id === player.id) roundProfit += Number(t.buyer_profit);
              if (t.seller_id === player.id) roundProfit += Number(t.seller_profit);
            }
            row.push(roundProfit.toFixed(2));
          } else {
            const result = await GameResultModel.findByRoundAndPlayer(round.id, player.id);
            row.push(result ? Number(result.profit).toFixed(2) : '0.00');
          }
        }

        row.push(Number(player.total_profit).toFixed(2));
        csv += row.join(',') + '\n';
      }
    } else if (type === 'trades' && isDA) {
      // Trade-level CSV for DA games
      csv = 'Round,Price,BuyerName,SellerName,BuyerProfit,SellerProfit,Time\n';
      const playerMap = new Map(players.map((p) => [p.id, p.name || 'Anonymous']));

      for (const round of rounds.filter((r) => r.status === 'completed')) {
        const trades = await TradeModel.findByRound(round.id);
        for (const t of trades) {
          csv += `${round.round_number},${t.price},"${playerMap.get(t.buyer_id) || 'Unknown'}","${playerMap.get(t.seller_id) || 'Unknown'}",${t.buyer_profit},${t.seller_profit},${t.created_at}\n`;
        }
      }
    } else if (type === 'actions' && !isDA) {
      // Action-level CSV for non-DA games
      csv = 'Round,PlayerName,Role,ActionType,ActionData,Time\n';
      const playerMap = new Map(players.map((p) => [p.id, { name: p.name || 'Anonymous', role: p.role }]));

      for (const round of rounds.filter((r) => r.status === 'completed')) {
        const actions = await GameActionModel.findByRound(round.id);
        for (const a of actions) {
          const info = playerMap.get(a.player_id);
          csv += `${round.round_number},"${info?.name || 'Unknown'}","${info?.role || ''}","${a.action_type}","${JSON.stringify(a.action_data).replace(/"/g, '""')}",${a.created_at}\n`;
        }
      }
    } else {
      return res.status(400).json({ success: false, error: 'Invalid export type. Use: players, rounds, trades (DA only), or actions (non-DA only)' });
    }

    const filename = `${session.code}_${session.game_type}_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ success: false, error: 'Failed to export CSV' });
  }
}

export const ExportController = { getResults, exportCSV };
