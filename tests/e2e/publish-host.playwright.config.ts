import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "publish-host.spec.ts",
  outputDir: "../../test-results/publish-host",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4193",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @web3d/studio dev --host 127.0.0.1 --port 4192",
      url: "http://127.0.0.1:4192",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        "pnpm --filter @web3d/minimal-host build && pnpm --filter @web3d/minimal-host preview --host 127.0.0.1 --port 4193",
      url: "http://127.0.0.1:4193",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
