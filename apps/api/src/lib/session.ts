import { SESSION_COOKIE_NAME } from '@evidencechase/shared/constants';
import connectPgSimple from 'connect-pg-simple';
import type { Request, RequestHandler } from 'express';
import session from 'express-session';
import type { Pool } from 'pg';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const sessionCookieOptions = (secure: boolean) =>
  ({ httpOnly: true, secure, sameSite: 'lax', path: '/' }) as const;

/**
 * Server-side sessions stored in Postgres (the `session` table, managed by Prisma migrations).
 * The browser only holds an opaque, httpOnly cookie, so a script on the page can't read it, and
 * signing out deletes the row, which revokes the session immediately.
 */
export function createSessionMiddleware(options: {
  pool: Pool;
  secret: string;
  secure: boolean;
  pruneExpired: boolean;
}): RequestHandler {
  const PgStore = connectPgSimple(session);
  return session({
    store: new PgStore({
      pool: options.pool,
      tableName: 'session',
      createTableIfMissing: false,
      // Delete expired rows every 15 minutes. Off in tests so no timer keeps the process alive.
      pruneSessionInterval: options.pruneExpired ? 15 * 60 : false,
    }),
    name: SESSION_COOKIE_NAME,
    secret: options.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { ...sessionCookieOptions(options.secure), maxAge: SESSION_MAX_AGE_MS },
  });
}

/**
 * Signs a user in. The session ID is regenerated first, so an ID planted before login (session
 * fixation) is never upgraded to an authenticated session.
 */
export async function startSession(req: Request, userId: string): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
  req.session.userId = userId;
  await new Promise<void>((resolve, reject) =>
    req.session.save((error) => (error ? reject(error) : resolve())),
  );
}

export async function destroySession(req: Request): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    req.session.destroy((error) => (error ? reject(error) : resolve())),
  );
}
