import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import { createBugSchema, updateBugStatusSchema } from '../validators/bug.validator';
import { io } from '../app';

const prisma = new PrismaClient();

export const createBug = async (req: AuthRequest, res: Response) => {
  try {
    const validation = createBugSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.error.errors.map((e) => e.message),
      });
    }

    const bugData = validation.data;
    const bugCount = await prisma.bug.count({ where: { projectId: bugData.projectId } });
    const bugKey = `BUG-${bugCount + 101}`;

    const bug = await prisma.bug.create({
      data: {
        ...bugData,
        bugKey,
        reporterId: req.user!.userId,
      },
      include: {
        assignee: { select: { id: true, fullName: true, avatarUrl: true } },
        reporter: { select: { id: true, fullName: true } },
      },
    });

    io.to(bug.projectId).emit('bug_created', bug);

    return res.status(201).json({ success: true, message: 'Bug logged successfully', data: { bug } });
  } catch (error) {
    console.error('Create bug error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getBugs = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, status, severity, priority } = req.query;

    const whereClause: any = {};
    if (projectId) whereClause.projectId = String(projectId);
    if (status) whereClause.status = String(status);
    if (severity) whereClause.severity = String(severity);
    if (priority) whereClause.priority = String(priority);

    const bugs = await prisma.bug.findMany({
      where: whereClause,
      include: {
        assignee: { select: { id: true, fullName: true, avatarUrl: true } },
        reporter: { select: { id: true, fullName: true } },
        project: { select: { id: true, name: true, key: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: { bugs } });
  } catch (error) {
    console.error('Get bugs error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateBugStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validation = updateBugStatusSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ success: false, message: 'Invalid bug status' });
    }

    const updatedBug = await prisma.bug.update({
      where: { id },
      data: { status: validation.data.status },
      include: {
        assignee: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    io.to(updatedBug.projectId).emit('bug_status_updated', updatedBug);

    return res.status(200).json({ success: true, message: 'Bug status updated', data: { bug: updatedBug } });
  } catch (error) {
    console.error('Update bug status error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};