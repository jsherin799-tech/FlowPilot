import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { AIService } from '../services/ai.service';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const uuidSchema = z.string().uuid();
const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string().trim().min(1).max(10000),
  })).min(1).max(30),
  projectId: uuidSchema.optional(),
});

async function canAccessProject(projectId: string, userId: string, role: string) {
  if (role === 'ADMIN') return true;
  return Boolean(await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true },
  }));
}

// ─── Helper: build rich sprint context string ─────────────────────────────────
async function buildSprintContext(sprintId: string) {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: {
      project: { select: { name: true } },
      tasks: {
        orderBy: [{ status: 'asc' }, { priority: 'desc' }],
      },
    },
  });

  if (!sprint) return null;

  return { sprint };
}

// POST /api/v1/ai/generate-test-scenarios
export const generateQAScenarios = async (req: AuthRequest, res: Response) => {
  try {
    const requirement: unknown = req.body?.requirement;

    if (typeof requirement !== 'string' || requirement.trim().length < 5 || requirement.trim().length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Requirement text must be between 5 and 5000 characters.',
      });
    }

    const result = await AIService.generateTestScenarios({ requirement: requirement.trim() });

    return res.status(200).json({
      success: true,
      message: 'QA Test scenarios generated successfully',
      data: result,
    });
  } catch (error) {
    console.error('AI QA generation error:', error);
    return res.status(502).json({ success: false, message: 'The AI service could not generate scenarios. Please try again.' });
  }
};

// POST /api/v1/ai/chat
export const chat = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Chat messages or project context are invalid.' });
    }
    const { messages, projectId } = parsed.data;

    let projectContext: string | undefined;
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          _count: { select: { tasks: true, bugs: true, sprints: true } },
          sprints: { where: { status: 'ACTIVE' }, take: 1 },
        },
      });
      if (!project || !await canAccessProject(projectId, req.user!.userId, req.user!.role)) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }
      projectContext = `Project Name: ${project.name}\nDescription: ${project.description || 'N/A'}\nTotal Tasks: ${project._count.tasks}\nTotal Bugs: ${project._count.bugs}\nActive Sprint: ${project.sprints[0]?.name || 'None'}`;
    }

    const reply = await AIService.chat({ messages, projectContext });

    return res.json({ success: true, data: { reply } });
  } catch (error) {
    console.error('AI chat error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during AI processing' });
  }
};

// POST /api/v1/ai/project-summary
export const getProjectSummary = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Project ID is required.' });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: { select: { tasks: true, bugs: true } },
        tasks: { select: { status: true } },
        sprints: { where: { status: 'ACTIVE' }, take: 1 },
        members: true,
      },
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const completedTasks = project.tasks.filter((t) => t.status === 'DONE').length;

    const summary = await AIService.generateProjectSummary({
      projectName: project.name,
      taskCount: project._count.tasks,
      bugCount: project._count.bugs,
      completedTasks,
      activeSprint: project.sprints[0]?.name,
      teamSize: project.members.length,
    });

    return res.json({ success: true, data: { summary } });
  } catch (error) {
    console.error('AI project summary error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during AI processing' });
  }
};

// POST /api/v1/ai/summarize-sprint
export const summarizeSprint = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = z.object({ sprintId: uuidSchema }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'A valid sprintId is required.' });
    }

    const ctx = await buildSprintContext(parsed.data.sprintId);
    if (!ctx) {
      return res.status(404).json({ success: false, message: 'Sprint not found.' });
    }
    if (!await canAccessProject(ctx.sprint.projectId, req.user!.userId, req.user!.role)) {
      return res.status(404).json({ success: false, message: 'Sprint not found.' });
    }

    const now = Date.now();
    const report = await AIService.generateSprintReport({
      sprintName: ctx.sprint.name,
      projectName: ctx.sprint.project.name,
      goal: ctx.sprint.goal,
      status: ctx.sprint.status,
      daysRemaining: ctx.sprint.endDate
        ? Math.max(0, Math.ceil((ctx.sprint.endDate.getTime() - now) / 86400000))
        : null,
      totalTasks: ctx.sprint.tasks.length,
      doneTasks: ctx.sprint.tasks.filter((task) => task.status === 'DONE').length,
      inProgressTasks: ctx.sprint.tasks.filter((task) => task.status === 'IN_PROGRESS').length,
      inReviewTasks: ctx.sprint.tasks.filter((task) => task.status === 'IN_REVIEW').length,
      toDoTasks: ctx.sprint.tasks.filter((task) => task.status === 'TO_DO').length,
      backlogTasks: ctx.sprint.tasks.filter((task) => task.status === 'BACKLOG').length,
      criticalTasks: ctx.sprint.tasks.filter((task) => task.priority === 'CRITICAL').length,
      totalPoints: ctx.sprint.tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
      donePoints: ctx.sprint.tasks
        .filter((task) => task.status === 'DONE')
        .reduce((sum, task) => sum + (task.storyPoints ?? 0), 0),
      overdueTasks: ctx.sprint.tasks.filter((task) =>
        task.status !== 'DONE' && task.dueDate !== null && task.dueDate.getTime() < now,
      ).length,
      unassignedTasks: ctx.sprint.tasks.filter((task) => task.assigneeId === null).length,
    });

    return res.json({
      success: true,
      data: {
        report,
        meta: {
          sprintName:   ctx.sprint.name,
          projectName:  ctx.sprint.project.name,
          totalTasks:   ctx.sprint.tasks.length,
          doneTasks:    ctx.sprint.tasks.filter((t) => t.status === 'DONE').length,
          generatedAt:  new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('Sprint summary error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during AI processing' });
  }
};