import { expect, test } from '@playwright/test';

test('project QA scenario generator accepts a requirement and displays generated cases', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('flowpilot_token', 'e2e-token');
  });

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown;

    if (path.endsWith('/auth/me')) {
      body = {
        success: true,
        data: { user: { id: 'e2e-user', name: 'QA Engineer', email: 'qa@example.com', role: 'QA_ENGINEER' } },
      };
    } else if (path.endsWith('/projects/e2e-project/analytics')) {
      body = { success: true, data: { tasksByStatus: [], tasksByPriority: [], bugsBySeverity: [], workload: [] } };
    } else if (path.endsWith('/projects/e2e-project')) {
      body = {
        success: true,
        data: { project: { id: 'e2e-project', name: 'Sample Project', description: 'E2E project', members: [] } },
      };
    } else if (path.endsWith('/tasks')) {
      body = { success: true, data: { tasks: [] } };
    } else if (path.endsWith('/bugs')) {
      body = { success: true, data: { bugs: [] } };
    } else if (path.endsWith('/sprints')) {
      body = { success: true, data: { sprints: [] } };
    } else if (path.endsWith('/notifications')) {
      body = { success: true, data: { notifications: [] } };
    } else if (path.endsWith('/ai/generate-test-scenarios')) {
      body = {
        success: true,
        data: {
          scenarios: [
            {
              testId: 'TC-001',
              scenario: 'Submit a valid password reset email',
              type: 'Positive',
              expectedResult: 'A reset confirmation is displayed.',
            },
            {
              testId: 'TC-002',
              scenario: 'Submit an unregistered email address',
              type: 'Negative',
              expectedResult: 'The request is safely rejected.',
            },
            {
              testId: 'TC-003',
              scenario: 'Submit the form with an empty email',
              type: 'Validation',
              expectedResult: 'The email field is marked as required.',
            },
            {
              testId: 'TC-004',
              scenario: 'Submit an email at the maximum supported length',
              type: 'Boundary',
              expectedResult: 'The email is handled according to the documented limit.',
            },
            {
              testId: 'TC-005',
              scenario: 'Request reset links repeatedly',
              type: 'Security',
              expectedResult: 'Rate limits prevent abuse without exposing account status.',
            },
          ],
        },
      };
    } else {
      throw new Error(`Unexpected API request: ${route.request().method()} ${path}`);
    }

    await route.fulfill({ json: body });
  });

  await page.goto('/dashboard/projects/e2e-project');
  await page.getByRole('button', { name: 'QA Scenarios' }).click();

  await expect(page.getByRole('heading', { name: 'AI Test Scenario Generator' })).toBeVisible();
  const requirement = 'User should be able to reset their password using their registered email.';
  await page.getByLabel('Requirement or feature description').fill(requirement);
  const generationRequest = page.waitForRequest((request) =>
    request.url().endsWith('/ai/generate-test-scenarios'),
  );
  await page.getByRole('button', { name: 'Generate Scenarios' }).click();
  expect((await generationRequest).postDataJSON()).toEqual({ requirement });

  await expect(page.getByRole('columnheader', { name: 'Test ID' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Scenario Description' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Expected Result' })).toBeVisible();
  await expect(page.getByText('Submit a valid password reset email')).toBeVisible();
  await expect(page.getByText('Validation', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy Scenarios' })).toBeVisible();

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy Scenarios' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
});
