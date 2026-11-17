import { expect, test } from '@playwright/test';

const roles = ['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER', 'QA_ENGINEER'] as const;

for (const role of roles) {
  test(`user with ${role} role can sign out and cannot reopen the dashboard`, async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('e2e-auth-seeded')) {
        localStorage.setItem('flowpilot_token', 'e2e-token');
        sessionStorage.setItem('e2e-auth-seeded', 'true');
      }
    });

    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;

      if (path.endsWith('/auth/me')) {
        await route.fulfill({
          json: {
            success: true,
            data: { user: { id: 'e2e-user', name: 'FlowPilot User', email: 'user@example.com', role } },
          },
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

      if (path.endsWith('/sprints')) {
        await route.fulfill({ json: { success: true, data: { sprints: [] } } });
        return;
      }

      await route.fulfill({ json: { success: true, data: { notifications: [] } } });
    });

    await page.goto('/dashboard');
    await expect(page.getByText(role.replace('_', ' '), { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('flowpilot_token'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('flowpilot_user'))).toBeNull();
  });
}

test('unauthenticated users cannot open dashboard routes directly', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('flowpilot_token');
    localStorage.removeItem('flowpilot_user');
  });

  for (const protectedPath of ['/dashboard', '/dashboard/projects']) {
    await page.goto(protectedPath);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  }
});
