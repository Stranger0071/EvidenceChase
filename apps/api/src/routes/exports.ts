import { Router, type RequestHandler } from 'express';
import { parseId } from '../lib/validate';
import type { ExportService } from '../services/exportService';

/**
 * Evidence pack downloads: GET /exports/:auditId?scope&exp&sig. Reached directly on the API's own
 * domain (not through the web app's proxy), so there's no session cookie. The short-lived signed
 * link is the credential. It's issued by POST /audits/:auditId/export-link to the audit's manager.
 */
export function createExportsRouter(
  exportService: ExportService,
  rateLimit: RequestHandler,
): Router {
  const router = Router();
  router.use(rateLimit);

  router.get('/:auditId', async (req, res) => {
    const auditId = parseId(req.params.auditId, 'Audit');
    const scope = exportService.authorize(auditId, req.query);
    await exportService.streamPack(auditId, scope, res);
  });

  return router;
}
