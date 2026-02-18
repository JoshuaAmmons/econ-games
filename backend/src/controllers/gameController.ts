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
      if (!round_id || !player_id || price === undefined || price === null) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields'
        } as ApiResponse);
        return;
      }

      // Validate price is a finite number (must run BEFORE validateBid to catch NaN)
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
        res.status(400).json({
          success: false,
          error: 'Price must be a valid non-negative number'
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

      // Validate bid against player's valuation
      const validation = validateBid(price, player);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error
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
      if (!round_id || !player_id || price === undefined || price === null) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields'
        } as ApiResponse);
        return;
      }

      // Validate price is a finite number (must run BEFORE validateAsk to catch NaN)
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
        res.status(400).json({
          success: false,
          error: 'Price must be a valid non-negative number'
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

      // Validate ask against player's production cost
      const validation = validateAsk(price, player);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error
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

      // Normalize DECIMAL fields from string to number (pg returns DECIMAL as string)
      const normalizedBids = bids.map((b: any) => ({
        ...b,
        price: b.price != null ? Number(b.price) : b.price,
      }));
      const normalizedAsks = asks.map((a: any) => ({
        ...a,
        price: a.price != null ? Number(a.price) : a.price,
      }));

      res.json({
        success: true,
        data: {
          bids: normalizedBids,
          asks: normalizedAsks
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

      // Normalize DECIMAL fields from string to number
      const normalizedTrades = trades.map((t: any) => ({
        ...t,
        price: t.price != null ? Number(t.price) : t.price,
        buyer_profit: t.buyer_profit != null ? Number(t.buyer_profit) : t.buyer_profit,
        seller_profit: t.seller_profit != null ? Number(t.seller_profit) : t.seller_profit,
      }));

      res.json({
        success: true,
        data: normalizedTrades
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
