import { expect, Page, test } from '@playwright/test';
import type { Bug, Task } from '../src/types';

const taskId = '43577749-791a-435c-8995-8ac463f36fac';
const bugId = '9e37d625-e913-451e-ae3f-e8a9ba590d93';
const developerId = 'b7b865d7-46b4-4979-bae3-3cd429bf182d';
const projectId = 'c98eec63-b83b-49cc-a331-ea604eb73502';
type MockComment = {
  id: string;
  content: string;
  parentId: string | null;
  taskId: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; email: string; role: 'PROJECT_MANAGER' | 'DEVELOPER' };
  replies: MockComment[];
};

const initialTask = {
  id: taskId,
  title: 'Implement password recovery',
  description: 'Add reset email handling.',
  status: 'TO_DO',
  priority: 'HIGH',
  storyPoints: 5,
  estimatedHours: 6,
  actualHours: 0,
  pullRequestUrl: null,
  dueDate: null,
  projectId,
  assigneeId: developerId,
  createdAt: '2026-10-28T00:00:00.000Z',
  updatedAt: '2026-10-28T00:00:00.000Z',
  project: { id: projectId, name: 'Identity', key: 'ID' },
  sprint: null,
  checklistItems: [],
  effortLogs: [],
  comments: [],
} satisfies Partial<Task> & Record<string, unknown>;

const initialBug = {
  id: bugId,
  title: 'Reset link expires before use',
  description: 'The reset link expires before the user completes the flow.',
  severity: 'CRITICAL',
  priority: 'HIGH',
  status: 'IN_PROGRESS',
  projectId,
  assigneeId: developerId,
  createdAt: '2026-10-28T00:00:00.000Z',
  updatedAt: '2026-10-28T00:00:00.000Z',
  project: { id: projectId, name: 'Identity', key: 'ID' },
  comments: [],
} satisfies Partial<Bug> & Record<string, unknown>;

async function mockDeveloperWorkspace(page: Page) {
  const taskStatusChanges: Record<string, unknown>[] = [];
  const effortEntries: Record<string, unknown>[] = [];
  const bugFixSubmissions: Record<string, unknown>[] = [];
  const commentSubmissions: Record<string, unknown>[] = [];
  let task = { ...initialTask };
  let bug = { ...initialBug };
  let checklistItems: { id: string; title: string; isComplete: boolean; sortOrder: number; taskId: string }[] = [];
  let taskComments: MockComment[] = [{
    id: 'root-comment',
    content: 'I verified the API contract.',
    parentId: null,
    taskId,
    authorId: 'pm-user',
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
    author: { id: 'pm-user', name: 'PM User', email: 'pm@example.com', role: 'PROJECT_MANAGER' },
    replies: [],
  }];

  await page.addInitScript(() => {
    localStorage.setItem('flowpilot_token', 'developer-workspace-e2e-token');
  });
  await page.route('**/api/v1/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();

    if (pathname.endsWith('/auth/me')) {
      await route.fulfill({
        json: { success: true, data: { user: { id: developerId, name: 'Dev User', email: 'dev@example.com', role: 'DEVELOPER' } } },
      });
      return;
    }
    if (pathname.endsWith('/notifications')) {
      await route.fulfill({ json: { success: true, data: { notifications: [] } } });
      return;
    }
    if (pathname.endsWith('/developer/workspace') && method === 'GET') {
      await route.fulfill({
        json: {
          success: true,
          data: {
            tasks: [{ ...task, checklistItems, comments: taskComments, effortLogs: effortEntries.map((entry, index) => ({ ...entry, id: `effort-${index}`, createdAt: new Date().toISOString() })) }],
            bugs: bug.status === 'FIXED' ? [] : [bug],
            alerts: { overdueTasks: 0, approachingSprintDeadlines: 0, urgentBugs: bug.status === 'FIXED' ? 0 : 1 },
          },
        },
      });
      return;
    }
    if (pathname.endsWith(`/tasks/${taskId}/status`) && method === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      taskStatusChanges.push(body);
      task = { ...task, status: body.status as string, description: body.description as string ?? task.description };
      await route.fulfill({ json: { success: true, data: { task } } });
      return;
    }
    if (pathname.endsWith(`/developer/tasks/${taskId}/effort`) && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      effortEntries.push(body);
      task = { ...task, actualHours: Number(task.actualHours ?? 0) + Number(body.hours) };
      await route.fulfill({ status: 201, json: { success: true, data: { effortLog: body } } });
      return;
    }
    if (pathname.endsWith(`/developer/tasks/${taskId}/checklist`) && method === 'POST') {
      const body = route.request().postDataJSON() as { title: string };
      checklistItems.push({ id: 'check-1', title: body.title, isComplete: false, sortOrder: 0, taskId });
      await route.fulfill({ status: 201, json: { success: true, data: { item: checklistItems[0] } } });
      return;
    }
    if (pathname.endsWith('/developer/checklist/check-1') && method === 'PATCH') {
      const body = route.request().postDataJSON() as { isComplete: boolean };
      checklistItems = checklistItems.map((item) => ({ ...item, isComplete: body.isComplete }));
      await route.fulfill({ json: { success: true, data: { item: checklistItems[0] } } });
      return;
    }
    if (pathname.endsWith(`/tasks/${taskId}/comments`) && method === 'POST') {
      const body = route.request().postDataJSON() as { content: string; parentId?: string };
      commentSubmissions.push(body);
      const reply: MockComment = {
        id: 'reply-1',
        content: body.content,
        parentId: body.parentId ?? null,
        taskId,
        authorId: developerId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: { id: developerId, name: 'Dev User', email: 'dev@example.com', role: 'DEVELOPER' },
        replies: [],
      };
      if (body.parentId) {
        taskComments = taskComments.map((comment) => comment.id === body.parentId
          ? { ...comment, replies: [reply] }
          : comment);
      } else {
        taskComments = [...taskComments, reply];
      }
      await route.fulfill({ status: 201, json: { success: true, data: { comment: reply } } });
      return;
    }
    if (pathname.endsWith(`/bugs/${bugId}`) && method === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      bugFixSubmissions.push(body);
      bug = { ...bug, ...body, status: 'FIXED' };
      await route.fulfill({ json: { success: true, data: { bug } } });
      return;
    }

    throw new Error(`Unexpected API request: ${method} ${pathname}`);
  });

  return { taskStatusChanges, effortEntries, bugFixSubmissions, commentSubmissions };
}

