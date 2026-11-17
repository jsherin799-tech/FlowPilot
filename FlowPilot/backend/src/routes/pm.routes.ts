import { Router } from 'express';
import { authorizeRoles, authenticateJWT } from '../middleware/auth.middleware';
import {
  createMilestone,
  createTask,
  createTaskBatch,
  getMilestones,
  getEligibleTeamMembers,
  getOverview,
  reorderBacklog,
  triageBug,
  updateMilestone,
} from '../controllers/pm.controller';

const router = Router();
router.use(authenticateJWT, authorizeRoles('ADMIN', 'PROJECT_MANAGER'));
router.get('/overview', getOverview);
router.get('/team', getEligibleTeamMembers);
router.get('/projects/:projectId/milestones', getMilestones);
router.post('/projects/:projectId/milestones', createMilestone);
router.patch('/milestones/:milestoneId', updateMilestone);
router.patch('/bugs/:bugId/triage', triageBug);
router.post('/tasks', createTask);
router.post('/tasks/bulk', createTaskBatch);
router.patch('/tasks/backlog/reorder', reorderBacklog);

export default router;
