import React from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@web3d/demo-support/theme.css";
import { ThemeProvider } from "@web3d/demo-support/theme-provider";

import { App } from "./App";
import { FactoryI18nProvider } from "./i18n/I18nProvider";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (root === null) {
  throw new Error("Factory Demo root element was not found.");
}

createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider storageKey="web3d.factory-demo.theme">
      <FactoryI18nProvider>
        <App />
      </FactoryI18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
