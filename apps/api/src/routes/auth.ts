import { loginInputSchema, signupInputSchema } from '@evidencechase/shared';
import { SESSION_COOKIE_NAME } from '@evidencechase/shared/constants';
import { Router } from 'express';
import { UnauthorizedError } from '../errors';
import { destroySession, sessionCookieOptions, startSession } from '../lib/session';
import { parseInput } from '../lib/validate';
import { currentUserId, requireManager } from '../middleware/auth';
import type { RateLimits } from '../middleware/rateLimits';
import type { AuthService } from '../services/authService';

export function createAuthRouter(deps: {
  authService: AuthService;
  rateLimits: RateLimits;
  secureCookies: boolean;
}): Router {
  const { authService, rateLimits } = deps;
  const router = Router();

  router.post('/signup', rateLimits.signup, async (req, res) => {
    const input = parseInput(signupInputSchema, req.body);
    const user = await authService.signup(input);
    await startSession(req, user.id);
    res.status(201).json({ user });
  });

  router.post('/login', rateLimits.login, async (req, res) => {
    const input = parseInput(loginInputSchema, req.body);
    const user = await authService.login(input);
    await startSession(req, user.id);
    res.json({ user });
  });

  router.post('/logout', async (req, res) => {
    await destroySession(req);
    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions(deps.secureCookies));
    res.status(204).end();
  });

  router.get('/me', requireManager, async (req, res) => {
    const user = await authService.getUser(currentUserId(req));
    if (!user) {
      // The account no longer exists, so the session is stale.
      await destroySession(req);
      throw new UnauthorizedError();
    }
    res.json({ user });
  });

  return router;
}
