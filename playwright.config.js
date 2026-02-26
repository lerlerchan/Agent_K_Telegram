// Playwright configuration for Tele Agent K
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  timeout: 30000,
  use: {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
