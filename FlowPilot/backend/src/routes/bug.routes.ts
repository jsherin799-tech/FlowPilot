import { Router } from 'express';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';
import { getBugs, getBugById, createBug, updateBug, deleteBug, addBugComment } from '../controllers/bug.controller';

const router = Router();

router.use(authenticateJWT);

router.get('/', getBugs);
router.post('/', authorizeRoles('QA_ENGINEER', 'PROJECT_MANAGER', 'ADMIN'), createBug);
router.get('/:id', getBugById);
router.put('/:id', updateBug);
router.delete('/:id', deleteBug);
router.post('/:id/comments', addBugComment);

export default router;