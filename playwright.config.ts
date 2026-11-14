import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4322', ...devices['Desktop Chrome'] },
  webServer: { command: 'npm run dev --workspace @lavbe/web -- --ignore-lock --port 4322', url: 'http://127.0.0.1:4322', reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
