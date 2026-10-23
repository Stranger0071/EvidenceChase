import type { Express } from 'express';
import pg from 'pg';
import { pino } from 'pino';
import request from 'supertest';
import { createApp } from '../../src/app';
import type { Env } from '../../src/config/env';
import { createPrismaClient } from '../../src/lib/prisma';
import type { EmailMessage, MailerPort } from '../../src/ports/mailer';
import { testDatabaseUrl } from './testDatabase';

export const WEB_ORIGIN = 'http://localhost:3000';

export class FakeMailer implements MailerPort {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

/** A fresh app wired to the test database, plus helpers to reset it between tests. */
export function createTestContext() {
  const databaseUrl = testDatabaseUrl();
  const env: Env = {
    NODE_ENV: 'test',
    PORT: 0,
    LOG_LEVEL: 'silent',
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: 'test-session-secret-that-is-at-least-32-chars',
    WEB_ORIGIN,
    TRUST_PROXY: 0,
  };
  const prisma = createPrismaClient(databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const mailer = new FakeMailer();
  const makeApp = (): Express =>
    createApp({ env, prisma, pool, logger: pino({ level: 'silent' }), mailer, bcryptCost: 4 });

  return {
    prisma,
    mailer,
    /** A new app instance each call, so rate-limit counters don't leak between tests. */
    makeApp,
    async reset() {
      await prisma.$executeRawUnsafe(
        'TRUNCATE "ActivityLog", "ReminderLog", "AccessToken", "EvidenceFile", "Submission", "EvidenceRequest", "Audit", "User", "session" CASCADE',
      );
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
