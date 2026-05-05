import { Router } from 'express';
import { PracticeController } from '../controllers/practiceController';

const router = Router();

// List the games available in practice mode (powers the landing-page tile grid)
router.get('/games', PracticeController.listGames);

// Start a solo + bots practice session for the given game type.
// Body: { name?: string }   Returns: { sessionCode, sessionId, playerId, ... }
router.post('/:gameType/start', PracticeController.start);

export default router;
