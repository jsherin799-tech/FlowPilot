import { Router } from 'express';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';
import { getSprints, getSprintById, createSprint, startSprint, completeSprint, updateSprint } from '../controllers/sprint.controller';

const router = Router();

router.use(authenticateJWT);

router.get('/', getSprints);
router.post('/', authorizeRoles('ADMIN', 'PROJECT_MANAGER'), createSprint);
router.get('/:id', getSprintById);
router.put('/:id', authorizeRoles('ADMIN', 'PROJECT_MANAGER'), updateSprint);
router.patch('/:id/start', authorizeRoles('ADMIN', 'PROJECT_MANAGER'), startSprint);
router.patch('/:id/complete', authorizeRoles('ADMIN', 'PROJECT_MANAGER'), completeSprint);

export default router;
