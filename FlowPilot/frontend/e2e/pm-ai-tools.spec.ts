import { expect, test } from '@playwright/test';

test('PM workspace opens AI chat and generates and regenerates an active sprint report', async ({ page }) => {
  let chatRequests = 0;
  let reportRequests = 0;
  const projectId = 'project-pm-1';
  const sprintId = 'sprint-pm-1';

  await page.addInitScript(() => {
    localStorage.setItem('flowpilot_token', 'pm-ai-test-token');
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (pathname.endsWith('/auth/me')) {
      await route.fulfill({ json: { success: true, data: { user: {
        id: 'pm-user-1', name: 'PM User', email: 'pm@example.com', role: 'PROJECT_MANAGER',
      } } } });
      return;
    }
    if (pathname.endsWith('/notifications')) {
      await route.fulfill({ json: { success: true, data: { notifications: [] } } });
      return;
    }
    if (pathname.endsWith('/pm/overview')) {
      await route.fulfill({ json: { success: true, data: {
        projects: [{
          id: projectId,
          name: 'Assigned PM Project',
          key: 'PM',
          status: 'ACTIVE',
          startDate: null,
          endDate: null,
          taskCounts: { DONE: 1 },
          completionPercent: 50,
          overdueTasks: 0,
          activeSprint: {
            id: sprintId,
            name: 'Sprint Alpha',
            goal: 'Ship the PM workspace',
            startDate: null,
            endDate: null,
            totalPoints: 8,
            remainingPoints: 4,
            completedPoints: 4,
            completionPercent: 50,
            tasks: 2,
            overdueTasks: 0,
            unassignedTasks: 0,
          },
          plannedSprints: [],
          milestones: [],
          velocity: [],
          team: [],
          _count: { tasks: 2, bugs: 0, sprints: 1 },
        }],
        alerts: {
          tasksInReview: 0,
          overdueTasks: 0,
          unassignedTasks: 0,
          bugsInRetest: 0,
          reopenedBugs: 0,
          openBlockerBugCount: 0,
          unassignedBugCount: 0,
          overdueMilestoneCount: 0,
          unassignedBugs: [],
          overdueMilestones: [],
          openBlockerBugs: [],
        },
        workload: [],
        recentActivity: [],
      } } });
      return;
    }
    if (pathname.endsWith('/pm/team')) {
      await route.fulfill({ json: { success: true, data: { members: [] } } });
      return;
    }
    if (pathname.endsWith('/tasks')) {
      await route.fulfill({ json: { success: true, data: { tasks: [] } } });
      return;
    }
    if (pathname.endsWith('/ai/chat')) {
      chatRequests += 1;
      await route.fulfill({ json: { success: true, data: { reply: 'Use the sprint goal to prioritize the remaining work.' } } });
      return;
    }
    if (pathname.endsWith('/ai/summarize-sprint')) {
      reportRequests += 1;
      await route.fulfill({ json: { success: true, data: {
        report: `## 🎯 Sprint Health\nAt Risk — half of the tasks are complete.\n\n## 📊 Progress Summary\n1 of 2 tasks are done.\n\n## ⚠️ Risk Analysis\n- One task remains.\n\n## ✅ Recommendations\n- Review the remaining work.\n\n## 🏁 Forecast\nReassess progress at the next check-in.`,
        meta: {
          sprintName: 'Sprint Alpha',
          projectName: 'Assigned PM Project',
          totalTasks: 2,
          doneTasks: 1,
          generatedAt: new Date().toISOString(),
        },
      } } });
      return;
    }

    throw new Error(`Unexpected API request: ${request.method()} ${pathname}`);
  });

  await page.goto('/dashboard/pm');
  await expect(page.getByRole('heading', { name: 'Sprint Alpha', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Open AI Chat' }).click();
  await page.getByPlaceholder(/Ask about your project/).fill('How should I prioritize the remaining sprint work?');
  await page.getByPlaceholder(/Ask about your project/).press('Enter');
  await expect(page.getByText('Use the sprint goal to prioritize the remaining work.')).toBeVisible();
  expect(chatRequests).toBe(1);
  await page.getByRole('button', { name: 'Close AI chat' }).click();

  await page.getByRole('button', { name: 'Generate sprint report' }).click();
  await page.getByRole('button', { name: 'Generate AI Report' }).click();
  await expect(page.getByText('At Risk — half of the tasks are complete.')).toBeVisible();
  await page.getByRole('button', { name: 'Regenerate Report' }).click();
  await expect.poll(() => reportRequests).toBe(2);
});
