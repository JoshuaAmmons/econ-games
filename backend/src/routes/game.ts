import { Router } from 'express';
import { GameController } from '../controllers/gameController';

const router = Router();

// Submit bid
router.post('/bids', GameController.submitBid);

// Submit ask
router.post('/asks', GameController.submitAsk);

// Get order book for round
router.get('/rounds/:roundId/orderbook', GameController.getOrderBook);

// Get trades for round
router.get('/rounds/:roundId/trades', GameController.getRoundTrades);

export default router;
