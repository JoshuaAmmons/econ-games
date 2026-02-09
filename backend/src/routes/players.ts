import { Router } from 'express';
import { PlayerController } from '../controllers/playerController';

const router = Router();

// Join session
router.post('/join', PlayerController.joinSession);

// Get player info
router.get('/:id', PlayerController.getPlayer);

// Get player status
router.get('/:id/status', PlayerController.getStatus);

export default router;
