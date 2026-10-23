import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:8766', headless: true },
  webServer: {
    command: 'python3 ../tests/serve_web_fixture.py',
    url: 'http://127.0.0.1:8766/connect/api/bootstrap',
    reuseExistingServer: !process.env.CI,
  },
})
