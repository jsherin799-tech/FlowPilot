import { BugSeverity, Prisma, PrismaClient, Priority, Role } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();
const uuidSchema = z.string().uuid();

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidSchema.safeParse(value).success;
}

async function canManageProject(userId: string, role: Role, projectId: string, tx: PrismaClient | Prisma.TransactionClient = prisma) {
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

function validDatePair(start: unknown, end: unknown) {
  if (start !== undefined && start !== null && (typeof start !== 'string' || Number.isNaN(Date.parse(start)))) return false;
  if (end !== undefined && end !== null && (typeof end !== 'string' || Number.isNaN(Date.parse(end)))) return false;
  return !(start && end && new Date(start as string) > new Date(end as string));
}

export const getOverview = async (req: AuthRequest, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      where: req.user!.role === 'ADMIN'
        ? { status: { not: 'ARCHIVED' } }
        : {
          OR: [
            { pmId: req.user!.userId },
            { members: { some: { userId: req.user!.userId, role: 'PROJECT_MANAGER' } } },
          ],
          status: { not: 'ARCHIVED' },
        },
      include: {
        _count: { select: { tasks: true, bugs: true, sprints: true } },
        members: {
          where: { role: { in: ['DEVELOPER', 'QA_ENGINEER'] }, user: { isActive: true } },
          select: { user: { select: { id: true, name: true, role: true } } },
        },
        milestones: {
          orderBy: { endDate: 'asc' },
          include: { tasks: { select: { status: true } } },
        },
        sprints: {
          where: { status: { in: ['ACTIVE', 'PLANNED'] } },
          include: { tasks: { select: { id: true, status: true, storyPoints: true, dueDate: true, assigneeId: true } } },
          orderBy: { startDate: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    const projectIds = projects.map(({ id }) => id);
    const [
      taskGroups,
      overdueTaskGroups,
      bugStatusGroups,
      completedSprints,
      unassignedTasks,
      openBlockerBugCount,
      openBlockerBugs,
      unassignedBugCount,
      unassignedBugs,
      overdueMilestoneCount,
      overdueMilestones,
      workload,
      activity,
    ] = await Promise.all([
      prisma.task.groupBy({ by: ['projectId', 'status'], where: { projectId: { in: projectIds } }, _count: true }),
      prisma.task.groupBy({
        by: ['projectId'],
        where: { projectId: { in: projectIds }, status: { not: 'DONE' }, dueDate: { lt: new Date() } },
        _count: true,
      }),
      prisma.bug.groupBy({ by: ['status'], where: { projectId: { in: projectIds } }, _count: true }),
      prisma.sprint.findMany({
        where: { projectId: { in: projectIds }, status: 'COMPLETED' },
        include: { tasks: { where: { status: 'DONE' }, select: { storyPoints: true } } },
        orderBy: { endDate: 'desc' },
        take: 100,
      }),
      prisma.task.count({ where: { projectId: { in: projectIds }, status: { not: 'DONE' }, assigneeId: null } }),
      prisma.bug.count({
        where: { projectId: { in: projectIds }, severity: { in: ['BLOCKER', 'CRITICAL'] }, status: { notIn: ['RESOLVED', 'CLOSED', 'WONT_FIX'] } },
      }),
      prisma.bug.findMany({
        where: { projectId: { in: projectIds }, severity: { in: ['BLOCKER', 'CRITICAL'] }, status: { notIn: ['RESOLVED', 'CLOSED', 'WONT_FIX'] } },
        select: { id: true, title: true, severity: true, projectId: true, project: { select: { name: true } } },
        take: 25,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.bug.count({
        where: { projectId: { in: projectIds }, assigneeId: null, status: { notIn: ['RESOLVED', 'CLOSED', 'WONT_FIX'] } },
      }),
      prisma.bug.findMany({
        where: { projectId: { in: projectIds }, assigneeId: null, status: { notIn: ['RESOLVED', 'CLOSED', 'WONT_FIX'] } },
        select: { id: true, title: true, severity: true, projectId: true, project: { select: { name: true } } },
        take: 25,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.milestone.count({
        where: { projectId: { in: projectIds }, isComplete: false, endDate: { lt: new Date() } },
      }),
      prisma.milestone.findMany({
        where: { projectId: { in: projectIds }, isComplete: false, endDate: { lt: new Date() } },
        include: { project: { select: { name: true } } },
        orderBy: { endDate: 'asc' },
        take: 25,
      }),
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { projectId: { in: projectIds }, status: { not: 'DONE' }, assigneeId: { not: null } },
        _count: true,
        _sum: { storyPoints: true },
      }),
      prisma.activityLog.findMany({
        where: { projectId: { in: projectIds } },
        include: { user: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const userIds = workload.flatMap(({ assigneeId }) => assigneeId ? [assigneeId] : []);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, role: true },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));
    const velocityByProject = new Map<string, typeof completedSprints>();
    for (const sprint of completedSprints) {
      const history = velocityByProject.get(sprint.projectId) ?? [];
      if (history.length < 6) history.push(sprint);
      velocityByProject.set(sprint.projectId, history);
    }
    const groupedCounts = new Map<string, Record<string, number>>();
    for (const row of taskGroups) {
      const counts = groupedCounts.get(row.projectId) ?? {};
      counts[row.status] = row._count;
      groupedCounts.set(row.projectId, counts);
    }
    const projectSummaries = projects.map((project) => {
      const counts = groupedCounts.get(project.id) ?? {};
      const totalTasks = Object.values(counts).reduce((sum, count) => sum + count, 0);
      const completedTasks = counts.DONE ?? 0;
      const activeSprint = project.sprints.find((sprint) => sprint.status === 'ACTIVE') ?? null;
      const sprintTotalPoints = activeSprint?.tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0) ?? 0;
      const sprintRemainingPoints = activeSprint?.tasks
        .filter((task) => task.status !== 'DONE')
        .reduce((sum, task) => sum + (task.storyPoints ?? 0), 0) ?? 0;
      return {
        id: project.id,
        name: project.name,
        key: project.key,
        status: project.status,
        team: project.members.map(({ user }) => user),
        milestones: project.milestones.map(({ tasks: milestoneTasks, ...milestone }) => ({
          ...milestone,
          taskCount: milestoneTasks.length,
          completedTaskCount: milestoneTasks.filter((task) => task.status === 'DONE').length,
          completionPercent: milestoneTasks.length
            ? Math.round(milestoneTasks.filter((task) => task.status === 'DONE').length / milestoneTasks.length * 100)
            : 0,
        })),
        startDate: project.startDate,
        endDate: project.endDate,
        taskCounts: counts,
        completionPercent: totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0,
        overdueTasks: overdueTaskGroups.find((row) => row.projectId === project.id)?._count ?? 0,
        activeSprint: activeSprint ? {
          id: activeSprint.id,
          name: activeSprint.name,
          goal: activeSprint.goal,
          startDate: activeSprint.startDate,
          endDate: activeSprint.endDate,
          totalPoints: sprintTotalPoints,
          remainingPoints: sprintRemainingPoints,
          completedPoints: sprintTotalPoints - sprintRemainingPoints,
          completionPercent: sprintTotalPoints ? Math.round((sprintTotalPoints - sprintRemainingPoints) / sprintTotalPoints * 100) : 0,
          tasks: activeSprint.tasks.length,
          overdueTasks: activeSprint.tasks.filter((task) => task.status !== 'DONE' && task.dueDate && task.dueDate < new Date()).length,
          unassignedTasks: activeSprint.tasks.filter((task) => task.status !== 'DONE' && !task.assigneeId).length,
        } : null,
        plannedSprints: project.sprints.filter((sprint) => sprint.status === 'PLANNED').map((sprint) => ({
          id: sprint.id,
          name: sprint.name,
          goal: sprint.goal,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          taskCount: sprint.tasks.length,
          storyPoints: sprint.tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
        })),
        velocity: (velocityByProject.get(project.id) ?? [])
          .reverse()
          .map((sprint) => ({
            id: sprint.id,
            name: sprint.name,
            completedPoints: sprint.tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
          })),
        _count: project._count,
      };
    });

    return res.json({
      success: true,
      data: {
        projects: projectSummaries,
        alerts: {
          tasksInReview: taskGroups.filter((row) => row.status === 'IN_REVIEW').reduce((sum, row) => sum + row._count, 0),
          overdueTasks: overdueTaskGroups.reduce((sum, row) => sum + row._count, 0),
          unassignedTasks,
          openBlockerBugCount,
          unassignedBugCount,
          overdueMilestoneCount,
          bugsInRetest: bugStatusGroups.find(({ status }) => status === 'RETEST')?._count ?? 0,
          reopenedBugs: bugStatusGroups.find(({ status }) => status === 'REOPENED')?._count ?? 0,
          unassignedBugs,
          overdueMilestones,
          openBlockerBugs,
        },
        workload: workload.map((row) => ({
          user: row.assigneeId ? usersById.get(row.assigneeId) : null,
          activeTasks: row._count,
          storyPoints: row._sum.storyPoints ?? 0,
        })),
        recentActivity: activity,
      },
    });
  } catch (error) {
    console.error('PM overview error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load project manager overview.' });
  }
};

export const getEligibleTeamMembers = async (_req: AuthRequest, res: Response) => {
  try {
    const members = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['DEVELOPER', 'QA_ENGINEER'] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: { members } });
  } catch (error) {
    console.error('PM team directory error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load available team members.' });
  }
};

export const createMilestone = async (req: AuthRequest, res: Response) => {
  const { name, description, startDate, endDate } = req.body ?? {};
  if (
    !isUuid(req.params.projectId) ||
    typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120 ||
    (description !== undefined && description !== null && typeof description !== 'string') ||
    !validDatePair(startDate, endDate)
  ) {
    return res.status(400).json({ success: false, message: 'Milestone details are invalid.' });
  }
  try {
    if (!await canManageProject(req.user!.userId, req.user!.role, req.params.projectId)) {
      return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
    }
    const milestone = await prisma.$transaction(async (tx) => {
      const created = await tx.milestone.create({
        data: {
          name: name.trim(),
          description: typeof description === 'string' ? description.trim() : null,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          projectId: req.params.projectId,
        },
      });
      await tx.activityLog.create({
        data: {
          action: 'MILESTONE_CREATED',
          entityType: 'Milestone',
          entityId: created.id,
          entityName: created.name,
          userId: req.user!.userId,
          projectId: req.params.projectId,
        },
      });
      return created;
    });
    return res.status(201).json({ success: true, data: { milestone } });
  } catch (error) {
    console.error('Create milestone error:', error);
    return res.status(500).json({ success: false, message: 'Unable to create milestone.' });
  }
};

export const getMilestones = async (req: AuthRequest, res: Response) => {
  if (!isUuid(req.params.projectId)) {
    return res.status(400).json({ success: false, message: 'Project ID is invalid.' });
  }
  try {
    if (!await canManageProject(req.user!.userId, req.user!.role, req.params.projectId)) {
      return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
    }
    const milestones = await prisma.milestone.findMany({
      where: { projectId: req.params.projectId },
      orderBy: [{ endDate: 'asc' }, { createdAt: 'asc' }],
    });
    return res.json({ success: true, data: { milestones } });
  } catch (error) {
    console.error('Get milestones error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load milestones.' });
  }
};

export const updateMilestone = async (req: AuthRequest, res: Response) => {
  const { isComplete } = req.body ?? {};
  if (!isUuid(req.params.milestoneId)) {
    return res.status(400).json({ success: false, message: 'Milestone ID is invalid.' });
  }
  if (typeof isComplete !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Milestone completion must be true or false.' });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const milestone = await tx.milestone.findUnique({
        where: { id: req.params.milestoneId },
        select: { id: true, name: true, projectId: true, isComplete: true },
      });
      if (!milestone) return { error: 'NOT_FOUND' as const };
      if (!await canManageProject(req.user!.userId, req.user!.role, milestone.projectId, tx)) return { error: 'FORBIDDEN' as const };
      const updated = await tx.milestone.update({ where: { id: milestone.id }, data: { isComplete } });
      await tx.activityLog.create({
        data: {
          action: isComplete ? 'MILESTONE_COMPLETED' : 'MILESTONE_REOPENED',
          entityType: 'Milestone',
          entityId: milestone.id,
          entityName: milestone.name,
          details: { before: milestone.isComplete, after: isComplete },
          userId: req.user!.userId,
          projectId: milestone.projectId,
        },
      });
      return { milestone: updated };
    });
    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Milestone not found.' });
      return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
    }
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Update milestone error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update milestone.' });
  }
};

