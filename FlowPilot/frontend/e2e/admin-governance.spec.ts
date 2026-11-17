import { expect, Page, test } from '@playwright/test';
import type { Role } from '../src/types';

const adminUser = {
  id: 'admin-1',
  name: 'Workspace Admin',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
};

const initialMembers = [
  {
    id: 'member-1',
    name: 'Riley Developer',
    email: 'riley@example.com',
    role: 'DEVELOPER' as Role,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    _count: { assignedTasks: 3, assignedBugs: 1, projectMembers: 2 },
  },
  {
    id: 'manager-1',
    name: 'Riley Manager',
    email: 'riley.manager@example.com',
    role: 'PROJECT_MANAGER' as Role,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    _count: { assignedTasks: 0, assignedBugs: 0, projectMembers: 1 },
  },
  {
    id: 'manager-2',
    name: 'Jordan Manager',
    email: 'jordan.manager@example.com',
    role: 'PROJECT_MANAGER' as Role,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    _count: { assignedTasks: 0, assignedBugs: 0, projectMembers: 0 },
  },
];

async function mockAdminApi(
  page: Page,
  failOverview = false,
  projects: Record<string, unknown>[] = [],
) {
  let members = [...initialMembers];
  const memberUpdates: { userId: string; body: { role?: Role; isActive?: boolean } }[] = [];
  const projectUpdates: { projectId: string; body: Record<string, unknown> }[] = [];
  const createdProjects: Record<string, unknown>[] = [];

  await page.addInitScript(() => {
    localStorage.setItem('flowpilot_token', 'admin-governance-test-token');
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (pathname.endsWith('/auth/me')) {
      await route.fulfill({ json: { success: true, data: { user: adminUser } } });
      return;
    }
    if (pathname.endsWith('/notifications')) {
      await route.fulfill({ json: { success: true, data: { notifications: [] } } });
      return;
    }
    if (pathname.endsWith('/admin/overview')) {
      if (failOverview) {
        await route.fulfill({ status: 503, json: { success: false, message: 'Overview temporarily unavailable.' } });
        return;
      }
      await route.fulfill({
        json: {
          success: true,
          data: {
            members: { active: 1, deactivated: 0 },
            projects: { total: 2, active: 1 },
            tasks: { active: 4, completed: 8, overdue: 1, unassigned: 2 },
            criticalBugs: 1,
            activeSprints: 1,
            auditEventCount: 6,
            completionTrend: [],
            recentAudit: [],
            membersByRole: { ADMIN: 1, PROJECT_MANAGER: 0, DEVELOPER: 0, QA_ENGINEER: 0 },
            projectsByStatus: { ACTIVE: 1, ON_HOLD: 0, COMPLETED: 1, ARCHIVED: 0 },
          },
        },
      });
      return;
    }
    if (pathname.endsWith('/admin/organization')) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            organization: {
              id: 'org-1',
              name: 'FlowPilot Workspace',
              slug: 'flowpilot-workspace',
              timezone: 'UTC',
              dateFormat: 'yyyy-MM-dd',
              language: 'en',
              defaultProjectStatus: 'ACTIVE',
              defaultRole: 'DEVELOPER',
              invitePolicy: 'ADMIN_ONLY',
            },
          },
        },
      });
      return;
    }
    if (pathname.endsWith('/admin/members') && request.method() === 'GET') {
      const role = new URL(request.url()).searchParams.get('role');
      const filteredMembers = role ? members.filter((member) => member.role === role) : members;
      await route.fulfill({
        json: {
          success: true,
          data: { members: filteredMembers, pagination: { page: 1, limit: 25, total: filteredMembers.length, totalPages: 1 } },
        },
      });
      return;
    }
    if (/\/admin\/members\/[^/]+$/.test(pathname) && request.method() === 'PATCH') {
      const userId = pathname.split('/').at(-1)!;
      const body = request.postDataJSON() as { role?: Role; isActive?: boolean };
      memberUpdates.push({ userId, body });
      members = members.map((member) => member.id === userId ? { ...member, ...body } : member);
      await route.fulfill({ json: { success: true, data: { member: members.find(({ id }) => id === userId) } } });
      return;
    }
    if (/\/admin\/projects\/[^/]+$/.test(pathname) && request.method() === 'PUT') {
      const projectId = pathname.split('/').at(-1)!;
      projectUpdates.push({ projectId, body: request.postDataJSON() as Record<string, unknown> });
      await route.fulfill({ json: { success: true, data: { project: { id: projectId } } } });
      return;
    }
    if (pathname.endsWith('/admin/projects') && request.method() === 'POST') {
      createdProjects.push(request.postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 201, json: { success: true, data: { project: createdProjects[0] } } });
      return;
    }
    if (pathname.endsWith('/admin/projects')) {
      await route.fulfill({
        json: {
          success: true,
          data: { projects, pagination: { page: 1, limit: 50, total: projects.length, totalPages: 1 } },
        },
      });
      return;
    }
    if (pathname.endsWith('/admin/audit')) {
      await route.fulfill({
        json: {
          success: true,
          data: { logs: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } },
        },
      });
      return;
    }

    throw new Error(`Unexpected API request: ${request.method()} ${pathname}`);
  });

  return { memberUpdates, projectUpdates, createdProjects };
}

