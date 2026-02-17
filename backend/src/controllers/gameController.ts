import { Request, Response } from 'express';
import { BidModel } from '../models/Bid';
import { AskModel } from '../models/Ask';
import { TradeModel } from '../models/Trade';
import { PlayerModel } from '../models/Player';
import { SubmitBidRequest, SubmitAskRequest, ApiResponse } from '../types';
import { RoundModel } from '../models/Round';
import { validateBid, validateAsk } from '../services/gameLogic';

export class GameController {
  // Submit bid
  static async submitBid(req: Request, res: Response) {
    try {
      const { round_id, player_id, price }: SubmitBidRequest = req.body;

      // Validate inputs
      if (!round_id || !player_id || !price) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields'
        } as ApiResponse);
        return;
      }

      // Get player
      const player = await PlayerModel.findById(player_id);
      if (!player) {
        res.status(404).json({
          success: false,
          error: 'Player not found'
        } as ApiResponse);
        return;
      }

      // Validate bid
      const validation = validateBid(price, player);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error
        } as ApiResponse);
        return;
      }

      // Validate price is a finite number
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
        res.status(400).json({
          success: false,
          error: 'Price must be a valid non-negative number'
        } as ApiResponse);
        return;
      }

      // Check round is active
      const round = await RoundModel.findById(round_id);
      if (!round || round.status !== 'active') {
        res.status(409).json({
          success: false,
          error: 'Round is not active'
        } as ApiResponse);
        return;
      }

      // Submit bid
      const bid = await BidModel.create(round_id, player_id, price);

      res.status(201).json({
        success: true,
        data: bid,
        message: 'Bid submitted successfully'
      } as ApiResponse);

    } catch (error) {
      console.error('Error submitting bid:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to submit bid'
      } as ApiResponse);
    }
  }

  // Submit ask
  static async submitAsk(req: Request, res: Response) {
    try {
      const { round_id, player_id, price }: SubmitAskRequest = req.body;

      // Validate inputs
      if (!round_id || !player_id || !price) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields'
        } as ApiResponse);
        return;
      }

      // Get player
      const player = await PlayerModel.findById(player_id);
      if (!player) {
        res.status(404).json({
          success: false,
          error: 'Player not found'
        } as ApiResponse);
        return;
      }

      // Validate ask
      const validation = validateAsk(price, player);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error
        } as ApiResponse);
        return;
      }

      // Validate price is a finite number
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
        res.status(400).json({
          success: false,
          error: 'Price must be a valid non-negative number'
        } as ApiResponse);
        return;
      }

      // Check round is active
      const askRound = await RoundModel.findById(round_id);
      if (!askRound || askRound.status !== 'active') {
        res.status(409).json({
          success: false,
          error: 'Round is not active'
        } as ApiResponse);
        return;
      }

      // Submit ask
      const ask = await AskModel.create(round_id, player_id, price);

      res.status(201).json({
        success: true,
        data: ask,
        message: 'Ask submitted successfully'
      } as ApiResponse);

    } catch (error) {
      console.error('Error submitting ask:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to submit ask'
      } as ApiResponse);
    }
  }

  // Get order book
  static async getOrderBook(req: Request, res: Response) {
    try {
      const roundId = req.params.roundId as string;

      const bids = await BidModel.findActiveByRound(roundId);
      const asks = await AskModel.findActiveByRound(roundId);

      res.json({
        success: true,
        data: {
          bids,
          asks
        }
      } as ApiResponse);

    } catch (error) {
      console.error('Error getting order book:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get order book'
      } as ApiResponse);
    }
  }

  // Get trades for round
  static async getRoundTrades(req: Request, res: Response) {
    try {
      const roundId = req.params.roundId as string;

      const trades = await TradeModel.findByRound(roundId);

      res.json({
        success: true,
        data: trades
      } as ApiResponse);

    } catch (error) {
      console.error('Error getting trades:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get trades'
      } as ApiResponse);
    }
  }
}
