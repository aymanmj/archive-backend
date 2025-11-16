-- CreateTable
CREATE TABLE "SlaSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "dueSoonHours" INTEGER NOT NULL DEFAULT 24,
    "overdueHours" INTEGER NOT NULL DEFAULT 0,
    "escalateL1Minutes" INTEGER NOT NULL DEFAULT 60,
    "escalateL2Minutes" INTEGER NOT NULL DEFAULT 120,
    "escalateL3Minutes" INTEGER NOT NULL DEFAULT 240,
    "escalateL4Minutes" INTEGER NOT NULL DEFAULT 480,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaSettings_pkey" PRIMARY KEY ("id")
);
