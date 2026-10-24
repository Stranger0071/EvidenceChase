import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

/**
 * End-to-end tests in a real browser against the real stack: Next.js → Express → Postgres, with
 * uploads going to the S3-compatible server from docker compose (RustFS). Locally they reuse the
 * dev servers if they're already running (`pnpm dev`); in CI they start the production builds.
 */
export default defineConfig({
  testDir: './e2e',
  // The flows share one database and one storage bucket, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: isCI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: isCI
        ? 'pnpm --filter @evidencechase/api start'
        : 'pnpm --filter @evidencechase/api dev',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: isCI
        ? 'pnpm --filter @evidencechase/web start'
        : 'pnpm --filter @evidencechase/web dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
