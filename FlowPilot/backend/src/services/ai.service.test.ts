import assert from 'node:assert/strict';
import test from 'node:test';
import { AIService } from './ai.service';

test('sprint report fallback returns the headings and current sprint metrics', async () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const report = await AIService.generateSprintReport({
      sprintName: 'Sprint Alpha',
      projectName: 'FlowPilot',
      goal: 'Ship the sprint dashboard',
      status: 'ACTIVE',
      daysRemaining: 2,
      totalTasks: 5,
      doneTasks: 2,
      inProgressTasks: 1,
      inReviewTasks: 1,
      toDoTasks: 0,
      backlogTasks: 1,
      criticalTasks: 1,
      totalPoints: 13,
      donePoints: 5,
      overdueTasks: 1,
      unassignedTasks: 1,
    });

    assert.match(report, /## 🎯 Sprint Health/);
    assert.match(report, /## 📊 Progress Summary/);
    assert.match(report, /## ⚠️ Risk Analysis/);
    assert.match(report, /## ✅ Recommendations/);
    assert.match(report, /## 🏁 Forecast/);
    assert.match(report, /2 of 5 tasks are done/);
    assert.match(report, /1 task\(s\) are overdue/);
  } finally {
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
  }
});
