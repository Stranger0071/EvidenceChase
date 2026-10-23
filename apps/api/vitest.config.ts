import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/integration/globalSetup.ts'],
          // Test files share one database, so they run one at a time in a single process.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          hookTimeout: 60_000,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
