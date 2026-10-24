import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const BASE = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  SESSION_SECRET: 'a-session-secret-that-is-at-least-32-chars',
  WEB_ORIGIN: 'https://evidencechase.vercel.app',
};

const PRODUCTION = {
  ...BASE,
  NODE_ENV: 'production',
  AWS_ACCESS_KEY_ID: 'key',
  AWS_SECRET_ACCESS_KEY: 'secret',
  CRON_SECRET: 'a-cron-secret-that-is-at-least-32-characters',
  EXPORT_SIGNING_SECRET: 'an-export-secret-that-is-at-least-32-chars',
  RESEND_API_KEY: 're_test',
};

describe('loadEnv: API_PUBLIC_URL', () => {
  it("uses Render's own URL when none is set", () => {
    const env = loadEnv({
      ...PRODUCTION,
      RENDER_EXTERNAL_URL: 'https://evidencechase-api-x7k2.onrender.com',
    });
    expect(env.API_PUBLIC_URL).toBe('https://evidencechase-api-x7k2.onrender.com');
  });

  it('prefers an explicit value, e.g. a custom domain', () => {
    const env = loadEnv({
      ...PRODUCTION,
      API_PUBLIC_URL: 'https://api.evidencechase.xyz',
      RENDER_EXTERNAL_URL: 'https://evidencechase-api.onrender.com',
    });
    expect(env.API_PUBLIC_URL).toBe('https://api.evidencechase.xyz');
  });

  it('treats an empty value as unset', () => {
    const env = loadEnv({
      ...PRODUCTION,
      API_PUBLIC_URL: '',
      RENDER_EXTERNAL_URL: 'https://x.onrender.com',
    });
    expect(env.API_PUBLIC_URL).toBe('https://x.onrender.com');
  });

  it('defaults to localhost in development', () => {
    expect(loadEnv(BASE).API_PUBLIC_URL).toBe('http://localhost:4000');
  });

  it('refuses to start in production with only the localhost default', () => {
    expect(() => loadEnv(PRODUCTION)).toThrow(/API_PUBLIC_URL/);
  });
});
