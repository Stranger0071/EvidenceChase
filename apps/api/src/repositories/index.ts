import type { PrismaClient } from '@prisma/client';
import { createAuditRepository } from './auditRepository';
import { createRequestRepository } from './requestRepository';
import { createUserRepository } from './userRepository';

export function createRepositories(prisma: PrismaClient) {
  return {
    users: createUserRepository(prisma),
    audits: createAuditRepository(prisma),
    requests: createRequestRepository(prisma),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
