import { auditInputSchema, auditUpdateSchema } from '@evidencechase/shared';
import { Router } from 'express';
import { parseId, parseInput } from '../lib/validate';
import { currentUserId, requireManager } from '../middleware/auth';
import type { AuditService } from '../services/auditService';

export function createAuditsRouter(auditService: AuditService): Router {
  const router = Router();
  router.use(requireManager);

  router.get('/', async (req, res) => {
    const audits = await auditService.list(currentUserId(req));
    res.json({ audits });
  });

  router.post('/', async (req, res) => {
    const data = parseInput(auditInputSchema, req.body);
    const audit = await auditService.create(currentUserId(req), data);
    res.status(201).json({ audit });
  });

  router.get('/:auditId', async (req, res) => {
    const audit = await auditService.get(currentUserId(req), parseId(req.params.auditId, 'Audit'));
    res.json({ audit });
  });

  router.patch('/:auditId', async (req, res) => {
    const auditId = parseId(req.params.auditId, 'Audit');
    const data = parseInput(auditUpdateSchema, req.body);
    const audit = await auditService.update(currentUserId(req), auditId, data);
    res.json({ audit });
  });

  router.post('/:auditId/archive', async (req, res) => {
    const audit = await auditService.archive(
      currentUserId(req),
      parseId(req.params.auditId, 'Audit'),
    );
    res.json({ audit });
  });

  return router;
}
