import type { Request, RequestHandler } from 'express';
import { UnauthorizedError } from '../errors';

/** Rejects requests without a signed-in manager. */
export const requireManager: RequestHandler = (req, _res, next) => {
  if (!req.session.userId) throw new UnauthorizedError();
  next();
};

/** The signed-in manager's user ID. Only call it behind `requireManager`. */
export function currentUserId(req: Request): string {
  const userId = req.session.userId;
  if (!userId) throw new UnauthorizedError();
  return userId;
}
