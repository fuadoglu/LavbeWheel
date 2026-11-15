import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pwa',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4325', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'node scripts/serve-static-preview.mjs --port 4325',
    url: 'http://127.0.0.1:4325',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
