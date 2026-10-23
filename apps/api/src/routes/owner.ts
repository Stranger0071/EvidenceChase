import { prepareUploadsSchema, submitEvidenceSchema } from '@evidencechase/shared';
import { Router, type RequestHandler } from 'express';
import { parseInput } from '../lib/validate';
import { ownerToken, requireOwnerToken } from '../middleware/ownerAuth';
import type { OwnerService } from '../services/ownerService';
import type { TokenService } from '../services/tokenService';

/**
 * Control-owner routes (/e/*). Authenticated by the magic-link token header, not a session
 * cookie, so they need no CSRF origin check: browsers never attach that header on their own.
 */
export function createOwnerRouter(deps: {
  ownerService: OwnerService;
  tokenService: TokenService;
  rateLimit: RequestHandler;
}): Router {
  const { ownerService } = deps;
  const router = Router();
  router.use(deps.rateLimit, requireOwnerToken(deps.tokenService));

  router.get('/request', async (_req, res) => {
    res.json(await ownerService.getPortal(ownerToken(res)));
  });

  router.post('/uploads', async (req, res) => {
    const { files } = parseInput(prepareUploadsSchema, req.body);
    const uploads = await ownerService.prepareUploads(ownerToken(res), files);
    res.status(201).json({ uploads });
  });

  router.post('/submit', async (req, res) => {
    const input = parseInput(submitEvidenceSchema, req.body);
    const submission = await ownerService.submit(ownerToken(res), input, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(201).json({ submission });
  });

  return router;
}
