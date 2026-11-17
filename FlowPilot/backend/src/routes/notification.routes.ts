import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticateJWT);

// GET /api/v1/notifications
router.get('/', async (req: AuthRequest, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    return res.json({ success: true, data: { notifications, unreadCount } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PATCH /api/v1/notifications/mark-all-read
router.patch('/mark-all-read', async (req: AuthRequest, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, isRead: false },
      data: { isRead: true },
    });
    return res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', async (req: AuthRequest, res) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    return res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
