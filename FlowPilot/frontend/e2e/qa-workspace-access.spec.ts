import { expect, test } from '@playwright/test';
import type { Role } from '../src/types';

const authorizedRoles: Role[] = ['QA_ENGINEER', 'PROJECT_MANAGER', 'ADMIN'];

for (const role of authorizedRoles) {
  test(`${role} can open the QA dashboard`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('flowpilot_token', 'qa-workspace-access-token');
    });
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/me')) {
        await route.fulfill({
          json: { success: true, data: { user: { id: 'user-1', name: 'Workspace User', email: 'user@example.com', role } } },
        });
      } else if (path.endsWith('/qa/overview')) {
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
      } else if (path.endsWith('/projects')) {
        await route.fulfill({ json: { success: true, data: { projects: [] } } });
      } else {
        await route.fulfill({ json: { success: true, data: { notifications: [] } } });
      }
    });

    await page.goto('/dashboard/qa');
    await expect(page.getByRole('heading', { name: 'QA Dashboard', exact: true })).toBeVisible();
  });
}

test('developers are denied access to the QA dashboard', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('flowpilot_token', 'qa-workspace-access-token');
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) {
      await route.fulfill({
        json: { success: true, data: { user: { id: 'dev-1', name: 'Developer', email: 'dev@example.com', role: 'DEVELOPER' } } },
      });
    } else {
      await route.fulfill({ json: { success: true, data: { notifications: [] } } });
    }
  });

  await page.goto('/dashboard/qa');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
});
