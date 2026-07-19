import { expect, test } from "@playwright/test";

import { setInterfacePreferences } from "./settings-helpers";
import {
  artifact,
  assertNoRuntimeErrors,
  createHotspotFromCenterReticle,
  expectInsideViewport,
  expectNoPageOrToolbarOverflow,
  importFactoryModel,
  observeRuntimeErrors,
  openHotspotPopover,
  openHotspotsPanel,
  readyCanvas,
  studioUrl,
} from "./hotspot-test-helpers";

const viewports = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1440x900", width: 1440, height: 900 },
] as const;
const locales = ["en", "zh-CN"] as const;
const themes = ["light", "dark"] as const;

test.afterEach(async ({ page }) => assertNoRuntimeErrors(page));

for (const viewport of viewports) {
  for (const locale of locales) {
    for (const theme of themes) {
      test(`fits ${locale} ${theme} hotspots at ${viewport.name}`, async ({ page }) => {
        test.setTimeout(75_000);
        observeRuntimeErrors(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(studioUrl);
        await readyCanvas(page);
        await importFactoryModel(page);
        const title = "Quality point";
        await createHotspotFromCenterReticle(page, title);
        await setInterfacePreferences(page, { locale, theme });

        await openHotspotsPanel(page, locale === "en" ? "Hotspots" : "热点");
        const popover = await openHotspotPopover(
          page,
          title,
          locale === "en" ? `Hotspot actions for ${title}` : `${title} 的热点操作`,
        );
        await expectInsideViewport(page, popover);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.getByTestId("add-hotspot-button")).toHaveAttribute(
          "aria-label",
          locale === "en" ? "Add hotspot (H)" : "添加热点 (H)",
        );
        await expect(
          popover.getByRole("button", { name: locale === "en" ? "Rename" : "重命名" }),
        ).toBeVisible();
        await expect(
          popover.getByRole("button", { name: locale === "en" ? "Reposition" : "重新放置" }),
        ).toBeVisible();
        await expect(
          popover.getByRole("button", { name: locale === "en" ? "More" : "更多" }),
        ).toBeVisible();
        await expect(page.locator(".web3d-hotspot-overlay")).toHaveAttribute(
          "data-reduced-motion",
          "true",
        );
        await expect(popover).toHaveCSS("animation-name", "none");
        expect(
          await page
            .locator(".web3d-hotspot-proxy")
            .evaluate((element) => element.style.transition),
        ).toBe("none");
        await expectNoPageOrToolbarOverflow(page);
        await page.screenshot({
          path: artifact(`hotspots-${locale}-${theme}-reduced-${viewport.name}.png`),
          fullPage: true,
        });
      });
    }
  }
}
