import { CSV_IMPORT_LIMITS, requestInputSchema, requestUpdateSchema } from '@evidencechase/shared';
import express, { Router, type Request } from 'express';
import { ValidationError } from '../errors';
import { parseId, parseInput } from '../lib/validate';
import { currentUserId, requireManager } from '../middleware/auth';
import type { RequestService } from '../services/requestService';

/** Evidence requests, nested under their audit: /audits/:auditId/requests. */
export function createRequestsRouter(requestService: RequestService): Router {
  const router = Router({ mergeParams: true });
  router.use(requireManager);

  // `auditId` comes from the parent path (mergeParams), which Express's types can't see.
  const params = (req: Request) => req.params as Record<string, string | undefined>;
  const auditIdOf = (req: Request) => parseId(params(req).auditId, 'Audit');
  const ids = (req: Request) => ({
    auditId: auditIdOf(req),
    requestId: parseId(params(req).requestId, 'Evidence request'),
  });

  router.get('/', async (req, res) => {
    const requests = await requestService.list(currentUserId(req), auditIdOf(req));
    res.json({ requests });
  });

  router.post('/', async (req, res) => {
    const auditId = auditIdOf(req);
    const data = parseInput(requestInputSchema, req.body);
    const request = await requestService.create(currentUserId(req), auditId, data);
    res.status(201).json({ request });
  });

  // The CSV is sent as raw `text/csv`, so its own (larger) body limit applies here only.
  router.post(
    '/import',
    express.text({ type: 'text/csv', limit: CSV_IMPORT_LIMITS.maxBytes }),
    async (req, res) => {
      const auditId = auditIdOf(req);
      if (typeof req.body !== 'string' || req.body.trim() === '') {
        throw new ValidationError('Send the CSV file as text/csv');
      }
      const imported = await requestService.importCsv(currentUserId(req), auditId, req.body);
      res.status(201).json({ imported });
    },
  );

  router.patch('/:requestId', async (req, res) => {
    const { auditId, requestId } = ids(req);
    const data = parseInput(requestUpdateSchema, req.body);
    const request = await requestService.update(currentUserId(req), auditId, requestId, data);
    res.json({ request });
  });

  router.delete('/:requestId', async (req, res) => {
    const { auditId, requestId } = ids(req);
    await requestService.remove(currentUserId(req), auditId, requestId);
    res.status(204).end();
  });

  return router;
}
