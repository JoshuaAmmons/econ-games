import { Router } from 'express';
import { ExportController } from '../controllers/exportController';
import { requireAdmin } from '../middleware/adminAuth';

const router = Router();

// Get comprehensive results for a session (JSON) — admin only
router.get('/:id/results', requireAdmin, ExportController.getResults);

// Export session data as CSV — admin only
// Query param: type = 'players' | 'rounds' | 'trades' | 'actions'
router.get('/:id/export', requireAdmin, ExportController.exportCSV);

export default router;
