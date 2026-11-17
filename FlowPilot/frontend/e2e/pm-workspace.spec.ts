import { expect, Page, test } from '@playwright/test';

const projectId = 'c98eec63-b83b-49cc-a331-ea604eb73502';
const activeSprintId = '46b1efde-03c1-4ad0-8c37-fcf5c8bb0e38';
const plannedSprintId = '85dcfe46-c4eb-49fb-9115-43043cf04467';
const milestoneId = 'e988ddee-3cb6-487c-91b5-fb94a1052272';
const taskId = 'ec0c98bc-c5bf-47ad-ab93-8a4c9a7f307a';

const project = {
  id: projectId,
  name: 'Identity',
  key: 'ID',
  status: 'ACTIVE',
  startDate: null,
  endDate: null,
  taskCounts: { BACKLOG: 1, DONE: 0 },
  completionPercent: 0,
  overdueTasks: 0,
  activeSprint: {
    id: activeSprintId,
    name: 'Sprint 4',
    goal: 'Password recovery',
    startDate: '2026-10-01T00:00:00.000Z',
    endDate: '2026-10-14T00:00:00.000Z',
    totalPoints: 5,
    remainingPoints: 5,
    completedPoints: 0,
    completionPercent: 0,
    tasks: 1,
    overdueTasks: 0,
    unassignedTasks: 0,
  },
  plannedSprints: [{
    id: plannedSprintId,
    name: 'Sprint 5',
    goal: 'Follow-up',
    startDate: '2026-10-15T00:00:00.000Z',
    endDate: '2026-10-28T00:00:00.000Z',
    taskCount: 0,
    storyPoints: 0,
  }],
  milestones: [{
    id: milestoneId,
    name: 'Account recovery',
    description: 'Password reset delivery',
    isComplete: false,
    startDate: null,
    endDate: null,
    taskCount: 0,
    completedTaskCount: 0,
    completionPercent: 0,
  }],
  velocity: [],
  team: [],
  _count: { tasks: 1, bugs: 0, sprints: 2 },
};

const initialTask = {
  id: taskId,
  title: 'Verify reset email',
  status: 'BACKLOG',
  priority: 'MEDIUM',
  projectId,
  sprintId: null,
  milestoneId: null,
  storyPoints: 3,
  tags: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

async function mockPmWorkspace(page: Page) {
  const taskRequests: { path: string; body: Record<string, unknown> }[] = [];
  const tasks = [initialTask];

  await page.addInitScript(() => {
    localStorage.setItem('flowpilot_token', 'pm-workspace-e2e-token');
  });
  await page.route('**/api/v1/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();

    if (pathname.endsWith('/auth/me')) {
      await route.fulfill({
        json: {
          success: true,
          data: { user: { id: 'pm-1', name: 'PM User', email: 'pm@example.com', role: 'PROJECT_MANAGER' } },
        },
      });
      return;
    }
    if (pathname.endsWith('/notifications')) {
      await route.fulfill({ json: { success: true, data: { notifications: [] } } });
      return;
    }
    if (pathname.endsWith('/pm/overview')) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            projects: [project],
            alerts: {
              tasksInReview: 0,
              overdueTasks: 0,
              unassignedTasks: 0,
              bugsInRetest: 0,
              reopenedBugs: 0,
              openBlockerBugCount: 0,
              unassignedBugCount: 0,
              overdueMilestoneCount: 0,
              unassignedBugs: [],
              overdueMilestones: [],
              openBlockerBugs: [],
            },
            workload: [],
            recentActivity: [],
          },
        },
      });
      return;
    }
    if (pathname.endsWith('/pm/team')) {
      await route.fulfill({ json: { success: true, data: { members: [] } } });
      return;
    }
    if (pathname.endsWith('/tasks') && method === 'GET') {
      await route.fulfill({ json: { success: true, data: { tasks } } });
      return;
    }
    if (pathname.endsWith('/pm/tasks') && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      taskRequests.push({ path: pathname, body });
      await route.fulfill({ status: 201, json: { success: true, data: { task: { ...body, id: 'new-task' } } } });
      return;
    }
    if (pathname.endsWith('/pm/tasks/bulk') && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      taskRequests.push({ path: pathname, body });
      await route.fulfill({ json: { success: true, data: { updatedCount: 1 } } });
      return;
    }
    if (pathname.endsWith(`/sprints/${activeSprintId}/complete`) && method === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      taskRequests.push({ path: pathname, body });
      await route.fulfill({ json: { success: true, data: { movedTaskCount: 1 } } });
      return;
    }

    throw new Error(`Unexpected API request: ${method} ${pathname}`);
  });

  return taskRequests;
}

test('PM can link and groom milestone work and roll incomplete sprint tasks forward', async ({ page }) => {
  const requests = await mockPmWorkspace(page);
  await page.goto('/dashboard/pm');

  await expect(page.getByRole('heading', { name: 'Delivery command center' })).toBeVisible();
  await expect(page.getByText('Account recovery')).toBeVisible();

  await page.getByRole('button', { name: 'Task', exact: true }).click();
  const taskDialog = page.getByRole('dialog', { name: 'Create task · Identity' });
  await taskDialog.getByLabel('Title').fill('Validate recovery email');
  await taskDialog.getByRole('combobox').nth(3).selectOption(milestoneId);
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect.poll(() => requests.some(({ path, body }) =>
    path.endsWith('/pm/tasks') && body.milestoneId === milestoneId)).toBe(true);

  await page.getByRole('checkbox', { name: `Select ${initialTask.title}` }).check();
  await page.getByLabel('Bulk priority').selectOption('HIGH');
  await page.getByLabel('Bulk milestone').selectOption(milestoneId);
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect.poll(() => requests.some(({ path, body }) =>
    path.endsWith('/pm/tasks/bulk') &&
    body.priority === 'HIGH' &&
    body.milestoneId === milestoneId &&
    Array.isArray(body.taskIds) &&
    body.taskIds.includes(taskId))).toBe(true);

  await page.getByRole('button', { name: 'Complete sprint' }).click();
  await page.getByText('Move to a planned sprint').click();
  await page.getByLabel('Target sprint').selectOption(plannedSprintId);
  await page.getByRole('button', { name: 'Complete sprint', exact: true }).last().click();

  await expect.poll(() => requests.some(({ path, body }) =>
    path.endsWith(`/sprints/${activeSprintId}/complete`) &&
    body.incompleteAction === 'future_sprint' &&
    body.targetSprintId === plannedSprintId)).toBe(true);
});
