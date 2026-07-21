import path from "node:path";

import { test } from "@playwright/test";
import { preview, type PreviewServer } from "vite";

import {
  feature009StudioViewports,
  probeIndexedDbBlobStorage,
  recordBrowserIdentity,
  runPublishedHostCriticalFlow,
  runStudioCriticalFlow,
  type BrowserEngine,
} from "./feature009-browser-flow";

const publishedHostPorts: Readonly<Record<BrowserEngine, number>> = {
  chromium: 4194,
  firefox: 4195,
  webkit: 4196,
};

let publishedHost: PreviewServer | undefined;
let publishedHostUrl: string | undefined;

test.describe("Feature 009 browser E1 shared critical flow", () => {
  test.beforeAll(async ({ browserName }) => {
    const engine = browserName as BrowserEngine;
    const port = publishedHostPorts[engine];
    publishedHost = await preview({
      configFile: path.resolve("examples/minimal-host/vite.config.ts"),
      root: path.resolve("examples/minimal-host"),
      preview: { host: "127.0.0.1", port, strictPort: true },
    });
    publishedHostUrl = `http://127.0.0.1:${port}/`;
  });

  test.afterAll(async () => {
    await publishedHost?.close();
    publishedHost = undefined;
    publishedHostUrl = undefined;
  });

  for (const viewport of feature009StudioViewports) {
    test(`runs the Studio semantic flow at ${viewport.name}`, async ({
      browserName,
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await recordBrowserIdentity(page, browserName as BrowserEngine, testInfo);
      if (browserName === "webkit") {
        const capability = await probeIndexedDbBlobStorage(page);
        console.log(
          `feature009-browser capability=indexeddb-blob engine=webkit supported=${capability.supported} error=${JSON.stringify(capability.error)}`,
        );
        test.skip(
          !capability.supported,
          `Playwright WebKit Linux cannot persist Studio asset Blobs: ${capability.error ?? "unknown error"}`,
        );
      }
      await runStudioCriticalFlow(page, viewport, browserName as BrowserEngine, testInfo);
    });
  }

  test("runs the published-host semantic flow without relabeling WebKit", async ({
    browserName,
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await recordBrowserIdentity(page, browserName as BrowserEngine, testInfo);
    if (publishedHostUrl === undefined) throw new Error("Published host did not start.");
    await runPublishedHostCriticalFlow(
      page,
      publishedHostUrl,
      browserName as BrowserEngine,
      testInfo,
    );
  });
});
