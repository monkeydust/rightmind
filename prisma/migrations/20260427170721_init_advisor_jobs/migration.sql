-- CreateTable
CREATE TABLE "AdvisorJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challenge" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL DEFAULT 'instant',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" TEXT NOT NULL DEFAULT '[]',
    "report" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AgentResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "agentRole" TEXT NOT NULL,
    "agentModel" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "phase" TEXT,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentResponse_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AdvisorJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
