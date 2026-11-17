import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TestScenario {
  testId: string;
  scenario: string;
  type: 'Positive' | 'Negative' | 'Validation' | 'Boundary' | 'Security';
  expectedResult: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface ProjectSummaryInput {
  projectName: string;
  taskCount: number;
  bugCount: number;
  completedTasks: number;
  activeSprint?: string;
  teamSize: number;
}

export interface SprintReportInput {
  sprintName: string;
  projectName: string;
  goal: string | null;
  status: string;
  daysRemaining: number | null;
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  inReviewTasks: number;
  toDoTasks: number;
  backlogTasks: number;
  criticalTasks: number;
  totalPoints: number;
  donePoints: number;
  overdueTasks: number;
  unassignedTasks: number;
}

// ─── LLM Provider Helper ──────────────────────────────────────────────────────

async function callGemini(prompt: string, fallbackOnError = true): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // Graceful fallback — return structured mock when no key configured
    return '__FALLBACK__';
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Gemini API error:', error);
    if (fallbackOnError) return '__FALLBACK__';
    throw new Error('AI provider request failed.');
  }
}

// ─── AI Service ───────────────────────────────────────────────────────────────

export class AIService {
  /**
   * Generate structured QA Test Scenarios for a given requirement.
   * Falls back to deterministic mock data if no LLM API key is configured.
   */
  static async generateTestScenarios({ requirement }: { requirement: string }): Promise<{ scenarios: TestScenario[] }> {
    const prompt = `You are a senior QA engineer. Given the following requirement, generate comprehensive test scenarios in JSON format.

Requirement: "${requirement}"

Return ONLY a valid JSON array with objects matching this exact structure:
[
  {
    "testId": "TC-001",
    "scenario": "description of the test scenario",
    "type": "Positive|Negative|Validation|Boundary|Security",
    "expectedResult": "what should happen"
  }
]

Generate at least 10 scenarios, with at least one scenario for each type: Positive, Negative, Validation, Boundary, and Security. Keep scenarios specific to the requirement. Return ONLY the JSON array, nothing else.`;

    const response = await callGemini(prompt, false);

    if (response === '__FALLBACK__') {
      return { scenarios: generateFallbackScenarios(requirement) };
    }

    try {
      const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
      const parsed: unknown = JSON.parse(cleaned);
      const rows = Array.isArray(parsed)
        ? parsed
        : isRecord(parsed) && Array.isArray(parsed.scenarios)
          ? parsed.scenarios
          : null;

      if (!rows || rows.length === 0) {
        throw new Error('AI response did not contain test scenarios.');
      }

      return {
        scenarios: rows.map((row, index) => {
          if (
            !isRecord(row) ||
            typeof row.testId !== 'string' ||
            typeof row.scenario !== 'string' ||
            typeof row.expectedResult !== 'string' ||
            !isScenarioType(row.type)
          ) {
            throw new Error(`AI response contained an invalid test scenario at position ${index + 1}.`);
          }

          return {
            testId: row.testId,
            scenario: row.scenario,
            type: row.type,
            expectedResult: row.expectedResult,
          };
        }),
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('AI response was not valid JSON.');
      }
      throw error;
    }
  }

  /**
   * Chat with AI assistant about a project.
   */
  static async chat({ messages, projectContext }: { messages: ChatMessage[]; projectContext?: string }): Promise<string> {
    const systemPrompt = `You are FlowPilot AI, an expert product manager and software engineering assistant embedded in the FlowPilot project management platform. You help teams with:
- Breaking down requirements into actionable tasks
- Sprint planning and estimation
- Bug analysis and root cause investigation
- Code review guidance and technical architecture advice
- Team productivity insights

${projectContext ? `Current Project Context:\n${projectContext}` : ''}

Be concise, practical, and structured. Use bullet points for lists. Format code in markdown.`;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return 'Please ask me a question!';
    }

    const conversationHistory = messages
      .slice(0, -1)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const fullPrompt = `${systemPrompt}\n\n${conversationHistory ? `Conversation history:\n${conversationHistory}\n\n` : ''}User: ${lastMessage.content}\n\nAssistant:`;

    const response = await callGemini(fullPrompt);

    if (response === '__FALLBACK__') {
      return generateChatFallback(lastMessage.content);
    }

