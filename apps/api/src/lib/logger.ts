import { pino, type Logger } from 'pino';
import type { Env } from '../config/env';

export type { Logger };

export function createLogger(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Logger {
  return pino({
    level: env.LOG_LEVEL,
    // Never write credentials or session cookies to the logs.
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-access-token"]',
        // Vercel's proxy signature is a bearer credential too.
        'req.headers["x-vercel-proxy-signature"]',
        'res.headers["set-cookie"]',
      ],
      censor: '[redacted]',
    },
    // Human-readable logs locally; structured JSON everywhere else (Render's log viewer).
    ...(env.NODE_ENV === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    }),
  });
}
