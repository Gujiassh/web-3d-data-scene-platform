import { expect, type Locator, type Page } from "@playwright/test";

export async function openAppSettings(page: Page): Promise<Locator> {
  await page.getByTestId("app-settings-button").click();
  const dialog = page.locator(".studio-settings-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function setInterfacePreferences(
  page: Page,
  preferences: { readonly locale?: "en" | "zh-CN"; readonly theme?: "light" | "dark" },
): Promise<void> {
  const dialog = await openAppSettings(page);
  if (preferences.locale !== undefined) {
    await dialog.getByTestId(`settings-locale-${preferences.locale}`).click();
    await expect(page.locator("html")).toHaveAttribute("lang", preferences.locale);
  }
  if (preferences.theme !== undefined) {
    await dialog.getByTestId(`settings-theme-${preferences.theme}`).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", preferences.theme);
  }
  await dialog.locator("header .icon-button").click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("app-settings-button")).toBeFocused();
}
