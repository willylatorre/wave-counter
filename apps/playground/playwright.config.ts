import { defineConfig } from '@playwright/test'

delete process.env.NO_COLOR

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev:fastapi',
      port: 18081,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:express',
      port: 18082,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      port: 5173,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
