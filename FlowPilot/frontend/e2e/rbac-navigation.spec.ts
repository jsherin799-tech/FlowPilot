import { expect, test } from '@playwright/test';
import type { Role } from '../src/types';

const roleScenarios: {
  role: Role;
  demoButton: string;
  homePath: string;
  homeHeading: string;
  menuItems: string[];
  forbiddenPath?: string;
  forbiddenHeading?: string;
  canCreateProject: boolean;
}[] = [
    {
      role: 'ADMIN',
      demoButton: 'Admin',
      homePath: '/dashboard/admin',
      homeHeading: 'Workspace Governance',
      menuItems: ['Workspace Overview', 'All Projects', 'Team & Role Management', 'Platform Activity', 'Quality Assurance', 'System Settings'],
      canCreateProject: true,
    },
    {
      role: 'PROJECT_MANAGER',
      demoButton: 'Project Manager',
      homePath: '/dashboard/pm',
      homeHeading: 'Delivery command center',
      menuItems: ['PM Overview & Roadmap', 'My Projects & Sprints', 'Task Allocation', 'Project Analytics', 'Quality Assurance', 'Settings'],
      forbiddenPath: '/dashboard/team',
      forbiddenHeading: 'Team & Role Management',
      canCreateProject: true,
    },
    {
      role: 'DEVELOPER',
      demoButton: 'Developer',
      homePath: '/dashboard/developer',
      homeHeading: 'My work',
      menuItems: ['My Work & Assigned Tasks', 'Kanban Board', 'Open Pull Requests / Code Review', 'Assigned Bugs'],
      forbiddenPath: '/dashboard/team',
      forbiddenHeading: 'Team & Role Management',
      canCreateProject: false,
    },
    {
      role: 'QA_ENGINEER',
      demoButton: 'QA Engineer',
      homePath: '/dashboard/qa',
      homeHeading: 'QA Dashboard',
      menuItems: ['QA Dashboard', 'Bug Tracker', 'Test Scenario Generator', 'Sprint Retests', 'Settings'],
      forbiddenPath: '/dashboard/tasks',
      forbiddenHeading: 'Task Allocation',
      canCreateProject: false,
    },
  ];

for (const scenario of roleScenarios) {
  test(`${scenario.role} sees role navigation and lands on the correct workspace`, async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const user = {
        id: `user-${scenario.role.toLowerCase()}`,
        name: 'FlowPilot Test User',
        email: 'user@example.com',
        role: scenario.role,
      };

      if (path.endsWith('/auth/login')) {
        await route.fulfill({
          json: {
            success: true,
            data: { token: 'rbac-test-token', user },
          },
        });
        return;
      }

      if (path.endsWith('/auth/me')) {
        await route.fulfill({ json: { success: true, data: { user } } });
        return;
      }

      if (path.endsWith('/admin/overview')) {
        await route.fulfill({
          json: {
            success: true,
            data: {
              members: { active: 0, deactivated: 0 },
              projects: { total: 0, active: 0 },
              tasks: { active: 0, completed: 0, overdue: 0, unassigned: 0 },
              criticalBugs: 0,
              activeSprints: 0,
              auditEventCount: 0,
              completionTrend: [],
              recentAudit: [],
              membersByRole: {},
              projectsByStatus: {},
            },
          },
        });
        return;
      }

      if (path.endsWith('/admin/organization')) {
        await route.fulfill({ json: { success: true, data: { organization: null } } });
        return;
      }

      if (path.includes('/admin/members')) {
        await route.fulfill({
          json: { success: true, data: { members: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } } },
        });
        return;
      }

      if (path.includes('/admin/projects')) {
        await route.fulfill({
          json: { success: true, data: { projects: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } } },
        });
        return;
      }

      if (path.includes('/admin/audit')) {
        await route.fulfill({
          json: { success: true, data: { logs: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } } },
        });
        return;
      }

      if (path.endsWith('/pm/overview')) {
        await route.fulfill({
          json: {
            success: true,
            data: {
              projects: [],
              alerts: {
                tasksInReview: 0, overdueTasks: 0, unassignedTasks: 0, bugsInRetest: 0, reopenedBugs: 0,
                openBlockerBugCount: 0, unassignedBugCount: 0, overdueMilestoneCount: 0,
                unassignedBugs: [], overdueMilestones: [], openBlockerBugs: [],
              },
              workload: [],
              recentActivity: [],
            },
          },
        });
        return;
      }

      if (path.endsWith('/pm/team')) {
        await route.fulfill({ json: { success: true, data: { members: [] } } });
        return;
      }

      if (path.endsWith('/developer/workspace')) {
        await route.fulfill({
          json: { success: true, data: { tasks: [], bugs: [], alerts: { overdueTasks: 0, approachingSprintDeadlines: 0, urgentBugs: 0 } } },
        });
        return;
      }

      if (path.endsWith('/projects')) {
        await route.fulfill({ json: { success: true, data: { projects: [] } } });
        return;
      }

      if (path.endsWith('/tasks')) {
        await route.fulfill({ json: { success: true, data: { tasks: [] } } });
        return;
      }

      if (path.endsWith('/bugs')) {
        await route.fulfill({ json: { success: true, data: { bugs: [] } } });
        return;
      }

      if (path.endsWith('/qa/overview')) {
        await route.fulfill({
          json: {
            success: true,
            data: {
              metrics: {
                totalOpenBugs: 0,
                severityBreakdown: { BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0 },
                resolutionRate: 0,
                retestQueue: 0,
              },
              pendingVerification: { tasks: [], fixedBugs: [], retestingBugs: [] },
            },
          },
        });
        return;
      }

      if (path.endsWith('/sprints')) {
        await route.fulfill({ json: { success: true, data: { sprints: [] } } });
        return;
      }

      await route.fulfill({ json: { success: true, data: { notifications: [] } } });
    });

    await page.goto('/login');
    await expect(page).toHaveURL('/');
    const landingNavigation = page.waitForURL(`**${scenario.homePath}`, { timeout: 15000 });
    await page.getByRole('button', { name: new RegExp(scenario.demoButton) }).click();
    await landingNavigation;
    await expect(page.getByRole('heading', { name: scenario.homeHeading, exact: true })).toBeVisible();
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    for (const item of scenario.menuItems) {
      await expect(navigation.getByRole('link', { name: item, exact: true })).toBeVisible();
    }

    if (scenario.forbiddenPath && scenario.forbiddenHeading) {
      await page.goto(scenario.forbiddenPath);
      await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
      await expect(page.getByRole('heading', { name: scenario.forbiddenHeading })).toHaveCount(0);
    }

    await page.goto('/dashboard/projects');
    if (scenario.canCreateProject) {
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'New Project' })).toHaveCount(0);
    }
  });
}
