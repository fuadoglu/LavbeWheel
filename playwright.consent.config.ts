import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/consent',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4326', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'node scripts/serve-consent-fixture.mjs --port 4326',
    url: 'http://127.0.0.1:4326',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
