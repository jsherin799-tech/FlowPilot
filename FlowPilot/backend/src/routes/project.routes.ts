import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/auth.middleware';
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectAnalytics,
  addProjectMember,
} from '../controllers/project.controller';

const router = Router();

router.use(authenticateJWT);

router.get('/', getProjects);
router.post('/', authorizeRoles('ADMIN', 'PROJECT_MANAGER'), createProject);
router.get('/:id', getProjectById);
router.put('/:id', authorizeRoles('ADMIN', 'PROJECT_MANAGER'), updateProject);
router.delete('/:id', authorizeRoles('ADMIN'), deleteProject);
router.get('/:id/analytics', getProjectAnalytics);
router.post('/:id/members', authorizeRoles('ADMIN', 'PROJECT_MANAGER'), addProjectMember);

export default router;