import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('FlowPilot Core E2E Tests', () => {

    test('1. Successful Authentication & Navigation', async ({ page }) => {
        // Navigate to Login Page
        await page.goto(`${BASE_URL}/login`);

        // Fill credentials for Admin user
        await page.fill('input[type="email"]', 'admin@flowpilot.io');
        await page.fill('input[type="password"]', 'Password123!');
        await page.click('button[type="submit"]');

        // Verify Redirect to Dashboard
        await page.waitForURL('**/dashboard');
        await expect(page.locator('h1')).toContainText('Good');
        await expect(page.locator('text=Alex Rivera')).toBeVisible();
    });

    test('2. Role-Based Access Control (RBAC) - Settings Page', async ({ page }) => {
        // Login as Project Manager
        await page.goto(`${BASE_URL}/login`);
        await page.fill('input[type="email"]', 'pm@flowpilot.io');
        await page.fill('input[type="password"]', 'Password123!');
        await page.click('button[type="submit"]');

        // Navigate to Settings
        await page.goto(`${BASE_URL}/dashboard/settings`);

        // Verify email field is disabled and properly populated
        const emailInput = page.locator('input[type="email"]');
        await expect(emailInput).toHaveValue('pm@flowpilot.io');
        await expect(emailInput).toBeDisabled();
    });

    test('3. Project Detail & Sprint AI Report Drawer', async ({ page }) => {
        // Login as Developer
        await page.goto(`${BASE_URL}/login`);
        await page.fill('input[type="email"]', 'dev@flowpilot.io');
        await page.fill('input[type="password"]', 'Password123!');
        await page.click('button[type="submit"]');

        // Navigate to Projects
        await page.goto(`${BASE_URL}/dashboard/projects`);
        await page.waitForSelector('a[href^="/dashboard/projects/"]');

        // Click the first project
        await page.locator('a[href^="/dashboard/projects/"]').first().click();

        // Switch to Sprints tab
        await page.click('text=Sprints');

        // Trigger AI Report Drawer
        const aiButton = page.locator('button:has-text("Generate AI Report")');
        if (await aiButton.isVisible()) {
            await aiButton.click();
            await expect(page.locator('text=Sprint Intelligence')).toBeVisible();
        }
    });

});