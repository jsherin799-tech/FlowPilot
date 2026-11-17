import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthRequest extends Request<Record<string, string>> {
  user?: {
    userId: string;
    email: string;
    role: Role;
  };
}

export function getJwtSecret(): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured.');
  }
  return process.env.JWT_SECRET;
}

export const authenticateJWT = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  const tokenMatch = typeof authHeader === 'string' ? /^Bearer\s+(\S+)$/i.exec(authHeader) : null;
  if (!tokenMatch) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Token missing or malformed.',
    });
  }

  const token = tokenMatch[1];

  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.',
    });
  }

  if (typeof decoded === 'string' || typeof decoded.userId !== 'string') {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.',
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Account is inactive or unavailable.' });
    }
    req.user = { userId: user.id, email: user.email, role: user.role };
    next();
  } catch (error) {
    console.error('Authentication account lookup failed:', error);
    return res.status(503).json({ success: false, message: 'Authentication service is temporarily unavailable.' });
  }
};

export const authorizeRoles = (...allowedRoles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthenticated.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission to perform this action.',
      });
    }

    next();
  };
};

export const requireCurrentAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthenticated.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Account is inactive or unavailable.' });
    }
    if (user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Administrator access is required.',
      });
    }

    req.user.role = user.role;
    next();
  } catch (error) {
    console.error('Admin authorization lookup failed:', error);
    return res.status(503).json({ success: false, message: 'Authorization service is temporarily unavailable.' });
  }
};