import { Response } from 'express';
import { Prisma, PrismaClient, ProjectStatus } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

async function canManageProject(userId: string, role: string, projectId: string): Promise<boolean> {
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

// GET /api/v1/projects
export const getProjects = async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, page = '1', limit = '10' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: Prisma.ProjectWhereInput = {};
    const accessFilters: Prisma.ProjectWhereInput[] = [];
    if (status && typeof status === 'string') {
      where.status = status as ProjectStatus;
    }
    if (search && typeof search === 'string') {
      accessFilters.push({ OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ] });
    }
    if (req.user!.role === 'PROJECT_MANAGER') {
      accessFilters.push({ OR: [
        { pmId: req.user!.userId },
        { members: { some: { userId: req.user!.userId, role: 'PROJECT_MANAGER' } } },
      ] });
    } else if (req.user!.role === 'DEVELOPER' || req.user!.role === 'QA_ENGINEER') {
      accessFilters.push({ OR: [
        { members: { some: { userId: req.user!.userId, role: req.user!.role } } },
        { tasks: { some: { OR: [
          { assigneeId: req.user!.userId },
          { qaAssigneeId: req.user!.userId },
        ] } } },
        { bugs: { some: { assigneeId: req.user!.userId } } },
      ] });
    }
    if (accessFilters.length) where.AND = accessFilters;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } },
          },
          _count: { select: { tasks: true, bugs: true, sprints: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.project.count({ where }),
    ]);

    return res.json({
      success: true,
      data: {
        projects,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  } catch (error) {
    console.error('Get projects error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/v1/projects/:id
export const getProjectById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } },
        },
        sprints: { orderBy: { createdAt: 'desc' } },
        milestones: { orderBy: { endDate: 'asc' } },
        _count: { select: { tasks: true, bugs: true, sprints: true } },
      },
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    if (req.user!.role === 'PROJECT_MANAGER' &&
      !await canManageProject(req.user!.userId, req.user!.role, project.id)) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    if ((req.user!.role === 'DEVELOPER' || req.user!.role === 'QA_ENGINEER') &&
      !await prisma.project.findFirst({
        where: {
          id: project.id,
          OR: [
            { members: { some: { userId: req.user!.userId, role: req.user!.role } } },
            { tasks: { some: { OR: [
              { assigneeId: req.user!.userId },
              { qaAssigneeId: req.user!.userId },
            ] } } },
            { bugs: { some: { assigneeId: req.user!.userId } } },
          ],
        },
        select: { id: true },
      })) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    return res.json({ success: true, data: { project } });
  } catch (error) {
    console.error('Get project error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/v1/projects
export const createProject = async (req: AuthRequest, res: Response) => {
  try {
    const { name, key, description, organizationId, startDate, endDate, memberIds } = req.body ?? {};

    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120) {
      return res.status(400).json({ success: false, message: 'Project name must be at least 2 characters.' });
    }
    const normalizedKey = typeof key === 'string'
      ? key.trim().toUpperCase()
      : (name.trim().split(/\s+/).map((word: string) => word[0]).join('').toUpperCase() || name.trim().toUpperCase())
        .slice(0, 8)
        .padEnd(2, 'X');
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(normalizedKey)) {
      return res.status(400).json({ success: false, message: 'Project key must be 2-10 letters or numbers and start with a letter.' });
    }
    if (
      (startDate !== undefined && startDate !== null && (typeof startDate !== 'string' || Number.isNaN(Date.parse(startDate)))) ||
      (endDate !== undefined && endDate !== null && (typeof endDate !== 'string' || Number.isNaN(Date.parse(endDate)))) ||
      (startDate && endDate && new Date(startDate) > new Date(endDate)) ||
      (memberIds !== undefined && (!Array.isArray(memberIds) || !memberIds.every((id: unknown) => typeof id === 'string')))
    ) {
      return res.status(400).json({ success: false, message: 'Project schedule or member list is invalid.' });
    }

    const organization = organizationId
      ? await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, defaultProjectStatus: true } })
      : await prisma.organization.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true, defaultProjectStatus: true },
      });
    if (organizationId && !organization) {
      return res.status(400).json({ success: false, message: 'Organization not found.' });
    }

    const uniqueMemberIds = [...new Set<string>([req.user!.userId, ...(memberIds ?? [])])];
    const project = await prisma.$transaction(async (tx) => {
      let projectMembers = new Map<string, 'ADMIN' | 'PROJECT_MANAGER' | 'DEVELOPER' | 'QA_ENGINEER'>();
      if (uniqueMemberIds.length > 1) {
        const activeUsers = await tx.user.findMany({
          where: { id: { in: uniqueMemberIds }, isActive: true },
          select: { id: true, role: true },
        });
        if (activeUsers.length !== uniqueMemberIds.length) throw new Error('PROJECT_MEMBERS_INVALID');
        projectMembers = new Map(activeUsers.map((user) => [user.id, user.role]));
      }
      const created = await tx.project.create({
        data: {
          name: name.trim(),
          key: normalizedKey,
          description: typeof description === 'string' ? description.trim() : null,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          organizationId: organization?.id ?? null,
          pmId: req.user!.role === 'PROJECT_MANAGER' ? req.user!.userId : null,
          status: organization?.defaultProjectStatus ?? 'ACTIVE',
          members: {
            create: uniqueMemberIds.map((userId) => ({
              userId,
              role: projectMembers.get(userId) ?? req.user!.role,
            })),
          },
        },
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
          },
        },
      });
      await tx.activityLog.create({
        data: {
          action: 'PROJECT_CREATED',
          entityType: 'Project',
          entityId: created.id,
          entityName: created.name,
          userId: req.user!.userId,
          projectId: created.id,
        },
      });
      return created;
    });

    return res.status(201).json({ success: true, message: 'Project created successfully', data: { project } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'That project key is already in use.' });
    }
    if (error instanceof Error && error.message === 'PROJECT_MEMBERS_INVALID') {
      return res.status(400).json({ success: false, message: 'All project members must be active users.' });
    }
    console.error('Create project error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/v1/projects/:id
export const updateProject = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, key, description, status, startDate, endDate } = req.body ?? {};
    if (
      (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120)) ||
      (key !== undefined && (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9]{1,9}$/.test(key.trim()))) ||
      (status !== undefined && !['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'].includes(status)) ||
      (startDate !== undefined && startDate !== null && (typeof startDate !== 'string' || Number.isNaN(Date.parse(startDate)))) ||
      (endDate !== undefined && endDate !== null && (typeof endDate !== 'string' || Number.isNaN(Date.parse(endDate)))) ||
      (startDate && endDate && new Date(startDate) > new Date(endDate))
    ) {
      return res.status(400).json({ success: false, message: 'Project changes are invalid.' });
    }
    if (req.user!.role === 'PROJECT_MANAGER' &&
      !await canManageProject(req.user!.userId, req.user!.role, id)) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const project = await prisma.$transaction(async (tx) => {
      const existing = await tx.project.findUnique({ where: { id } });
      if (!existing) return null;
      const updated = await tx.project.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(key !== undefined && { key: key.trim().toUpperCase() }),
          ...(description !== undefined && { description: typeof description === 'string' ? description.trim() : null }),
          ...(status !== undefined && { status: status as ProjectStatus }),
          ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
          ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        },
      });
      await tx.activityLog.create({
        data: {
          action: 'PROJECT_UPDATED',
          entityType: 'Project',
          entityId: updated.id,
          entityName: updated.name,
          details: {
            before: { name: existing.name, key: existing.key, status: existing.status, startDate: existing.startDate, endDate: existing.endDate },
            after: { name: updated.name, key: updated.key, status: updated.status, startDate: updated.startDate, endDate: updated.endDate },
          },
          userId: req.user!.userId,
          projectId: updated.id,
        },
      });
      return updated;
    });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    return res.json({ success: true, message: 'Project updated successfully', data: { project } });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'That project key is already in use.' });
    }
    console.error('Update project error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/v1/projects/:id
export const deleteProject = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.project.delete({ where: { id } });
    return res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }
    console.error('Delete project error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/v1/projects/:id/analytics
export const getProjectAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (req.user!.role === 'PROJECT_MANAGER' &&
      !await canManageProject(req.user!.userId, req.user!.role, id)) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const [tasksByStatus, tasksByPriority, bugsBySeverity, bugsByStatus, members, recentActivity] =
      await Promise.all([
        prisma.task.groupBy({ by: ['status'], where: { projectId: id }, _count: true }),
        prisma.task.groupBy({ by: ['priority'], where: { projectId: id }, _count: true }),
        prisma.bug.groupBy({ by: ['severity'], where: { projectId: id }, _count: true }),
        prisma.bug.groupBy({ by: ['status'], where: { projectId: id }, _count: true }),
        prisma.projectMember.findMany({
          where: { projectId: id },
          include: { user: { select: { id: true, name: true, role: true } } },
        }),
        prisma.activityLog.findMany({
          where: { projectId: id },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);

    // Compute workload per member
    const workload = await Promise.all(
      members.map(async (m) => {
        const taskCount = await prisma.task.count({
          where: { projectId: id, assigneeId: m.userId, status: { not: 'DONE' } },
        });
        return { user: m.user, activeTasks: taskCount };
      })
    );

    return res.json({
      success: true,
      data: {
        tasksByStatus,
        tasksByPriority,
        bugsBySeverity,
        bugsByStatus,
        workload,
        recentActivity,
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/v1/projects/:id/members
export const addProjectMember = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.body;

    if (typeof userId !== 'string' || (role !== undefined && !['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER', 'QA_ENGINEER'].includes(role))) {
      return res.status(400).json({ success: false, message: 'A valid user ID and project role are required.' });
    }
    if (req.user!.role === 'PROJECT_MANAGER' &&
      !await canManageProject(req.user!.userId, req.user!.role, id)) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const activeUser = await prisma.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } });
    if (!activeUser) {
      return res.status(400).json({ success: false, message: 'Project members must be active users.' });
    }

    const member = await prisma.projectMember.create({
      data: { projectId: id, userId, role: role || 'DEVELOPER' },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    if (member.role === 'PROJECT_MANAGER') {
      await prisma.project.update({ where: { id }, data: { pmId: member.userId } });
    }

    await prisma.activityLog.create({
      data: {
        action: 'MEMBER_ADDED',
        entityType: 'Project',
        entityId: id,
        entityName: `Member ${member.user.name} added`,
        userId: req.user!.userId,
        projectId: id,
      },
    });

    return res.status(201).json({ success: true, message: 'Member added successfully', data: { member } });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'User is already a member of this project.' });
    }
    console.error('Add member error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
