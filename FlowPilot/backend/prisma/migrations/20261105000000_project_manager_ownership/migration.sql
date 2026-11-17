ALTER TABLE "Project"
ADD COLUMN "pmId" TEXT;

UPDATE "Project" AS project
SET "pmId" = (
    SELECT member."userId"
    FROM "ProjectMember" AS member
    JOIN "User" AS manager ON manager."id" = member."userId"
    WHERE member."projectId" = project."id"
      AND member."role" = 'PROJECT_MANAGER'
      AND manager."role" = 'PROJECT_MANAGER'
    ORDER BY member."joinedAt", member."userId"
    LIMIT 1
);

CREATE INDEX "Project_pmId_idx" ON "Project"("pmId");
CREATE INDEX "Task_projectId_assigneeId_idx" ON "Task"("projectId", "assigneeId");
CREATE INDEX "Bug_projectId_assigneeId_idx" ON "Bug"("projectId", "assigneeId");

ALTER TABLE "Task"
ADD COLUMN "qaAssigneeId" TEXT;

CREATE INDEX "Task_projectId_qaAssigneeId_idx" ON "Task"("projectId", "qaAssigneeId");

ALTER TABLE "Task"
ADD CONSTRAINT "Task_qaAssigneeId_fkey"
FOREIGN KEY ("qaAssigneeId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project"
ADD CONSTRAINT "Project_pmId_fkey"
FOREIGN KEY ("pmId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
