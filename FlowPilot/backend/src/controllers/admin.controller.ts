import { BugStatus, Prisma, PrismaClient, Priority, ProjectStatus, TaskStatus } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

// ─── Shared constants ────────────────────────────────────────────────────────
const PROJECT_STATUSES: ProjectStatus[] = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'];
const TASK_STATUSES: TaskStatus[] = ['BACKLOG', 'TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const BUG_STATUSES: BugStatus[] = ['OPEN', 'IN_PROGRESS', 'FIXED', 'RETEST', 'REOPENED', 'RESOLVED', 'CLOSED', 'WONT_FIX'];
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const BUG_SEVERITIES = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR'] as const;

// ─── Zod schemas ────────────────────────────────────────────────────────────
const organizationSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(63),
  logoUrl: z.string().url().max(2000).or(z.literal('')).nullable().optional(),
  timezone: z.string().min(1).max(100).optional(),
  dateFormat: z.string().min(1).max(40).optional(),
  language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).optional(),
  defaultProjectStatus: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']).optional(),
  defaultRole: z.enum(['PROJECT_MANAGER', 'DEVELOPER', 'QA_ENGINEER']).optional(),
  invitePolicy: z.enum(['ADMIN_ONLY', 'ALL_MEMBERS']).optional(),
});

const memberUpdateSchema = z.object({
  role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER', 'QA_ENGINEER']).optional(),
  isActive: z.boolean().optional(),
}).refine((d) => d.role !== undefined || d.isActive !== undefined, {
  message: 'Provide a valid role or account status.',
});

const membersQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER', 'QA_ENGINEER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

const projectsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const projectCreateSchema = z.object({
  name: z.string().min(1).max(200),
  key: z.string().max(10).regex(/^[A-Z0-9]+$/).optional().nullable(),
  description: z.string().max(5000).optional(),
  status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']).optional(),
  startDate: z.string().datetime({ offset: true }).optional().nullable(),
  endDate: z.string().datetime({ offset: true }).optional().nullable(),
  organizationId: z.string().uuid().optional().nullable(),
  managerId: z.string().uuid(),
});

const projectUpdateSchema = projectCreateSchema.partial().extend({
  managerId: z.string().uuid().nullable().optional(),
});

const projectLifecycleSchema = z.object({
  status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']),
});

const workItemUpdateSchema = z.object({
  assigneeId: z.string().uuid().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
}).refine((d) => d.assigneeId !== undefined || d.priority !== undefined, {
  message: 'Provide a valid assignee or priority.',
});

