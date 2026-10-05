import { test, expect } from '@playwright/test';

test.describe('FlowPilot E2E Tests', () => {
  test('should login as admin and view dashboard project board', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.getByRole('button', { name: 'Admin', exact: true }).click();
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Project board' })).toBeVisible();
  });
})