import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  activeStoredDocument,
  assertNoRuntimeErrors,
  createHotspotFromCenterReticle,
  currentRevision,
  documentSnapshot,
  expectDocumentSnapshot,
  expectRevision,
  hotspotRow,
  observeRuntimeErrors,
  openHotspotInspector,
  openHotspotsPanel,
  openStudioWithFactoryModel,
} from "./hotspot-test-helpers";

type ActionCase = "show-content" | "focus-hotspot" | "focus-target" | "open-link";

const expectedFeedback: Record<ActionCase, string> = {
  "show-content": "Hotspot content opened",
  "focus-hotspot": "Hotspot focused",
  "focus-target": "Target focused",
  "open-link": "Link opened",
};

test.afterEach(async ({ page }) => assertNoRuntimeErrors(page));

for (const action of ["show-content", "focus-hotspot", "focus-target", "open-link"] as const) {
  test(`executes ${action} in Run without mutating the document`, async ({ page }) => {
    test.setTimeout(75_000);
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    if (action === "open-link") await installWindowOpenRecorder(page);
    await openStudioWithFactoryModel(page);
    await createHotspotFromCenterReticle(page, "Run action point");
    await openHotspotsPanel(page);

    const inspector = await openHotspotInspector(page, "Run action point");
    await configureAction(page, inspector, action);
    const beforeRun = await documentSnapshot(page);

    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expectRevision(page, beforeRun.revision);
    const runRow = hotspotRow(page, "Run action point");
    if (action === "open-link") {
      await expect(runRow).toBeEnabled();
      await clickWithoutUserActivation(page, runRow);
      await expect(page.locator(".hotspot-live-region")).toHaveText(
        "The browser blocked this link",
      );
      expect(await recordedWindowOpenCalls(page)).toEqual([]);
      await expectDocumentSnapshot(page, beforeRun);
    }
    await runRow.click();
    await expect(page.locator(".hotspot-live-region")).toHaveText(expectedFeedback[action]);

    if (action === "show-content") {
      await expect(
        page.getByRole("complementary", { name: "Hotspot content", exact: true }),
      ).toContainText("Inspection ready");
    } else {
      await expect(
        page.getByRole("complementary", { name: "Hotspot content", exact: true }),
      ).toHaveCount(0);
    }
    if (action === "open-link") {
      await expect
        .poll(() => recordedWindowOpenCalls(page))
        .toEqual([
          {
            href: "https://example.com/inspection",
            target: "_blank",
            features: "noopener,noreferrer",
          },
        ]);
    }
    await expectDocumentSnapshot(page, beforeRun);
  });
}

async function clickWithoutUserActivation(page: Page, target: Locator): Promise<void> {
  // CDP evaluate carries a user gesture. Run the click after Chromium's 5s transient window.
  await target.evaluate((element) => {
    window.setTimeout(() => (element as HTMLButtonElement).click(), 6_500);
  });
  await page.waitForTimeout(7_000);
}

async function configureAction(page: Page, inspector: Locator, action: ActionCase): Promise<void> {
  const before = await currentRevision(page);
  if (action === "show-content") {
    const content = inspector.getByRole("textbox", { name: /^Content/u });
    await content.fill("Inspection ready");
    await content.press("Tab");
    await expectRevision(page, before + 1);
    return;
  }

  await inspector.getByText("Behavior", { exact: true }).click();
  if (action === "focus-hotspot") {
    await inspector.getByRole("radio", { name: "Focus hotspot", exact: true }).click();
    await expectRevision(page, before + 1);
    return;
  }

  if (action === "focus-target") {
    await inspector.getByRole("radio", { name: "Focus target", exact: true }).click();
    const target = (await activeStoredDocument(page)).targets[0];
    if (target === undefined) throw new Error("The imported M0 scene has no real Target.");
    const search = inspector.getByRole("searchbox", { name: "Target" });
    await search.fill(target.name);
    await inspector
      .getByRole("listbox", { name: "Target" })
      .getByRole("option", { name: target.name, exact: true })
      .click();
    await expectRevision(page, before + 1);
    return;
  }

  await inspector.getByRole("radio", { name: "Open link", exact: true }).click();
  let link = inspector.getByRole("textbox", { name: /^HTTPS link/u });
  await link.fill("http://example.com");
  await link.press("Enter");
  await expect(inspector.getByRole("alert")).toHaveText("Enter a valid HTTPS link");
  await expectRevision(page, before);
  link = inspector.getByRole("textbox", { name: /^HTTPS link/u });
  await link.fill("https://example.com/inspection");
  await link.press("Enter");
  await expectRevision(page, before + 1);
}

async function installWindowOpenRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const calls: Array<{ href: string; target: string; features: string }> = [];
    (window as typeof window & { __hotspotOpenCalls?: typeof calls }).__hotspotOpenCalls = calls;
    window.open = ((href?: string | URL, target?: string, features?: string) => {
      calls.push({ href: String(href), target: target ?? "", features: features ?? "" });
      return window;
    }) as typeof window.open;
  });
}

async function recordedWindowOpenCalls(page: Page) {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __hotspotOpenCalls?: Array<{ href: string; target: string; features: string }>;
        }
      ).__hotspotOpenCalls ?? [],
  );
}
