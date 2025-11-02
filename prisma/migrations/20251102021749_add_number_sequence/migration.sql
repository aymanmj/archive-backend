-- CreateTable
CREATE TABLE "NumberSequence" (
    "id" SERIAL NOT NULL,
    "scope" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NumberSequence_scope_key" ON "NumberSequence"("scope");

-- CreateIndex
CREATE INDEX "NumberSequence_scope_idx" ON "NumberSequence"("scope");
