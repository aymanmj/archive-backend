-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('info', 'warning', 'danger');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('Unread', 'Read');

-- CreateTable
CREATE TABLE "EscalationPolicy" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationLevel" (
    "id" SERIAL NOT NULL,
    "policyId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "thresholdMinutes" INTEGER NOT NULL,
    "priorityBump" INTEGER NOT NULL DEFAULT 1,
    "statusOnReach" "DistributionStatus" DEFAULT 'Escalated',
    "requireDelayReason" BOOLEAN NOT NULL DEFAULT false,
    "autoReassign" BOOLEAN NOT NULL DEFAULT false,
    "notifyAssignee" BOOLEAN NOT NULL DEFAULT true,
    "notifyManager" BOOLEAN NOT NULL DEFAULT true,
    "notifyAdmin" BOOLEAN NOT NULL DEFAULT false,
    "throttleMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalationLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'info',
    "status" "NotificationStatus" NOT NULL DEFAULT 'Unread',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EscalationPolicy_name_key" ON "EscalationPolicy"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationLevel_policyId_level_key" ON "EscalationLevel"("policyId", "level");

-- CreateIndex
CREATE INDEX "Notification_userId_status_createdAt_idx" ON "Notification"("userId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "EscalationLevel" ADD CONSTRAINT "EscalationLevel_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "EscalationPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
