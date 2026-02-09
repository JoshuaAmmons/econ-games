import { Router } from 'express';
import { ExportController } from '../controllers/exportController';

const router = Router();

// Get comprehensive results for a session (JSON)
router.get('/:id/results', ExportController.getResults);

// Export session data as CSV
// Query param: type = 'players' | 'rounds' | 'trades' | 'actions'
router.get('/:id/export', ExportController.exportCSV);

export default router;
