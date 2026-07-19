import React from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@web3d/demo-support/theme.css";
import { ThemeProvider } from "@web3d/demo-support/theme-provider";

import { App } from "./App";
import { StudioI18nProvider } from "./i18n/I18nProvider";
import "./styles.css";
import "./data-binding/data-binding.css";
import "./help/shortcut-help.css";
import "./hotspots/hotspots.css";
import "./layout/scene-layout.css";
import "./scene-settings/scene-settings.css";
import "./settings/app-settings.css";
import "./transform/transform-editor.css";

const root = document.querySelector<HTMLDivElement>("#root");
if (root === null) throw new Error("Studio root element was not found.");

createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider storageKey="web3d.studio.theme">
      <StudioI18nProvider>
        <App
          trustedHotspotContentCatalog={[
            { key: "studio.maintenance-record", displayName: "Maintenance record" },
          ]}
        />
      </StudioI18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
