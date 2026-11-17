# Developer workspace

The developer home is `/dashboard/developer`, backed by `GET /api/v1/developer/workspace`. Developers receive only their own assigned tasks and bugs; Admins can view developer-assigned work across the workspace, and PMs are scoped to projects where they have a PM membership.

Task execution updates use `PATCH /api/v1/tasks/:id/status`. Developers can update only assigned tasks and follow the task transition workflow. A task needs implementation notes or an HTTPS pull-request URL before it can enter review or be marked done. Status changes and activity records are committed in one transaction.

Effort entries (`POST /api/v1/developer/tasks/:taskId/effort`) are developer-only and atomically update actual task hours and activity history. Checklists are stored as task checklist items and are scoped to the assignee, project PM, or Admin. Bug fixes are submitted through `PUT /api/v1/bugs/:id`; developers can update only assigned bugs, and a fix requires resolution notes plus an HTTPS PR URL or a hexadecimal commit hash. The fix status, audit activity, and reporter notification are committed together.

Tasks and bugs expose root comments and one level of replies as a lightweight Markdown-text collaboration thread. Reply targets must belong to the same task or bug, and comment records and activity events are written transactionally. No VCS webhook or commit parsing is implemented; PR URLs and commit hashes are developer-supplied metadata.

Apply the developer execution and threaded-comment migrations with `npx prisma migrate deploy` from the backend directory before using these additions.
