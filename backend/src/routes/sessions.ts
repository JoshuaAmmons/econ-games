import { Router } from 'express';
import { SessionController } from '../controllers/sessionController';
import { requireAdmin, requireDeleteAllConfirmation } from '../middleware/adminAuth';

const router = Router();

// Create new session
router.post('/', SessionController.create);

// Get all sessions
router.get('/', SessionController.list);

// Get session by code (must be before /:id to avoid conflict)
router.get('/code/:code', SessionController.getByCode);

// Verify admin password for session
router.post('/code/:code/verify-admin', SessionController.verifyAdminPassword);

// Get session by ID
router.get('/:id', SessionController.getById);

// Get players for session
router.get('/:id/players', SessionController.getPlayers);

// Get rounds for session
router.get('/:id/rounds', SessionController.getRounds);

// Start session (admin only)
router.post('/:id/start', requireAdmin, SessionController.start);

// End session (admin only)
router.post('/:id/end', requireAdmin, SessionController.end);

// Delete session (admin only)
router.delete('/:id', requireAdmin, SessionController.delete);

// Delete all sessions (requires confirmation header)
router.delete('/', requireDeleteAllConfirmation, SessionController.deleteAll);

export default router;
