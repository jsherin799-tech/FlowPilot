import { test, expect } from '@playwright/test';

test.describe('FlowPilot E2E Tests', () => {
  test('demo access signs in directly and routes admins to their workspace', async ({ page }) => {
    let submittedEmail: string | undefined;
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/login')) {
        submittedEmail = route.request().postDataJSON().email;
        await route.fulfill({
          json: {
            success: true,
            data: {
              token: 'admin-test-token',
              user: {
                id: 'admin-test-user',
                name: 'FlowPilot Admin',
                email: submittedEmail,
                role: 'ADMIN',
              },
            },
          },
        });
        return;
      }

      await route.fulfill({ status: 503, json: { success: false, message: 'Unavailable in this test' } });
    });

    await page.goto('/');
    const workspaceNavigation = page.waitForURL('**/dashboard/admin', { timeout: 15000 });
    await page.getByRole('button', { name: 'Admin', exact: true }).click();
    await workspaceNavigation;

    expect(submittedEmail).toBe('admin@flowpilot.io');
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Workspace Overview' })).toBeVisible();
  });

  test('shows actionable guidance when the API cannot be reached', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) => route.abort());
    await page.goto('/');
    await page.getByRole('button', { name: 'Admin', exact: true }).click();

    await expect(page.getByText(/Unable to reach the FlowPilot API/)).toBeVisible();
    await expect(page.getByText(/npm run dev:backend/)).toBeVisible();
  });
})