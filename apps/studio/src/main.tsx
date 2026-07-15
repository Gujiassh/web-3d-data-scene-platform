import React from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@web3d/demo-support/theme.css";

import { App } from "./App";
import { StudioI18nProvider } from "./i18n/I18nProvider";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("Studio root element was not found.");
}

createRoot(root).render(
  <React.StrictMode>
    <StudioI18nProvider>
      <App />
    </StudioI18nProvider>
  </React.StrictMode>,
);
