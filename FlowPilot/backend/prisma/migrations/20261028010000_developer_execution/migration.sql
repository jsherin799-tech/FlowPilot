ALTER TABLE "Task"
ADD COLUMN "estimatedHours" DOUBLE PRECISION,
ADD COLUMN "actualHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "pullRequestUrl" TEXT;

ALTER TABLE "Bug"
ADD COLUMN "resolutionNotes" TEXT,
ADD COLUMN "pullRequestUrl" TEXT,
ADD COLUMN "commitHash" TEXT;

CREATE TABLE "TaskChecklistItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskEffortLog" (
    "id" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskEffortLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskChecklistItem_taskId_sortOrder_idx" ON "TaskChecklistItem"("taskId", "sortOrder");
CREATE INDEX "TaskEffortLog_taskId_createdAt_idx" ON "TaskEffortLog"("taskId", "createdAt");
CREATE INDEX "TaskEffortLog_userId_createdAt_idx" ON "TaskEffortLog"("userId", "createdAt");

ALTER TABLE "TaskChecklistItem"
ADD CONSTRAINT "TaskChecklistItem_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskEffortLog"
ADD CONSTRAINT "TaskEffortLog_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskEffortLog"
ADD CONSTRAINT "TaskEffortLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
