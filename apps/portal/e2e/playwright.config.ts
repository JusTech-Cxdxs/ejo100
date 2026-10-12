import { defineConfig, devices } from '@playwright/test';

/**
 * Real-browser tests against a running portal (CI: next start on :3001) and
 * the website / customer portal (CI: :3002).
 *
 * Files run in parallel (2 workers in CI); the tests inside a file run in
 * order. Every spec uses its own data (fresh vehicles, unique names, its own
 * seeded part), so two files never step on each other.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 75_000,
  // Always finish (and write the results) well inside the CI job's limit.
  globalTimeout: 38 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  retries: Number(process.env.E2E_RETRIES ?? (process.env.CI ? 1 : 0)),
  reporter: [['list'], ['json', { outputFile: 'report/results.json' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
  ],
});
