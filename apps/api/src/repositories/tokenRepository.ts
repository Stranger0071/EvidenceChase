import type { AccessToken, Prisma, PrismaClient } from '@prisma/client';

const withRequestAndAudit = {
  request: {
    include: {
      audit: { include: { owner: { select: { email: true, name: true } } } },
    },
  },
} satisfies Prisma.AccessTokenInclude;

/** A token with the request it opens, that request's audit, and the audit's manager. */
export type TokenWithRequest = Prisma.AccessTokenGetPayload<{
  include: typeof withRequestAndAudit;
}>;

export function createTokenRepository(prisma: PrismaClient) {
  return {
    create(requestId: string, tokenHash: string, expiresAt: Date): Promise<AccessToken> {
      return prisma.accessToken.create({ data: { requestId, tokenHash, expiresAt } });
    },

    /** Looked up by hash: the token itself is never stored, so a database leak opens nothing. */
    findByHash(tokenHash: string): Promise<TokenWithRequest | null> {
      return prisma.accessToken.findUnique({ where: { tokenHash }, include: withRequestAndAudit });
    },

    async touchLastUsed(id: string, at: Date): Promise<void> {
      await prisma.accessToken.update({ where: { id }, data: { lastUsedAt: at } });
    },
  };
}

export type TokenRepository = ReturnType<typeof createTokenRepository>;
