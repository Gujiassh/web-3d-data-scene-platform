import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @web3d/studio dev --host 127.0.0.1",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @web3d/factory-demo dev --host 127.0.0.1",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
