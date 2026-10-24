import type { PrismaClient } from '@prisma/client';
import { createActivityRepository } from './activityRepository';
import { createAuditRepository } from './auditRepository';
import { createExportRepository } from './exportRepository';
import { createFileRepository } from './fileRepository';
import { createReminderRepository } from './reminderRepository';
import { createRequestRepository } from './requestRepository';
import { createSubmissionRepository } from './submissionRepository';
import { createTokenRepository } from './tokenRepository';
import { createUserRepository } from './userRepository';

export function createRepositories(prisma: PrismaClient) {
  return {
    users: createUserRepository(prisma),
    audits: createAuditRepository(prisma),
    requests: createRequestRepository(prisma),
    tokens: createTokenRepository(prisma),
    files: createFileRepository(prisma),
    submissions: createSubmissionRepository(prisma),
    activity: createActivityRepository(prisma),
    reminders: createReminderRepository(prisma),
    exports: createExportRepository(prisma),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
