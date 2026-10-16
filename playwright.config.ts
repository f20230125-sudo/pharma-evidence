import { defineConfig } from "@playwright/test";
const base = process.env.BASE_URL;
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 60000,
  expect: { timeout: 12000 },
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: base ?? "http://localhost:3070",
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  webServer: base
    ? undefined
    : {
        command: "npm run start",
        url: "http://localhost:3070",
        reuseExistingServer: !process.env.CI,
      },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
