# Quality assurance workspace

The QA dashboard is `/dashboard/qa`, with bug logging at `/dashboard/bugs` and retest actions at `/dashboard/qa/retests`. The `/api/v1/qa` routes require an active QA Engineer, Project Manager, or Admin. New bug reports use `POST /api/v1/bugs`, which is restricted to those same roles.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/qa/overview` | Open-bug totals, severity counts, resolution rate, retest queue, and pending verification feed; accepts an optional project UUID |
| `POST` | `/api/v1/qa/bugs/:id/retest` | Record a passing or failing retest outcome for a bug in `RETEST` |
| `GET`, `POST` | `/api/v1/bugs` | Read bugs or create a report with reproduction, expected/actual results, environment, HTTPS attachment links, severity, optional task, and optional developer assignee |

Bug creation, its activity event, and any assignee notification are persisted in one Prisma transaction. A linked task routes a report to its assigned Developer when possible; otherwise the issue remains unassigned in the project backlog. Explicit assignees must be active Developers on the selected project, and linked tasks must belong to that same project.

The normal developer fix handoff remains `FIXED` with resolution notes and a pull-request URL or commit hash. An authorized QA Engineer, Project Manager, or Admin then moves the bug to `RETEST`. A passing retest records the outcome and closes the bug; a failing retest requires notes, reopens it, and stores the rejection details in the activity log. Retest state changes and their activity records are atomic. Closing or reopening a bug directly from `RETEST` through the general update route is rejected.

Tasks cannot transition to `DONE` while linked `BLOCKER` or `CRITICAL` bugs remain unverified. Sprint completion is blocked while any project `BLOCKER` or `CRITICAL` bug remains unverified. `CLOSED` and `WONT_FIX` bugs do not block these quality gates.

The migration `20261029000000_qa_bug_details` adds expected/actual results, HTTPS attachment-link metadata, and the optional bug-to-task relation. Apply migrations with `npx prisma migrate deploy` from the backend directory before using these features. Attachments are recorded as HTTPS links; this module does not upload files or integrate with an external CI/CD test runner. Test case registry and automated test execution are not included.
