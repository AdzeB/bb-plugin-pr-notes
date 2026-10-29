import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          process.env.BB_PR_TEST_REPORT ?? "test-results/results.json",
      },
    ],
  ],
  use: {
    baseURL: process.env.BB_SERVER_URL ?? "http://127.0.0.1:38886",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.BB_PR_CHROMIUM
      ? { executablePath: process.env.BB_PR_CHROMIUM }
      : {},
    trace: "retain-on-failure",
  },
});
