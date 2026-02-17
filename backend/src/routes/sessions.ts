import { Router } from 'express';
import { SessionController } from '../controllers/sessionController';

const router = Router();

// Create new session
router.post('/', SessionController.create);

// Get all sessions
router.get('/', SessionController.list);

// Get session by code (must be before /:id to avoid conflict)
router.get('/code/:code', SessionController.getByCode);

// Get session by ID
router.get('/:id', SessionController.getById);

// Get players for session
router.get('/:id/players', SessionController.getPlayers);

// Get rounds for session
router.get('/:id/rounds', SessionController.getRounds);

// Start session
router.post('/:id/start', SessionController.start);

// End session
router.post('/:id/end', SessionController.end);

// Delete session
router.delete('/:id', SessionController.delete);

// Delete all sessions
router.delete('/', SessionController.deleteAll);

export default router;
