import { Response } from 'express';
import { Prisma, PrismaClient, Priority } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import { createBugSchema } from '../validators/bug.validator';

const prisma = new PrismaClient();

export const createBug = async (req: AuthRequest, res: Response) => {
  try {
    const validation = createBugSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.error.issues.map((issue) => issue.message),
      });
    }

    const bugData = validation.data;
    const bug = await prisma.bug.create({
      data: {
        ...bugData,
        reporterId: req.user!.userId,
      },
      include: {
        reporter: { select: { id: true, name: true } },
      },
    });

    return res.status(201).json({ success: true, message: 'Bug logged successfully', data: { bug } });
  } catch (error) {
    console.error('Create bug error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getBugs = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, severity } = req.query;

    const whereClause: Prisma.BugWhereInput = {};
    if (typeof projectId === 'string') whereClause.projectId = projectId;
    if (
      typeof severity === 'string' &&
      ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)
    ) {
      whereClause.severity = severity as Priority;
    }

    const bugs = await prisma.bug.findMany({
      where: whereClause,
      include: {
        reporter: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: { bugs } });
  } catch (error) {
    console.error('Get bugs error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};