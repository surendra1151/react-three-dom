import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/playwright',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Enable WebGL in headless mode for Three.js / R3F
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'pnpm dev -- --port 5173 --strictPort',
    port: 5173,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
