import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  tsconfig: "./tests/tsconfig.json",
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "bun run vite --config vite.browser.config.ts",
    url: "http://127.0.0.1:4173/tests/browser/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
