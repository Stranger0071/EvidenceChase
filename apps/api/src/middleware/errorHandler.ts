import type { ApiErrorBody } from '@evidencechase/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { DomainError } from '../errors';
import type { Logger } from '../lib/logger';

function send(res: Parameters<RequestHandler>[1], status: number, error: ApiErrorBody['error']) {
  res.status(status).json({ error } satisfies ApiErrorBody);
}

/** Errors raised by Express's body parsers carry a `type` and an HTTP `status`. */
function isBodyParserError(error: unknown): error is { type: string; status: number } {
  return typeof error === 'object' && error !== null && 'type' in error && 'status' in error;
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  send(res, 404, { code: 'ROUTE_NOT_FOUND', message: 'No such endpoint' });
};

/**
 * The single place where errors become HTTP responses, so every error has the same shape:
 * `{ error: { code, message, details? } }`. Unexpected errors are logged and hidden behind a
 * generic 500, so stack traces and internals never reach the client.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);

    if (error instanceof DomainError) {
      send(res, error.status, {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && { details: error.details }),
      });
      return;
    }

    if (isBodyParserError(error)) {
      if (error.type === 'entity.parse.failed') {
        return send(res, 400, {
          code: 'INVALID_JSON',
          message: 'The request body is not valid JSON',
        });
      }
      if (error.type === 'entity.too.large') {
        return send(res, 413, {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'The request body is too large',
        });
      }
    }

    logger.error({ err: error, reqId: req.id }, 'Unhandled error');
    send(res, 500, { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
  };
}
