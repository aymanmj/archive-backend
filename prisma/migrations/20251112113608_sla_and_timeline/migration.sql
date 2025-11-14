-- AlterTable
ALTER TABLE "IncomingDistribution" ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "escalationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" BIGSERIAL NOT NULL,
    "docId" BIGINT NOT NULL,
    "docType" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "eventType" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimelineEvent_docType_docId_createdAt_idx" ON "TimelineEvent"("docType", "docId", "createdAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_createdAt_idx" ON "TimelineEvent"("createdAt");

-- CreateIndex
CREATE INDEX "IncomingDistribution_dueAt_idx" ON "IncomingDistribution"("dueAt");

-- CreateIndex
CREATE INDEX "IncomingDistribution_status_dueAt_idx" ON "IncomingDistribution"("status", "dueAt");
