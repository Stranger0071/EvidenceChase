import { reviewRequestSchema } from '@evidencechase/shared';
import { Router } from 'express';
import { parseId, parseInput } from '../lib/validate';
import { currentUserId, requireManager } from '../middleware/auth';
import type { ReviewService } from '../services/reviewService';

/** Manager review of a request's evidence: /requests/:requestId/{review,submissions,timeline}. */
export function createReviewRouter(reviewService: ReviewService): Router {
  const router = Router();
  router.use(requireManager);

  const requestIdOf = (value: unknown) => parseId(value, 'Evidence request');

  router.post('/:requestId/review', async (req, res) => {
    const input = parseInput(reviewRequestSchema, req.body);
    const request = await reviewService.review(
      currentUserId(req),
      requestIdOf(req.params.requestId),
      input,
      {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    );
    res.json({ request });
  });

  router.get('/:requestId/submissions', async (req, res) => {
    const submissions = await reviewService.listSubmissions(
      currentUserId(req),
      requestIdOf(req.params.requestId),
    );
    res.json({ submissions });
  });

  router.get('/:requestId/timeline', async (req, res) => {
    const timeline = await reviewService.timeline(
      currentUserId(req),
      requestIdOf(req.params.requestId),
    );
    res.json({ timeline });
  });

  return router;
}

/** Short-lived file links: /files/:fileId/url?disposition=inline|attachment. */
export function createFilesRouter(reviewService: ReviewService): Router {
  const router = Router();
  router.use(requireManager);

  router.get('/:fileId/url', async (req, res) => {
    const inline = req.query.disposition === 'inline';
    res.json(
      await reviewService.fileUrl(currentUserId(req), parseId(req.params.fileId, 'File'), inline),
    );
  });

  return router;
}
