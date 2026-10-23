import type { PrismaClient } from '@prisma/client';
import { createActivityRepository } from './activityRepository';
import { createAuditRepository } from './auditRepository';
import { createFileRepository } from './fileRepository';
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
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
