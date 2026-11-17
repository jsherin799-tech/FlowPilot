import { PrismaClient, Role } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();
const uuidSchema = z.string().uuid();

async function taskAccess(userId: string, role: Role, taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, projectId: true, assigneeId: true, status: true },
  });
  if (!task) return { error: 'NOT_FOUND' as const };
  if (role === 'DEVELOPER' && task.assigneeId !== userId) return { error: 'FORBIDDEN' as const };
  if (role === 'PROJECT_MANAGER') {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId } },
      select: { role: true },
    });
    if (membership?.role !== 'PROJECT_MANAGER') return { error: 'FORBIDDEN' as const };
  }
  return { task };
}

function respondAccessError(res: Response, error: 'NOT_FOUND' | 'FORBIDDEN') {
  return error === 'NOT_FOUND'
    ? res.status(404).json({ success: false, message: 'Task not found.' })
    : res.status(403).json({ success: false, message: 'Task is not available in your workspace.' });
}

export const getDeveloperWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const warningCutoff = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const assignedDeveloper = req.user!.role === 'DEVELOPER'
      ? { assigneeId: userId }
      : { assignee: { role: 'DEVELOPER' as const } };
    const managedProjects = req.user!.role === 'PROJECT_MANAGER'
      ? { members: { some: { userId, role: 'PROJECT_MANAGER' as const } } }
      : {};
    const [tasks, bugs] = await Promise.all([
      prisma.task.findMany({
        where: { ...assignedDeveloper, project: managedProjects },
        include: {
          project: { select: { id: true, name: true, key: true } },
          sprint: { select: { id: true, name: true, status: true, endDate: true } },
          checklistItems: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
          effortLogs: { where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 },
          comments: {
            where: { parentId: null },
            include: {
              author: { select: { id: true, name: true, role: true } },
              replies: {
                include: { author: { select: { id: true, name: true, role: true } } },
                orderBy: { createdAt: 'asc' },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { updatedAt: 'desc' }],
      }),
      prisma.bug.findMany({
        where: {
          ...(req.user!.role === 'DEVELOPER' ? { assigneeId: userId } : { assignee: { role: 'DEVELOPER' as const } }),
          project: managedProjects,
          status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] },
        },
        include: {
          project: { select: { id: true, name: true, key: true } },
          comments: {
            where: { parentId: null },
            include: {
              author: { select: { id: true, name: true, role: true } },
              replies: {
                include: { author: { select: { id: true, name: true, role: true } } },
                orderBy: { createdAt: 'asc' },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ severity: 'asc' }, { updatedAt: 'desc' }],
      }),
    ]);

    return res.json({
      success: true,
      data: {
        tasks,
        bugs,
        alerts: {
          overdueTasks: tasks.filter((task) => task.status !== 'DONE' && task.dueDate && task.dueDate < now).length,
          approachingSprintDeadlines: [...new Set(tasks
            .filter((task) => task.status !== 'DONE' && task.sprint?.endDate && task.sprint.endDate <= warningCutoff)
            .map((task) => task.sprint!.id))].length,
          urgentBugs: bugs.filter((bug) => bug.severity === 'BLOCKER' || bug.severity === 'CRITICAL').length,
        },
      },
    });
  } catch (error) {
    console.error('Developer workspace error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load developer workspace.' });
  }
};

export const logTaskEffort = async (req: AuthRequest, res: Response) => {
  const parsed = z.object({
    hours: z.number().positive().max(24),
    note: z.string().trim().max(500).optional(),
  }).safeParse(req.body);
  if (!uuidSchema.safeParse(req.params.taskId).success || !parsed.success) {
    return res.status(400).json({ success: false, message: 'Task effort entry is invalid.' });
  }
  try {
    const access = await taskAccess(req.user!.userId, req.user!.role, req.params.taskId);
    if ('error' in access) return respondAccessError(res, access.error);
    const result = await prisma.$transaction(async (tx) => {
      const log = await tx.taskEffortLog.create({
        data: {
          taskId: access.task.id,
          userId: req.user!.userId,
          hours: parsed.data.hours,
          note: parsed.data.note || null,
        },
      });
      await tx.task.update({
        where: { id: access.task.id },
        data: { actualHours: { increment: parsed.data.hours } },
      });
      await tx.activityLog.create({
        data: {
          action: 'TASK_EFFORT_LOGGED',
          entityType: 'Task',
          entityId: access.task.id,
          entityName: access.task.title,
          details: { hours: parsed.data.hours, note: parsed.data.note ?? null },
          userId: req.user!.userId,
          projectId: access.task.projectId,
          taskId: access.task.id,
        },
      });
      return log;
    });
    return res.status(201).json({ success: true, data: { effortLog: result } });
  } catch (error) {
    console.error('Task effort log error:', error);
    return res.status(500).json({ success: false, message: 'Unable to log task effort.' });
  }
};

export const createChecklistItem = async (req: AuthRequest, res: Response) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(200) }).safeParse(req.body);
  if (!uuidSchema.safeParse(req.params.taskId).success || !parsed.success) {
    return res.status(400).json({ success: false, message: 'Checklist item is invalid.' });
  }
  try {
    const access = await taskAccess(req.user!.userId, req.user!.role, req.params.taskId);
    if ('error' in access) return respondAccessError(res, access.error);
    const item = await prisma.$transaction(async (tx) => {
      const last = await tx.taskChecklistItem.findFirst({
        where: { taskId: access.task.id },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      const created = await tx.taskChecklistItem.create({
        data: {
          taskId: access.task.id,
          title: parsed.data.title,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
      });
      await tx.activityLog.create({
        data: {
          action: 'TASK_CHECKLIST_ITEM_ADDED',
          entityType: 'Task',
          entityId: access.task.id,
          entityName: access.task.title,
          details: { itemId: created.id, title: created.title },
          userId: req.user!.userId,
          projectId: access.task.projectId,
          taskId: access.task.id,
        },
      });
      return created;
    });
    return res.status(201).json({ success: true, data: { item } });
  } catch (error) {
    console.error('Checklist item create error:', error);
    return res.status(500).json({ success: false, message: 'Unable to add checklist item.' });
  }
};

export const updateChecklistItem = async (req: AuthRequest, res: Response) => {
  const parsed = z.object({ isComplete: z.boolean() }).safeParse(req.body);
  if (!uuidSchema.safeParse(req.params.itemId).success || !parsed.success) {
    return res.status(400).json({ success: false, message: 'Checklist update is invalid.' });
  }
  try {
    const item = await prisma.taskChecklistItem.findUnique({
      where: { id: req.params.itemId },
      include: { task: { select: { id: true, title: true, projectId: true, assigneeId: true } } },
    });
    if (!item) return res.status(404).json({ success: false, message: 'Checklist item not found.' });
    const access = await taskAccess(req.user!.userId, req.user!.role, item.task.id);
    if ('error' in access) return respondAccessError(res, access.error);
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.taskChecklistItem.update({
        where: { id: item.id },
        data: { isComplete: parsed.data.isComplete },
      });
      await tx.activityLog.create({
        data: {
          action: parsed.data.isComplete ? 'TASK_CHECKLIST_ITEM_COMPLETED' : 'TASK_CHECKLIST_ITEM_REOPENED',
          entityType: 'Task',
          entityId: item.task.id,
          entityName: item.task.title,
          details: { itemId: item.id, title: item.title },
          userId: req.user!.userId,
          projectId: item.task.projectId,
          taskId: item.task.id,
        },
      });
      return changed;
    });
    return res.json({ success: true, data: { item: updated } });
  } catch (error) {
    console.error('Checklist item update error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update checklist item.' });
  }
};
