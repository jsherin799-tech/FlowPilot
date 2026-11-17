import { Router } from 'express';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';
import { getQAOverview, recordRetestOutcome } from '../controllers/qa.controller';

const router = Router();

router.use(authenticateJWT, authorizeRoles('QA_ENGINEER', 'ADMIN', 'PROJECT_MANAGER'));
router.get('/overview', getQAOverview);
router.post('/bugs/:id/retest', recordRetestOutcome);

export default router;
