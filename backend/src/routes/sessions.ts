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

// Start session
router.post('/:id/start', SessionController.start);

// End session
router.post('/:id/end', SessionController.end);

export default router;
