import { Router } from 'express';
import { authenticateJWT, AuthRequest } from '../middleware/auth.middleware';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticateJWT);

// GET /api/v1/activity?projectId=&entityType=
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { projectId, entityType, page = '1', limit = '30' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (projectId && typeof projectId === 'string') where.projectId = projectId;
    if (entityType && typeof entityType === 'string') where.entityType = entityType;

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, role: true, avatarUrl: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.activityLog.count({ where }),
    ]);

    return res.json({
      success: true,
      data: {
        logs,
        pagination: { page: parseInt(page as string), limit: parseInt(limit as string), total },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/v1/activity/global-search?q=
router.get('/search', async (req: AuthRequest, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters.' });
    }

    const query = q.trim();

    const [projects, tasks, bugs, users] = await Promise.all([
      prisma.project.findMany({
        where: { OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] },
        select: { id: true, name: true, description: true, status: true },
        take: 5,
      }),
      prisma.task.findMany({
        where: { OR: [{ title: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] },
        select: { id: true, title: true, status: true, priority: true, projectId: true, project: { select: { name: true } } },
        take: 5,
      }),
      prisma.bug.findMany({
        where: { OR: [{ title: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] },
        select: { id: true, title: true, severity: true, status: true, projectId: true, project: { select: { name: true } } },
        take: 5,
      }),
      prisma.user.findMany({
        where: { OR: [{ name: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }] },
        select: { id: true, name: true, email: true, role: true },
        take: 5,
      }),
    ]);

    return res.json({ success: true, data: { projects, tasks, bugs, users } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
