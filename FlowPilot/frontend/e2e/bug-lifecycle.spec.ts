import { expect, Page, test } from '@playwright/test';
import type { Bug, BugStatus } from '../src/types';

const initialBug: Bug = {
  id: 'bug-1',
  title: 'Password reset link expires too soon',
  description: 'The reset link expires before the user can complete the form.',
  severity: 'MAJOR',
  priority: 'HIGH',
  status: 'FIXED',
  projectId: 'project-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  project: { id: 'project-1', name: 'Identity' },
};

async function mockQaWorkspace(page: Page) {
  const transitions: BugStatus[] = [];
  const outcomes: { outcome: 'PASSED' | 'FAILED'; notes?: string }[] = [];
  let bug = { ...initialBug };

  await page.addInitScript(() => {
    localStorage.setItem('flowpilot_token', 'bug-lifecycle-e2e-token');
  });
  await page.route('**/api/v1/**', async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname.endsWith('/auth/me')) {
      await route.fulfill({
        json: {
          success: true,
          data: { user: { id: 'qa-1', name: 'QA User', email: 'qa@example.com', role: 'QA_ENGINEER' } },
        },
      });
      return;
    }
    if (pathname.endsWith('/notifications')) {
      await route.fulfill({ json: { success: true, data: { notifications: [] } } });
      return;
    }
    if (pathname.endsWith('/bugs') && route.request().method() === 'GET') {
      await route.fulfill({ json: { success: true, data: { bugs: [bug] } } });
      return;
    }
    if (pathname.endsWith('/bugs/bug-1') && route.request().method() === 'PUT') {
      const { status } = route.request().postDataJSON() as { status: BugStatus };
      transitions.push(status);
      bug = { ...bug, status };
      await route.fulfill({ json: { success: true, data: { bug } } });
      return;
    }
    if (pathname.endsWith('/qa/bugs/bug-1/retest') && route.request().method() === 'POST') {
      const { outcome, notes } = route.request().postDataJSON() as { outcome: 'PASSED' | 'FAILED'; notes?: string };
      outcomes.push({ outcome, notes });
      bug = { ...bug, status: outcome === 'PASSED' ? 'CLOSED' : 'REOPENED' };
      await route.fulfill({ json: { success: true, data: { bug } } });
      return;
    }

    throw new Error(`Unexpected API request: ${route.request().method()} ${pathname}`);
  });

  return { transitions, outcomes };
}

test('QA can retest a fixed bug and close it only after a passing retest', async ({ page }) => {
  const { transitions, outcomes } = await mockQaWorkspace(page);
  await page.goto('/dashboard/qa/retests');

  await page.getByRole('button', { name: 'Start retest' }).click();
  await expect(page.getByText('Status: RETEST')).toBeVisible();
  await page.getByRole('button', { name: 'Pass and verify' }).click();

  await expect(page.getByText('No fixes are waiting for retest and no retests are in progress.')).toBeVisible();
  expect(transitions).toEqual(['RETEST']);
  expect(outcomes).toEqual([{ outcome: 'PASSED', notes: '' }]);
});

test('QA can reopen a bug when its retest fails', async ({ page }) => {
  const { transitions, outcomes } = await mockQaWorkspace(page);
  await page.goto('/dashboard/qa/retests');

  await page.getByRole('button', { name: 'Start retest' }).click();
  page.once('dialog', (dialog) => dialog.accept('The error still appears after submitting the form.'));
  await page.getByRole('button', { name: 'Fail and reopen' }).click();

  await expect(page.getByText('No fixes are waiting for retest and no retests are in progress.')).toBeVisible();
  expect(transitions).toEqual(['RETEST']);
  expect(outcomes).toEqual([{ outcome: 'FAILED', notes: 'The error still appears after submitting the form.' }]);
});
