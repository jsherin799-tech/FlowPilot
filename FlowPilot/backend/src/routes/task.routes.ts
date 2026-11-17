import { Router } from 'express';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';
import {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  addComment,
} from '../controllers/task.controller';

const router = Router();

router.use(authenticateJWT);

router.get('/', getTasks);
router.post('/', authorizeRoles('ADMIN', 'PROJECT_MANAGER'), createTask);
router.get('/:id', getTaskById);
router.put('/:id', authorizeRoles('ADMIN', 'PROJECT_MANAGER', 'DEVELOPER'), updateTask);
router.patch('/:id/status', authorizeRoles('ADMIN', 'PROJECT_MANAGER', 'DEVELOPER'), updateTaskStatus);
router.delete('/:id', authorizeRoles('ADMIN', 'PROJECT_MANAGER'), deleteTask);
router.post('/:id/comments', addComment);

export default router;