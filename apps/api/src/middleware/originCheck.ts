import type { RequestHandler } from 'express';
import { ForbiddenError } from '../errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection. Browsers always send an `Origin` header on state-changing requests, so any
 * POST/PATCH/DELETE that doesn't come from the web app is refused. This backs up the
 * `sameSite=lax` session cookie.
 */
export function originCheck(allowedOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.get('origin') !== allowedOrigin) {
      throw new ForbiddenError('Cross-site request refused');
    }
    next();
  };
}