test('developer can progress assigned work, track effort/checklists, and hand off a bug fix', async ({ page }) => {
  const requests = await mockDeveloperWorkspace(page);
  await page.goto('/dashboard/developer');

  await expect(page.getByRole('heading', { name: 'My work' })).toBeVisible();
  await expect(page.getByText('Implement password recovery')).toBeVisible();
  await expect(page.getByText('Reset link expires before use')).toBeVisible();
  await page.getByLabel('Filter bugs by severity').selectOption('CRITICAL');
  await expect(page.getByText('Reset link expires before use')).toBeVisible();
  await page.getByLabel('Filter bugs by severity').selectOption('MINOR');
  await expect(page.getByText('No bugs match this severity.')).toBeVisible();
  await page.getByLabel('Filter bugs by severity').selectOption('ALL');

  await page.getByLabel('Update status for Implement password recovery').selectOption('IN_PROGRESS');
  await expect.poll(() => requests.taskStatusChanges.length).toBe(1);
  expect(requests.taskStatusChanges[0].status).toBe('IN_PROGRESS');

  await page.getByLabel('Hours for Implement password recovery').fill('1.5');
  await page.getByLabel('Effort note for Implement password recovery').fill('Added token expiry validation');
  await page.getByRole('button', { name: 'Log effort' }).click();
  await expect.poll(() => requests.effortEntries.length).toBe(1);
  expect(requests.effortEntries[0]).toMatchObject({ hours: 1.5, note: 'Added token expiry validation' });

  await page.getByPlaceholder('Add a checklist item').fill('Add expiry regression coverage');
  await page.getByRole('button', { name: 'Add checklist item to Implement password recovery' }).click();
  await expect(page.getByText('Add expiry regression coverage')).toBeVisible();
  await page.getByRole('checkbox').click();
  await expect(page.getByRole('checkbox')).toBeChecked();

  const taskCard = page.locator('article').filter({ hasText: 'Implement password recovery' });
  await taskCard.getByRole('button', { name: 'Reply' }).click();
  await taskCard.getByLabel('Comment on Implement password recovery').fill('I added the expiry regression test.');
  await taskCard.getByRole('button', { name: 'Comment' }).click();
  await expect(page.getByText('I added the expiry regression test.')).toBeVisible();
  expect(requests.commentSubmissions[0]).toMatchObject({ parentId: 'root-comment' });

  const bugCard = page.locator('article').filter({ hasText: 'Reset link expires before use' });
  await bugCard.getByLabel('Fix notes (Markdown text)').fill('Extended the reset token lifetime and added expiry checks.');
  await bugCard.getByLabel('Pull request URL (HTTPS)').fill('https://github.com/acme/identity/pull/42');
  await bugCard.getByRole('button', { name: 'Submit fix for QA retest' }).click();
  await expect.poll(() => requests.bugFixSubmissions.length).toBe(1);
  expect(requests.bugFixSubmissions[0]).toMatchObject({
    status: 'FIXED',
    resolutionNotes: 'Extended the reset token lifetime and added expiry checks.',
    pullRequestUrl: 'https://github.com/acme/identity/pull/42',
  });
});
