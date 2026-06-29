// @ts-nocheck
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    headless: true,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    // Spin up the chinese-gallery folder over a tiny static server
    command: 'cd chinese-gallery && python3 -m http.server 8765 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8765/vocabulary.html',
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
