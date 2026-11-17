import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { registerSchema, loginSchema } from '../validators/auth.validator';
import { authenticateJWT, AuthRequest, getJwtSecret } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function generateToken(payload: { userId: string; email: string; role: string }) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.error.issues.map((i) => i.message),
      });
    }

    const { name, email, password } = validation.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const organization = await prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { defaultRole: true },
    });
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: organization?.defaultRole ?? 'DEVELOPER' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    const token = generateToken({ userId: user.id, email: user.email, role: user.role });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: { token, user },
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.error.issues.map((i) => i.message),
      });
    }

    const { email, password } = validation.data;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated.' });
    }

    const token = generateToken({ userId: user.id, email: user.email, role: user.role });
    const { password: _, ...userData } = user;

    return res.json({
      success: true,
      message: 'Login successful',
      data: { token, user: userData },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/v1/auth/me  (protected)
router.get('/me', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        bio: true,
        avatarUrl: true,
        createdAt: true,
        projectMembers: {
          include: {
            project: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({ success: true, data: { user } });
  } catch (error) {
    console.error('Me error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/v1/auth/profile (protected)
router.put('/profile', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const { name, bio, avatarUrl } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(name && { name }),
        ...(bio !== undefined && { bio }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: { id: true, name: true, email: true, role: true, bio: true, avatarUrl: true },
    });
    return res.json({ success: true, message: 'Profile updated', data: { user } });
  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/v1/auth/change-password (protected)
router.post('/change-password', authenticateJWT, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Invalid password data.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    return res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/v1/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  // In production: generate reset token and send email. For demo, just confirm.
  const user = await prisma.user.findUnique({ where: { email } });
  // Always return success for security (don't reveal if email exists)
  return res.json({
    success: true,
    message: user
      ? 'Password reset instructions have been sent to your email.'
      : 'Password reset instructions have been sent to your email.',
  });
});

export default router;