export const triageBug = async (req: AuthRequest, res: Response) => {
  const { assigneeId, severity } = req.body ?? {};
  const severities: BugSeverity[] = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR'];
  if (
    !isUuid(req.params.bugId) ||
    (assigneeId !== undefined && !(assigneeId === null || isUuid(assigneeId))) ||
    (severity !== undefined && !severities.includes(severity)) ||
    (assigneeId === undefined && severity === undefined)
  ) {
    return res.status(400).json({ success: false, message: 'Bug triage changes are invalid.' });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const bug = await tx.bug.findUnique({
        where: { id: req.params.bugId },
        select: { id: true, title: true, projectId: true, assigneeId: true, severity: true },
      });
      if (!bug) return { error: 'NOT_FOUND' as const };
      if (!await canManageProject(req.user!.userId, req.user!.role, bug.projectId, tx)) return { error: 'FORBIDDEN' as const };
      if (assigneeId && !await assignProjectMember(tx, bug.projectId, assigneeId, ['DEVELOPER'])) {
        return { error: 'INVALID_ASSIGNEE' as const };
      }
      const updated = await tx.bug.update({
        where: { id: bug.id },
        data: {
          ...(assigneeId !== undefined && { assigneeId }),
          ...(severity !== undefined && { severity }),
        },
      });
      await tx.activityLog.create({
        data: {
          action: 'BUG_TRIAGED',
          entityType: 'Bug',
          entityId: bug.id,
          entityName: bug.title,
          details: {
            before: { assigneeId: bug.assigneeId, severity: bug.severity },
            after: { assigneeId: updated.assigneeId, severity: updated.severity },
          },
          userId: req.user!.userId,
          projectId: bug.projectId,
          bugId: bug.id,
        },
      });
      return { bug: updated };
    });
    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Bug not found.' });
      if (result.error === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
      return res.status(400).json({ success: false, message: 'Bug assignee must be an active Developer on this project.' });
    }
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Bug triage error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update bug triage.' });
  }
};

