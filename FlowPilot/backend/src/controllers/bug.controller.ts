import { Response } from 'express';
import { Prisma, PrismaClient, BugSeverity, BugStatus, Priority } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { emitUserNotification } from '../services/notification.service';
import { getBugStatusTransitionError } from '../services/bug-lifecycle.service';
import { hasBugFixHandoffEvidence } from '../services/developer-workflow.service';
import { createBugSchema, updateBugSchema } from '../validators/bug.validator';

const prisma = new PrismaClient();
const uuidSchema = z.string().uuid();

// GET /api/v1/bugs
export const getBugs = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, severity, status, priority, search } = req.query;

    const where: Prisma.BugWhereInput = {};
    const accessFilters: Prisma.BugWhereInput[] = [];
    if (req.user!.role === 'DEVELOPER') accessFilters.push({ assigneeId: req.user!.userId });
    if (req.user!.role === 'PROJECT_MANAGER') {
      accessFilters.push({ project: { OR: [
        { pmId: req.user!.userId },
        { members: { some: { userId: req.user!.userId, role: 'PROJECT_MANAGER' } } },
      ] } });
    } else if (req.user!.role === 'QA_ENGINEER') {
      accessFilters.push({ OR: [
        { assigneeId: req.user!.userId },
        { project: { members: { some: { userId: req.user!.userId, role: 'QA_ENGINEER' } } } },
      ] });
    }
    if (projectId && typeof projectId === 'string') where.projectId = projectId;
    if (severity && typeof severity === 'string') {
      if (!Object.values(BugSeverity).includes(severity as BugSeverity)) {
        return res.status(400).json({ success: false, message: 'Invalid bug severity filter.' });
      }
      where.severity = severity as BugSeverity;
    }
    if (status && typeof status === 'string') {
      const statuses = status.split(',');
      if (!statuses.every((value) => Object.values(BugStatus).includes(value as BugStatus))) {
        return res.status(400).json({ success: false, message: 'Invalid bug status filter.' });
      }
      where.status = statuses.length === 1
        ? statuses[0] as BugStatus
        : { in: statuses as BugStatus[] };
    }
    if (priority && typeof priority === 'string') {
      if (!Object.values(Priority).includes(priority as Priority)) {
        return res.status(400).json({ success: false, message: 'Invalid bug priority filter.' });
      }
      where.priority = priority as Priority;
    }
    if (search && typeof search === 'string') {
      accessFilters.push({ OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ] });
    }
    if (accessFilters.length) where.AND = accessFilters;

    const bugs = await prisma.bug.findMany({
      where,
      include: {
        reporter: { select: { id: true, name: true, avatarUrl: true } },
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    });

    return res.json({ success: true, data: { bugs } });
  } catch (error) {
    console.error('Get bugs error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/v1/bugs/:id
export const getBugById = async (req: AuthRequest, res: Response) => {
  try {
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(400).json({ success: false, message: 'Bug ID is invalid.' });
    }
    const bug = await prisma.bug.findUnique({
      where: { id: req.params.id },
      include: {
        reporter: { select: { id: true, name: true, avatarUrl: true, role: true } },
        assignee: { select: { id: true, name: true, avatarUrl: true, role: true } },
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
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

    if (!bug) {
      return res.status(404).json({ success: false, message: 'Bug not found.' });
    }
    if (req.user!.role === 'DEVELOPER' && bug.assigneeId !== req.user!.userId) {
      return res.status(404).json({ success: false, message: 'Bug not found.' });
    }
    if (req.user!.role === 'PROJECT_MANAGER' &&
      !await prisma.project.findFirst({
        where: {
          id: bug.projectId,
          OR: [
            { pmId: req.user!.userId },
            { members: { some: { userId: req.user!.userId, role: 'PROJECT_MANAGER' } } },
          ],
        },
        select: { id: true },
      })) {
      return res.status(404).json({ success: false, message: 'Bug not found.' });
    }
    if (req.user!.role === 'QA_ENGINEER' &&
      !await prisma.bug.findFirst({
        where: {
          id: bug.id,
          OR: [
            { assigneeId: req.user!.userId },
            { project: { members: { some: { userId: req.user!.userId, role: 'QA_ENGINEER' } } } },
          ],
        },
        select: { id: true },
      })) {
      return res.status(404).json({ success: false, message: 'Bug not found.' });
    }

    return res.json({ success: true, data: { bug } });
  } catch (error) {
    console.error('Get bug error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/v1/bugs
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
    const {
      title, description, projectId, severity, priority, reproductionSteps, expectedResult, actualResult,
      attachments, taskId, environment, browser, os, assigneeId,
    } = validation.data;
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } });
      if (!project) return { error: 'PROJECT_NOT_FOUND' as const };

      const task = taskId
        ? await tx.task.findFirst({ where: { id: taskId, projectId }, select: { id: true, assigneeId: true } })
        : null;
      if (taskId && !task) return { error: 'TASK_NOT_FOUND' as const };

      let routedAssigneeId = assigneeId || null;
      if (!routedAssigneeId && task?.assigneeId) {
        const taskAssignee = await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: task.assigneeId } },
          select: { user: { select: { role: true, isActive: true } } },
        });
        if (taskAssignee?.user.role === 'DEVELOPER' && taskAssignee.user.isActive) {
          routedAssigneeId = task.assigneeId;
        }
      }
      if (routedAssigneeId) {
        const membership = await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: routedAssigneeId } },
          select: { user: { select: { role: true, isActive: true } } },
        });
        if (!membership || membership.user.role !== 'DEVELOPER' || !membership.user.isActive) {
          return { error: 'INVALID_ASSIGNEE' as const };
        }
      }

      const bug = await tx.bug.create({
        data: {
          title,
          description,
          projectId,
          taskId: task?.id ?? null,
          severity: severity || 'MAJOR',
          priority: priority || (severity === 'BLOCKER' || severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH'),
          status: 'OPEN',
          reproductionSteps,
          expectedResult,
          actualResult,
          attachments: attachments ?? [],
          environment,
          browser,
          os,
          reporterId: req.user!.userId,
          assigneeId: routedAssigneeId,
        },
        include: {
          reporter: { select: { id: true, name: true, avatarUrl: true } },
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          project: { select: { id: true, name: true } },
          task: { select: { id: true, title: true } },
        },
      });

      await tx.activityLog.create({
        data: {
          action: 'BUG_REPORTED',
          entityType: 'Bug',
          entityId: bug.id,
          entityName: bug.title,
          details: { severity: bug.severity, taskId: bug.taskId },
          userId: req.user!.userId,
          projectId: bug.projectId,
          bugId: bug.id,
        },
      });

      const notification = bug.assigneeId && bug.assigneeId !== req.user!.userId
        ? await tx.notification.create({
          data: {
            type: 'BUG_REPORTED',
            title: `${bug.severity} Bug Assigned`,
            message: `Bug "${bug.title}" has been assigned to you.`,
            userId: bug.assigneeId,
            metadata: { bugId: bug.id, projectId: bug.projectId },
          },
        })
        : null;

      return { bug, notification };
    });

    if ('error' in result) {
      if (result.error === 'PROJECT_NOT_FOUND') return res.status(404).json({ success: false, message: 'Project not found.' });
      if (result.error === 'TASK_NOT_FOUND') return res.status(400).json({ success: false, message: 'Selected task must belong to the chosen project.' });
      return res.status(400).json({ success: false, message: 'Assignee must be an active developer on this project.' });
    }
    if (result.notification) emitUserNotification(req.app.get('io'), result.notification);
    return res.status(201).json({ success: true, message: 'Bug logged successfully', data: { bug: result.bug } });
  } catch (error) {
    console.error('Create bug error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/v1/bugs/:id
export const updateBug = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!uuidSchema.safeParse(id).success) {
      return res.status(400).json({ success: false, message: 'Bug ID is invalid.' });
    }
    const validation = updateBugSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.error.issues.map((issue) => issue.message),
      });
    }
    const {
      title, description, severity, priority, status, reproductionSteps, environment, browser, os, assigneeId,
      resolutionNotes, pullRequestUrl, commitHash, expectedResult, actualResult, attachments, taskId,
    } = validation.data;

    const existing = await prisma.bug.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Bug not found.' });
    if (taskId) {
      const task = await prisma.task.findFirst({
        where: { id: taskId, projectId: existing.projectId },
        select: { id: true },
      });
      if (!task) return res.status(400).json({ success: false, message: 'Selected task must belong to this bug project.' });
    }
    if (assigneeId) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: existing.projectId, userId: assigneeId } },
        select: { user: { select: { role: true, isActive: true } } },
      });
      if (!member || member.user.role !== 'DEVELOPER' || !member.user.isActive) {
        return res.status(400).json({ success: false, message: 'Assignee must be an active developer on this project.' });
      }
    }
    if (existing.status === 'RETEST' && (validation.data.status === 'CLOSED' || validation.data.status === 'REOPENED')) {
      return res.status(400).json({ success: false, message: 'Submit a retest outcome with notes through the QA retest endpoint.' });
    }
    if (req.user!.role === 'DEVELOPER') {
      const allowedFields = new Set(['status', 'resolutionNotes', 'pullRequestUrl', 'commitHash']);
      if (Object.keys(req.body ?? {}).some((key) => !allowedFields.has(key))) {
        return res.status(403).json({ success: false, message: 'Developers can only update fix details for assigned bugs.' });
      }
      if (existing.assigneeId !== req.user!.userId) {
        return res.status(403).json({ success: false, message: 'Developers can only update bugs assigned to them.' });
      }
    }

    const nextStatus = status;
    if (nextStatus && nextStatus !== existing.status) {
      const transitionError = getBugStatusTransitionError(req.user!.role, existing.status, nextStatus);
      if (transitionError) {
        return res.status(403).json({ success: false, message: transitionError });
      }
    }
    if (req.user!.role === 'DEVELOPER' && nextStatus === 'FIXED' &&
      !hasBugFixHandoffEvidence(
        resolutionNotes ?? existing.resolutionNotes,
        pullRequestUrl ?? existing.pullRequestUrl,
        commitHash ?? existing.commitHash,
      )) {
      return res.status(400).json({ success: false, message: 'Add fix notes and a pull request URL or commit hash before handing off for retest.' });
    }

    const updateData: Prisma.BugUpdateManyMutationInput = {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(severity !== undefined && { severity }),
      ...(priority !== undefined && { priority }),
      ...(nextStatus !== undefined && { status: nextStatus }),
      ...(reproductionSteps !== undefined && { reproductionSteps }),
      ...(expectedResult !== undefined && { expectedResult }),
      ...(actualResult !== undefined && { actualResult }),
      ...(attachments !== undefined && { attachments }),
      ...(taskId !== undefined && { taskId }),
      ...(environment !== undefined && { environment }),
      ...(browser !== undefined && { browser }),
      ...(os !== undefined && { os }),
      ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
      ...(resolutionNotes !== undefined && { resolutionNotes }),
      ...(pullRequestUrl !== undefined && { pullRequestUrl }),
      ...(commitHash !== undefined && { commitHash }),
    };

    const result = await prisma.$transaction(async (transaction) => {
      const result = await transaction.bug.updateMany({
        where: { id, status: existing.status },
        data: updateData,
      });
      if (result.count !== 1) return null;

      const updatedBug = await transaction.bug.findUniqueOrThrow({
        where: { id },
        include: {
          reporter: { select: { id: true, name: true, avatarUrl: true } },
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          project: { select: { id: true, name: true } },
        },
      });
      const notifications: Awaited<ReturnType<typeof transaction.notification.create>>[] = [];

      if (nextStatus && nextStatus !== existing.status) {
        await transaction.activityLog.create({
          data: {
            action: nextStatus === 'FIXED' || nextStatus === 'RESOLVED' ? 'BUG_RESOLVED' : 'BUG_STATUS_CHANGED',
            entityType: 'Bug',
            entityId: updatedBug.id,
            entityName: updatedBug.title,
            details: { from: existing.status, to: nextStatus },
            userId: req.user!.userId,
            projectId: updatedBug.projectId,
            bugId: updatedBug.id,
          },
        });
        if (nextStatus === 'FIXED') {
          const qaMembers = await transaction.projectMember.findMany({
            where: { projectId: updatedBug.projectId, role: 'QA_ENGINEER', user: { isActive: true } },
            select: { userId: true },
          });
          for (const { userId } of qaMembers) {
            if (userId === req.user!.userId) continue;
            notifications.push(await transaction.notification.create({
              data: {
                type: 'BUG_RESOLVED',
                title: 'Bug fix ready for retest',
                message: `"${updatedBug.title}" is fixed and waiting for QA retest.`,
                userId,
                metadata: { bugId: updatedBug.id, projectId: updatedBug.projectId },
              },
            }));
          }
        }
      }

      return { bug: updatedBug, notifications };
    });

    if (!result) {
      return res.status(409).json({ success: false, message: 'Bug status changed concurrently. Refresh and try again.' });
    }
    for (const notification of result.notifications) {
      emitUserNotification(req.app.get('io'), notification);
    }

    return res.json({ success: true, message: 'Bug updated successfully', data: { bug: result.bug } });
  } catch (error) {
    console.error('Update bug error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/v1/bugs/:id
export const deleteBug = async (req: AuthRequest, res: Response) => {
  try {
    if (!uuidSchema.safeParse(req.params.id).success) {
      return res.status(400).json({ success: false, message: 'Bug ID is invalid.' });
    }
    await prisma.bug.delete({ where: { id: req.params.id } });
    return res.json({ success: true, message: 'Bug deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Bug not found.' });
    }
    console.error('Delete bug error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/v1/bugs/:id/comments
export const addBugComment = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = z.object({
      content: z.string().trim().min(1).max(5000),
      parentId: uuidSchema.optional(),
    }).safeParse(req.body);
    if (!uuidSchema.safeParse(req.params.id).success || !parsed.success) {
      return res.status(400).json({ success: false, message: 'Comment content is required.' });
    }
    const bug = await prisma.bug.findUnique({
      where: { id: req.params.id },
      select: { id: true, title: true, projectId: true },
    });
    if (!bug) return res.status(404).json({ success: false, message: 'Bug not found.' });
    if (parsed.data.parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: parsed.data.parentId, bugId: bug.id, parentId: null },
        select: { id: true },
      });
      if (!parent) return res.status(400).json({ success: false, message: 'Reply target must belong to this bug.' });
    }
    if (req.user!.role !== 'ADMIN') {
      const membership = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: bug.projectId, userId: req.user!.userId } },
        select: { role: true },
      });
      if (!membership || (req.user!.role === 'PROJECT_MANAGER' && membership.role !== 'PROJECT_MANAGER')) {
        return res.status(403).json({ success: false, message: 'Project membership is required to comment.' });
      }
    }
    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          content: parsed.data.content,
          bugId: bug.id,
          parentId: parsed.data.parentId,
          authorId: req.user!.userId,
        },
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      });
      await tx.activityLog.create({
        data: {
          action: 'BUG_COMMENT_ADDED',
          entityType: 'Bug',
          entityId: bug.id,
          entityName: bug.title,
          details: { commentId: created.id, parentId: parsed.data.parentId ?? null },
          userId: req.user!.userId,
          projectId: bug.projectId,
          bugId: bug.id,
        },
      });
      return created;
    });
    return res.status(201).json({ success: true, data: { comment } });
  } catch (error) {
    console.error('Add bug comment error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};