// ─── Helpers ────────────────────────────────────────────────────────────────
function parseBoundedInteger(value: unknown, fallback: number, maximum: number): number | null {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : null;
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function filterEndDate(value: string): Date {
  const date = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  req: AuthRequest,
  action: string,
  targetType: string,
  targetId: string,
  details?: Prisma.InputJsonValue,
) {
  return tx.adminAuditLog.create({
    data: {
      actorId: req.user!.userId,
      action,
      targetType,
      targetId,
      details,
      ipAddress: req.ip,
    },
  });
}

function csvQuote(value: unknown): string {
  const raw = String(value ?? '');
  // Guard against CSV formula injection
  const safe = /^[\s]*[=+\-@`]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

// ─── Overview ────────────────────────────────────────────────────────────────
export const getOverview = async (_req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const [
      activeMembers,
      deactivatedMembers,
      projects,
      activeProjects,
      tasks,
      completedTasks,
      overdueTasks,
      unassignedTasks,
      criticalBugs,
      activeSprints,
      auditEventCount,
      recentAudit,
      recentCompletions,
      membersByRole,
      projectsByStatus,
    ] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.project.count(),
      prisma.project.count({ where: { status: 'ACTIVE' } }),
      prisma.task.count({ where: { status: { not: 'DONE' } } }),
      prisma.task.count({ where: { status: 'DONE' } }),
      prisma.task.count({ where: { status: { not: 'DONE' }, dueDate: { lt: now } } }),
      prisma.task.count({ where: { status: { not: 'DONE' }, assigneeId: null } }),
      prisma.bug.count({ where: { severity: { in: ['BLOCKER', 'CRITICAL'] }, status: { notIn: ['RESOLVED', 'CLOSED', 'WONT_FIX'] } } }),
      prisma.sprint.count({ where: { status: 'ACTIVE' } }),
      prisma.adminAuditLog.count(),
      prisma.adminAuditLog.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
      prisma.task.findMany({
        where: { status: 'DONE', updatedAt: { gte: new Date(now.getTime() - 42 * 24 * 60 * 60 * 1000) } },
        select: { updatedAt: true },
      }),
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      prisma.project.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const completionTrend = Array.from({ length: 7 }, (_, index) => {
      const start = new Date(now);
      start.setDate(start.getDate() - (6 - index) * 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return {
        weekStarting: start.toISOString().slice(0, 10),
        completed: recentCompletions.filter(({ updatedAt }) => updatedAt >= start && updatedAt < end).length,
      };
    });

    return res.json({
      success: true,
      data: {
        members: { active: activeMembers, deactivated: deactivatedMembers },
        projects: { total: projects, active: activeProjects },
        tasks: { active: tasks, completed: completedTasks, overdue: overdueTasks, unassigned: unassignedTasks },
        criticalBugs,
        activeSprints,
        auditEventCount,
        completionTrend,
        recentAudit,
        membersByRole: Object.fromEntries(membersByRole.map((r) => [r.role, r._count._all])),
        projectsByStatus: Object.fromEntries(projectsByStatus.map((p) => [p.status, p._count._all])),
      },
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load workspace overview.' });
  }
};

// ─── Organization ─────────────────────────────────────────────────────────
export const getOrganization = async (_req: AuthRequest, res: Response) => {
  try {
    const organization = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    return res.json({ success: true, data: { organization } });
  } catch (error) {
    console.error('Admin organization read error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load workspace settings.' });
  }
};

export const updateOrganization = async (req: AuthRequest, res: Response) => {
  const parse = organizationSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ success: false, message: parse.error.issues.map((i) => i.message).join('; ') });
  }
  const body = parse.data;

  try {
    const current = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    const data = {
      name: body.name.trim(),
      slug: body.slug,
      logoUrl: body.logoUrl ?? null,
      ...(body.timezone !== undefined && { timezone: body.timezone }),
      ...(body.dateFormat !== undefined && { dateFormat: body.dateFormat }),
      ...(body.language !== undefined && { language: body.language }),
      ...(body.defaultProjectStatus !== undefined && { defaultProjectStatus: body.defaultProjectStatus }),
      ...(body.defaultRole !== undefined && { defaultRole: body.defaultRole }),
      ...(body.invitePolicy !== undefined && { invitePolicy: body.invitePolicy }),
    };

    const organization = await prisma.$transaction(async (tx) => {
      const saved = current
        ? await tx.organization.update({ where: { id: current.id }, data })
        : await tx.organization.create({ data });
      await writeAudit(tx, req, current ? 'WORKSPACE_SETTINGS_UPDATED' : 'WORKSPACE_CREATED', 'Organization', saved.id, {
        before: current
          ? { name: current.name, slug: current.slug, timezone: current.timezone, invitePolicy: current.invitePolicy }
          : null,
        after: { name: saved.name, slug: saved.slug, timezone: saved.timezone, invitePolicy: saved.invitePolicy },
      });
      return saved;
    });
    return res.json({ success: true, data: { organization } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'That workspace slug is already in use.' });
    }
    console.error('Admin organization update error:', error);
    return res.status(500).json({ success: false, message: 'Unable to save workspace settings.' });
  }
};

// ─── Members ─────────────────────────────────────────────────────────────────
export const getMembers = async (req: AuthRequest, res: Response) => {
  try {
    const parse = membersQuerySchema.safeParse(req.query);
    if (!parse.success) {
      return res.status(400).json({ success: false, message: 'Invalid member filters.' });
    }
    const { search = '', page, limit, role: roleFilter, status: statusFilter } = parse.data;

    const where: Prisma.UserWhereInput = {
      ...(roleFilter && { role: roleFilter }),
      ...(statusFilter === 'ACTIVE' && { isActive: true }),
      ...(statusFilter === 'INACTIVE' && { isActive: false }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [members, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, name: true, email: true, role: true,
          isActive: true, avatarUrl: true, createdAt: true,
          _count: { select: { assignedTasks: true, assignedBugs: true, projectMembers: true } },
        },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return res.json({
      success: true,
      data: { members, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
    });
  } catch (error) {
    console.error('Admin members error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load workspace members.' });
  }
};

export const updateMember = async (req: AuthRequest, res: Response) => {
  if (!z.string().uuid().safeParse(req.params.userId).success) {
    return res.status(400).json({ success: false, message: 'Invalid member ID.' });
  }
  const parse = memberUpdateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ success: false, message: 'Provide a valid role or account status.' });
  }
  const { role, isActive } = parse.data;

  if (req.params.userId === req.user!.userId && isActive === false) {
    return res.status(400).json({ success: false, message: 'You cannot deactivate your own account.' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const member = await tx.user.findUnique({ where: { id: req.params.userId } });
      if (!member) return { error: 'NOT_FOUND' as const };

      const losesAdmin = member.role === 'ADMIN' && member.isActive &&
        ((role !== undefined && role !== 'ADMIN') || isActive === false);
      if (losesAdmin) {
        const administrators = await tx.user.count({ where: { role: 'ADMIN', isActive: true } });
        if (administrators <= 1) return { error: 'LAST_ADMIN' as const };
      }

      const updated = await tx.user.update({
        where: { id: member.id },
        data: { ...(role !== undefined && { role }), ...(isActive !== undefined && { isActive }) },
        select: {
          id: true, name: true, email: true, role: true,
          isActive: true, avatarUrl: true, createdAt: true,
          _count: { select: { assignedTasks: true, assignedBugs: true, projectMembers: true } },
        },
      });

      // Offboarding: unassign tasks, bugs, remove project memberships
      if (isActive === false && member.isActive) {
        await tx.task.updateMany({ where: { assigneeId: member.id }, data: { assigneeId: null } });
        await tx.task.updateMany({ where: { qaAssigneeId: member.id }, data: { qaAssigneeId: null } });
        await tx.bug.updateMany({ where: { assigneeId: member.id }, data: { assigneeId: null } });
        await tx.projectMember.deleteMany({ where: { userId: member.id } });
        await tx.project.updateMany({ where: { pmId: member.id }, data: { pmId: null } });
      }
      if (role !== undefined && role !== 'PROJECT_MANAGER' && member.role === 'PROJECT_MANAGER') {
        await tx.projectMember.deleteMany({ where: { userId: member.id, role: 'PROJECT_MANAGER' } });
        await tx.project.updateMany({ where: { pmId: member.id }, data: { pmId: null } });
      }
      if (role !== undefined && role !== 'QA_ENGINEER' && member.role === 'QA_ENGINEER') {
        await tx.task.updateMany({ where: { qaAssigneeId: member.id }, data: { qaAssigneeId: null } });
        await tx.projectMember.deleteMany({ where: { userId: member.id, role: 'QA_ENGINEER' } });
      }

      if (role !== undefined && role !== member.role) {
        await writeAudit(tx, req, 'MEMBER_ROLE_CHANGED', 'User', member.id, { before: member.role, after: role, memberEmail: member.email });
      }
      if (isActive !== undefined && isActive !== member.isActive) {
        await writeAudit(tx, req, isActive ? 'MEMBER_REACTIVATED' : 'MEMBER_DEACTIVATED', 'User', member.id, {
          before: member.isActive, after: isActive, memberEmail: member.email,
        });
      }
      return { member: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Member not found.' });
      return res.status(409).json({ success: false, message: 'The last active administrator cannot be demoted or deactivated.' });
    }
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return res.status(409).json({ success: false, message: 'Administrator state changed concurrently. Reload and try again.' });
    }
    console.error('Admin member update error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update this member.' });
  }
};

// ─── Projects ────────────────────────────────────────────────────────────────
export const getProjects = async (req: AuthRequest, res: Response) => {
  try {
    const parse = projectsQuerySchema.safeParse(req.query);
    if (!parse.success) {
      return res.status(400).json({ success: false, message: 'Invalid project filters.' });
    }
    const { search = '', status, page, limit } = parse.data;

    const projectWhere: Prisma.ProjectWhereInput = {
      ...(status && { status }),
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };

    const [projects, total, overdueCounts, unassignedBugCounts] = await Promise.all([
      prisma.project.findMany({
        where: projectWhere,
        include: {
          _count: { select: { tasks: true, bugs: true, sprints: true, members: true } },
          organization: { select: { id: true, name: true } },
          members: {
            where: { role: 'PROJECT_MANAGER', user: { isActive: true, role: 'PROJECT_MANAGER' } },
            select: { user: { select: { id: true, name: true, email: true } } },
            take: 1,
          },
          manager: { select: { id: true, name: true, email: true, isActive: true, role: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.project.count({ where: projectWhere }),
      prisma.task.groupBy({
        by: ['projectId'],
        where: { project: projectWhere, status: { not: 'DONE' }, dueDate: { lt: new Date() } },
        _count: { _all: true },
      }),
      prisma.bug.groupBy({
        by: ['projectId'],
        where: { project: projectWhere, assigneeId: null, status: { notIn: ['RESOLVED', 'CLOSED', 'WONT_FIX'] } },
        _count: { _all: true },
      }),
    ]);

    const overdueByProject = new Map(overdueCounts.map(({ projectId, _count }) => [projectId, _count._all]));
    const unassignedBugsByProject = new Map(unassignedBugCounts.map(({ projectId, _count }) => [projectId, _count._all]));

    const projectsWithHealth = projects.map((project) => {
      const overdueTaskCount = overdueByProject.get(project.id) ?? 0;
      const unassignedBugCount = unassignedBugsByProject.get(project.id) ?? 0;
      // Risk score: 0-100 (higher = more at risk)
      const riskScore = Math.min(100, overdueTaskCount * 8 + unassignedBugCount * 5);
      const riskLevel = riskScore >= 50 ? 'HIGH' : riskScore >= 20 ? 'MEDIUM' : 'LOW';
      const { members, manager, ...projectData } = project;
      return {
        ...projectData,
        projectManager: manager?.isActive && manager.role === 'PROJECT_MANAGER'
          ? manager
          : members[0]?.user ?? null,
        overdueTaskCount,
        unassignedBugCount,
        riskScore,
        riskLevel,
      };
    });

    return res.json({
      success: true,
      data: {
        projects: projectsWithHealth,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('Admin projects error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load the project registry.' });
  }
};

export const createProject = async (req: AuthRequest, res: Response) => {
  const parse = projectCreateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ success: false, message: 'Invalid project data.' });
  }
  const body = parse.data;

  try {
    const project = await prisma.$transaction(async (tx) => {
      if (body.managerId) {
        const manager = await tx.user.findFirst({
          where: { id: body.managerId, role: 'PROJECT_MANAGER', isActive: true },
          select: { id: true },
        });
        if (!manager) return { error: 'INVALID_MANAGER' as const };
      }
      const created = await tx.project.create({
        data: {
          name: body.name,
          key: body.key ?? null,
          description: body.description ?? null,
          status: body.status ?? 'ACTIVE',
          startDate: body.startDate ? new Date(body.startDate) : null,
          endDate: body.endDate ? new Date(body.endDate) : null,
          organizationId: body.organizationId ?? null,
          pmId: body.managerId,
        },
        include: { _count: { select: { tasks: true, bugs: true, sprints: true, members: true } } },
      });
      if (body.managerId) {
        await tx.projectMember.create({
          data: { projectId: created.id, userId: body.managerId, role: 'PROJECT_MANAGER' },
        });
      }
      await writeAudit(tx, req, 'PROJECT_CREATED', 'Project', created.id, {
        name: created.name, status: created.status, managerId: body.managerId ?? null,
      });
      return { project: created };
    });
    if ('error' in project) {
      return res.status(400).json({ success: false, message: 'Project manager must be an active user with the Project Manager role.' });
    }
    return res.status(201).json({ success: true, data: project });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'A project with that key already exists.' });
    }
    console.error('Admin project create error:', error);
    return res.status(500).json({ success: false, message: 'Unable to create project.' });
  }
};

export const updateProject = async (req: AuthRequest, res: Response) => {
  if (!z.string().uuid().safeParse(req.params.projectId).success) {
    return res.status(400).json({ success: false, message: 'Invalid project ID.' });
  }
  const parse = projectUpdateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ success: false, message: 'Invalid project data.' });
  }
  const body = parse.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: req.params.projectId } });
      if (!project) return null;
      if (body.managerId !== undefined && body.managerId !== null) {
        const manager = await tx.user.findFirst({
          where: { id: body.managerId, role: 'PROJECT_MANAGER', isActive: true },
          select: { id: true },
        });
        if (!manager) return { error: 'INVALID_MANAGER' as const };
      }

      const updated = await tx.project.update({
        where: { id: project.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.key !== undefined && { key: body.key }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.status !== undefined && { status: body.status }),
          ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
          ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null }),
          ...(body.managerId !== undefined && { pmId: body.managerId }),
        },
        include: { _count: { select: { tasks: true, bugs: true, sprints: true, members: true } } },
      });
      if (body.managerId !== undefined) {
        await tx.projectMember.deleteMany({
          where: {
            projectId: project.id,
            role: 'PROJECT_MANAGER',
            ...(body.managerId && { userId: { not: body.managerId } }),
          },
        });
        if (body.managerId) {
          await tx.projectMember.upsert({
            where: { projectId_userId: { projectId: project.id, userId: body.managerId } },
            create: { projectId: project.id, userId: body.managerId, role: 'PROJECT_MANAGER' },
            update: { role: 'PROJECT_MANAGER' },
          });
        }
      }
      const manager = body.managerId === undefined
        ? await tx.projectMember.findFirst({
        where: { projectId: project.id, role: 'PROJECT_MANAGER', user: { isActive: true, role: 'PROJECT_MANAGER' } },
        select: { user: { select: { id: true, name: true, email: true } } },
        })
        : body.managerId
          ? await tx.user.findUnique({
            where: { id: body.managerId },
            select: { id: true, name: true, email: true },
          }).then((user) => user ? { user } : null)
          : null;
      await writeAudit(tx, req, 'PROJECT_UPDATED', 'Project', project.id, {
        before: { name: project.name, status: project.status, description: project.description },
        after: {
          name: updated.name,
          status: updated.status,
          description: updated.description,
          ...(body.managerId !== undefined && { managerId: body.managerId }),
        },
      });
      return { project: { ...updated, projectManager: manager?.user ?? null } };
    });

    if (!result) return res.status(404).json({ success: false, message: 'Project not found.' });
    if ('error' in result) {
      return res.status(400).json({ success: false, message: 'Project manager must be an active user with the Project Manager role.' });
    }
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'A project with that key already exists.' });
    }
    console.error('Admin project update error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update project.' });
  }
};

export const updateProjectLifecycle = async (req: AuthRequest, res: Response) => {
  if (!z.string().uuid().safeParse(req.params.projectId).success) {
    return res.status(400).json({ success: false, message: 'Invalid project ID.' });
  }
  const parse = projectLifecycleSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ success: false, message: 'A valid project status is required.' });
  }
  const { status } = parse.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: req.params.projectId }, select: { id: true, status: true } });
      if (!project) return null;
      const updated = await tx.project.update({ where: { id: project.id }, data: { status } });
      await writeAudit(tx, req, status === 'ARCHIVED' ? 'PROJECT_ARCHIVED' : 'PROJECT_STATUS_CHANGED', 'Project', project.id, {
        before: project.status, after: status,
      });
      return updated;
    });
    if (!result) return res.status(404).json({ success: false, message: 'Project not found.' });
    return res.json({ success: true, data: { project: result } });
  } catch (error) {
    console.error('Admin project status error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update project lifecycle.' });
  }
};

export const deleteProject = async (req: AuthRequest, res: Response) => {
  if (!z.string().uuid().safeParse(req.params.projectId).success) {
    return res.status(400).json({ success: false, message: 'Invalid project ID.' });
  }
  const confirmation = req.body?.confirmation;
  if (typeof confirmation !== 'string' || confirmation.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Type the exact project name to confirm deletion.' });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: req.params.projectId }, select: { id: true, name: true } });
      if (!project) return 'NOT_FOUND' as const;
      if (confirmation.trim() !== project.name) return 'MISMATCH' as const;
      await writeAudit(tx, req, 'PROJECT_DELETED', 'Project', project.id, { name: project.name });
      await tx.project.delete({ where: { id: project.id } });
      return 'DELETED' as const;
    });
    if (result === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Project not found.' });
    if (result === 'MISMATCH') return res.status(400).json({ success: false, message: 'The confirmation text does not match the project name.' });
    return res.json({ success: true, message: 'Project deleted.' });
  } catch (error) {
    console.error('Admin project deletion error:', error);
    return res.status(500).json({ success: false, message: 'Unable to delete this project.' });
  }
};

// ─── Work Items ───────────────────────────────────────────────────────────────
export const getWorkItems = async (req: AuthRequest, res: Response) => {
  const type = req.query.type === undefined ? 'all' : req.query.type;
  if (typeof type !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid work item type.' });
  }
  if (!['all', 'task', 'bug'].includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid work item type.' });
  }
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const assigneeId = typeof req.query.assigneeId === 'string' ? req.query.assigneeId : undefined;
  const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;
  const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const from = req.query.from;
  const to = req.query.to;
  const overdueOnly = req.query.overdue === 'true';
  const limit = parseBoundedInteger(req.query.limit, 100, 200);
  if (limit === null) {
    return res.status(400).json({ success: false, message: 'Invalid work item limit.' });
  }

  if (
    (['search', 'assigneeId', 'priority', 'severity', 'status'].some((key) =>
      req.query[key] !== undefined && typeof req.query[key] !== 'string')) ||
    (req.query.overdue !== undefined && req.query.overdue !== 'true' && req.query.overdue !== 'false') ||
    (req.query.assigneeId !== undefined && assigneeId !== 'unassigned' &&
      (assigneeId === undefined || !z.string().uuid().safeParse(assigneeId).success)) ||
    (priority && !PRIORITIES.includes(priority as Priority)) ||
    (severity && !BUG_SEVERITIES.includes(severity as typeof BUG_SEVERITIES[number])) ||
    (severity && type === 'task') ||
    (status && !TASK_STATUSES.includes(status as TaskStatus) && !BUG_STATUSES.includes(status as BugStatus)) ||
    (status && type === 'task' && !TASK_STATUSES.includes(status as TaskStatus)) ||
    (status && type === 'bug' && !BUG_STATUSES.includes(status as BugStatus)) ||
    (status === 'DONE' && overdueOnly) ||
    (from !== undefined && !isValidDate(from)) ||
    (to !== undefined && !isValidDate(to)) ||
    (isValidDate(from) && isValidDate(to) && new Date(from) > new Date(to))
  ) {
    return res.status(400).json({ success: false, message: 'Invalid work item filter.' });
  }

  try {
    const includeTasks = type !== 'bug' && !severity && (!status || TASK_STATUSES.includes(status as TaskStatus));
    const includeBugs = type !== 'task' && (!status || BUG_STATUSES.includes(status as BugStatus));

    const taskConditions: Prisma.TaskWhereInput[] = [];
    if (status && TASK_STATUSES.includes(status as TaskStatus)) taskConditions.push({ status: status as TaskStatus });
    if (overdueOnly) taskConditions.push({ status: { not: 'DONE' }, dueDate: { lt: new Date() } });

    const taskWhere: Prisma.TaskWhereInput = {
      ...(priority && { priority: priority as Priority }),
      ...(assigneeId && { assigneeId: assigneeId === 'unassigned' ? null : assigneeId }),
      ...((from || to) && {
        createdAt: {
          ...(from && { gte: new Date(from as string) }),
          ...(to && { lte: filterEndDate(to as string) }),
        },
      }),
      ...(taskConditions.length > 0 && { AND: taskConditions }),
      ...(search && { OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] }),
    };

    const bugWhere: Prisma.BugWhereInput = {
      ...(status && BUG_STATUSES.includes(status as BugStatus) && { status: status as BugStatus }),
      ...(priority && { priority: priority as Priority }),
      ...(assigneeId && { assigneeId: assigneeId === 'unassigned' ? null : assigneeId }),
      ...(severity && { severity: severity as typeof BUG_SEVERITIES[number] }),
      ...((from || to) && {
        createdAt: {
          ...(from && { gte: new Date(from as string) }),
          ...(to && { lte: filterEndDate(to as string) }),
        },
      }),
      ...(search && { OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] }),
    };

    const [tasks, bugs] = await Promise.all([
      !includeTasks ? Promise.resolve([]) : prisma.task.findMany({
        where: taskWhere,
        include: {
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      !includeBugs ? Promise.resolve([]) : prisma.bug.findMany({
        where: bugWhere,
        include: {
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
    ]);

    return res.json({ success: true, data: { tasks, bugs } });
  } catch (error) {
    console.error('Admin work item search error:', error);
    return res.status(500).json({ success: false, message: 'Unable to search workspace work items.' });
  }
};

export const updateWorkItem = async (req: AuthRequest, res: Response) => {
  const itemType = req.params.type;
  if (!['task', 'bug'].includes(itemType)) {
    return res.status(400).json({ success: false, message: 'Invalid item type.' });
  }
  if (!z.string().uuid().safeParse(req.params.itemId).success) {
    return res.status(400).json({ success: false, message: 'Invalid work item ID.' });
  }

  const parse = workItemUpdateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ success: false, message: 'Provide a valid assignee or priority.' });
  }
  const { assigneeId, priority } = parse.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (assigneeId) {
        const activeMember = await tx.user.findFirst({ where: { id: assigneeId, isActive: true }, select: { id: true } });
        if (!activeMember) return { error: 'INVALID_ASSIGNEE' as const };
      }
      if (itemType === 'task') {
        const existing = await tx.task.findUnique({ where: { id: req.params.itemId }, select: { assigneeId: true, priority: true } });
        if (!existing) return { error: 'NOT_FOUND' as const };
        const updated = await tx.task.update({
          where: { id: req.params.itemId },
          data: { ...(assigneeId !== undefined && { assigneeId }), ...(priority !== undefined && { priority }) },
          select: { id: true, title: true, assigneeId: true, priority: true },
        });
        await writeAudit(tx, req, 'TASK_GOVERNANCE_UPDATED', 'Task', updated.id, {
          before: { assigneeId: existing.assigneeId, priority: existing.priority },
          after: { assigneeId: updated.assigneeId, priority: updated.priority },
        });
        return { item: updated };
      }

      const existing = await tx.bug.findUnique({ where: { id: req.params.itemId }, select: { assigneeId: true, priority: true } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      const updated = await tx.bug.update({
        where: { id: req.params.itemId },
        data: { ...(assigneeId !== undefined && { assigneeId }), ...(priority !== undefined && { priority }) },
        select: { id: true, title: true, assigneeId: true, priority: true },
      });
      await writeAudit(tx, req, 'BUG_GOVERNANCE_UPDATED', 'Bug', updated.id, {
        before: { assigneeId: existing.assigneeId, priority: existing.priority },
        after: { assigneeId: updated.assigneeId, priority: updated.priority },
      });
      return { item: updated };
    });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'Work item not found.' });
      return res.status(400).json({ success: false, message: 'Assignee must be an active workspace member.' });
    }
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Admin work item update error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update this work item.' });
  }
};

// ─── Audit Log ────────────────────────────────────────────────────────────────
export const getAuditLog = async (req: AuthRequest, res: Response) => {
  const from = req.query.from;
  const to = req.query.to;
  if (
    (from !== undefined && !isValidDate(from)) ||
    (to !== undefined && !isValidDate(to)) ||
    (isValidDate(from) && isValidDate(to) && new Date(from) > new Date(to))
  ) {
    return res.status(400).json({ success: false, message: 'Audit date filters must be valid dates.' });
  }
  if (
    (req.query.actorId !== undefined && (typeof req.query.actorId !== 'string' || !z.string().uuid().safeParse(req.query.actorId).success)) ||
    (req.query.format !== undefined && (typeof req.query.format !== 'string' || !['csv', 'json'].includes(req.query.format))) ||
    (req.query.action !== undefined && (typeof req.query.action !== 'string' || req.query.action.length > 100)) ||
    (req.query.targetType !== undefined && (typeof req.query.targetType !== 'string' || req.query.targetType.length > 100))
  ) {
    return res.status(400).json({ success: false, message: 'Invalid audit log filters.' });
  }

  const where: Prisma.AdminAuditLogWhereInput = {
    ...(typeof req.query.action === 'string' && { action: req.query.action }),
    ...(typeof req.query.actorId === 'string' && { actorId: req.query.actorId }),
    ...(typeof req.query.targetType === 'string' && { targetType: req.query.targetType }),
    ...(from || to) && {
      createdAt: {
        ...(from && { gte: new Date(from as string) }),
        ...(to && { lte: filterEndDate(to as string) }),
      },
    },
  };

  const format = req.query.format;
  const page = parseBoundedInteger(req.query.page, 1, 100000);
  const limit = parseBoundedInteger(req.query.limit, 50, 100);
  if (
    page === null ||
    limit === null ||
    (req.query.page !== undefined && typeof req.query.page !== 'string') ||
    (req.query.limit !== undefined && typeof req.query.limit !== 'string')
  ) {
    return res.status(400).json({ success: false, message: 'Invalid audit pagination.' });
  }

  try {
    if (format === 'csv' || format === 'json') {
      const logs = await prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 5000,
        include: { actor: { select: { id: true, name: true, email: true } } },
      });

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="flowpilot-admin-audit.json"');
        return res.send(JSON.stringify({ exported: new Date().toISOString(), count: logs.length, records: logs }, null, 2));
      }

      // CSV export with injection protection
      const lines = [
        ['timestamp', 'actor_id', 'actor_name', 'actor_email', 'action', 'target_type', 'target_id', 'ip_address', 'details'].join(','),
        ...logs.map((log) => [
          log.createdAt.toISOString(), log.actorId, log.actor.name, log.actor.email, log.action,
          log.targetType, log.targetId, log.ipAddress ?? '', JSON.stringify(log.details),
        ].map(csvQuote).join(',')),
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="flowpilot-admin-audit.csv"');
      return res.send(lines.join('\r\n'));
    }

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    return res.json({ success: true, data: { logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } });
  } catch (error) {
    console.error('Admin audit log error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load administrative audit records.' });
  }
};
