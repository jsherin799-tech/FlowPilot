import { Router } from 'express';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';
import {
  createChecklistItem,
  getDeveloperWorkspace,
  logTaskEffort,
  updateChecklistItem,
} from '../controllers/developer.controller';

const router = Router();

router.use(authenticateJWT, authorizeRoles('ADMIN', 'PROJECT_MANAGER', 'DEVELOPER'));
router.get('/workspace', getDeveloperWorkspace);
router.post('/tasks/:taskId/effort', authorizeRoles('DEVELOPER'), logTaskEffort);
router.post('/tasks/:taskId/checklist', createChecklistItem);
router.patch('/checklist/:itemId', updateChecklistItem);

export default router;
