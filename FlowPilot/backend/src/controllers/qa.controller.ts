import { Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();
const uuidSchema = z.string().uuid();

export const getQAOverview = async (req: AuthRequest, res: Response) => {
  try {
    const projectIdValue = req.query.projectId;
    if (projectIdValue !== undefined &&
      (typeof projectIdValue !== 'string' || !uuidSchema.safeParse(projectIdValue).success)) {
      return res.status(400).json({ success: false, message: 'Project ID is invalid.' });
    }
    const projectId = typeof projectIdValue === 'string' ? projectIdValue : undefined;

    const projectScope: Prisma.BugWhereInput = projectId ? { projectId } : {};
    const taskProjectScope: Prisma.TaskWhereInput = projectId ? { projectId } : {};
    const projectFilter: Prisma.ProjectWhereInput | undefined = req.user!.role === 'PROJECT_MANAGER'
      ? {
        OR: [
          { pmId: req.user!.userId },
          { members: { some: { userId: req.user!.userId, role: 'PROJECT_MANAGER' } } },
        ],
      }
      : req.user!.role === 'QA_ENGINEER'
        ? {
          OR: [
            { members: { some: { userId: req.user!.userId, role: 'QA_ENGINEER' } } },
            { tasks: { some: { OR: [
              { assigneeId: req.user!.userId },
              { qaAssigneeId: req.user!.userId },
            ] } } },
            { bugs: { some: { assigneeId: req.user!.userId } } },
          ],
        }
        : undefined;
    const bugWhere: Prisma.BugWhereInput = {
      ...projectScope,
      ...(projectFilter ? { project: projectFilter } : {}),
    };
    const taskWhere: Prisma.TaskWhereInput = {
      ...taskProjectScope,
      ...(projectFilter ? { project: projectFilter } : {}),
    };
    const openWhere: Prisma.BugWhereInput = { ...bugWhere, status: { notIn: ['CLOSED', 'WONT_FIX'] } };

    const [total, open, severityCounts, closed, retestQueue, tasksInReview, assignedTasks, fixedBugs, retestingBugs] = await Promise.all([
      prisma.bug.count({ where: bugWhere }),
      prisma.bug.count({ where: openWhere }),
      prisma.bug.groupBy({ by: ['severity'], where: openWhere, _count: { _all: true } }),
      prisma.bug.count({ where: { ...bugWhere, status: { in: ['CLOSED', 'RESOLVED'] } } }),
      prisma.bug.count({ where: { ...bugWhere, status: { in: ['FIXED', 'RETEST'] } } }),
      prisma.task.findMany({
        where: { ...taskWhere, status: 'IN_REVIEW' },
        select: {
          id: true, title: true, updatedAt: true,
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'asc' },
        take: 10,
      }),
      prisma.task.findMany({
        where: req.user!.role === 'QA_ENGINEER'
          ? {
            ...taskWhere,
            OR: [
              { assigneeId: req.user!.userId },
              { qaAssigneeId: req.user!.userId },
            ],
          }
          : { id: { in: [] } },
        select: {
          id: true, title: true, status: true, updatedAt: true,
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      prisma.bug.findMany({
        where: { ...bugWhere, status: 'FIXED' },
        select: {
          id: true, title: true, severity: true, updatedAt: true,
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'asc' },
        take: 10,
      }),
      prisma.bug.findMany({
        where: { ...bugWhere, status: 'RETEST' },
        select: {
          id: true, title: true, severity: true, updatedAt: true,
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'asc' },
        take: 10,
      }),
    ]);

    return res.json({
      success: true,
      data: {
        metrics: {
          totalOpenBugs: open,
          severityBreakdown: Object.fromEntries(
            (['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR'] as const).map((severity) => [
              severity,
              severityCounts.find((item) => item.severity === severity)?._count._all ?? 0,
            ]),
          ),
          resolutionRate: total === 0 ? 0 : Math.round(closed / total * 100),
          retestQueue,
        },
        pendingVerification: { tasks: tasksInReview, assignedTasks, fixedBugs, retestingBugs },
      },
    });
  } catch (error) {
    console.error('Get QA overview error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load QA overview.' });
  }
};

const retestOutcomeSchema = z.object({
  outcome: z.enum(['PASSED', 'FAILED']),
  notes: z.string().trim().max(5000).optional(),
}).refine(({ outcome, notes }) => outcome !== 'FAILED' || !!notes?.trim(), {
  message: 'Failure notes are required when a retest fails.',
  path: ['notes'],
});

export const recordRetestOutcome = async (req: AuthRequest, res: Response) => {
  if (!uuidSchema.safeParse(req.params.id).success) {
    return res.status(400).json({ success: false, message: 'Bug ID is invalid.' });
  }
  const parsed = retestOutcomeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: parsed.error.issues.map((issue) => issue.message),
    });
  }

  try {
    const { outcome, notes } = parsed.data;
    const nextStatus = outcome === 'PASSED' ? 'CLOSED' : 'REOPENED';
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.bug.findUnique({ where: { id: req.params.id } });
      if (!current) return { error: 'NOT_FOUND' as const };
      if (current.status !== 'RETEST') return { error: 'INVALID_STATE' as const };
      if (req.user!.role === 'QA_ENGINEER') {
        const access = await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId: current.projectId, userId: req.user!.userId } },
          select: { role: true },
        });
        if (access?.role !== 'QA_ENGINEER' && current.assigneeId !== req.user!.userId) {
          return { error: 'FORBIDDEN' as const };
        }
      } else if (req.user!.role === 'PROJECT_MANAGER') {
        const project = await tx.project.findFirst({
          where: {
            id: current.projectId,
            OR: [
              { pmId: req.user!.userId },
              { members: { some: { userId: req.user!.userId, role: 'PROJECT_MANAGER' } } },
            ],
          },
          select: { id: true },
        });
        if (!project) return { error: 'FORBIDDEN' as const };
      }

      const updated = await tx.bug.updateMany({
        where: { id: current.id, status: 'RETEST' },
        data: { status: nextStatus },
      });
      if (updated.count !== 1) return { error: 'CONFLICT' as const };

      const bug = await tx.bug.findUniqueOrThrow({
        where: { id: current.id },
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
      });
      await tx.activityLog.create({
        data: {
          action: outcome === 'PASSED' ? 'BUG_RESOLVED' : 'BUG_STATUS_CHANGED',
          entityType: 'Bug',
          entityId: bug.id,
          entityName: bug.title,
          details: { from: 'RETEST', to: nextStatus, outcome, notes: notes?.trim() || null },
          userId: req.user!.userId,
          projectId: bug.projectId,
          bugId: bug.id,
        },
      });
      return { bug };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Bug not found.' });
      if (result.error === 'INVALID_STATE') return res.status(409).json({ success: false, message: 'Only bugs in RETEST can receive a retest outcome.' });
      if (result.error === 'FORBIDDEN') return res.status(404).json({ success: false, message: 'Bug not found.' });
      return res.status(409).json({ success: false, message: 'Bug status changed concurrently. Refresh and retry.' });
    }
    return res.json({
      success: true,
      message: outcome === 'PASSED' ? 'Bug verified and closed.' : 'Bug reopened with QA failure notes.',
      data: { bug: result.bug },
    });
  } catch (error) {
    console.error('Record QA retest outcome error:', error);
    return res.status(500).json({ success: false, message: 'Unable to record the retest outcome.' });
  }
};