export const createTaskBatch = async (req: AuthRequest, res: Response) => {
  const { projectId, taskIds, assigneeId, priority, sprintId, milestoneId } = req.body ?? {};
  if (
    !isUuid(projectId) ||
    !Array.isArray(taskIds) ||
    taskIds.length < 1 || taskIds.length > 100 ||
    !taskIds.every(isUuid) ||
    new Set(taskIds).size !== taskIds.length ||
    (assigneeId !== undefined && !(assigneeId === null || isUuid(assigneeId))) ||
    (priority !== undefined && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) ||
    (sprintId !== undefined && !(sprintId === null || isUuid(sprintId))) ||
    (milestoneId !== undefined && !(milestoneId === null || isUuid(milestoneId))) ||
    (assigneeId === undefined && priority === undefined && sprintId === undefined && milestoneId === undefined)
  ) {
    return res.status(400).json({ success: false, message: 'Batch task changes are invalid.' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (!await canManageProject(req.user!.userId, req.user!.role, projectId, tx)) return { error: 'FORBIDDEN' as const };
      const tasks = await tx.task.findMany({
        where: { id: { in: taskIds }, projectId },
        select: { id: true },
      });
      if (tasks.length !== taskIds.length) return { error: 'TASKS_NOT_FOUND' as const };
      if (assigneeId && !await assignProjectMember(tx, projectId, assigneeId, ['DEVELOPER', 'QA_ENGINEER'])) {
        return { error: 'INVALID_ASSIGNEE' as const };
      }
      if (sprintId) {
        const sprint = await tx.sprint.findFirst({ where: { id: sprintId, projectId, status: { not: 'COMPLETED' } }, select: { id: true } });
        if (!sprint) return { error: 'INVALID_SPRINT' as const };
      }
      if (milestoneId) {
        const milestone = await tx.milestone.findFirst({ where: { id: milestoneId, projectId }, select: { id: true } });
        if (!milestone) return { error: 'INVALID_MILESTONE' as const };
      }
      await tx.task.updateMany({
        where: { id: { in: taskIds }, projectId },
        data: {
          ...(assigneeId !== undefined && { assigneeId }),
          ...(priority !== undefined && { priority: priority as Priority }),
          ...(sprintId !== undefined && { sprintId }),
          ...(milestoneId !== undefined && { milestoneId }),
        },
      });
      if (sprintId === null) {
        await tx.task.updateMany({
          where: { id: { in: taskIds }, projectId, status: { not: 'DONE' } },
          data: { status: 'BACKLOG' },
        });
      } else if (typeof sprintId === 'string') {
        await tx.task.updateMany({
          where: { id: { in: taskIds }, projectId, status: 'BACKLOG' },
          data: { status: 'TO_DO' },
        });
      }
      await tx.activityLog.create({
        data: {
          action: 'TASKS_BULK_UPDATED',
          entityType: 'Task',
          entityId: projectId,
          entityName: `${taskIds.length} tasks updated`,
          details: {
            taskIds,
            ...(assigneeId !== undefined && { assigneeId }),
            ...(priority !== undefined && { priority }),
            ...(sprintId !== undefined && { sprintId }),
            ...(milestoneId !== undefined && { milestoneId }),
          },
          userId: req.user!.userId,
          projectId,
        },
      });
      return { updatedCount: taskIds.length };
    });
    if ('error' in result) {
      if (result.error === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
      if (result.error === 'TASKS_NOT_FOUND') return res.status(404).json({ success: false, message: 'One or more tasks were not found in this project.' });
      if (result.error === 'INVALID_ASSIGNEE') return res.status(400).json({ success: false, message: 'Assignee must be an active Developer or QA Engineer on this project.' });
      if (result.error === 'INVALID_MILESTONE') return res.status(400).json({ success: false, message: 'Milestone must belong to this project.' });
      return res.status(400).json({ success: false, message: 'Sprint must belong to this project and not be completed.' });
    }
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Bulk task update error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update the selected tasks.' });
  }
};

export const createTask = async (req: AuthRequest, res: Response) => {
  const { projectId, title, description, priority, storyPoints, estimatedHours, dueDate, sprintId, assigneeId, qaAssigneeId, tags, milestoneId } = req.body ?? {};
  if (
    !isUuid(projectId) ||
    typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 200 ||
    (description !== undefined && description !== null && typeof description !== 'string') ||
    (priority !== undefined && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) ||
    (storyPoints !== undefined && storyPoints !== null && (!Number.isInteger(storyPoints) || storyPoints < 0 || storyPoints > 1000)) ||
    (estimatedHours !== undefined && estimatedHours !== null && (typeof estimatedHours !== 'number' || !Number.isFinite(estimatedHours) || estimatedHours < 0 || estimatedHours > 10000)) ||
    (dueDate !== undefined && dueDate !== null && (typeof dueDate !== 'string' || Number.isNaN(Date.parse(dueDate)))) ||
    (sprintId !== undefined && !(sprintId === null || isUuid(sprintId))) ||
    (milestoneId !== undefined && !(milestoneId === null || isUuid(milestoneId))) ||
    (assigneeId !== undefined && !(assigneeId === null || isUuid(assigneeId))) ||
    (qaAssigneeId !== undefined && !(qaAssigneeId === null || isUuid(qaAssigneeId))) ||
    (tags !== undefined && (!Array.isArray(tags) || tags.length > 20 ||
      !tags.every((tag: unknown) => typeof tag === 'string' && tag.trim().length > 0 && tag.trim().length <= 40)))
  ) {
    return res.status(400).json({ success: false, message: 'Task details are invalid.' });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (!await canManageProject(req.user!.userId, req.user!.role, projectId, tx)) return { error: 'FORBIDDEN' as const };
      if (sprintId) {
        const sprint = await tx.sprint.findFirst({
          where: { id: sprintId, projectId, status: { not: 'COMPLETED' } },
          select: { id: true },
        });
        if (!sprint) return { error: 'INVALID_SPRINT' as const };
      }
      if (milestoneId) {
        const milestone = await tx.milestone.findFirst({
          where: { id: milestoneId, projectId },
          select: { id: true },
        });
        if (!milestone) return { error: 'INVALID_MILESTONE' as const };
      }
      if (assigneeId && !await assignProjectMember(tx, projectId, assigneeId, ['DEVELOPER', 'QA_ENGINEER'])) {
        return { error: 'INVALID_ASSIGNEE' as const };
      }
      if (qaAssigneeId && !await assignProjectMember(tx, projectId, qaAssigneeId, ['QA_ENGINEER'])) {
        return { error: 'INVALID_QA_ASSIGNEE' as const };
      }
      const task = await tx.task.create({
        data: {
          title: title.trim(),
          description: typeof description === 'string' ? description.trim() : null,
          projectId,
          priority: (priority as Priority | undefined) ?? 'MEDIUM',
          storyPoints: storyPoints ?? null,
          estimatedHours: estimatedHours ?? null,
          dueDate: dueDate ? new Date(dueDate) : null,
          sprintId: sprintId ?? null,
          milestoneId: milestoneId ?? null,
          assigneeId: assigneeId ?? null,
          qaAssigneeId: qaAssigneeId ?? null,
          tags: tags ? [...new Set<string>(tags.map((tag: string) => tag.trim()))] : [],
          status: sprintId ? 'TO_DO' : 'BACKLOG',
        },
      });
      await tx.activityLog.create({
        data: {
          action: 'TASK_CREATED',
          entityType: 'Task',
          entityId: task.id,
          entityName: task.title,
          userId: req.user!.userId,
          projectId,
          taskId: task.id,
        },
      });
      return { task };
    });
    if ('error' in result) {
      if (result.error === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
      if (result.error === 'INVALID_ASSIGNEE') return res.status(400).json({ success: false, message: 'Assignee must be an active Developer or QA Engineer on this project.' });
      if (result.error === 'INVALID_QA_ASSIGNEE') return res.status(400).json({ success: false, message: 'QA assignee must be an active QA Engineer.' });
      if (result.error === 'INVALID_MILESTONE') return res.status(400).json({ success: false, message: 'Milestone must belong to this project.' });
      return res.status(400).json({ success: false, message: 'Sprint must belong to this project and not be completed.' });
    }
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('PM task create error:', error);
    return res.status(500).json({ success: false, message: 'Unable to create task.' });
  }
};

