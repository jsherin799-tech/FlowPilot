# Project manager workspace

The PM workspace UI is `/dashboard/pm`. Its backend endpoints are mounted at `/api/v1/pm` and require an active user with the `ADMIN` or `PROJECT_MANAGER` role.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/overview` | Assigned project health, sprint progress/velocity, team workload, alerts, and recent activity |
| `GET` | `/team` | Active Developer and QA member directory for project planning |
| `POST` | `/tasks` | Create a backlog or sprint task with description, priority, estimate, tags, due date, and optional assignee |
| `POST` | `/tasks/bulk` | Batch update assignees, priority, sprint, and milestone association in one transaction |
| `PATCH` | `/tasks/backlog/reorder` | Save an ordered list of backlog task IDs |
| `PATCH` | `/bugs/:bugId/triage` | Change severity and/or assign an open bug to a project Developer |
| `GET`, `POST` | `/projects/:projectId/milestones` | Read or create project milestones |
| `PATCH` | `/milestones/:milestoneId` | Mark a milestone complete or reopen it |

PM project reads and mutations are scoped to projects where the user has a `PROJECT_MANAGER` project membership. Project creation adds the creator as the PM and can assign active Developers/QA Engineers. Sprint creation, start, completion, and date/goal updates are role-gated and validate UUIDs, dates, and state transitions; sprint completion and batch task changes use Prisma transactions with activity records. Starting a second sprint while one is active is rejected. Completing a sprint moves unfinished tasks either to the backlog or to a selected planned sprint. Tasks can be assigned to milestones only within the same project, and milestone progress is derived from linked task statuses.

The shared `POST /api/v1/tasks` endpoint follows the same Admin/PM and project-membership restrictions. The shared task update endpoint allows team task-status changes but only project managers can change priority, sprint placement, or assignee.

The schema migrations `20261026010000_pm_workspace` and `20261028000000_milestone_task_grouping` add project keys/timelines, task backlog ordering/tags, milestones, and the task-to-milestone relation. Later developer execution/comment migrations add effort tracking, checklists, PR metadata, and comment replies. Apply migrations with `npx prisma migrate deploy` before using this UI.

## Metrics and current boundaries

Sprint progress and burndown indicators are computed from the current task state. Velocity is derived from completed tasks still associated with completed sprints; historical point-in-time burndown snapshots are not stored. Activity refreshes on a 30-second polling interval. The application has no tenant-scoped user membership model, so the eligible team directory is global to the existing workspace and this module does not establish multi-tenant isolation. Task exports are CSV and sprint summaries are JSON.
