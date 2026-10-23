import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../config/env';
import { ForbiddenError, UnauthorizedError } from '../errors';
import type { Logger } from '../lib/logger';
import type { Repositories } from '../repositories';
import type { TokenWithRequest } from '../repositories/tokenRepository';
import type { Clock } from './auditService';

const TOKEN_BYTES = 32;
export const TOKEN_TTL_DAYS = 30;

/**
 * Tokens are 256 random bits, so a fast hash is the right choice (unlike passwords, they can't be
 * guessed, so a slow hash like bcrypt adds nothing). It also allows an indexed lookup by hash.
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Owner magic links (PRD §9.4): one token per request, valid for 30 days, revocable. Only the
 * hash is stored, so a database leak doesn't expose working links.
 */
export function createTokenService(
  { tokens }: Repositories,
  env: Env,
  logger: Logger,
  clock: Clock = () => new Date(),
) {
  return {
    async issue(requestId: string): Promise<{ url: string; expiresAt: Date }> {
      const raw = randomBytes(TOKEN_BYTES).toString('base64url');
      const expiresAt = new Date(clock().getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
      await tokens.create(requestId, hashToken(raw), expiresAt);
      return { url: `${env.WEB_ORIGIN}/e/${raw}`, expiresAt };
    },

    /** Resolves a token from the X-Access-Token header, or throws with a code the portal can explain. */
    async validate(raw: string | undefined): Promise<TokenWithRequest> {
      if (!raw)
        throw new UnauthorizedError('This page needs the link from your email', 'LINK_INVALID');

      const token = await tokens.findByHash(hashToken(raw));
      if (!token) {
        throw new UnauthorizedError(
          "This link isn't valid. Check that you copied all of it.",
          'LINK_INVALID',
        );
      }
      if (token.revokedAt) {
        throw new ForbiddenError(
          'This link has been replaced. Ask your compliance manager for a new one.',
          'LINK_REVOKED',
        );
      }
      if (token.expiresAt <= clock()) {
        throw new ForbiddenError(
          'This link has expired. Ask your compliance manager for a new one.',
          'LINK_EXPIRED',
        );
      }

      // Bookkeeping only: never fail or slow down the owner's request because of it.
      tokens.touchLastUsed(token.id, clock()).catch((error: unknown) => {
        logger.warn({ err: error, tokenId: token.id }, 'Could not record token use');
      });
      return token;
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
