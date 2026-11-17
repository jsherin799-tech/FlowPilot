# Admin governance API

All routes below are mounted at `/api/v1/admin` and require a valid bearer token for an active user whose **current database role** is `ADMIN`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/overview` | Workspace counts, overdue/unassigned work, critical bugs, completion trend, recent admin events |
| `GET`, `PUT` | `/organization` | Read or update the workspace profile and defaults |
| `GET` | `/members` | Search and paginate the member directory |
| `PATCH` | `/members/:userId` | Change a role or deactivate/reactivate a member |
| `GET` | `/projects` | Search the global project registry and health counts |
| `PATCH` | `/projects/:projectId` | Change project lifecycle status |
| `DELETE` | `/projects/:projectId` | Permanently delete a project; request body must contain its exact name as `confirmation` |
| `GET` | `/work-items` | Search/filter tasks and bugs across projects |
| `PATCH` | `/work-items/:type/:itemId` | Reassign a task or bug and/or change its priority |
| `GET` | `/audit` | Paginated admin audit records; `?format=csv` downloads up to 5,000 matching events |

Role changes, member status changes, workspace settings, project lifecycle/deletion, and work-item governance are committed with their audit event in one Prisma transaction. Member deactivation also unassigns their tasks and bugs and removes project memberships. The final active administrator cannot be demoted or deactivated. Audit records are protected by a database trigger that rejects updates and deletes.

Apply the schema change with the normal deployment migration step (`npx prisma migrate deploy`) before deploying code that uses these endpoints.

## Current architecture boundaries

The existing product data model has global users and optional project-to-organization links, but no organization membership or tenant-scoped foreign keys. These admin endpoints therefore operate on the existing global dataset; they do **not** provide multi-tenant data isolation. The workspace preference fields for invitation policy, timezone, date format, and language are stored, but only the default registration role and default project status are currently applied by their respective flows.

There is no configured email delivery/invitation acceptance flow, integration-secret store, session registry/timeout enforcement, MFA state, or login-anomaly feed. Analytics currently cover task counts and a weekly completion trend; the audit trail supports CSV export, not analytics exports.
