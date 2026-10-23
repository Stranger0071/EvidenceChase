-- CreateEnum
CREATE TYPE "AuditFramework" AS ENUM ('SOC2', 'ISO27001', 'HIPAA', 'PCI_DSS', 'GDPR', 'INTERNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CHANGES_REQUESTED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "FileState" AS ENUM ('PENDING_UPLOAD', 'AWAITING_SCAN', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('NOT_SCANNED', 'NO_THREATS_FOUND', 'THREATS_FOUND', 'UNSUPPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('T_MINUS_7', 'T_MINUS_3', 'T_MINUS_1', 'DUE_TODAY', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('MANAGER', 'OWNER', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "framework" "AuditFramework" NOT NULL,
    "auditDate" DATE,
    "remindersOn" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRequest" (
    "id" UUID NOT NULL,
    "auditId" UUID NOT NULL,
    "controlRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "ownerName" TEXT,
    "ownerEmail" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "note" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceFile" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "submissionId" UUID,
    "state" "FileState" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'NOT_SCANNED',
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "declaredMime" TEXT NOT NULL,
    "detectedMime" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "retainUntil" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "EvidenceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessToken" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "sentOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" "RequestStatus",
    "toStatus" "RequestStatus",
    "comment" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Audit_ownerId_createdAt_idx" ON "Audit"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "EvidenceRequest_auditId_status_idx" ON "EvidenceRequest"("auditId", "status");

-- CreateIndex
CREATE INDEX "EvidenceRequest_status_dueDate_idx" ON "EvidenceRequest"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceRequest_auditId_controlRef_key" ON "EvidenceRequest"("auditId", "controlRef");

-- CreateIndex
CREATE INDEX "Submission_requestId_submittedAt_idx" ON "Submission"("requestId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceFile_storageKey_key" ON "EvidenceFile"("storageKey");

-- CreateIndex
CREATE INDEX "EvidenceFile_state_createdAt_idx" ON "EvidenceFile"("state", "createdAt");

-- CreateIndex
CREATE INDEX "EvidenceFile_submissionId_idx" ON "EvidenceFile"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessToken_tokenHash_key" ON "AccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessToken_requestId_idx" ON "AccessToken"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_requestId_kind_sentOn_key" ON "ReminderLog"("requestId", "kind", "sentOn");

-- CreateIndex
CREATE INDEX "ActivityLog_requestId_createdAt_idx" ON "ActivityLog"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "IDX_session_expire" ON "session"("expire");

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRequest" ADD CONSTRAINT "EvidenceRequest_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EvidenceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EvidenceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EvidenceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EvidenceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EvidenceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