    return response;
  }

  static async generateSprintReport(input: SprintReportInput): Promise<string> {
    const prompt = `You are an Agile delivery lead. Produce a concise sprint report using only the supplied data.

Sprint: ${input.sprintName}
Project: ${input.projectName}
Goal: ${input.goal || 'No goal set'}
Status: ${input.status}
Days remaining: ${input.daysRemaining ?? 'Not set'}
Tasks: ${input.doneTasks} done, ${input.inProgressTasks} in progress, ${input.inReviewTasks} in review, ${input.toDoTasks} to do, ${input.backlogTasks} in backlog, out of ${input.totalTasks}
Story points: ${input.donePoints} completed out of ${input.totalPoints}
Critical tasks: ${input.criticalTasks}
Overdue tasks: ${input.overdueTasks}
Unassigned tasks: ${input.unassignedTasks}

Use exactly these five Markdown headings, including their emoji:
## 🎯 Sprint Health
## 📊 Progress Summary
## ⚠️ Risk Analysis
## ✅ Recommendations
## 🏁 Forecast

Include specific counts and actionable recommendations. Do not invent facts.`;
    const response = await callGemini(prompt);
    if (response !== '__FALLBACK__') return response;

    const completionPercent = input.totalTasks
      ? Math.round((input.doneTasks / input.totalTasks) * 100)
      : 0;
    const health = input.criticalTasks > 0 && input.daysRemaining === 0
      ? 'Critical'
      : input.overdueTasks > 0 || (input.daysRemaining !== null && input.daysRemaining <= 3 && completionPercent < 70)
        ? 'At Risk'
        : 'Healthy';
    const forecast = health === 'Healthy'
      ? 'The sprint appears on track based on the current completion data.'
      : 'The sprint goal is at risk; review remaining scope and blockers with the team.';
    const risks = [
      input.overdueTasks > 0 ? `- ${input.overdueTasks} task(s) are overdue.` : '- No overdue tasks are currently recorded.',
      input.criticalTasks > 0 ? `- ${input.criticalTasks} critical-priority task(s) need close attention.` : '- No critical-priority tasks are currently recorded.',
      input.unassignedTasks > 0 ? `- ${input.unassignedTasks} task(s) do not have an assignee.` : '- All sprint tasks have an assignee.',
    ].join('\n');

    return `## 🎯 Sprint Health
${health} — ${completionPercent}% of sprint tasks are complete.

## 📊 Progress Summary
${input.doneTasks} of ${input.totalTasks} tasks are done; ${input.inProgressTasks} are in progress and ${input.inReviewTasks} are in review. ${input.donePoints} of ${input.totalPoints} story points have been completed.

## ⚠️ Risk Analysis
${risks}

## ✅ Recommendations
- Review overdue and critical work in the next team check-in.
- Confirm owners for any unassigned tasks and adjust scope if remaining work exceeds capacity.

## 🏁 Forecast
${forecast}`;
  }

  /**
   * Generate a project summary analysis.
   */
  static async generateProjectSummary(input: ProjectSummaryInput): Promise<string> {
    const prompt = `You are a project management expert. Analyze this project health data and provide a concise summary with insights and recommendations:

Project: ${input.projectName}
- Total Tasks: ${input.taskCount} (${input.completedTasks} completed, ${((input.completedTasks / Math.max(input.taskCount, 1)) * 100).toFixed(0)}% completion rate)
- Total Bugs: ${input.bugCount}
- Team Size: ${input.teamSize} members
- Active Sprint: ${input.activeSprint || 'None'}

Provide:
1. Current health status (Healthy/At Risk/Critical)
2. Key observations (3 bullet points)
3. Actionable recommendations (2-3 items)

Keep it concise and practical. Use markdown formatting.`;

    const response = await callGemini(prompt);
    if (response === '__FALLBACK__') {
      return generateProjectSummaryFallback(input);
    }
    return response;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScenarioType(value: unknown): value is TestScenario['type'] {
  return value === 'Positive' ||
    value === 'Negative' ||
    value === 'Validation' ||
    value === 'Boundary' ||
    value === 'Security';
}

// ─── Fallback Generators (used when no API key) ───────────────────────────────

function generateFallbackScenarios(requirement: string): TestScenario[] {
  const base = requirement.trim();
  return [
    {
      testId: 'TC-001',
      scenario: `Verify successful execution of: ${base}`,
      type: 'Positive',
      expectedResult: 'The feature completes successfully with a confirmation message.',
    },
    {
      testId: 'TC-002',
      scenario: `Verify system rejects invalid input for: ${base}`,
      type: 'Negative',
      expectedResult: 'The system rejects the invalid input and explains how to correct it.',
    },
    {
      testId: 'TC-003',
      scenario: `Verify required fields cannot be submitted empty for: ${base}`,
      type: 'Validation',
      expectedResult: 'Required fields are identified and submission is prevented until they are valid.',
    },
    {
      testId: 'TC-004',
      scenario: `Verify maximum length boundary condition for: ${base}`,
      type: 'Boundary',
      expectedResult: 'Input exceeding maximum length is gracefully rejected.',
    },
    {
      testId: 'TC-005',
      scenario: `Verify minimum length boundary condition for: ${base}`,
      type: 'Boundary',
      expectedResult: 'Minimum boundary value is accepted and processed correctly.',
    },
    {
      testId: 'TC-006',
      scenario: `Verify SQL injection prevention for: ${base}`,
      type: 'Security',
      expectedResult: 'SQL injection attempt is blocked; no sensitive data is exposed.',
    },
    {
      testId: 'TC-007',
      scenario: `Verify XSS prevention for: ${base}`,
      type: 'Security',
      expectedResult: 'Script is sanitized and does not execute. Content is safely escaped.',
    },
    {
      testId: 'TC-008',
      scenario: `Verify behavior with special characters for: ${base}`,
      type: 'Negative',
      expectedResult: 'Special characters are handled gracefully without system errors.',
    },
    {
      testId: 'TC-009',
      scenario: `Verify invalid data formats are reported for: ${base}`,
      type: 'Validation',
      expectedResult: 'The system identifies malformed values and displays field-specific guidance.',
    },
    {
      testId: 'TC-010',
      scenario: `Verify boundary values do not cause errors for: ${base}`,
      type: 'Boundary',
      expectedResult: 'Values at the supported limits are processed safely and consistently.',
    },
  ];
}

function generateChatFallback(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  if (lower.includes('task') || lower.includes('breakdown')) {
    return `## Task Breakdown Suggestions

Based on your request, here are some recommended subtasks:

- **Define acceptance criteria** – Write clear, testable acceptance criteria before development begins
- **API design first** – Sketch the API contract (endpoints, request/response schemas) before implementation
- **Frontend component decomposition** – Break UI into atomic components (atoms → molecules → organisms)
- **Unit tests** – Write tests alongside implementation (TDD recommended)
- **Integration testing** – Validate end-to-end data flow
- **Code review & QA sign-off** – Peer review + QA validation before merge

> 💡 **Tip**: Aim for tasks completable in 1–2 days for better sprint velocity tracking.`;
  }

  if (lower.includes('sprint') || lower.includes('planning')) {
    return `## Sprint Planning Recommendations

**Sprint Best Practices:**

1. **Capacity Planning** – Account for meetings, code reviews, and unexpected tasks (~70-80% capacity)
2. **Story Point Alignment** – Ensure team consensus on point scales (use Fibonacci: 1, 2, 3, 5, 8, 13, 21)
3. **Sprint Goal** – Define one clear, measurable sprint goal
4. **Definition of Done** – Clearly define what "done" means for your team

**Suggested Sprint Structure:**
- Day 1: Sprint planning + task assignment
- Day 2-8: Development + daily standups
- Day 9: Code freeze + QA testing
- Day 10: Sprint review + retrospective

> 📊 **Velocity Tip**: Track your team's average velocity over 3 sprints for better forecasting.`;
  }

  if (lower.includes('bug') || lower.includes('fix') || lower.includes('error')) {
    return `## Bug Investigation Framework

**Systematic Debugging Approach:**

1. **Reproduce consistently** – Can you reproduce it 100% of the time? Document exact steps
2. **Isolate the scope** – Is it frontend, backend, database, or network?
3. **Check recent changes** – Review git log for changes in the last 48-72 hours
4. **Examine logs** – Check application logs, error tracking (Sentry), and database query logs
5. **Root cause vs. symptom** – Ensure you're fixing the cause, not just the symptom

**Root Cause Analysis Template:**
- **What happened?** Describe the bug
- **Why did it happen?** First cause
- **Why did that happen?** Second cause (keep asking "why" 5 times)
- **Preventive measures?** What process change prevents recurrence?`;
  }

  return `## FlowPilot AI Assistant

I'm here to help with your project management needs! I can assist with:

- 📋 **Task Breakdown** – Breaking epics into actionable stories
- 🏃 **Sprint Planning** – Capacity planning and velocity estimation
- 🐛 **Bug Analysis** – Root cause analysis frameworks
- 🏗️ **Architecture** – Technical design recommendations
- 📊 **Metrics** – Understanding your team's performance data

What would you like to explore?`;
}

function generateProjectSummaryFallback(input: ProjectSummaryInput): string {
  const completionRate = input.taskCount > 0
    ? Math.round((input.completedTasks / input.taskCount) * 100)
    : 0;
  const bugRatio = input.taskCount > 0
    ? (input.bugCount / input.taskCount).toFixed(2)
    : '0';

  const health = completionRate >= 70 ? '🟢 Healthy' : completionRate >= 40 ? '🟡 At Risk' : '🔴 Critical';

  return `## ${input.projectName} – Project Health Summary

**Status: ${health}**

### Key Observations
- **Completion Rate**: ${completionRate}% (${input.completedTasks}/${input.taskCount} tasks done)
- **Bug Density**: ${bugRatio} bugs per task — ${parseFloat(bugRatio) < 0.3 ? 'within acceptable range' : 'higher than recommended; review QA processes'}
- **Team Capacity**: ${input.teamSize} members${input.activeSprint ? ` actively working on ${input.activeSprint}` : '; no active sprint'}

### Recommendations
1. ${completionRate < 50 ? 'Review sprint scope — consider reducing backlog to improve focus and delivery rate' : 'Maintain current velocity and continue regular retrospectives'}
2. ${input.bugCount > 5 ? 'Schedule a dedicated bug-fix sprint to reduce technical debt accumulation' : 'Bug count is manageable; continue preventive code reviews'}
3. Ensure daily standups address blockers within 24 hours to maintain team momentum`;
}