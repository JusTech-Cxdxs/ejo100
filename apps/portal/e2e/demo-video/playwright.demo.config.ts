import { defineConfig, devices } from '@playwright/test';
/** Demo-video tooling only (never part of CI): data preparation and scene recording. */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.demo\.ts/,
  timeout: 600_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    launchOptions: { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' },
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } }],
});
