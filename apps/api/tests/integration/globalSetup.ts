import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './testDatabase';

/**
 * Brings the test database up to date with the committed migrations before the suite runs.
 * `migrate deploy` only applies pending migrations and never drops data; each test file empties
 * the tables itself (see `reset()` in helpers.ts).
 */
export default function setup() {
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
  });
}
