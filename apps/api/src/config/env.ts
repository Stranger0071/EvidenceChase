import { z } from 'zod';

/** "true"/"false" from the environment, as a boolean. */
const booleanFlag = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .default(fallback ? 'true' : 'false')
    .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a postgres:// connection URL'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  /** Origin of the web app: used for the CSRF origin check and for the links in emails. */
  WEB_ORIGIN: z
    .string({
      required_error:
        'WEB_ORIGIN is required: the web app URL, e.g. https://evidencechase.vercel.app',
    })
    .url(
      'WEB_ORIGIN must be a full URL starting with https://, e.g. https://evidencechase.vercel.app',
    )
    // Browsers send the bare origin, so "https://app.vercel.app/" or ".../login" would never match.
    .transform((value) => new URL(value).origin),
  /** Number of proxies in front of the API. See .env.example. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  /** Public URL of this API. Export downloads go straight here, not through the web app's proxy. */
  API_PUBLIC_URL: z
    .string()
    .url('API_PUBLIC_URL must be the full URL of this API')
    .default('http://localhost:4000'),
  /** Signs the short-lived evidence export links (HMAC). Exports are off without it. */
  EXPORT_SIGNING_SECRET: z
    .string()
    .min(32, 'EXPORT_SIGNING_SECRET must be at least 32 characters')
    .optional(),

  /** Bearer secret that cron-job.org sends to /internal/cron/*. Those routes are off without it. */
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters').optional(),

  // Object storage: AWS S3 in production, MinIO locally (docker compose).
  AWS_REGION: z.string().min(1).default('ap-southeast-1'),
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).default('evidencechase-dev'),
  /** MinIO endpoint for local development. Leave unset for AWS S3. */
  S3_ENDPOINT: z.string().url().optional(),
  /** Wait for GuardDuty's malware scan before promoting files. Off locally (no GuardDuty). */
  MALWARE_SCAN_ENABLED: booleanFlag(false),
  OBJECT_LOCK_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

  /** Without a key, emails are written to the log instead of being sent. */
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).default('EvidenceChase <onboarding@resend.dev>'),
});

export type Env = z.infer<typeof envSchema>;

/** Reads and validates configuration once at startup, so a missing variable fails fast and loudly. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // An empty value means "not set". That matters for S3_ENDPOINT: writing `S3_ENDPOINT=` in an env
  // file both means "use real AWS" and stops tools that read .env (Prisma) from filling in the
  // local MinIO/RustFS endpoint behind your back.
  const provided = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse({
    ...provided,
    // Render sets RENDER_EXTERNAL_URL on every web service (e.g. https://evidencechase-api.onrender.com),
    // so the API knows its own public URL without anyone typing it in.
    API_PUBLIC_URL: source.API_PUBLIC_URL || source.RENDER_EXTERNAL_URL || undefined,
  });
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  const env = result.data;
  if (env.NODE_ENV === 'production') {
    const missing = (
      [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'CRON_SECRET',
        'EXPORT_SIGNING_SECRET',
        'RESEND_API_KEY',
      ] as const
    ).filter((name) => !env[name]);
    if (missing.length > 0) {
      throw new Error(`Missing production configuration: ${missing.join(', ')}`);
    }
    if (new URL(env.API_PUBLIC_URL).hostname === 'localhost') {
      throw new Error('API_PUBLIC_URL must be the public URL of the API in production');
    }
  }
  return env;
}
