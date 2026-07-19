import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "hotspots*.spec.ts",
  outputDir: "../../test-results/hotspots",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4187",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @web3d/studio dev --host 127.0.0.1 --port 4187",
    url: "http://127.0.0.1:4187",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
