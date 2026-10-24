import { auditInputSchema, auditUpdateSchema, exportLinkSchema } from '@evidencechase/shared';
import { Router } from 'express';
import { parseId, parseInput } from '../lib/validate';
import { currentUserId, requireManager } from '../middleware/auth';
import type { AuditService } from '../services/auditService';
import type { ExportService } from '../services/exportService';

export function createAuditsRouter(
  auditService: AuditService,
  exportService: ExportService,
): Router {
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

  // A 60-second signed link that downloads the evidence pack straight from the API.
  router.post('/:auditId/export-link', async (req, res) => {
    const { scope } = parseInput(exportLinkSchema, req.body ?? {});
    const link = await exportService.createLink(
      currentUserId(req),
      parseId(req.params.auditId, 'Audit'),
      scope,
    );
    res.status(201).json(link);
  });

  router.get('/:auditId/dashboard', async (req, res) => {
    const dashboard = await auditService.dashboard(
      currentUserId(req),
      parseId(req.params.auditId, 'Audit'),
    );
    res.json({ dashboard });
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
