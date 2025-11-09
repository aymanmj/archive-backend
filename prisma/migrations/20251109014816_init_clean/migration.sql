-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('Draft', 'Registered', 'UnderReview', 'Completed', 'Archived', 'Rejected');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('Open', 'InProgress', 'Closed', 'Escalated');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('InProgress', 'Completed', 'Cancelled');

-- CreateEnum
CREATE TYPE "WorkflowActionType" AS ENUM ('REVIEWED', 'FORWARDED', 'APPROVED', 'REJECTED', 'COMMENT');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('Hand', 'Mail', 'Email', 'Courier', 'Fax', 'ElectronicSystem');

-- CreateEnum
CREATE TYPE "UrgencyLevel" AS ENUM ('Low', 'Normal', 'High', 'Urgent');

-- CreateTable
CREATE TABLE "Department" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "parentDepartmentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" INTEGER,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "departmentId" INTEGER,
    "securityClearanceRank" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityLevel" (
    "id" SERIAL NOT NULL,
    "levelName" TEXT NOT NULL,
    "description" TEXT,
    "rankOrder" INTEGER NOT NULL,

    CONSTRAINT "SecurityLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" SERIAL NOT NULL,
    "typeName" TEXT NOT NULL,
    "isIncomingType" BOOLEAN NOT NULL DEFAULT false,
    "isOutgoingType" BOOLEAN NOT NULL DEFAULT false,
    "isInternalMemo" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" BIGSERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "currentStatus" "DocumentStatus" NOT NULL DEFAULT 'Draft',
    "isPhysicalCopyExists" BOOLEAN NOT NULL DEFAULT false,
    "physicalLocation" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "documentTypeId" INTEGER NOT NULL,
    "securityLevelId" INTEGER NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "owningDepartmentId" INTEGER NOT NULL,
    "searchVector" tsvector,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFile" (
    "id" BIGSERIAL NOT NULL,
    "documentId" BIGINT NOT NULL,
    "fileNameOriginal" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileExtension" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "checksumHash" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "isLatestVersion" BOOLEAN NOT NULL DEFAULT true,
    "uploadedByUserId" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalParty" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "contactInfo" TEXT,
    "status" TEXT DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExternalParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingRecord" (
    "id" BIGSERIAL NOT NULL,
    "documentId" BIGINT NOT NULL,
    "externalPartyId" INTEGER NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "receivedByUserId" INTEGER NOT NULL,
    "incomingNumber" TEXT NOT NULL,
    "deliveryMethod" "DeliveryMethod" NOT NULL,
    "urgencyLevel" "UrgencyLevel",
    "requiredAction" TEXT,
    "dueDateForResponse" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedat" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingDistribution" (
    "id" BIGSERIAL NOT NULL,
    "incomingId" BIGINT NOT NULL,
    "targetDepartmentId" INTEGER NOT NULL,
    "assignedToUserId" INTEGER,
    "status" "DistributionStatus" NOT NULL DEFAULT 'Open',
    "notes" TEXT,
    "lastUpdateAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditTrail" (
    "id" BIGSERIAL NOT NULL,
    "documentId" BIGINT,
    "userId" INTEGER,
    "actionType" TEXT NOT NULL,
    "actionDescription" TEXT,
    "actionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromIP" TEXT,
    "workstationName" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,

    CONSTRAINT "AuditTrail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentMetadata" (
    "id" BIGSERIAL NOT NULL,
    "documentId" BIGINT NOT NULL,
    "metaKey" TEXT NOT NULL,
    "metaValue" TEXT NOT NULL,
    "isSearchable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DocumentMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTag" (
    "id" SERIAL NOT NULL,
    "tagName" TEXT NOT NULL,

    CONSTRAINT "DocumentTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTagLink" (
    "id" BIGSERIAL NOT NULL,
    "documentId" BIGINT NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "DocumentTagLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutgoingRecord" (
    "id" BIGSERIAL NOT NULL,
    "documentId" BIGINT NOT NULL,
    "externalPartyId" INTEGER NOT NULL,
    "outgoingNumber" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "signedByUserId" INTEGER NOT NULL,
    "sendMethod" "DeliveryMethod" NOT NULL,
    "isDelivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveryProofPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutgoingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "roleName" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowInstance" (
    "id" BIGSERIAL NOT NULL,
    "documentId" BIGINT NOT NULL,
    "currentStep" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'InProgress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "currentAssigneeUserId" INTEGER,

    CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStepAction" (
    "id" BIGSERIAL NOT NULL,
    "workflowId" BIGINT NOT NULL,
    "stepName" TEXT NOT NULL,
    "actionType" "WorkflowActionType" NOT NULL,
    "actionByUserId" INTEGER NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "requiredNextStep" TEXT,

    CONSTRAINT "WorkflowStepAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingDistributionLog" (
    "id" BIGSERIAL NOT NULL,
    "distributionId" BIGINT NOT NULL,
    "oldStatus" "DistributionStatus",
    "newStatus" "DistributionStatus",
    "note" TEXT,
    "updatedByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingDistributionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NumberSequence" (
    "id" SERIAL NOT NULL,
    "scope" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OCRText" (
    "id" BIGSERIAL NOT NULL,
    "documentId" BIGINT NOT NULL,
    "textContent" TEXT NOT NULL,
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OCRText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" SERIAL NOT NULL,
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Department_status_idx" ON "Department"("status");

-- CreateIndex
CREATE INDEX "Department_parentDepartmentId_idx" ON "Department"("parentDepartmentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_securityClearanceRank_idx" ON "User"("securityClearanceRank");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "SecurityLevel_levelName_idx" ON "SecurityLevel"("levelName");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityLevel_rankOrder_key" ON "SecurityLevel"("rankOrder");

-- CreateIndex
CREATE INDEX "DocumentType_isIncomingType_idx" ON "DocumentType"("isIncomingType");

-- CreateIndex
CREATE INDEX "DocumentType_isOutgoingType_idx" ON "DocumentType"("isOutgoingType");

-- CreateIndex
CREATE INDEX "DocumentType_isInternalMemo_idx" ON "DocumentType"("isInternalMemo");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_typeName_key" ON "DocumentType"("typeName");

-- CreateIndex
CREATE INDEX "Document_currentStatus_idx" ON "Document"("currentStatus");

-- CreateIndex
CREATE INDEX "Document_owningDepartmentId_idx" ON "Document"("owningDepartmentId");

-- CreateIndex
CREATE INDEX "Document_createdAt_idx" ON "Document"("createdAt");

-- CreateIndex
CREATE INDEX "Document_securityLevelId_idx" ON "Document"("securityLevelId");

-- CreateIndex
CREATE INDEX "Document_documentTypeId_idx" ON "Document"("documentTypeId");

-- CreateIndex
CREATE INDEX "Document_searchVector_idx" ON "Document" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "DocumentFile_documentId_isLatestVersion_versionNumber_idx" ON "DocumentFile"("documentId", "isLatestVersion", "versionNumber");

-- CreateIndex
CREATE INDEX "DocumentFile_checksumHash_idx" ON "DocumentFile"("checksumHash");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFile_documentId_versionNumber_key" ON "DocumentFile"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "ExternalParty_status_idx" ON "ExternalParty"("status");

-- CreateIndex
CREATE INDEX "ExternalParty_name_idx" ON "ExternalParty"("name");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingRecord_documentId_key" ON "IncomingRecord"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingRecord_incomingNumber_key" ON "IncomingRecord"("incomingNumber");

-- CreateIndex
CREATE INDEX "IncomingRecord_receivedDate_idx" ON "IncomingRecord"("receivedDate");

-- CreateIndex
CREATE INDEX "IncomingRecord_externalPartyId_idx" ON "IncomingRecord"("externalPartyId");

-- CreateIndex
CREATE INDEX "IncomingDistribution_targetDepartmentId_idx" ON "IncomingDistribution"("targetDepartmentId");

-- CreateIndex
CREATE INDEX "IncomingDistribution_status_idx" ON "IncomingDistribution"("status");

-- CreateIndex
CREATE INDEX "IncomingDistribution_targetDepartmentId_status_lastUpdateAt_idx" ON "IncomingDistribution"("targetDepartmentId", "status", "lastUpdateAt");

-- CreateIndex
CREATE INDEX "IncomingDistribution_createdAt_idx" ON "IncomingDistribution"("createdAt");

-- CreateIndex
CREATE INDEX "AuditTrail_documentId_idx" ON "AuditTrail"("documentId");

-- CreateIndex
CREATE INDEX "AuditTrail_userId_idx" ON "AuditTrail"("userId");

-- CreateIndex
CREATE INDEX "AuditTrail_actionAt_idx" ON "AuditTrail"("actionAt");

-- CreateIndex
CREATE INDEX "AuditTrail_correlationId_idx" ON "AuditTrail"("correlationId");

-- CreateIndex
CREATE INDEX "DocumentMetadata_metaKey_idx" ON "DocumentMetadata"("metaKey");

-- CreateIndex
CREATE INDEX "DocumentMetadata_metaValue_idx" ON "DocumentMetadata"("metaValue");

-- CreateIndex
CREATE INDEX "DocumentMetadata_documentId_metaKey_idx" ON "DocumentMetadata"("documentId", "metaKey");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTag_tagName_key" ON "DocumentTag"("tagName");

-- CreateIndex
CREATE INDEX "DocumentTagLink_tagId_idx" ON "DocumentTagLink"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTagLink_documentId_tagId_key" ON "DocumentTagLink"("documentId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "OutgoingRecord_documentId_key" ON "OutgoingRecord"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "OutgoingRecord_outgoingNumber_key" ON "OutgoingRecord"("outgoingNumber");

-- CreateIndex
CREATE INDEX "OutgoingRecord_issueDate_idx" ON "OutgoingRecord"("issueDate");

-- CreateIndex
CREATE INDEX "OutgoingRecord_externalPartyId_idx" ON "OutgoingRecord"("externalPartyId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_roleName_key" ON "Role"("roleName");

-- CreateIndex
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE INDEX "WorkflowInstance_status_idx" ON "WorkflowInstance"("status");

-- CreateIndex
CREATE INDEX "WorkflowInstance_currentAssigneeUserId_idx" ON "WorkflowInstance"("currentAssigneeUserId");

-- CreateIndex
CREATE INDEX "WorkflowInstance_documentId_idx" ON "WorkflowInstance"("documentId");

-- CreateIndex
CREATE INDEX "WorkflowStepAction_workflowId_idx" ON "WorkflowStepAction"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowStepAction_actionByUserId_idx" ON "WorkflowStepAction"("actionByUserId");

-- CreateIndex
CREATE INDEX "WorkflowStepAction_actionAt_idx" ON "WorkflowStepAction"("actionAt");

-- CreateIndex
CREATE INDEX "IncomingDistributionLog_distributionId_idx" ON "IncomingDistributionLog"("distributionId");

-- CreateIndex
CREATE INDEX "IncomingDistributionLog_createdAt_idx" ON "IncomingDistributionLog"("createdAt");

-- CreateIndex
CREATE INDEX "IncomingDistributionLog_updatedByUserId_idx" ON "IncomingDistributionLog"("updatedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "NumberSequence_scope_key" ON "NumberSequence"("scope");

-- CreateIndex
CREATE INDEX "NumberSequence_scope_idx" ON "NumberSequence"("scope");

-- CreateIndex
CREATE INDEX "OCRText_documentId_idx" ON "OCRText"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentDepartmentId_fkey" FOREIGN KEY ("parentDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_owningDepartmentId_fkey" FOREIGN KEY ("owningDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_securityLevelId_fkey" FOREIGN KEY ("securityLevelId") REFERENCES "SecurityLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingRecord" ADD CONSTRAINT "IncomingRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingRecord" ADD CONSTRAINT "IncomingRecord_externalPartyId_fkey" FOREIGN KEY ("externalPartyId") REFERENCES "ExternalParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingRecord" ADD CONSTRAINT "IncomingRecord_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingDistribution" ADD CONSTRAINT "IncomingDistribution_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingDistribution" ADD CONSTRAINT "IncomingDistribution_incomingId_fkey" FOREIGN KEY ("incomingId") REFERENCES "IncomingRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingDistribution" ADD CONSTRAINT "IncomingDistribution_targetDepartmentId_fkey" FOREIGN KEY ("targetDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditTrail" ADD CONSTRAINT "AuditTrail_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditTrail" ADD CONSTRAINT "AuditTrail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentMetadata" ADD CONSTRAINT "DocumentMetadata_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTagLink" ADD CONSTRAINT "DocumentTagLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTagLink" ADD CONSTRAINT "DocumentTagLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "DocumentTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingRecord" ADD CONSTRAINT "OutgoingRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingRecord" ADD CONSTRAINT "OutgoingRecord_externalPartyId_fkey" FOREIGN KEY ("externalPartyId") REFERENCES "ExternalParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingRecord" ADD CONSTRAINT "OutgoingRecord_signedByUserId_fkey" FOREIGN KEY ("signedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_currentAssigneeUserId_fkey" FOREIGN KEY ("currentAssigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStepAction" ADD CONSTRAINT "WorkflowStepAction_actionByUserId_fkey" FOREIGN KEY ("actionByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStepAction" ADD CONSTRAINT "WorkflowStepAction_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingDistributionLog" ADD CONSTRAINT "IncomingDistributionLog_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "IncomingDistribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingDistributionLog" ADD CONSTRAINT "IncomingDistributionLog_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OCRText" ADD CONSTRAINT "OCRText_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
