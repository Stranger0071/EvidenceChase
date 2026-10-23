import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://evidencechase:evidencechase@localhost:5432/evidencechase_test';

/**
 * The database the integration tests use. The tests wipe it, so it's deliberately a separate
 * database from the development one, and the URL must name a database ending in "_test".
 */
export function testDatabaseUrl(): string {
  const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
  if (!process.env.TEST_DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to run tests against ${url}: the database name must end in "_test".`);
  }
  return url;
}