test('admin overview shows operational KPIs and confirms role changes', async ({ page }) => {
  const { memberUpdates } = await mockAdminApi(page);
  await page.goto('/dashboard/admin');

  await expect(page.getByRole('heading', { name: 'Workspace Governance' })).toBeVisible();
  await expect(page.getByText('Total members')).toBeVisible();
  await expect(page.getByText('Active projects')).toBeVisible();
  await expect(page.getByText('System health')).toBeVisible();
  await expect(page.getByText('Operational')).toBeVisible();
  await expect(page.getByText('Active sprints')).toBeVisible();

  await page.getByRole('button', { name: 'Members' }).click();
  await expect(page.getByText('Riley Developer')).toBeVisible();
  await page.getByRole('combobox', { name: 'Role for Riley Developer' }).selectOption('QA_ENGINEER');

  const confirmation = page.getByRole('dialog');
  await expect(confirmation.getByRole('heading', { name: 'Change role for Riley Developer' })).toBeVisible();
  await confirmation.getByRole('button', { name: 'Confirm role change' }).click();

  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Role for Riley Developer' })).toHaveValue('QA_ENGINEER');
  expect(memberUpdates).toEqual([{ userId: 'member-1', body: { role: 'QA_ENGINEER' } }]);
});

test('admin overview displays an actionable error when its API request fails', async ({ page }) => {
  await mockAdminApi(page, true);
  await page.goto('/dashboard/admin');

  await expect(page.locator('div[role="alert"]').filter({ hasText: 'Overview temporarily unavailable.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
});

test('admin can assign a project manager on creation and reassign an existing project', async ({ page }) => {
  const project = {
    id: 'project-1',
    name: 'FlowPilot QA',
    key: 'FPQA',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    overdueTaskCount: 0,
    unassignedBugCount: 0,
    riskScore: 0,
    riskLevel: 'LOW',
    projectManager: { id: 'manager-1', name: 'Riley Manager', email: 'riley.manager@example.com' },
    _count: { tasks: 0, bugs: 0, sprints: 0, members: 1 },
  };
  const { projectUpdates, createdProjects } = await mockAdminApi(page, false, [project]);
  await page.goto('/dashboard/admin');
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.getByText('Riley Manager')).toBeVisible();

  await page.getByRole('button', { name: 'Edit project' }).click();
  await page.getByRole('combobox', { name: 'Project Manager for FlowPilot QA' }).selectOption('manager-2');
  await page.getByRole('button', { name: 'Save assignment' }).click();
  await expect(page.getByText('Project Manager assignment updated.')).toBeVisible();
  expect(projectUpdates).toEqual([{ projectId: 'project-1', body: { managerId: 'manager-2' } }]);

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Project name').fill('Assigned project');
  await page.getByLabel('Key (e.g. PROJ)').fill('ASGN');
  await page.getByRole('combobox', { name: 'Assign Project Manager' }).selectOption('manager-2');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText('Project created.')).toBeVisible();
  expect(createdProjects).toEqual([{
    name: 'Assigned project',
    key: 'ASGN',
    status: 'ACTIVE',
    managerId: 'manager-2',
  }]);
});
