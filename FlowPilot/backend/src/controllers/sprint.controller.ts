import { Response } from 'express';
import { Prisma, PrismaClient, Role } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();
const uuidSchema = z.string().uuid();
const dateSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date');
const createSprintSchema = z.object({
  name: z.string().trim().min(2).max(120),
  goal: z.string().trim().nullable().optional(),
  projectId: uuidSchema,
  startDate: dateSchema.nullable().optional(),
  endDate: dateSchema.nullable().optional(),
}).refine(({ startDate, endDate }) => !startDate || !endDate || new Date(startDate) <= new Date(endDate));
const completeSprintSchema = z.object({
  incompleteAction: z.enum(['backlog', 'future_sprint']).default('backlog'),
  targetSprintId: uuidSchema.optional(),
}).refine(({ incompleteAction, targetSprintId }) => incompleteAction !== 'future_sprint' || !!targetSprintId);
const updateSprintSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  goal: z.string().trim().nullable().optional(),
  startDate: dateSchema.nullable().optional(),
  endDate: dateSchema.nullable().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined))
  .refine(({ startDate, endDate }) => !startDate || !endDate || new Date(startDate) <= new Date(endDate));

async function canManageProject(userId: string, role: Role, projectId: string, tx: PrismaClient | Prisma.TransactionClient) {
  if (role === 'ADMIN') return true;
  if (role !== 'PROJECT_MANAGER') return false;
  const project = await tx.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { pmId: userId },
        { members: { some: { userId, role: 'PROJECT_MANAGER' } } },
      ],
    },
    select: { id: true },
  });
  return !!project;
}

