ALTER TABLE "Task"
ADD COLUMN "milestoneId" TEXT;

CREATE INDEX "Task_projectId_milestoneId_idx" ON "Task"("projectId", "milestoneId");

ALTER TABLE "Task"
ADD CONSTRAINT "Task_milestoneId_fkey"
FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
