import type { RequestHandler } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DomainError, UnauthorizedError } from '../errors';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Protects /internal/cron/* with `Authorization: Bearer <CRON_SECRET>`. Both sides are hashed
 * first so they're the same length, then compared in constant time, so response timing reveals
 * nothing about the secret. Without a configured secret the routes are switched off entirely.
 */
export function requireCronSecret(secret: string | undefined): RequestHandler {
  const expected = secret ? digest(secret) : null;
  return (req, _res, next) => {
    if (!expected) throw new DomainError(503, 'CRON_DISABLED', 'Scheduled jobs are not configured');

    const header = req.get('authorization') ?? '';
    const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!provided || !timingSafeEqual(digest(provided), expected))
      throw new UnauthorizedError('Invalid cron secret');
    next();
  };
}