// GET /api/v1/sprints?projectId=
export const getSprints = async (req: AuthRequest, res: Response) => {
  try {
    const projectIdValue = req.query.projectId;
    if (projectIdValue !== undefined &&
      (typeof projectIdValue !== 'string' || !uuidSchema.safeParse(projectIdValue).success)) {
      return res.status(400).json({ success: false, message: 'Project ID is invalid.' });
    }
    const projectId = typeof projectIdValue === 'string' ? projectIdValue : undefined;
    const where: Prisma.SprintWhereInput = {
      ...(projectId && { projectId }),
      ...(req.user!.role === 'PROJECT_MANAGER' && {
        project: { OR: [
          { pmId: req.user!.userId },
          { members: { some: { userId: req.user!.userId, role: 'PROJECT_MANAGER' } } },
        ] },
      }),
    };

    const sprints = await prisma.sprint.findMany({
      where,
      include: {
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: { sprints } });
  } catch (error) {
    console.error('Get sprints error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/v1/sprints/:id
export const getSprintById = async (req: AuthRequest, res: Response) => {
  try {
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(400).json({ success: false, message: 'Sprint ID is invalid.' });
    }
    const sprint = await prisma.sprint.findUnique({
      where: { id: req.params.id },
      include: {
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { status: 'asc' },
        },
        project: { select: { id: true, name: true } },
      },
    });

    if (!sprint) {
      return res.status(404).json({ success: false, message: 'Sprint not found.' });
    }
    if (req.user!.role === 'PROJECT_MANAGER' &&
      !await canManageProject(req.user!.userId, req.user!.role, sprint.projectId, prisma)) {
      return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
    }

    // Compute burndown data
    const totalPoints = sprint.tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
    const completedPoints = sprint.tasks
      .filter((t) => t.status === 'DONE')
      .reduce((sum, t) => sum + (t.storyPoints || 0), 0);

    return res.json({
      success: true,
      data: {
        sprint,
        burndown: {
          totalPoints,
          completedPoints,
          remainingPoints: totalPoints - completedPoints,
          completionRate: totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0,
        },
      },
    });
  } catch (error) {
    console.error('Get sprint error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/v1/sprints
export const createSprint = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createSprintSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Sprint details are invalid.' });
    }
    const { name, goal, projectId, startDate, endDate } = parsed.data;

    const sprint = await prisma.$transaction(async (tx) => {
      if (!await canManageProject(req.user!.userId, req.user!.role, projectId, tx)) {
        throw new Error('SPRINT_PROJECT_FORBIDDEN');
      }
      const created = await tx.sprint.create({
        data: {
          name: name.trim(),
          goal: typeof goal === 'string' ? goal.trim() : null,
          projectId,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          status: 'PLANNED',
        },
      });
      await tx.activityLog.create({
        data: {
          action: 'SPRINT_CREATED',
          entityType: 'Sprint',
          entityId: created.id,
          entityName: created.name,
          userId: req.user!.userId,
          projectId: created.projectId,
        },
      });
      return created;
    });

    return res.status(201).json({ success: true, message: 'Sprint created successfully', data: { sprint } });
  } catch (error) {
    if (error instanceof Error && error.message === 'SPRINT_PROJECT_FORBIDDEN') {
      return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
    }
    console.error('Create sprint error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/v1/sprints/:id/start
export const startSprint = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ success: false, message: 'Sprint ID is invalid.' });
    }
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.sprint.findUnique({ where: { id } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (!await canManageProject(req.user!.userId, req.user!.role, existing.projectId, tx)) return { error: 'FORBIDDEN' as const };
      if (existing.status !== 'PLANNED') return { error: 'INVALID_STATE' as const };
      const active = await tx.sprint.findFirst({ where: { projectId: existing.projectId, status: 'ACTIVE' }, select: { id: true } });
      if (active) return { error: 'ACTIVE_EXISTS' as const };
      const sprint = await tx.sprint.update({ where: { id }, data: { status: 'ACTIVE', startDate: new Date() } });
      await tx.activityLog.create({
        data: {
          action: 'SPRINT_STARTED',
          entityType: 'Sprint',
          entityId: sprint.id,
          entityName: sprint.name,
          userId: req.user!.userId,
          projectId: sprint.projectId,
        },
      });
      return { sprint };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Sprint not found.' });
      if (result.error === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
      if (result.error === 'ACTIVE_EXISTS') return res.status(409).json({ success: false, message: 'Complete the active sprint before starting another.' });
      return res.status(400).json({ success: false, message: 'Only PLANNED sprints can be started.' });
    }
    return res.json({ success: true, message: 'Sprint started', data: { sprint: result.sprint } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return res.status(409).json({ success: false, message: 'Sprint state changed concurrently. Refresh and retry.' });
    }
    console.error('Start sprint error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/v1/sprints/:id/complete
export const completeSprint = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ success: false, message: 'Sprint ID is invalid.' });
    }
    const parsed = completeSprintSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Choose backlog or a target future sprint for incomplete tasks.' });
    }
    const { incompleteAction, targetSprintId } = parsed.data;
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.sprint.findUnique({ where: { id } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (!await canManageProject(req.user!.userId, req.user!.role, existing.projectId, tx)) return { error: 'FORBIDDEN' as const };
      if (existing.status !== 'ACTIVE') return { error: 'INVALID_STATE' as const };
      const blockingBugs = await tx.bug.findMany({
        where: {
          projectId: existing.projectId,
          severity: { in: ['BLOCKER', 'CRITICAL'] },
          status: { notIn: ['CLOSED', 'WONT_FIX'] },
        },
        select: { id: true, title: true, severity: true },
      });
      if (blockingBugs.length) return { error: 'QUALITY_GATE' as const, blockingBugs };
      let target = null;
      if (incompleteAction === 'future_sprint') {
        target = await tx.sprint.findFirst({
          where: { id: targetSprintId, projectId: existing.projectId, status: 'PLANNED' },
          select: { id: true },
        });
        if (!target) return { error: 'INVALID_TARGET' as const };
      }
      const unfinished = await tx.task.findMany({
        where: { sprintId: id, status: { not: 'DONE' } },
        select: { id: true, status: true },
      });
      if (unfinished.length) {
        await tx.task.updateMany({
          where: { id: { in: unfinished.map((task) => task.id) } },
          data: target
            ? { sprintId: target.id, status: 'TO_DO' }
            : { sprintId: null, status: 'BACKLOG' },
        });
      }
      const sprint = await tx.sprint.update({ where: { id }, data: { status: 'COMPLETED', endDate: new Date() } });
      await tx.activityLog.create({
        data: {
          action: 'SPRINT_COMPLETED',
          entityType: 'Sprint',
          entityId: sprint.id,
          entityName: sprint.name,
          details: { incompleteAction, targetSprintId: target?.id ?? null, movedTaskCount: unfinished.length },
          userId: req.user!.userId,
          projectId: sprint.projectId,
        },
      });
      return { sprint, movedTaskCount: unfinished.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Sprint not found.' });
      if (result.error === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
      if (result.error === 'INVALID_TARGET') return res.status(400).json({ success: false, message: 'Target sprint must be planned and belong to this project.' });
      if (result.error === 'QUALITY_GATE') {
        return res.status(409).json({
          success: false,
          message: 'Sprint cannot be completed while blocker or critical bugs remain unverified.',
          data: { blockingBugs: result.blockingBugs },
        });
      }
      return res.status(400).json({ success: false, message: 'Only ACTIVE sprints can be completed.' });
    }
    return res.json({
      success: true,
      message: `Sprint completed. ${result.movedTaskCount} incomplete tasks moved to ${incompleteAction === 'backlog' ? 'the backlog' : 'the selected sprint'}.`,
      data: { sprint: result.sprint, movedTaskCount: result.movedTaskCount },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return res.status(409).json({ success: false, message: 'Sprint state changed concurrently. Refresh and retry.' });
    }
    console.error('Complete sprint error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/v1/sprints/:id
export const updateSprint = async (req: AuthRequest, res: Response) => {
  try {
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(400).json({ success: false, message: 'Sprint ID is invalid.' });
    }
    const parsed = updateSprintSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Sprint details are invalid.' });
    }
    const { name, goal, startDate, endDate } = parsed.data;
    const existing = await prisma.sprint.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Sprint not found.' });
    if (!await canManageProject(req.user!.userId, req.user!.role, existing.projectId, prisma)) {
      return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
    }
    if (existing.status === 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'Completed sprints cannot be changed.' });
    }
    const effectiveStartDate = startDate === undefined ? existing.startDate : startDate ? new Date(startDate) : null;
    const effectiveEndDate = endDate === undefined ? existing.endDate : endDate ? new Date(endDate) : null;
    if (effectiveStartDate && effectiveEndDate && effectiveStartDate > effectiveEndDate) {
      return res.status(400).json({ success: false, message: 'Sprint details are invalid.' });
    }
    const sprint = await prisma.$transaction(async (tx) => {
      const updated = await tx.sprint.update({
        where: { id: req.params.id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(goal !== undefined && { goal: typeof goal === 'string' ? goal.trim() : null }),
          ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
          ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        },
      });
      await tx.activityLog.create({
        data: {
          action: 'SPRINT_UPDATED',
          entityType: 'Sprint',
          entityId: updated.id,
          entityName: updated.name,
          details: {
            before: { name: existing.name, goal: existing.goal, startDate: existing.startDate, endDate: existing.endDate },
            after: { name: updated.name, goal: updated.goal, startDate: updated.startDate, endDate: updated.endDate },
          },
          userId: req.user!.userId,
          projectId: updated.projectId,
        },
      });
      return updated;
    });
    return res.json({ success: true, data: { sprint } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Sprint not found.' });
    }
    console.error('Update sprint error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
