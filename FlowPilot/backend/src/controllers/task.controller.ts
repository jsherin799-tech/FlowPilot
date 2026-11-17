import { Response } from 'express';
import { Prisma, PrismaClient, TaskStatus, Priority, Role } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { emitUserNotification } from '../services/notification.service';
import { getTaskTransitionError, hasTaskImplementationEvidence } from '../services/developer-workflow.service';

const prisma = new PrismaClient();
const uuidSchema = z.string().uuid();

async function canManageProject(userId: string, role: Role, projectId: string): Promise<boolean> {
  if (role === 'ADMIN') return true;
  if (role !== 'PROJECT_MANAGER') return false;
  const project = await prisma.project.findFirst({
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

async function assignProjectMember(
  tx: Prisma.TransactionClient,
  projectId: string,
  userId: string,
  roles: Role[],
) {
  const user = await tx.user.findFirst({
    where: { id: userId, isActive: true, role: { in: roles } },
    select: { id: true, role: true },
  });
  if (!user) return false;
  await tx.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, role: user.role },
    update: { role: user.role },
  });
  return true;
}

// GET /api/v1/tasks
export const getTasks = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, status, priority, assigneeId, sprintId, search } = req.query;

    const where: Prisma.TaskWhereInput = {};
    const accessFilters: Prisma.TaskWhereInput[] = [];
    if (projectId && typeof projectId === 'string') where.projectId = projectId;
    if (req.user!.role === 'PROJECT_MANAGER') {
      accessFilters.push({ project: { OR: [
        { pmId: req.user!.userId },
        { members: { some: { userId: req.user!.userId, role: 'PROJECT_MANAGER' } } },
      ] } });
    }
    if (req.user!.role === 'DEVELOPER') {
      accessFilters.push({ assigneeId: req.user!.userId });
    } else if (req.user!.role === 'QA_ENGINEER') {
      accessFilters.push({ OR: [
        { assigneeId: req.user!.userId },
        { qaAssigneeId: req.user!.userId },
        { project: { members: { some: { userId: req.user!.userId, role: 'QA_ENGINEER' } } } },
      ] });
    }
    if (status && typeof status === 'string') where.status = status as TaskStatus;
    if (priority && typeof priority === 'string') where.priority = priority as Priority;
    if (assigneeId && typeof assigneeId === 'string' && req.user!.role !== 'DEVELOPER') {
      where.assigneeId = assigneeId;
    }
    if (sprintId && typeof sprintId === 'string') where.sprintId = sprintId;
    if (search && typeof search === 'string') {
      accessFilters.push({ OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ] });
    }
    if (accessFilters.length) where.AND = accessFilters;

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        qaAssignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        project: { select: { id: true, name: true } },
        sprint: { select: { id: true, name: true, status: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { status: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    });

    return res.json({ success: true, data: { tasks } });
  } catch (error) {
    console.error('Get tasks error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/v1/tasks/:id
export const getTaskById = async (req: AuthRequest, res: Response) => {
  try {
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(400).json({ success: false, message: 'Task ID is invalid.' });
    }
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
        qaAssignee: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
        project: { select: { id: true, name: true } },
        sprint: { select: { id: true, name: true, status: true } },
        comments: {
          where: { parentId: null },
          include: {
            author: { select: { id: true, name: true, avatarUrl: true } },
            replies: {
              include: { author: { select: { id: true, name: true, avatarUrl: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        activityLogs: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }
    if (req.user!.role === 'DEVELOPER' && task.assigneeId !== req.user!.userId) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }
    if (req.user!.role === 'PROJECT_MANAGER' &&
      !await canManageProject(req.user!.userId, req.user!.role, task.projectId)) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }
    if (req.user!.role === 'QA_ENGINEER' &&
      !await prisma.task.findFirst({
        where: {
          id: task.id,
          OR: [
            { assigneeId: req.user!.userId },
            { qaAssigneeId: req.user!.userId },
            { project: { members: { some: { userId: req.user!.userId, role: 'QA_ENGINEER' } } } },
          ],
        },
        select: { id: true },
      })) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    return res.json({ success: true, data: { task } });
  } catch (error) {
    console.error('Get task error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/v1/tasks
export const createTask = async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, projectId, assigneeId, qaAssigneeId, status, priority, storyPoints, estimatedHours, dueDate, sprintId } = req.body ?? {};

    if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 200) {
      return res.status(400).json({ success: false, message: 'Task title is required.' });
    }
    if (
      !uuidSchema.safeParse(projectId).success ||
      (description !== undefined && description !== null && typeof description !== 'string') ||
      (assigneeId !== undefined && assigneeId !== null && !uuidSchema.safeParse(assigneeId).success) ||
      (qaAssigneeId !== undefined && qaAssigneeId !== null && !uuidSchema.safeParse(qaAssigneeId).success) ||
      (sprintId !== undefined && sprintId !== null && !uuidSchema.safeParse(sprintId).success) ||
      (status !== undefined && !['BACKLOG', 'TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'].includes(status)) ||
      (priority !== undefined && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) ||
      (storyPoints !== undefined && storyPoints !== null && (!Number.isInteger(storyPoints) || storyPoints < 0 || storyPoints > 1000)) ||
      (estimatedHours !== undefined && estimatedHours !== null && (typeof estimatedHours !== 'number' || !Number.isFinite(estimatedHours) || estimatedHours < 0 || estimatedHours > 10000)) ||
      (dueDate !== undefined && dueDate !== null && (typeof dueDate !== 'string' || Number.isNaN(Date.parse(dueDate))))
    ) {
      return res.status(400).json({ success: false, message: 'Task details are invalid.' });
    }

    if (!await canManageProject(req.user!.userId, req.user!.role, projectId)) {
      return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
    }

    if (sprintId) {
      const sprint = await prisma.sprint.findFirst({
        where: { id: sprintId, projectId, status: { not: 'COMPLETED' } },
        select: { id: true },
      });
      if (!sprint) return res.status(400).json({ success: false, message: 'Sprint must belong to this project and not be completed.' });
    }
    const taskResult = await prisma.$transaction(async (tx) => {
      if (assigneeId && !await assignProjectMember(tx, projectId, assigneeId, ['DEVELOPER', 'QA_ENGINEER'])) {
        return { error: 'INVALID_ASSIGNEE' as const };
      }
      if (qaAssigneeId && !await assignProjectMember(tx, projectId, qaAssigneeId, ['QA_ENGINEER'])) {
        return { error: 'INVALID_QA_ASSIGNEE' as const };
      }
      const created = await tx.task.create({
        data: {
          title: title.trim(),
          description: typeof description === 'string' ? description.trim() : null,
          projectId,
          assigneeId: assigneeId || null,
          qaAssigneeId: qaAssigneeId || null,
          status: (status as TaskStatus | undefined) ?? 'TO_DO',
          priority: (priority as Priority | undefined) ?? 'MEDIUM',
          storyPoints: storyPoints ?? null,
          estimatedHours: estimatedHours ?? null,
          dueDate: dueDate ? new Date(dueDate) : null,
          sprintId: sprintId || null,
        },
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          qaAssignee: { select: { id: true, name: true, avatarUrl: true } },
          project: { select: { id: true, name: true } },
        },
      });
      await tx.activityLog.create({
        data: {
          action: 'TASK_CREATED',
          entityType: 'Task',
          entityId: created.id,
          entityName: created.title,
          userId: req.user!.userId,
          projectId: created.projectId,
          taskId: created.id,
        },
      });
      return { task: created };
    });
    if ('error' in taskResult) {
      const message = taskResult.error === 'INVALID_QA_ASSIGNEE'
        ? 'QA assignee must be an active QA Engineer.'
        : 'Assignee must be an active Developer or QA Engineer.';
      return res.status(400).json({ success: false, message });
    }
    const task = taskResult.task;

    if (task.assigneeId && task.assigneeId !== req.user!.userId) {
      const notification = await prisma.notification.create({
        data: {
          type: 'TASK_ASSIGNED',
          title: 'New Task Assigned',
          message: `You have been assigned to "${task.title}"`,
          userId: task.assigneeId,
          metadata: { taskId: task.id, projectId: task.projectId },
        },
      });
      emitUserNotification(req.app.get('io'), notification);
    }
    if (task.qaAssigneeId && task.qaAssigneeId !== req.user!.userId && task.qaAssigneeId !== task.assigneeId) {
      const notification = await prisma.notification.create({
        data: {
          type: 'TASK_ASSIGNED',
          title: 'QA Review Assigned',
          message: `You have been assigned to review "${task.title}"`,
          userId: task.qaAssigneeId,
          metadata: { taskId: task.id, projectId: task.projectId },
        },
      });
      emitUserNotification(req.app.get('io'), notification);
    }

    return res.status(201).json({ success: true, message: 'Task created successfully', data: { task } });
  } catch (error) {
    console.error('Create task error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/v1/tasks/:id
export const updateTask = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, assigneeId, qaAssigneeId, storyPoints, estimatedHours, dueDate, sprintId } = req.body ?? {};
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ success: false, message: 'Task ID is invalid.' });
    }
    if (
      (title !== undefined && (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 200)) ||
      (description !== undefined && description !== null && typeof description !== 'string') ||
      (status !== undefined && !['BACKLOG', 'TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'].includes(status)) ||
      (priority !== undefined && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) ||
      (assigneeId !== undefined && assigneeId !== null && !uuidSchema.safeParse(assigneeId).success) ||
      (qaAssigneeId !== undefined && qaAssigneeId !== null && !uuidSchema.safeParse(qaAssigneeId).success) ||
      (sprintId !== undefined && sprintId !== null && !uuidSchema.safeParse(sprintId).success) ||
      (storyPoints !== undefined && storyPoints !== null && (!Number.isInteger(storyPoints) || storyPoints < 0 || storyPoints > 1000)) ||
      (estimatedHours !== undefined && estimatedHours !== null && (typeof estimatedHours !== 'number' || !Number.isFinite(estimatedHours) || estimatedHours < 0 || estimatedHours > 10000)) ||
      (dueDate !== undefined && dueDate !== null && (typeof dueDate !== 'string' || Number.isNaN(Date.parse(dueDate))))
    ) {
      return res.status(400).json({ success: false, message: 'Task details are invalid.' });
    }

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }
    if (req.user!.role === 'DEVELOPER' && existing.assigneeId !== req.user!.userId) {
      return res.status(403).json({ success: false, message: 'Developers can only update tasks assigned to them.' });
    }
    if (req.user!.role === 'PROJECT_MANAGER' &&
      !await canManageProject(req.user!.userId, req.user!.role, existing.projectId)) {
      return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
    }
    if (status !== undefined && status !== existing.status) {
      if (req.user!.role === 'DEVELOPER') {
        return res.status(400).json({ success: false, message: 'Use the task status workflow to change assigned task status.' });
      }
      if (req.user!.role !== 'ADMIN' &&
        (!await canManageProject(req.user!.userId, req.user!.role, existing.projectId))) {
        return res.status(403).json({ success: false, message: 'Only project managers can change this task status.' });
      }
    }
    const changesPlanningFields =
      (priority !== undefined && priority !== existing.priority) ||
      (sprintId !== undefined && (sprintId || null) !== existing.sprintId) ||
      (assigneeId !== undefined && (assigneeId || null) !== existing.assigneeId) ||
      (qaAssigneeId !== undefined && (qaAssigneeId || null) !== existing.qaAssigneeId) ||
      (storyPoints !== undefined && (storyPoints ?? null) !== existing.storyPoints) ||
      (estimatedHours !== undefined && estimatedHours !== existing.estimatedHours);
    if (changesPlanningFields) {
      if (!await canManageProject(req.user!.userId, req.user!.role, existing.projectId)) {
        return res.status(403).json({ success: false, message: 'Only project managers can change priority, sprint, or assignee.' });
      }
      if (sprintId) {
        const sprint = await prisma.sprint.findFirst({
          where: { id: sprintId, projectId: existing.projectId, status: { not: 'COMPLETED' } },
          select: { id: true },
        });
        if (!sprint) return res.status(400).json({ success: false, message: 'Sprint must belong to this project and not be completed.' });
      }
      if (assigneeId) {
        const member = await prisma.user.findFirst({
          where: {
            id: assigneeId,
            role: { in: ['DEVELOPER', 'QA_ENGINEER'] },
            isActive: true,
          },
          select: { id: true, role: true },
        });
        if (!member) return res.status(400).json({ success: false, message: 'Assignee must be an active project team member.' });
      }
      if (qaAssigneeId) {
        const qaMember = await prisma.user.findFirst({
          where: { id: qaAssigneeId, role: 'QA_ENGINEER', isActive: true },
          select: { id: true },
        });
        if (!qaMember) return res.status(400).json({ success: false, message: 'QA assignee must be an active QA Engineer.' });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      if (status === 'DONE' && existing.status !== 'DONE') {
        const blockingBugs = await tx.bug.findMany({
          where: {
            taskId: id,
            severity: { in: ['BLOCKER', 'CRITICAL'] },
            status: { notIn: ['CLOSED', 'WONT_FIX'] },
          },
          select: { id: true, title: true, severity: true },
        });
        if (blockingBugs.length) return { error: 'QUALITY_GATE' as const, blockingBugs };
      }

      if (assigneeId) {
        if (!await assignProjectMember(tx, existing.projectId, assigneeId, ['DEVELOPER', 'QA_ENGINEER'])) {
          return { error: 'INVALID_ASSIGNEE' as const };
        }
      }
      if (qaAssigneeId && !await assignProjectMember(tx, existing.projectId, qaAssigneeId, ['QA_ENGINEER'])) {
        return { error: 'INVALID_QA_ASSIGNEE' as const };
      }

      const task = await tx.task.update({
        where: { id },
        data: {
          ...(title && { title: title.trim() }),
          ...(description !== undefined && { description: description?.trim() }),
          ...(status && { status: status as TaskStatus }),
          ...(priority && { priority: priority as Priority }),
          ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
          ...(qaAssigneeId !== undefined && { qaAssigneeId: qaAssigneeId || null }),
          ...(storyPoints !== undefined && { storyPoints: storyPoints ? parseInt(storyPoints) : null }),
          ...(estimatedHours !== undefined && { estimatedHours }),
          ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
          ...(sprintId !== undefined && { sprintId: sprintId || null }),
        },
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          qaAssignee: { select: { id: true, name: true, avatarUrl: true } },
          project: { select: { id: true, name: true } },
        },
      });

      if (status && status !== existing.status) {
        await tx.activityLog.create({
          data: {
            action: 'TASK_STATUS_CHANGED',
            entityType: 'Task',
            entityId: task.id,
            entityName: task.title,
            details: { from: existing.status, to: status },
            userId: req.user!.userId,
            projectId: task.projectId,
            taskId: task.id,
          },
        });
      }
      return { task };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if ('error' in result) {
      if (result.error === 'INVALID_ASSIGNEE') {
        return res.status(400).json({ success: false, message: 'Assignee must be an active Developer or QA Engineer.' });
      }
      if (result.error === 'INVALID_QA_ASSIGNEE') {
        return res.status(400).json({ success: false, message: 'QA assignee must be an active QA Engineer.' });
      }
      return res.status(409).json({
        success: false,
        message: 'Task cannot be completed while linked blocker or critical bugs remain unverified.',
        data: { blockingBugs: result.blockingBugs },
      });
    }
    const { task } = result;

    // Notify on new assignee
    if (assigneeId && assigneeId !== existing.assigneeId && assigneeId !== req.user!.userId) {
      const notification = await prisma.notification.create({
        data: {
          type: 'TASK_ASSIGNED',
          title: 'Task Assigned',
          message: `You have been assigned to "${task.title}"`,
          userId: assigneeId,
          metadata: { taskId: task.id, projectId: task.projectId },
        },
      });
      emitUserNotification(req.app.get('io'), notification);
    }
    if (qaAssigneeId && qaAssigneeId !== existing.qaAssigneeId && qaAssigneeId !== req.user!.userId && qaAssigneeId !== task.assigneeId) {
      const notification = await prisma.notification.create({
        data: {
          type: 'TASK_ASSIGNED',
          title: 'QA Review Assigned',
          message: `You have been assigned to review "${task.title}"`,
          userId: qaAssigneeId,
          metadata: { taskId: task.id, projectId: task.projectId },
        },
      });
      emitUserNotification(req.app.get('io'), notification);
    }

    return res.json({ success: true, message: 'Task updated successfully', data: { task } });
  } catch (error) {
    console.error('Update task error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/v1/tasks/:id/status (Kanban drag-and-drop + real-time Socket.IO)
export const updateTaskStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = z.object({
      status: z.enum(['BACKLOG', 'TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']),
      description: z.string().trim().max(5000).optional(),
      pullRequestUrl: z.string().url().refine((value) => value.startsWith('https://'), 'PR links must use HTTPS').nullable().optional(),
    }).safeParse(req.body);
    if (!uuidSchema.safeParse(id).success || !parsed.success) {
      return res.status(400).json({ success: false, message: 'Task status update is invalid.' });
    }
    const { status, description, pullRequestUrl } = parsed.data;

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Task not found.' });
    if (req.user!.role === 'DEVELOPER' && existing.assigneeId !== req.user!.userId) {
      return res.status(403).json({ success: false, message: 'Developers can only update tasks assigned to them.' });
    }
    if (req.user!.role === 'PROJECT_MANAGER' &&
      !await canManageProject(req.user!.userId, req.user!.role, existing.projectId)) {
      return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
    }
    if (req.user!.role === 'DEVELOPER') {
      const transitionError = getTaskTransitionError(req.user!.role, existing.status, status);
      if (transitionError) return res.status(400).json({ success: false, message: transitionError });
    }
    const effectiveDescription = description === undefined ? existing.description : description;
    const effectivePullRequestUrl = pullRequestUrl === undefined ? existing.pullRequestUrl : pullRequestUrl;
    if ((status === 'IN_REVIEW' || status === 'DONE') &&
      !hasTaskImplementationEvidence(effectiveDescription, effectivePullRequestUrl)) {
      return res.status(400).json({ success: false, message: 'Add task implementation notes or a secure pull request URL before review or completion.' });
    }

    const task = await prisma.$transaction(async (tx) => {
      if (status === 'DONE' && existing.status !== 'DONE') {
        const blockingBugs = await tx.bug.findMany({
          where: {
            taskId: id,
            severity: { in: ['BLOCKER', 'CRITICAL'] },
            status: { notIn: ['CLOSED', 'WONT_FIX'] },
          },
          select: { id: true, title: true, severity: true },
        });
        if (blockingBugs.length) return { error: 'QUALITY_GATE' as const, blockingBugs };
      }

      const update = await tx.task.update({
        where: { id },
        data: {
          status,
          ...(description !== undefined && { description }),
          ...(pullRequestUrl !== undefined && { pullRequestUrl }),
        },
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          project: { select: { id: true, name: true } },
          sprint: { select: { id: true, name: true } },
        },
      });
      if (status !== existing.status) {
        await tx.activityLog.create({
          data: {
            action: 'TASK_STATUS_CHANGED',
            entityType: 'Task',
            entityId: update.id,
            entityName: update.title,
            details: { from: existing.status, to: status },
            userId: req.user!.userId,
            projectId: update.projectId,
            taskId: update.id,
          },
        });
      }
      return update;
    });

    if ('error' in task) {
      return res.status(409).json({
        success: false,
        message: 'Task cannot be completed while linked blocker or critical bugs remain unverified.',
        data: { blockingBugs: task.blockingBugs },
      });
    }

    if (status !== existing.status) {
      const io = req.app.get('io');
      if (io) {
        io.to(`project:${task.projectId}`).emit('task:updated', {
          taskId: task.id,
          title: task.title,
          oldStatus: existing.status,
          newStatus: status,
          projectId: task.projectId,
          updatedBy: { id: req.user!.userId },
          task,
        });
      }
    }

    return res.json({ success: true, message: 'Task status updated', data: { task } });
  } catch (error) {
    console.error('Update task status error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/v1/tasks/:id
export const deleteTask = async (req: AuthRequest, res: Response) => {
  try {
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(400).json({ success: false, message: 'Task ID is invalid.' });
    }
    const task = await prisma.task.findUnique({ where: { id: req.params.id }, select: { id: true, projectId: true } });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found.' });
    if (req.user!.role === 'PROJECT_MANAGER' &&
      !await canManageProject(req.user!.userId, req.user!.role, task.projectId)) {
      return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
    }
    await prisma.task.delete({ where: { id: task.id } });
    return res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }
    console.error('Delete task error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/v1/tasks/:id/comments
export const addComment = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = z.object({
      content: z.string().trim().min(1).max(5000),
      parentId: uuidSchema.optional(),
    }).safeParse(req.body);
    if (!uuidSchema.safeParse(req.params.id).success || !parsed.success) {
      return res.status(400).json({ success: false, message: 'Comment content is required.' });
    }
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      select: { id: true, title: true, projectId: true },
    });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found.' });
    if (parsed.data.parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: parsed.data.parentId, taskId: task.id, parentId: null },
        select: { id: true },
      });
      if (!parent) return res.status(400).json({ success: false, message: 'Reply target must belong to this task.' });
    }
    if (req.user!.role === 'PROJECT_MANAGER' &&
      !await canManageProject(req.user!.userId, req.user!.role, task.projectId)) {
      return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
    }
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'PROJECT_MANAGER') {
      const membership = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: task.projectId, userId: req.user!.userId } },
        select: { id: true },
      });
      if (!membership) return res.status(403).json({ success: false, message: 'Project membership is required to comment.' });
    }
    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          content: parsed.data.content,
          taskId: task.id,
          parentId: parsed.data.parentId,
          authorId: req.user!.userId,
        },
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      });
      await tx.activityLog.create({
        data: {
          action: 'TASK_COMMENT_ADDED',
          entityType: 'Task',
          entityId: task.id,
          entityName: task.title,
          details: { commentId: created.id, parentId: parsed.data.parentId ?? null },
          userId: req.user!.userId,
          projectId: task.projectId,
          taskId: task.id,
        },
      });
      return created;
    });
    return res.status(201).json({ success: true, data: { comment } });
  } catch (error) {
    console.error('Add comment error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
