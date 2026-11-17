import { Router } from 'express';
import { authenticateJWT, requireCurrentAdmin } from '../middleware/auth.middleware';
import {
  createProject,
  deleteProject,
  getAuditLog,
  getMembers,
  getOrganization,
  getOverview,
  getProjects,
  getWorkItems,
  updateMember,
  updateOrganization,
  updateProject,
  updateProjectLifecycle,
  updateWorkItem,
} from '../controllers/admin.controller';

const router = Router();

// All admin routes: live DB role check on every request
router.use(authenticateJWT, requireCurrentAdmin);

// Workspace overview & settings
router.get('/overview', getOverview);
router.get('/organization', getOrganization);
router.put('/organization', updateOrganization);

// Member directory & governance
router.get('/members', getMembers);
router.patch('/members/:userId', updateMember);

// Global project registry
router.get('/projects', getProjects);
router.post('/projects', createProject);
router.put('/projects/:projectId', updateProject);
router.patch('/projects/:projectId/lifecycle', updateProjectLifecycle);
router.delete('/projects/:projectId', deleteProject);

// Cross-project task & bug control
router.get('/work-items', getWorkItems);
router.patch('/work-items/:type/:itemId', updateWorkItem);

// Audit trail (supports ?format=csv and ?format=json)
router.get('/audit', getAuditLog);

export default router;
