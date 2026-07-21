import { defineConfig, devices } from "@playwright/test";

const feature009BrowserMatrix = /feature009-browser-matrix\.spec\.ts/u;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/feature009-global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:4173",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /publish-host\.spec\.ts/u,
      use: { ...devices["Desktop Chrome"], userAgent: undefined },
    },
    {
      name: "firefox",
      testMatch: feature009BrowserMatrix,
      use: { ...devices["Desktop Firefox"], userAgent: undefined },
    },
    {
      name: "webkit",
      testMatch: feature009BrowserMatrix,
      use: { ...devices["Desktop Safari"], userAgent: undefined },
    },
  ],
  webServer: {
    command: "pnpm --filter @web3d/studio dev --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    env: { VITE_STARTER_DESCRIPTOR_PATH: "/test-starter/descriptor.json" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