export const reorderBacklog = async (req: AuthRequest, res: Response) => {
  const { projectId, taskIds } = req.body ?? {};
  if (
    !isUuid(projectId) || !Array.isArray(taskIds) ||
    taskIds.length > 500 || !taskIds.every(isUuid) ||
    new Set(taskIds).size !== taskIds.length
  ) {
    return res.status(400).json({ success: false, message: 'Backlog ordering request is invalid.' });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (!await canManageProject(req.user!.userId, req.user!.role, projectId, tx)) return 'FORBIDDEN' as const;
      const current = await tx.task.findMany({
        where: { projectId, id: { in: taskIds }, status: 'BACKLOG', sprintId: null },
        select: { id: true },
      });
      if (current.length !== taskIds.length) return 'TASKS_NOT_FOUND' as const;
      await Promise.all(taskIds.map((id: string, index: number) =>
        tx.task.update({ where: { id }, data: { sortOrder: index } }),
      ));
      return 'OK' as const;
    });
    if (result === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'You are not a project manager for this project.' });
    if (result === 'TASKS_NOT_FOUND') return res.status(400).json({ success: false, message: 'Only backlog tasks from this project can be reordered.' });
    return res.json({ success: true, message: 'Backlog order saved.' });
  } catch (error) {
    console.error('Backlog reorder error:', error);
    return res.status(500).json({ success: false, message: 'Unable to reorder the backlog.' });
  }
};
