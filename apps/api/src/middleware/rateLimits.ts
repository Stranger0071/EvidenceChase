import type { ApiErrorBody } from '@evidencechase/shared';
import { rateLimit } from 'express-rate-limit';

function limiter(windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      const body: ApiErrorBody = { error: { code: 'RATE_LIMITED', message } };
      res.status(429).json(body);
    },
  });
}

/**
 * Per-IP limits on the endpoints attackers target. Counters live in memory, which is accurate
 * because the API runs as a single instance (see PRD §9.4). Created per app so tests don't share
 * counters.
 */
export function createRateLimits() {
  return {
    login: limiter(60_000, 5, 'Too many sign-in attempts. Wait a minute and try again.'),
    signup: limiter(
      60 * 60_000,
      20,
      'Too many accounts created from this network. Try again later.',
    ),
    // Public magic-link routes: stops token guessing and upload-link spam (PRD §9.4).
    owner: limiter(60_000, 30, 'Too many requests. Wait a minute and try again.'),
  };
}

export type RateLimits = ReturnType<typeof createRateLimits>;
