import type { Express } from 'express';
import pg from 'pg';
import { pino } from 'pino';
import request from 'supertest';
import { MemoryStorageAdapter } from '../../src/adapters/storage.memory';
import { createApp } from '../../src/app';
import type { Env } from '../../src/config/env';
import { createPrismaClient } from '../../src/lib/prisma';
import type { EmailMessage, MailerPort } from '../../src/ports/mailer';
import { testDatabaseUrl } from './testDatabase';

export const WEB_ORIGIN = 'http://localhost:3000';
export const CRON_SECRET = 'test-cron-secret-that-is-at-least-32-characters';
export const EXPORT_SIGNING_SECRET = 'test-export-signing-secret-at-least-32-chars';

export class FakeMailer implements MailerPort {
  readonly sent: EmailMessage[] = [];
  /** Recipients whose emails should fail, to test that failures are reported. */
  readonly failFor = new Set<string>();

  async send(message: EmailMessage): Promise<void> {
    if (this.failFor.has(message.to)) throw new Error(`Simulated send failure to ${message.to}`);
    this.sent.push(message);
  }

  /** The magic links in every email sent to this address, newest last. */
  linksTo(address: string): string[] {
    return this.sent
      .filter((message) => message.to === address)
      .flatMap((message) => message.text.split(/\s+/).filter((word) => word.includes('/e#')));
  }
}

/** A fresh app wired to the test database and in-memory storage, plus helpers to reset them. */
export function createTestContext(overrides: Partial<Env> = {}) {
  const databaseUrl = testDatabaseUrl();
  const env: Env = {
    NODE_ENV: 'test',
    PORT: 0,
    LOG_LEVEL: 'silent',
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: 'test-session-secret-that-is-at-least-32-chars',
    WEB_ORIGIN,
    TRUST_PROXY: 0,
    CRON_SECRET,
    API_PUBLIC_URL: 'http://api.test',
    EXPORT_SIGNING_SECRET,
    AWS_REGION: 'ap-southeast-1',
    S3_BUCKET: 'test-bucket',
    MALWARE_SCAN_ENABLED: false,
    OBJECT_LOCK_RETENTION_DAYS: 90,
    EMAIL_FROM: 'test@example.com',
    ...overrides,
  };
  const prisma = createPrismaClient(databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const mailer = new FakeMailer();
  const storage = new MemoryStorageAdapter();
  /** `clock` pins "now", for date-dependent behaviour such as reminders. */
  const makeApp = (options: { clock?: () => Date } = {}): Express =>
    createApp({
      clock: options.clock,
      env,
      prisma,
      pool,
      logger: pino({ level: 'silent' }),
      mailer,
      storage,
      bcryptCost: 4,
      scanSettle: { timeoutMs: 0, intervalMs: 0 },
    });

  return {
    env,
    prisma,
    mailer,
    storage,
    /** A new app instance each call, so rate-limit counters don't leak between tests. */
    makeApp,
    async reset() {
      await prisma.$executeRawUnsafe(
        'TRUNCATE "ActivityLog", "ReminderLog", "AccessToken", "EvidenceFile", "Submission", "EvidenceRequest", "Audit", "User", "session" CASCADE',
      );
      mailer.sent.length = 0;
      mailer.failFor.clear();
      storage.objects.clear();
      storage.failNextCopy.clear();
    },
    async close() {
      await Promise.all([prisma.$disconnect(), pool.end()]);
    },
  };
}

let userCounter = 0;

/** Signs up a new manager and returns a cookie-carrying agent for their session. */
export async function signedInAgent(app: Express, name = 'Priya') {
  userCounter += 1;
  const agent = request.agent(app);
  const email = `manager${userCounter}@example.com`;
  await agent
    .post('/auth/signup')
    .set('Origin', WEB_ORIGIN)
    .send({ name, email, password: 'correct-horse-battery' })
    .expect(201);
  return { agent, email };
}

/** Minimal real file contents, so magic-byte detection sees genuine signatures. */
export const SAMPLE_FILES = {
  pdf: Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
  ),
  png: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
  /** A Windows executable header ("MZ" + PE signature), as if someone renamed setup.exe to .pdf. */
  exe: Buffer.concat([
    Buffer.from('MZ'),
    Buffer.alloc(58),
    Buffer.from([0x40, 0, 0, 0]),
    Buffer.from('PE\0\0'),
    Buffer.alloc(200),
  ]),
  csv: Buffer.from('user,mfa_enabled\nrahul@example.com,true\n'),
};
