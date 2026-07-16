import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { ProjectMenu } from "./ProjectMenu";

describe("ProjectMenu", () => {
  it("keeps Scene settings visible but disabled when authoring is unavailable", () => {
    const html = renderMenu(false);

    expect(html).toContain('aria-label="Scene settings"');
    expect(html.match(/aria-label="Scene settings"/g)).toHaveLength(1);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toMatch(/<button[^>]*aria-label="Scene settings"[^>]*disabled/);
  });

  it("enables Scene settings in Edit", () => {
    const html = renderMenu(true);
    const action = html.match(/<button[^>]*aria-label="Scene settings"[^>]*>/)?.[0];

    expect(action).toBeDefined();
    expect(action).not.toContain("disabled");
  });
});

function renderMenu(canConfigureScene: boolean): string {
  return renderToStaticMarkup(
    createElement(
      StudioI18nProvider,
      null,
      createElement(ProjectMenu, {
        canConfigureScene,
        canRename: canConfigureScene,
        currentProjectId: "project",
        recent: [],
        onClose: () => undefined,
        onDelete: () => undefined,
        onExportJson: () => undefined,
        onImportArchive: () => undefined,
        onImportJson: () => undefined,
        onNew: () => undefined,
        onOpen: () => undefined,
        onRename: () => undefined,
        onSceneSettings: () => undefined,
      }),
    ),
  );
}
